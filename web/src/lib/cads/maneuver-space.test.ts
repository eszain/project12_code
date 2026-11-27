import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { tradeStudy } from "./maneuver";
import { DEFAULT_LEAD_HOURS, DEFAULT_SPACECRAFT, DEFAULT_TARGETS, maneuverOptionSpace } from "./maneuver-space";
import { parseDocument, type NormalizedCdm } from "./parser";

// Working out maneuver options takes seconds, longer on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

const FIXTURES = join(__dirname, "../../../public/fixtures");
const load = (path: string): NormalizedCdm => parseDocument(readFileSync(join(FIXTURES, path), "utf8"), path)[0].cdm!;
const close = load("synthetic/synthetic_high_risk_3.json"); // CADS TEST, Pc 3.9e-4: above the action level
const clear = load("reconstructed/cdm_set_6.json"); // SCISAT 1, Pc 0

describe("maneuver option space", () => {
  const space = maneuverOptionSpace(close);
  if (!space.available) throw new Error(space.reason);

  it("gives one line per target, with a point for each lead time plus half an orbit", () => {
    expect(space.lines.map((l) => l.targetPc)).toEqual(DEFAULT_TARGETS);
    for (const line of space.lines) {
      expect(line.points.map((p) => p.leadTimeH)).toEqual([space.halfOrbitH, ...DEFAULT_LEAD_HOURS]);
      for (const p of line.points) expect(p.dvMs === null || p.dvMs >= 0).toBe(true);
    }
    expect(space.halfOrbitH).toBeCloseTo(space.orbitalPeriodH / 2, 9);
    expect(space.issuesCommands).toBe(false);
  });

  it("a burn half an orbit before TCA moves the satellite further than the same burn at the last minute", () => {
    // CSA, Nov 13: the biggest effect is 180 degrees around the orbit from where the burn is done.
    const burn: [number, number, number] = [0, 0.05, 0]; // 5 cm/s in-track
    const study = tradeStudy(close, [{ label: "half an orbit", dvRtnMs: burn, leadTimeH: space.halfOrbitH }, { label: "last minute", dvRtnMs: burn, leadTimeH: 0.05 }], DEFAULT_SPACECRAFT, 1e-4, 10);
    const [early, late] = study.candidates;
    // Measured: 340 m against 57 m (no burn: 62 m).
    expect(early.missDistanceM).toBeGreaterThan(3 * late.missDistanceM);
  });

  it("needs a smaller burn half an orbit before TCA than one orbit before", () => {
    const line = space.lines[0];
    const half = line.points.find((p) => p.leadTimeH === space.halfOrbitH)!;
    const oneOrbit = line.points.find((p) => p.leadTimeH === 2)!; // about one orbit (1.6 h) before
    expect(half.dvMs).not.toBeNull();
    expect(half.dvMs!).toBeLessThan(oneOrbit.dvMs!);
  });

  it("a stricter target needs a bigger burn", () => {
    const at = (i: number) => space.lines[i].points[0].dvMs!;
    expect(at(1)).toBeGreaterThan(at(0));
    expect(at(2)).toBeGreaterThan(at(1));
  });

  it("is not generated for events below the action level, and the level can be changed", () => {
    const gated = maneuverOptionSpace(clear);
    expect(gated.available).toBe(false);
    expect(!gated.available && gated.reason).toMatch(/Pc below the 0\.01% maneuver-study threshold/);
    // With the level set to 0 it runs, and finds no burn is needed for a Pc of 0.
    const forced = maneuverOptionSpace(clear, { minPc: 0 });
    if (!forced.available) throw new Error(forced.reason);
    expect(forced.lines[0].points.every((p) => p.dvMs === 0)).toBe(true);
  });

  it("explains when the CDM has no Pc or no orbit data", () => {
    expect(maneuverOptionSpace({ ...close, pc: null })).toEqual({ available: false, reason: "The CDM has no collision probability." });
    const noOrbit = maneuverOptionSpace({ ...close, sat1: { ...close.sat1, covarianceRtn: null } }, { minPc: 0 });
    expect(noOrbit.available).toBe(false);
  });

  it("runs in a few seconds and reuses the result for the same CDM", () => {
    const fresh = { ...close };
    const t0 = performance.now();
    const a = maneuverOptionSpace(fresh);
    const firstMs = performance.now() - t0;
    expect(firstMs).toBeLessThan(20_000); // about 1 to 3 s on a normal machine; this only guards against something pathological
    expect(maneuverOptionSpace(fresh)).toBe(a);
  });
});
