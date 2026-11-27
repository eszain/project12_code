import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MU, inertialVelocity } from "./frames";
import { dot, norm, scale, sub, type V3 } from "./linalg";
import { orbitTrack, propagate } from "./orbit-track";
import { parseDocument, type NormalizedCdm } from "./parser";
import { replayTrack, type ReplayTrack } from "./replay";

const FIXTURES = join(__dirname, "../../../public/fixtures");
const manifest: Record<string, string[]> = JSON.parse(readFileSync(join(FIXTURES, "manifest.json"), "utf8"));
const samples: [string, NormalizedCdm][] = Object.entries(manifest).flatMap(([folder, files]) =>
  files.map((f) => [f, parseDocument(readFileSync(join(FIXTURES, folder, f), "utf8"), f)[0].cdm!] as [string, NormalizedCdm]),
);
const track = (cdm: NormalizedCdm, opts?: Parameters<typeof orbitTrack>[1]): ReplayTrack => {
  const r = orbitTrack(cdm, opts);
  if (!r.available) throw new Error(r.reason);
  return r;
};
const m = (km: V3): V3 => scale(km, 1000);

describe("orbit positions around the closest approach (issue #27)", () => {
  it.each(samples)("%s: starts at the CDM state vectors and passes at the CDM miss distance", (_, cdm) => {
    const t = track(cdm);
    const atTca = t.samples.find((s) => s.t === 0)!;
    expect(norm(sub(atTca.primary, m(cdm.sat1.positionKm!)))).toBeLessThan(1e-6);
    expect(norm(sub(atTca.secondary, m(cdm.sat2.positionKm!)))).toBeLessThan(1e-6);
    // The state vectors and the CDM's MISS_DISTANCE agree to within a few metres.
    expect(Math.abs(atTca.separationM - cdm.missDistanceM)).toBeLessThan(Math.max(5, 0.01 * cdm.missDistanceM));
    // The closest moment is (almost exactly) the CDM's TCA, and nothing in the window is closer.
    expect(Math.abs(t.closest.t)).toBeLessThan(0.01);
    for (const s of t.samples) expect(s.separationM).toBeGreaterThanOrEqual(t.closest.separationM - 1e-6);
  });

  it.each(samples)("%s: moves at the CDM velocity at TCA, and the objects pass at the CDM relative speed", (_, cdm) => {
    // Central difference of the Earth-fixed positions at t = 0 must give the CDM's Earth-fixed velocity.
    const t = track(cdm, { fromS: -0.001, toS: 0.001, stepS: 0.001 });
    const [a, , b] = t.samples;
    const vPrimary = scale(sub(b.primary, a.primary), 1 / 0.002);
    expect(norm(sub(vPrimary, m(cdm.sat1.velocityKms!)))).toBeLessThan(0.01);
    const relSpeed = norm(scale(sub(sub(b.secondary, b.primary), sub(a.secondary, a.primary)), 1 / 0.002));
    expect(Math.abs(relSpeed / cdm.relativeSpeedMs! - 1)).toBeLessThan(0.01);
  });

  it("follows the curved orbit, not the straight line", () => {
    const cdm = samples[0][1];
    const curved = track(cdm).samples.at(-1)!;
    const straight = (replayTrack(cdm) as ReplayTrack).samples.at(-1)!;
    // After 10 s gravity has pulled the primary off the straight line (measured: 385 to 392 m on the 9 samples).
    const off = norm(sub(curved.primary, straight.primary));
    expect(off).toBeGreaterThan(100);
    expect(off).toBeLessThan(700);
    // Both objects are pulled alike, so the gap between them barely changes (measured: under 3 m).
    expect(Math.abs(curved.separationM - straight.separationM)).toBeLessThan(5);
  });

  it("keeps the orbital energy constant (gravity only)", () => {
    const cdm = samples[0][1];
    const s0 = { r: cdm.sat1.positionKm!, v: inertialVelocity(cdm.sat1.positionKm!, cdm.sat1.velocityKms!, cdm.sat1.refFrame).v };
    const energy = (s: { r: V3; v: V3 }) => dot(s.v, s.v) / 2 - MU / norm(s.r);
    for (const t of [-10, 10, 60]) expect(Math.abs(energy(propagate(s0, t)) / energy(s0) - 1)).toBeLessThan(1e-10);
  });

  it("covers the requested window and step", () => {
    const cdm = samples[0][1];
    const def = track(cdm);
    expect(def.samples).toHaveLength(81);
    expect(def.samples[0].t).toBe(-10);
    expect(def.samples.at(-1)!.t).toBe(10);
    const custom = track(cdm, { fromS: -2, toS: 4, stepS: 0.5 });
    expect(custom.samples).toHaveLength(13);
    expect(custom.samples.at(-1)!.t).toBe(4);
    expect(() => orbitTrack(cdm, { stepS: 0 })).toThrow(RangeError);
    expect(() => orbitTrack(cdm, { fromS: 5, toS: 5 })).toThrow(RangeError);
  });

  it("explains why an event cannot be propagated", () => {
    const cdm = samples[0][1];
    const noState = orbitTrack({ ...cdm, sat2: { ...cdm.sat2, velocityKms: null } });
    expect(!noState.available && noState.reason).toMatch(/no position and velocity for the secondary/);
    const inertial = orbitTrack({ ...cdm, sat1: { ...cdm.sat1, refFrame: "EME2000" } });
    expect(!inertial.available && inertial.reason).toMatch(/EME2000 frame/);
  });
});
