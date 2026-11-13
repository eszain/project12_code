import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { missVsUncertainty } from "./details";
import { riskChecks } from "./risk-checks";
import { Store, latestRevision, severityOf, type CdmEvent } from "./store";

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

  it("returns the four checks in order", () => {
    expect(checks.map((c) => c.name)).toEqual(["Probability level", "Trend", "Confidence", "Time to act"]);
  });

  it("1. rates the CDM's Pc against the action level", () => {
    expect(result("Probability level")).toBe("1 in 2,571: at or above the action level of 1 in 10k, so ACTION");
  });

  it("2. compares the latest Pc with the previous CDM", () => {
    expect(result("Trend")).toBe("Rising: 1 in 5,528 to 1 in 2,571");
  });

  it("3. divides the miss distance by the uncertainty, matching the dashboard's comparison", () => {
    const m = missVsUncertainty(latestRevision(test).cdm);
    if (!m.available) throw new Error(m.reason);
    expect(result("Confidence")).toContain(`= ${m.ratio.toFixed(1)}x, so ${m.confidence} confidence`);
    expect(result("Confidence")).toMatch(/^62 m miss \//);
    expect(m.confidence).toBe("low");
  });

  it("4. gives the hours until closest approach, or how long ago it passed", () => {
    expect(result("Time to act")).toBe("15.7 h until closest approach");
    const after = riskChecks(test, tca + 2 * HOUR).find((c) => c.name === "Time to act")!.result;
    expect(after).toBe("Closest approach passed 2.0 h ago");
  });

  it("agrees with the severity the dashboard shows, for every sample event", () => {
    const label = { ACTION: "ACTION", WATCH: "WATCH", LOW: "LOW", ZERO: "CLEAR", UNKNOWN: "cannot be rated" };
    for (const event of load(ALL)) {
      const level = riskChecks(event, 0)[0].result;
      expect(level).toContain(label[severityOf(latestRevision(event).cdm.pc)]);
    }
  });

  it("says so when there is only one CDM, or a Pc is missing", () => {
    const [single] = load([SYNTHETIC[0]]);
    expect(riskChecks(single, 0)[1].result).toBe("Only one CDM so far, nothing to compare yet");

    const noPc: CdmEvent = { ...test, revisions: test.revisions.map((r, i) => (i === test.revisions.length - 1 ? { ...r, cdm: { ...r.cdm, pc: null } } : r)) };
    const [level, trend] = riskChecks(noPc, 0);
    expect(level.result).toBe("Not provided in the CDM, so the event cannot be rated");
    expect(trend.result).toBe("Cannot compare: a CDM has no Pc");
  });
});
