import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { M2 } from "./linalg";
import { pcCircle } from "./pc";
import { parseDocument, type NormalizedCdm } from "./parser";
import { chanPc, expandedPc, zoneOf } from "./pc-methods";
import { CONFIG } from "./store";

const FIXTURES = join(__dirname, "../../../public/fixtures");
const manifest: Record<string, string[]> = JSON.parse(readFileSync(join(FIXTURES, "manifest.json"), "utf8"));
const samples: [string, NormalizedCdm][] = Object.entries(manifest).flatMap(([folder, files]) =>
  files.map((f) => [f, parseDocument(readFileSync(join(FIXTURES, folder, f), "utf8"), f)[0].cdm!] as [string, NormalizedCdm]),
);
const byName = (name: string) => samples.find(([f]) => f === name)![1];

describe("expanded Pc analysis", () => {
  it("Chan's series equals Foster's integration for a round uncertainty (where Chan is exact)", () => {
    for (const [sigma, miss, r] of [[50, [30, 10], 5], [200, [400, -100], 20], [10, [0, 0], 3], [1000, [5000, 2000], 15]] as [number, [number, number], number][]) {
      const cov: M2 = [[sigma * sigma, 0], [0, sigma * sigma]];
      expect(Math.abs(chanPc(miss, cov, r) / pcCircle(miss, cov, r) - 1)).toBeLessThan(1e-6);
    }
  });

  it.each(samples)("%s: Chan and Foster agree on the sample CDMs", (_, cdm) => {
    const e = expandedPc(cdm);
    if (!e.available) throw new Error(e.reason);
    const [foster, chan] = e.methods;
    // Measured on the 9 samples: within 0.06% for every Pc above 1e-22, and 0.7% for a Pc near 1e-35.
    expect(Math.abs(chan.pc / foster.pc - 1)).toBeLessThan(foster.pc > 1e-22 ? 1e-3 : 1e-2);
  });

  it.each(samples)("%s: the worst case is never below the normal (Foster) Pc", (_, cdm) => {
    const e = expandedPc(cdm);
    if (!e.available) throw new Error(e.reason);
    expect(e.worst.pc).toBeGreaterThanOrEqual(e.methods[0].pc);
    expect(e.methods.map((m) => m.name)).toEqual(["Foster", "Chan", "Expanded covariance"]);
  });

  it("finds a larger Pc when the uncertainty is scaled, and says by how much", () => {
    // CADS TEST (62 m miss, small uncertainty): shrinking the uncertainty makes a hit more likely.
    const e = expandedPc(byName("synthetic_high_risk_3.json"));
    if (!e.available) throw new Error(e.reason);
    const expanded = e.methods[2];
    expect(expanded.pc).toBeGreaterThan(e.methods[0].pc);
    expect(expanded.note).toMatch(/^uncertainty x(0\.5|0\.75|1\.5|2|3)$/);
  });

  it("puts each event in a green, yellow or red zone from the watch and action levels", () => {
    expect(zoneOf(CONFIG.pcAction)).toBe("red");
    expect(zoneOf(CONFIG.pcAction * 0.99)).toBe("yellow");
    expect(zoneOf(CONFIG.pcWatch)).toBe("yellow");
    expect(zoneOf(CONFIG.pcWatch * 0.99)).toBe("green");
    const test = expandedPc(byName("synthetic_high_risk_3.json"));
    expect(test.available && test.zone).toBe("red");
    const scisat = expandedPc(byName("cdm_set_6.json"));
    expect(scisat.available && scisat.zone).toBe("green");
  });

  it("explains when it cannot run", () => {
    const cdm = samples[0][1];
    const e = expandedPc({ ...cdm, sat2: { ...cdm.sat2, covarianceRtn: null } });
    expect(e.available).toBe(false);
    expect(!e.available && e.reason).toMatch(/covariance/);
  });
});
