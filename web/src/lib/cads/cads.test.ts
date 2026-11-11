import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { analyzeEvent, formatDistance, missComponentsM, formatOdds, formatShortOdds, formatSpeed } from "./analyze";
import { groupMessages } from "./correlation";
import { loadDemoDocuments } from "./demo";
import { tradeStudy } from "./maneuver";
import { parseDocument } from "./parser";
import { recalculate } from "./pc";
import { positionSigmasM } from "./quality";
import { CONFIG, Store } from "./store";
import { hoursBetween } from "./time";

const DATA = join(__dirname, "../../../../data/fixtures");
const PUBLIC = join(__dirname, "../../../public");
const read = (...p: string[]) => readFileSync(join(DATA, ...p), "utf8");
const cdm = (folder: string, file: string) => parseDocument(read(folder, file), file)[0].cdm!;
const recon = () => Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`cdm_set_${n}.json`, cdm("reconstructed", `cdm_set_${n}.json`)]));

function permutations<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}

describe("ingestion and correlation (AC01, AC02)", () => {
  it("groups the six samples into the same two encounters in all 720 file orders", () => {
    const c = recon();
    const expected = new Set(["cdm_set_1.json|cdm_set_4.json", "cdm_set_2.json|cdm_set_3.json|cdm_set_5.json|cdm_set_6.json"]);
    for (const order of permutations(Object.keys(c))) {
      const groups = groupMessages(order.map((n) => [n, c[n].sat1.designator, c[n].sat2.designator, c[n].tca]), CONFIG.correlationWindowS);
      expect(new Set(groups.map((g) => g.join("|")))).toEqual(expected);
    }
  });
  it("keeps Pc text exactly and a source zero distinct from not-provided", () => {
    const c = recon();
    const raw = Object.values(c).map((x) => x.pcRaw);
    expect(raw).toEqual(["1.009416E-06", "2.885737E-08", "7.665263E-09", "0", "7.854690E-07", "0"]);
    expect(c["cdm_set_4.json"].pc).toBe(0);
  });
  it("rejects every invalid fixture with a reason", () => {
    for (const f of readdirSync(join(DATA, "invalid"))) {
      const res = parseDocument(read("invalid", f), f);
      expect(res.some((r) => r.cdm), f).toBe(false);
      expect(res.every((r) => r.errors.length > 0), f).toBe(true);
    }
  });
  it("KVN adapter gives the same values as JSON", () => {
    const k = parseDocument(read("kvn", "synthetic_high_risk_3.kvn"))[0].cdm!;
    const j = cdm("synthetic", "synthetic_high_risk_3.json");
    expect([k.tca, k.pcRaw, k.missDistanceM]).toEqual([j.tca, j.pcRaw, j.missDistanceM]);
  });
});

describe("experimental Pc matches the Python implementation", () => {
  const python: Record<string, number> = {
    "cdm_set_1.json": 1.008843e-6, "cdm_set_2.json": 2.891801e-8, "cdm_set_3.json": 7.672115e-9, "cdm_set_5.json": 7.852202e-7,
  };
  it.each(Object.entries(python))("%s", (file, expected) => {
    const r = recalculate(recon()[file], 10);
    expect(r.available && Math.abs(r.recalculatedPc / expected - 1)).toBeLessThan(1e-3);
  });
  it("synthetic high-risk recalculation equals its source Pc", () => {
    for (const n of [1, 2, 3]) {
      const c = cdm("synthetic", `synthetic_high_risk_${n}.json`);
      const r = recalculate(c, 10);
      expect(r.available && Math.abs(r.recalculatedPc / c.pc! - 1)).toBeLessThan(1e-3);
    }
  });
});

describe("store, alerts and analysis (AC03)", () => {
  const docs = (folder: string, label = folder) => readdirSync(join(DATA, folder)).map((f) => ({ name: f, content: read(folder, f), label }));
  const rule = { name: "Pc >= 1e-4", pcMin: 1e-4, missDistanceMaxM: null, hoursToTcaMax: null, objectIds: [] };
  it("imports to two events, ignores repeats, alerts only on qualifying CDMs without duplicates", () => {
    const s = new Store();
    s.addRule(rule);
    expect(s.importDocuments(docs("reconstructed")).counts).toEqual({ imported: 6, duplicate: 0, rejected: 0 });
    expect(s.getSnapshot().events.map((e) => e.revisions.length).sort()).toEqual([2, 4]);
    expect(s.getSnapshot().alerts).toHaveLength(0);
    s.importDocuments(docs("synthetic"));
    s.importDocuments(docs("synthetic"));
    expect(s.importDocuments(docs("reconstructed")).counts.duplicate).toBe(6);
    expect(s.getSnapshot().alerts).toHaveLength(2);
    s.reset();
    expect(s.getSnapshot()).toEqual({ events: [], rules: [], alerts: [] });
  });
  it("demo scenario is re-dated to upcoming encounters and the analysis explains each event", async () => {
    const now = Date.now();
    vi.stubGlobal("fetch", async (url: string) => ({ json: async () => JSON.parse(readFileSync(join(PUBLIC, url), "utf8")) }));
    const { docs: demo } = await loadDemoDocuments(now);
    vi.unstubAllGlobals();
    const s = new Store();
    expect(s.importDocuments(demo).counts).toEqual({ imported: 9, duplicate: 0, rejected: 0 });
    const events = s.getSnapshot().events;
    expect(events).toHaveLength(3);
    for (const e of events) {
      const h = hoursBetween(now, e.revisions.at(-1)!.cdm.tca);
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThan(24);
    }
    const sev = events.map((e) => analyzeEvent(e, now)).sort((a, b) => a.severity.localeCompare(b.severity));
    expect(sev.map((x) => x.severity)).toEqual(["ACTION", "ZERO", "ZERO"]);
    expect(sev.every((x) => x.why.length >= 4)).toBe(true);

    // Verify ELI5 math explanation and severity rationale
    const action = sev.find((x) => x.severity === "ACTION")!;
    expect(action.why.some((w) => w.includes("The Math in Simple Terms"))).toBe(true);
    expect(action.why.some((w) => w.includes("ACTION — High Collision Danger"))).toBe(true);
    expect(action.why.some((w) => w.includes("uncertainty cloud"))).toBe(true);
    expect(action.why.some((w) => w.includes("1 in 10,000"))).toBe(true);
    expect(action.why.some((w) => w.includes("1 in 2,571"))).toBe(true);
    expect(action.why.some((w) => w.includes("Flyby Timing"))).toBe(true);
    expect(action.why.some((w) => w.includes("Risk Trend"))).toBe(true);

    const zero = sev.find((x) => x.severity === "ZERO")!;
    expect(zero.why.some((w) => w.includes("Latest CDM reports Pc exactly 0"))).toBe(true);
    expect(zero.why.some((w) => w.includes("0% overlap"))).toBe(true);
  });

  it("formats odds, distances, and speeds for a non-technical audience", () => {
    expect(formatOdds(0)).toBe("0% (zero chance of collision)");
    expect(formatOdds(3.888786e-4)).toBe("1 in 2,571 (0.04%)");
    expect(formatOdds(1e-6)).toBe("1 in 1 million (less than 0.001%)");
    expect(formatShortOdds(3.888786e-4)).toBe("1 in 2,571");
    expect(formatShortOdds(0)).toBe("0%");
    expect(formatDistance(62)).toContain("football field");
    expect(formatSpeed(12793)).toContain("Mach");
  });
});

describe("maneuver trade (AC05)", () => {
  it("changes miss distance, reports propellant and issues no commands", () => {
    const c = cdm("synthetic", "synthetic_high_risk_3.json");
    const r = tradeStudy(c, [{ label: "small in-track", dvRtnMs: [0, 0.05, 0], leadTimeH: 12 }], { massKg: 500, ispS: 220, propellantAvailableKg: 5 }, 1e-4, 10);
    expect(r.issuesCommands).toBe(false);
    expect(r.candidates[0].missDistanceM).not.toBeCloseTo(r.baseline.missDistanceM, 0);
    expect(r.candidates[0].propellantKg).toBeGreaterThan(0);
    expect(r.assumptions.length && r.limitations.length).toBeTruthy();
  });
});

describe("front-line uncertainty (A1)", () => {
  it("returns 1-sigma radial, in-track, cross-track from the covariance diagonal", () => {
    const o = cdm("reconstructed", "cdm_set_1.json").sat1;
    const s = positionSigmasM(o)!;
    expect(s).toHaveLength(3);
    s.forEach((v, i) => expect(v).toBeCloseTo(Math.sqrt(o.covarianceRtn![i][i]), 6));
  });
  it("returns null when the CDM has no covariance", () => {
    const o = { ...cdm("reconstructed", "cdm_set_1.json").sat1, covarianceRtn: null };
    expect(positionSigmasM(o)).toBeNull();
  });
});

describe("miss distance by direction (A2)", () => {
  it("splits the relative position into non-negative radial, in-track, cross-track parts that add up to the miss distance", () => {
    const c = cdm("reconstructed", "cdm_set_1.json");
    const m = missComponentsM(c)!;
    expect(Math.hypot(m.radial, m.inTrack, m.crossTrack)).toBeCloseTo(c.missDistanceM, -1); // within the parser's 1% consistency check
    expect(Math.min(m.radial, m.inTrack, m.crossTrack)).toBeGreaterThanOrEqual(0);
  });
  it("returns null when the CDM has no relative position", () => {
    expect(missComponentsM({ ...cdm("reconstructed", "cdm_set_1.json"), relPosRtnM: null })).toBeNull();
  });
});
