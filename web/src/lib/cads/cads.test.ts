import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { analyzeEvent, formatDistance, missComponentsM, phoneSummary, formatOdds, formatShortOdds, formatSpeed } from "./analyze";
import { groupMessages } from "./correlation";
import { loadDemoDocuments, sortByCreation } from "./demo";
import { tradeStudy } from "./maneuver";
import { parseDocument } from "./parser";
import { recalculate } from "./pc";
import { lastObservations, positionSigmasM } from "./quality";
import { CONFIG, Store } from "./store";
import { hoursBetween } from "./time";
import { actionLabel, needsAttention, severityBands } from "./severity";
import { pcAxis, pcChange, pcFraction, trendPoints } from "./trend";

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

describe("last observation (A3)", () => {
  const base = () => cdm("reconstructed", "cdm_set_1.json");
  const withObs = (a: number | null, b: number | null) => {
    const c = base();
    return { ...c, sat1: { ...c.sat1, lastObEnd: a }, sat2: { ...c.sat2, lastObEnd: b } };
  };
  it("reports hours before TCA and before now for each object", () => {
    const c = base();
    const now = c.tca + 3 * 3600000;
    const lo = lastObservations(c, now, 12);
    expect(lo.sat1!.beforeTcaH).toBeCloseTo((c.tca - c.sat1.lastObEnd!) / 3600000, 6);
    expect(lo.sat1!.beforeNowH - lo.sat1!.beforeTcaH).toBeCloseTo(3, 6);
  });
  it("warns only when the objects were last observed more than the limit apart", () => {
    const t = base().tca;
    const H = 3600000;
    expect(lastObservations(withObs(t - 20 * H, t - 8 * H), t, 12).warn).toBe(false); // exactly 12 h apart: no warning
    const far = lastObservations(withObs(t - 21 * H, t - 8 * H), t, 12); // 13 h apart
    expect(far.warn).toBe(true);
    expect(far.gapH).toBeCloseTo(13, 6);
  });
  it("does not warn and reports null when an observation time is missing", () => {
    const lo = lastObservations(withObs(null, base().tca), base().tca, 12);
    expect(lo.sat1).toBeNull();
    expect(lo.gapH).toBeNull();
    expect(lo.warn).toBe(false);
  });
});

describe("CDM history and trend (B1, B2)", () => {
  const history = () => {
    const s = new Store();
    s.importDocuments(readdirSync(join(DATA, "reconstructed")).map((f) => ({ name: f, content: read("reconstructed", f), label: "r" })));
    return s.getSnapshot().events.find((e) => e.revisions.length === 4)!;
  };
  it("lists every CDM of the event oldest first, with the source Pc kept as reported", () => {
    const pts = trendPoints(history());
    expect(pts.map((p) => p.n)).toEqual([1, 2, 3, 4]);
    expect(pts.map((p) => p.createdMs)).toEqual([...pts.map((p) => p.createdMs)].sort((a, b) => a - b));
    expect(pts.map((p) => p.pc)).toEqual([7.85469e-7, 2.885737e-8, 7.665263e-9, 0]); // Appendix A values, in creation order
    expect(pts.every((p) => p.hoursToTca > 0)).toBe(true);
  });
  it("classifies the change in Pc, including missing values", () => {
    expect(pcChange(1e-6, 1e-7)).toBe("lower");
    expect(pcChange(1e-7, 1e-6)).toBe("higher");
    expect(pcChange(0, 0)).toBe("same");
    expect(pcChange(null, 1e-7)).toBe("n/a");
  });
  it("puts non-zero Pc on a log axis and a source zero on the floor line", () => {
    const axis = pcAxis(trendPoints(history()))!;
    expect(axis).toEqual({ floorExp: -10, minExp: -9, maxExp: -6 });
    expect(pcFraction(0, axis)).toBe(0);
    expect(pcFraction(null, axis)).toBe(0);
    expect(pcFraction(1e-6, axis)).toBeCloseTo(1, 9);
    expect(pcFraction(1e-9, axis)).toBeCloseTo(0.25, 9);
    expect(pcFraction(1e-6, axis)).toBeGreaterThan(pcFraction(1e-8, axis));
  });
  it("has no axis when no CDM has a non-zero Pc", () => {
    const pts = trendPoints(history()).map((p) => ({ ...p, pc: 0 }));
    expect(pcAxis(pts)).toBeNull();
  });
});

describe("operator phone summary (C1)", () => {
  const c = () => cdm("reconstructed", "cdm_set_1.json");
  const H = 3600000;
  it("names both objects, the time to TCA and the collision chance", () => {
    const x = c();
    const text = phoneSummary(x, x.tca - 13 * H);
    expect(text).toContain("closest approach in 13.0 hours");
    expect(text).toContain(`collision chance ${formatShortOdds(x.pc)}`);
    expect(text).toContain(x.sat1.name ?? x.sat1.designator);
    expect(text).toContain(x.sat2.name ?? x.sat2.designator);
  });
  it("says so when the pass is over, and handles a zero or missing Pc", () => {
    const x = c();
    expect(phoneSummary(x, x.tca + 2 * H)).toContain("closest approach was 2.0 hours ago");
    expect(phoneSummary({ ...x, pc: 0 }, x.tca)).toContain("collision chance 0%");
    expect(phoneSummary({ ...x, pc: null }, x.tca)).toContain("collision chance not provided");
  });
  it("marks a debris object", () => {
    const x = c();
    expect(phoneSummary({ ...x, sat2: { ...x.sat2, objectType: "DEBRIS" } }, x.tca)).toContain(`${x.sat2.name ?? x.sat2.designator} (debris)`);
  });
});

describe("one-at-a-time loading (D2)", () => {
  const all = () => ["reconstructed", "synthetic"].flatMap((f) => readdirSync(join(DATA, f)).filter((n) => n.endsWith(".json")).map((n) => ({ name: n, content: read(f, n), label: f })));
  it("orders documents by CDM creation date, oldest first, with unparseable ones last", () => {
    const junk = { name: "junk.txt", content: "not a cdm", label: "x" };
    const shuffled = [junk, ...all().reverse()];
    const out = sortByCreation(shuffled);
    const times = out.slice(0, -1).map((d) => parseDocument(d.content, d.name)[0].cdm!.creationDate);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(out[out.length - 1].name).toBe("junk.txt");
  });
  it("importing one document at a time gives the same events as importing them all at once", () => {
    const one = new Store();
    sortByCreation(all()).forEach((d) => one.importDocuments([d]));
    const bulk = new Store();
    bulk.importDocuments(all());
    // Compare the grouping (which files form each event, in order); the event key is named after the first CDM to arrive, so it can differ.
    const shape = (s: Store) => s.getSnapshot().events.map((e) => e.revisions.map((r) => r.sourceFile).join(",")).sort();
    expect(shape(one)).toEqual(shape(bulk));
  });
});

describe("severity bands and action labels (G7, G8)", () => {
  it("has one band per severity, in the order ACTION, WATCH, LOW, ZERO, UNKNOWN", () => {
    expect(severityBands().map((b) => b.severity)).toEqual(["ACTION", "WATCH", "LOW", "ZERO", "UNKNOWN"]);
  });
  it("states the limits from CONFIG in plain words, so the legend cannot drift from the rating", () => {
    const [action, watch] = severityBands();
    expect(action.range).toBe("Pc of 1 in 10,000 or higher");
    expect(watch.range).toBe("Pc from 1 in 10,000,000 up to 1 in 10,000");
  });
  it("gives every severity an action label, and only ACTION asks for a maneuver", () => {
    expect(actionLabel("ACTION")).toMatch(/maneuver/i);
    for (const s of ["WATCH", "LOW", "ZERO", "UNKNOWN"] as const) expect(actionLabel(s)).not.toMatch(/maneuver/i);
  });
  it("marks ACTION, WATCH and UNKNOWN as needing attention", () => {
    expect(["ACTION", "WATCH", "LOW", "ZERO", "UNKNOWN"].filter((s) => needsAttention(s as never))).toEqual(["ACTION", "WATCH", "UNKNOWN"]);
  });
});
