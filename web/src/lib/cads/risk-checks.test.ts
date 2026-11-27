import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { formatShortOdds, missComponentsM } from "./analyze";
import { missVsUncertainty } from "./details";
import { expandedPc } from "./pc-methods";
import { positionSigmasM } from "./quality";
import { riskChecks } from "./risk-checks";
import { Store, latestRevision, severityOf, type CdmEvent } from "./store";

// Working out maneuver options takes seconds, longer on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

const DATA = join(__dirname, "../../../../data/fixtures");
const doc = (folder: string, name: string) => ({ name, content: readFileSync(join(DATA, folder, name), "utf8"), label: "test" });
const HOUR = 3600000;

// Load CDM files into a fresh store and return its events (the same grouping the dashboard uses).
function load(files: [string, string][]): CdmEvent[] {
  const store = new Store();
  store.importDocuments(files.map(([folder, name]) => doc(folder, name)));
  return store.getSnapshot().events;
}

const SYNTHETIC: [string, string][] = [1, 2, 3].map((n) => ["synthetic", `synthetic_high_risk_${n}.json`]);
const ALL: [string, string][] = [...SYNTHETIC, ...[1, 2, 3, 4, 5, 6].map((n): [string, string] => ["reconstructed", `cdm_set_${n}.json`])];

describe("risk analysis checks (issue #9)", () => {
  const [test] = load(SYNTHETIC); // CADS TEST event: 3 CDMs, latest Pc 3.888786E-04, miss 62 m
  const tca = latestRevision(test).cdm.tca;
  const checks = riskChecks(test, tca - 15.7 * HOUR);
  const result = (name: string) => checks.find((c) => c.name === name)!.result;

  it("returns the seven checks in order", () => {
    expect(checks.map((c) => c.name)).toEqual(["Pc level", "Pc trend", "Miss / σ", "Time to TCA", "Radial separation", "Expanded Pc", "Maneuver options"]);
  });

  it("7. gives the maneuver options only for events at the action level", () => {
    expect(result("Maneuver options")).toMatch(/^Study only\. Δv to reach 1 in 10k: [\d.]+ cm\/s -in-track at TCA−0\.8 h \(½ orbit\); [\d.]+ cm\/s \+in-track at TCA−48 h$/);
    const [clear] = load([["reconstructed", "cdm_set_6.json"]]);
    expect(riskChecks(clear, 0)[6].result).toBe("Not generated: Pc below the 1 in 10k maneuver-study threshold");
  });

  it("5. compares the altitude difference with the altitude uncertainty", () => {
    const cdm = latestRevision(test).cdm;
    const r = missComponentsM(cdm)!.radial;
    const sigmaR = Math.hypot(positionSigmasM(cdm.sat1)![0], positionSigmasM(cdm.sat2)![0]);
    expect(result("Radial separation")).toBe(`|ΔR| ${Math.round(r)} m, σR ${Math.round(sigmaR)} m = ${(r / sigmaR).toFixed(1)}σ (within 1σ)`);
    const noCov = riskChecks({ ...test, revisions: [{ ...latestRevision(test), cdm: { ...cdm, sat2: { ...cdm.sat2, covarianceRtn: null } } }] }, 0);
    expect(noCov[4].result).toBe("Unavailable: no relative position or covariance");
  });

  it("6. reports the worst case of the three Pc methods and its zone", () => {
    const e = expandedPc(latestRevision(test).cdm);
    if (!e.available) throw new Error(e.reason);
    expect(result("Expanded Pc")).toMatch(/^RED: worst case 1 in [\d,]+ \(/);
    expect(result("Expanded Pc")).toContain(formatShortOdds(e.worst.pc));
  });

  it("1. rates the CDM's Pc against the action level", () => {
    expect(result("Pc level")).toBe("1 in 2,571, at or above action limit 1 in 10k: ACTION");
  });

  it("2. compares the latest Pc with the previous CDM", () => {
    expect(result("Pc trend")).toBe("Rising: 1 in 5,528 → 1 in 2,571");
  });

  it("3. divides the miss distance by the uncertainty, matching the dashboard's comparison", () => {
    const m = missVsUncertainty(latestRevision(test).cdm);
    if (!m.available) throw new Error(m.reason);
    expect(result("Miss / σ")).toContain(`= ${m.ratio.toFixed(1)}σ (${m.confidence} confidence)`);
    expect(result("Miss / σ")).toMatch(/^62 m miss \//);
    expect(m.confidence).toBe("low");
  });

  it("4. gives the hours until closest approach, or how long ago it passed", () => {
    expect(result("Time to TCA")).toBe("15.7 h");
    const after = riskChecks(test, tca + 2 * HOUR).find((c) => c.name === "Time to TCA")!.result;
    expect(after).toBe("TCA passed 2.0 h ago");
  });

  it("agrees with the severity the dashboard shows, for every sample event", () => {
    const label = { ACTION: "ACTION", WATCH: "WATCH", LOW: "LOW", ZERO: "CLEAR", UNKNOWN: "unrated" };
    for (const event of load(ALL)) {
      const level = riskChecks(event, 0)[0].result;
      expect(level).toContain(label[severityOf(latestRevision(event).cdm.pc)]);
    }
  });

  it("says so when there is only one CDM, or a Pc is missing", () => {
    const [single] = load([SYNTHETIC[0]]);
    expect(riskChecks(single, 0)[1].result).toBe("Single CDM: no trend yet");

    const noPc: CdmEvent = { ...test, revisions: test.revisions.map((r, i) => (i === test.revisions.length - 1 ? { ...r, cdm: { ...r.cdm, pc: null } } : r)) };
    const [level, trend] = riskChecks(noPc, 0);
    expect(level.result).toBe("No Pc in CDM: unrated");
    expect(trend.result).toBe("Unavailable: a CDM has no Pc");
  });
});
