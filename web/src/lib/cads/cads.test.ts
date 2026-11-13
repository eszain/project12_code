import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { analyzeEvent, formatDistance, missComponentsM, phoneSummary, formatOdds, formatShortOdds, formatSpeed } from "./analyze";
import { groupMessages } from "./correlation";
import { SCALE_NOTE, generateScaleDocs, loadDemoDocuments, sortByCreation } from "./demo";
import { tradeStudy } from "./maneuver";
import { parseDocument } from "./parser";
import { recalculate } from "./pc";
import { CONFIDENCE_LIMITS, calculationDetails, confidenceOf, encounterPicture, missVsUncertainty } from "./details";
import { lastObservations, positionSigmasM } from "./quality";
import { DEFAULT_FILTERS, filterAndSort, isArchived, paginate, statusCounts } from "./register";
import { CONFIG, Store, severityOf } from "./store";
import { hoursBetween } from "./time";
import { actionLabel, needsAttention, severityBands } from "./severity";
import { pcAxis, pcChange, pcFraction, trendPoints } from "./trend";
import { getRevisionChanges } from "./revision-changes";
import { getEventListData } from "./register";

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

it("groups connected TCA revisions regardless of arrival order", () => {
  const second = 1000;

  const messages: [string, string, string, number][] = [
    ["CDM-A", "SAT-1", "SAT-2", 0],
    ["CDM-B", "SAT-1", "SAT-2", 120 * second],
    ["CDM-C", "SAT-2", "SAT-1", 60 * second],
  ];

  for (const order of permutations(messages)) {
    const groups = groupMessages(order, 60);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(["CDM-A", "CDM-B", "CDM-C"]);
  }
});

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


it("keeps two passes 90 minutes apart as separate events", () => {
  const base = JSON.parse(
    read("reconstructed", "cdm_set_1.json")
  );

  const start = Date.parse(base.TCA);

  function makeDoc(id: string, offsetSeconds: number) {
    const document = {
      ...base,
      CDM_ID: id,
      MESSAGE_ID: `separate-${id}`,
      TCA: new Date(
        start + offsetSeconds * 1000
      ).toISOString(),
    };

    return {
      name: `${id}.json`,
      content: JSON.stringify(document),
      label: "test",
    };
  }

  const store = new Store();

  store.importDocuments([
    makeDoc("A", 0),
    makeDoc("C", 5400),
    makeDoc("B", 60),
    makeDoc("D", 5460),
  ]);

  const events = store.getSnapshot().events;

  expect(events).toHaveLength(2);
  expect(
    events.map((event) => event.revisions.length).sort()
  ).toEqual([2, 2]);
});


it("merges existing events when a bridging CDM arrives", () => {
  const base = JSON.parse(
    read("reconstructed", "cdm_set_1.json")
  );

  const start = Date.parse(base.TCA);

  function makeDoc(
    id: string,
    offsetSeconds: number
  ) {
    const document = {
      ...base,
      CDM_ID: id,
      MESSAGE_ID: `bridge-${id}`,
      TCA: new Date(
        start + offsetSeconds * 1000
      ).toISOString(),
    };

    return {
      name: `${id}.json`,
      content: JSON.stringify(document),
      label: "test",
    };
  }

  const store = new Store();

  // A and B initially form two separate events.
  store.importDocuments([
    makeDoc("A", 0),
    makeDoc("B", 120),
  ]);

  expect(store.getSnapshot().events).toHaveLength(2);

  // C falls within 60 seconds of both events.
  store.importDocuments([
    makeDoc("C", 60),
  ]);

  const events = store.getSnapshot().events;

  // All three revisions should now be one event.
  expect(events).toHaveLength(1);
  expect(events[0].revisions).toHaveLength(3);
});


it("keeps the same event groups when CDMs arrive in any order", () => {
  const files = [
    "cdm_set_1.json",
    "cdm_set_2.json",
    "cdm_set_3.json",
    "cdm_set_4.json",
    "cdm_set_5.json",
    "cdm_set_6.json",
  ];

  const expected = [
    "cdm_set_1.json|cdm_set_4.json",
    "cdm_set_2.json|cdm_set_3.json|cdm_set_5.json|cdm_set_6.json",
  ];

  for (const order of permutations(files)) {
    const store = new Store();

    const docs = order.map((file) => ({
      name: file,
      content: read("reconstructed", file),
      label: "test",
    }));

    store.importDocuments(docs);

    const groups = store.getSnapshot().events
      .map((event) =>
        event.revisions
          .map((revision) => revision.sourceFile)
          .sort()
          .join("|")
      )
      .sort();

    expect(groups).toEqual(expected);
  }
});

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
    expect(formatShortOdds(7.665263e-9)).toBe("1 in 130.5M"); // below a billion: unchanged
    expect(formatShortOdds(6.12e-12)).toBe("< 1 in 1B"); // very small values stay short enough for a card
    expect(formatOdds(6.12e-12)).toBe("less than 1 in 1 billion (practically zero)");
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


it("handles missing Pc values without treating them as zero", () => {
  const store = new Store();

  store.importDocuments([
    {
      name: "cdm_set_1.json",
      content: read("reconstructed", "cdm_set_1.json"),
      label: "test",
    },
    {
      name: "cdm_set_4.json",
      content: read("reconstructed", "cdm_set_4.json"),
      label: "test",
    },
  ]);

  const original = store.getSnapshot().events[0];

  // Simulate a missing source Pc in the second revision.
  const event = {
    ...original,
    revisions: original.revisions.map((revision, index) =>
      index === 1
        ? {
            ...revision,
            cdm: {
              ...revision.cdm,
              pc: null,
              pcRaw: null,
            },
          }
        : revision
    ),
  };

  const timeline = getRevisionChanges(event);

  expect(timeline).toHaveLength(2);

  // Missing Pc must not be interpreted as zero.
  expect(timeline[1].pc).toBeNull();

  // Comparing a known Pc with a missing Pc is unavailable.
  expect(timeline[1].pcChange).toBe("n/a");

  // Other revision changes must still be calculated.
  expect(timeline[1].missDistanceChangeM).not.toBeNull();
  expect(timeline[1].tcaChangeS).not.toBeNull();
});


it("reports Pc, miss distance and TCA changes in chronological order", () => {
  const store = new Store();

  store.importDocuments([
    {
      name: "cdm_set_4.json",
      content: read("reconstructed", "cdm_set_4.json"),
      label: "test",
    },
    {
      name: "cdm_set_1.json",
      content: read("reconstructed", "cdm_set_1.json"),
      label: "test",
    },
  ]);

  const event = store.getSnapshot().events[0];
  expect(event.revisions).toHaveLength(2);

  const timeline = getRevisionChanges(event);
  const [first, second] = timeline;

  // Every revision must appear in the timeline.
  expect(timeline).toHaveLength(2);

  // Revisions must be ordered by CDM creation date.
  expect(first.createdAt).toBeLessThanOrEqual(
    second.createdAt
  );

  // The first revision has nothing to compare against.
  expect(first.previousPc).toBeNull();
  expect(first.pcChange).toBe("n/a");
  expect(first.missDistanceChangeM).toBeNull();
  expect(first.tcaChangeS).toBeNull();

  // Verify the changes against the original CDM values.
  const revisions = [...event.revisions].sort(
    (a, b) =>
      a.cdm.creationDate - b.cdm.creationDate ||
      a.id - b.id
  );

  const oldCdm = revisions[0].cdm;
  const newCdm = revisions[1].cdm;

  expect(second.pc).toBe(newCdm.pc);
  expect(second.previousPc).toBe(oldCdm.pc);

  expect(second.missDistanceChangeM).toBeCloseTo(
    newCdm.missDistanceM - oldCdm.missDistanceM
  );

  expect(second.tcaChangeS).toBeCloseTo(
    (newCdm.tca - oldCdm.tca) / 1000
  );

  const expectedPcChange =
    oldCdm.pc === null || newCdm.pc === null
      ? "n/a"
      : newCdm.pc > oldCdm.pc
        ? "higher"
        : newCdm.pc < oldCdm.pc
          ? "lower"
          : "same";

  expect(second.pcChange).toBe(expectedPcChange);
});

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

describe("miss distance against uncertainty and the calculation details (A4, A5, E1)", () => {
  const syn = (n: number) => parseDocument(readFileSync(join(PUBLIC, "fixtures/synthetic", `synthetic_high_risk_${n}.json`), "utf8"), "s")[0].cdm!;
  it("turns the ratio into high, moderate or low confidence at the stated limits", () => {
    expect(confidenceOf(CONFIDENCE_LIMITS.high)).toBe("high");
    expect(confidenceOf(CONFIDENCE_LIMITS.high - 0.01)).toBe("moderate");
    expect(confidenceOf(CONFIDENCE_LIMITS.low)).toBe("moderate");
    expect(confidenceOf(CONFIDENCE_LIMITS.low - 0.01)).toBe("low");
  });
  it("rates a miss far larger than the uncertainty as high confidence, and one smaller than it as low", () => {
    const clear = missVsUncertainty(cdm("reconstructed", "cdm_set_6.json"));
    const close = missVsUncertainty(syn(3));
    if (!clear.available || !close.available) throw new Error("expected both to be available");
    expect(clear.confidence).toBe("high"); // 183 m miss, about 15 m uncertainty
    expect(clear.ratio).toBeGreaterThan(10);
    expect(close.confidence).toBe("low"); // 62 m miss, about 118 m uncertainty
    expect(close.ratio).toBeLessThan(1);
    expect(close.sentence).toMatch(/low confidence/i);
  });
  it("is unavailable, with a reason, when the CDM has no covariance", () => {
    const c = cdm("reconstructed", "cdm_set_1.json");
    const r = missVsUncertainty({ ...c, sat1: { ...c.sat1, covarianceRtn: null } });
    expect(r.available).toBe(false);
  });
  it("reproduces the source Pc within 1% for the synthetic CDMs (CARA-style 2D method)", () => {
    for (const n of [1, 2, 3]) {
      const c = syn(n);
      const rec = calculationDetails(c).recalculation;
      if (!rec.available) throw new Error(rec.reason);
      expect(Math.abs(rec.recalculatedPc / c.pc! - 1)).toBeLessThan(0.01);
    }
  });
  it("lists both objects with RSS uncertainty and keeps the source values untouched", () => {
    const c = syn(3);
    const d = calculationDetails(c);
    expect(d.objects).toHaveLength(2);
    expect(d.objects[0].rssM).toBeCloseTo(Math.hypot(d.objects[0].radialM, d.objects[0].inTrackM, d.objects[0].crossTrackM), 9);
    expect(d.source.pcRaw).toBe(c.pcRaw);
    expect(d.source.missM).toBe(c.missDistanceM);
  });
});

describe("conjunction picture geometry (G4)", () => {
  const syn3 = () => parseDocument(readFileSync(join(PUBLIC, "fixtures/synthetic/synthetic_high_risk_3.json"), "utf8"), "s")[0].cdm!;
  it("places the secondary at the in-plane miss, with 1, 2 and 3 sigma ellipses growing in that order", () => {
    const p = encounterPicture(syn3());
    if (!p.available) throw new Error(p.reason);
    expect(Math.hypot(p.missX, p.missZ)).toBeCloseTo(62, 0);
    expect(p.ellipses.map((e) => e.k)).toEqual([1, 2, 3]);
    expect(p.ellipses[1].majorM).toBeCloseTo(2 * p.ellipses[0].majorM, 9);
    expect(p.ellipses[2].majorM).toBeCloseTo(3 * p.ellipses[0].majorM, 9);
    expect(p.ellipses.every((e) => e.majorM >= e.minorM)).toBe(true);
  });
  it("fits the miss point, the 3 sigma ellipse and the objects inside the view", () => {
    const p = encounterPicture(syn3());
    if (!p.available) throw new Error(p.reason);
    expect(p.extentM).toBeGreaterThan(Math.hypot(p.missX, p.missZ) + p.ellipses[2].majorM);
    expect(p.extentM).toBeGreaterThan(p.hbrM * 4);
  });
  it("is unavailable, with a reason, when the CDM has no covariance", () => {
    const c = syn3();
    expect(encounterPicture({ ...c, sat2: { ...c.sat2, covarianceRtn: null } }).available).toBe(false);
  });
});

describe("register: archive, filters, sort and paging (D1, G5, G6)", () => {

it("filters and searches 180 events efficiently", () => {
  const store = new Store();

  // Read synthetic fixtures directly from disk,
  // since Vitest does not serve browser URLs.
  const templates = [1, 2, 3].map((n) =>
    JSON.parse(
      readFileSync(
        join(
          __dirname,
          `../../../../data/fixtures/synthetic/synthetic_high_risk_${n}.json`
        ),
        "utf8"
      )
    )
  );

  // Generate 180 events in three batches.
  for (let batch = 0; batch < 3; batch++) {
    const docs = generateScaleDocs(
      templates,
      60,
      Date.now(),
      batch * 60
    );

    store.importDocuments(sortByCreation(docs));
  }

  const events = store.getSnapshot().events;

  expect(events).toHaveLength(180);

  const filters = {
    ...DEFAULT_FILTERS,
    query: "SAT",
  };

  const start = performance.now();

  // Run filtering 100 times.
  for (let i = 0; i < 100; i++) {
    getEventListData(
      events,
      filters,
      true,
      Date.now()
    );
  }

  const duration = performance.now() - start;

  expect(duration).toBeLessThan(1000);
});

  const H = 3600000;
  const loaded = () => {
    const s = new Store();
    s.importDocuments(["reconstructed", "synthetic"].flatMap((f) => readdirSync(join(DATA, f)).filter((n) => n.endsWith(".json")).map((n) => ({ name: n, content: read(f, n), label: f }))));
    return s.getSnapshot().events; // 3 events: two SCISAT passes and the CADS TEST event
  };
  const tcaOf = (e: ReturnType<typeof loaded>[number]) => e.revisions[e.revisions.length - 1].cdm.tca;
  it("archives an event once its closest approach has passed, unless the user chose otherwise", () => {
    const [first] = loaded();
    expect(isArchived(first, tcaOf(first) - H)).toBe(false);
    expect(isArchived(first, tcaOf(first) + H)).toBe(true);
    expect(isArchived(first, tcaOf(first) - H, { [first.id]: true })).toBe(true); // archived by hand
    expect(isArchived(first, tcaOf(first) + H, { [first.id]: false })).toBe(false); // kept active by hand
  });
  it("splits events into Active and Archived and counts them", () => {
    const events = loaded();
    const mid = tcaOf(events[0]) + H; // after the first SCISAT pass only
    const c = statusCounts(events, mid);
    expect(c.archived).toBeGreaterThanOrEqual(1);
    expect(c.active + c.archived).toBe(events.length);
    const active = filterAndSort(events, { ...DEFAULT_FILTERS, status: "active" }, false, mid);
    const archived = filterAndSort(events, { ...DEFAULT_FILTERS, status: "archived" }, false, mid);
    expect(active.length).toBe(c.active);
    expect(archived.length).toBe(c.archived);
    expect(active.some((e) => archived.includes(e))).toBe(false);
  });
  it("searches by object name or number, ignoring case", () => {
    const events = loaded();
    const now = Math.min(...events.map(tcaOf)) - H;
    expect(filterAndSort(events, { ...DEFAULT_FILTERS, query: "scisat" }, false, now)).toHaveLength(events.filter((e) => e.revisions[0].cdm.sat1.name === "SCISAT 1").length);
    expect(filterAndSort(events, { ...DEFAULT_FILTERS, query: "99901" }, false, now)).toHaveLength(1);
    expect(filterAndSort(events, { ...DEFAULT_FILTERS, query: "no such object" }, false, now)).toHaveLength(0);
  });
  it("applies the severity and needs-attention filters only after the risk analysis", () => {
    const events = loaded();
    const now = Math.min(...events.map(tcaOf)) - H;
    const action = { ...DEFAULT_FILTERS, severity: "ACTION" as const };
    expect(filterAndSort(events, action, false, now)).toHaveLength(events.length); // not analysed: ignored
    expect(filterAndSort(events, action, true, now)).toHaveLength(1); // only the CADS TEST event is above 1e-4
    expect(filterAndSort(events, { ...DEFAULT_FILTERS, attentionOnly: true }, true, now)).toHaveLength(1); // the two SCISAT events are ZERO
  });
  it("sorts by closest approach, or by highest Pc once analysed", () => {
    const events = loaded();
    const now = Math.min(...events.map(tcaOf)) - H;
    const byTca = filterAndSort(events, DEFAULT_FILTERS, true, now).map(tcaOf);
    expect(byTca).toEqual([...byTca].sort((a, b) => a - b));
    const byRisk = filterAndSort(events, { ...DEFAULT_FILTERS, sort: "risk" }, true, now);
    expect(byRisk[0].revisions[0].cdm.sat1.designator).toBe("99901"); // Pc 3.9e-4 beats the two zeros
  });
  it("pages a long list and keeps the page number in range", () => {
    const items = Array.from({ length: 14 }, (_, i) => i);
    expect(paginate(items, 1).items).toEqual([0, 1, 2, 3, 4, 5]);
    expect(paginate(items, 3).items).toEqual([12, 13]);
    expect(paginate(items, 3).pages).toBe(3);
    expect(paginate(items, 99).page).toBe(3); // clamped
    expect(paginate(items, -4).page).toBe(1);
    expect(paginate([], 1)).toMatchObject({ pages: 1, total: 0, items: [] });
  });
});

describe("generated test events (G5)", () => {
  const templates = () => [1, 2, 3].map((n) => JSON.parse(readFileSync(join(PUBLIC, "fixtures/synthetic", `synthetic_high_risk_${n}.json`), "utf8")) as Record<string, string>);
  const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
  it("makes three CDMs per event, all valid, with unique message IDs and new object numbers", () => {
    const docs = generateScaleDocs(templates(), 20, NOW);
    expect(docs).toHaveLength(60);
    const parsed = docs.map((d) => parseDocument(d.content, d.name)[0]);
    expect(parsed.every((p) => p.cdm && p.errors.length === 0)).toBe(true);
    expect(new Set(parsed.map((p) => p.cdm!.messageKey)).size).toBe(60);
    expect(new Set(parsed.map((p) => p.cdm!.sat1.designator)).size).toBe(20);
  });
  it("groups into exactly the requested number of events, oldest CDM first", () => {
    const s = new Store();
    s.importDocuments(sortByCreation(generateScaleDocs(templates(), 25, NOW)));
    expect(s.getSnapshot().events).toHaveLength(25);
    expect(s.getSnapshot().events.every((e) => e.revisions.length === 3)).toBe(true);
  });
  it("is repeatable, and a second batch never repeats an ID", () => {
    expect(generateScaleDocs(templates(), 5, NOW)).toEqual(generateScaleDocs(templates(), 5, NOW));
    const s = new Store();
    s.importDocuments(generateScaleDocs(templates(), 10, NOW, 0));
    s.importDocuments(generateScaleDocs(templates(), 10, NOW, 10));
    expect(s.getSnapshot().events).toHaveLength(20);
  });
  it("spreads closest approaches around now and covers every severity band", () => {
    const s = new Store();
    s.importDocuments(generateScaleDocs(templates(), 120, NOW));
    const evs = s.getSnapshot().events;
    const tcas = evs.map((e) => e.revisions[2].cdm.tca);
    expect(tcas.some((t) => t < NOW)).toBe(true); // some already passed, so they are archived
    expect(tcas.some((t) => t > NOW + 48 * 3600000)).toBe(true);
    const sevs = new Set(evs.map((e) => severityOf(e.revisions[2].cdm.pc)));
    for (const band of ["ACTION", "WATCH", "LOW", "ZERO"] as const) expect(sevs.has(band)).toBe(true);
  });
  it("marks every generated CDM as a test event", () => {
    for (const d of generateScaleDocs(templates(), 3, NOW)) expect(JSON.parse(d.content)._FIXTURE_NOTE).toBe(SCALE_NOTE);
  });
});
