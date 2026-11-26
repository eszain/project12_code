import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cross, dot, norm, scale, sub, unit } from "./linalg";
import { parseDocument, type NormalizedCdm } from "./parser";
import { CLOSE_UP_TILT, REPLAY_HALF_SPAN_S, closeUpOffset, playbackRate, replayTrack, subPoint, type ReplayTrack } from "./replay";

const FIXTURES = join(__dirname, "../../../public/fixtures");
const manifest: Record<string, string[]> = JSON.parse(readFileSync(join(FIXTURES, "manifest.json"), "utf8"));
const samples: [string, NormalizedCdm][] = Object.entries(manifest).flatMap(([folder, files]) =>
  files.map((f) => [f, parseDocument(readFileSync(join(FIXTURES, folder, f), "utf8"), f)[0].cdm!] as [string, NormalizedCdm]),
);
const trackOf = (cdm: NormalizedCdm): ReplayTrack => {
  const r = replayTrack(cdm);
  if (!r.available) throw new Error(r.reason);
  return r;
};

describe("3D replay positions", () => {
  it.each(samples)("%s: starts at the CDM state vectors and passes at the CDM miss distance", (_, cdm) => {
    const track = trackOf(cdm);
    const atTca = track.samples.find((s) => s.t === 0)!;
    expect(norm(sub(atTca.primary, scale(cdm.sat1.positionKm!, 1000)))).toBeLessThan(1e-6);
    expect(norm(sub(atTca.secondary, scale(cdm.sat2.positionKm!, 1000)))).toBeLessThan(1e-6);
    // The state vectors and the CDM's MISS_DISTANCE agree to within a few metres.
    expect(Math.abs(atTca.separationM - cdm.missDistanceM)).toBeLessThan(Math.max(5, 0.01 * cdm.missDistanceM));
    // The closest moment is (almost exactly) the CDM's TCA, and nothing in the window is closer.
    expect(Math.abs(track.closest.t)).toBeLessThan(0.01);
    for (const s of track.samples) expect(s.separationM).toBeGreaterThanOrEqual(track.closest.separationM - 1e-6);
  });

  it("covers 10 s either side of the closest approach and moves at the CDM speed", () => {
    const cdm = samples[0][1];
    const track = trackOf(cdm);
    expect(track.samples[0].t).toBe(-REPLAY_HALF_SPAN_S);
    expect(track.samples.at(-1)!.t).toBe(REPLAY_HALF_SPAN_S);
    const a = track.samples[0];
    const b = track.samples[1];
    expect(norm(sub(b.primary, a.primary)) / (b.t - a.t)).toBeCloseTo(norm(cdm.sat1.velocityKms!) * 1000, 6);
    // At the ends of the window the objects are far apart: about relative speed x 10 s.
    expect(track.samples[0].separationM).toBeCloseTo(cdm.relativeSpeedMs! * REPLAY_HALF_SPAN_S, -3);
  });

  it("explains why an event cannot be shown in 3D", () => {
    const cdm = samples[0][1];
    const noState = replayTrack({ ...cdm, sat2: { ...cdm.sat2, positionKm: null } });
    expect(noState).toMatchObject({ available: false });
    expect(!noState.available && noState.reason).toMatch(/no position and velocity for the secondary/);
    const inertial = replayTrack({ ...cdm, sat1: { ...cdm.sat1, refFrame: "EME2000" } });
    expect(!inertial.available && inertial.reason).toMatch(/EME2000 frame/);
  });

  it("slows to 1/100 of real speed at the closest approach and speeds up away from it", () => {
    expect(playbackRate(0)).toBe(0.01);
    expect(playbackRate(-0.5)).toBe(0.5);
    expect(playbackRate(0.5)).toBe(0.5);
    expect(playbackRate(-10)).toBe(2);
    expect(playbackRate(10)).toBe(2);
  });

  it("gives the latitude and longitude under a position", () => {
    expect(subPoint([7000e3, 0, 0])).toEqual({ lat: 0, lon: 0 });
    const ne = subPoint([1, 1, Math.SQRT2]);
    expect(ne.lat).toBeCloseTo(45, 9);
    expect(ne.lon).toBeCloseTo(45, 9);
    expect(subPoint([0, -1, 0]).lon).toBeCloseTo(-90, 9);
  });

  it.each(samples)("%s: puts the close-up camera square to the pass and the miss, from above", (_, cdm) => {
    const track = trackOf(cdm);
    const [e, n, u] = closeUpOffset(track);
    const up = unit(track.closest.primary);
    const east = unit(cross([0, 0, 1], up));
    const north = cross(up, east);
    const offset = [0, 1, 2].map((k) => east[k] * e + north[k] * n + up[k] * u) as [number, number, number];
    const distance = Math.max(300, 4 * track.closest.separationM);
    // Remove the upward tilt: what is left is the viewing direction, at right angles to the motion and the miss.
    const view = sub(offset, scale(up, CLOSE_UP_TILT * distance));
    const first = track.samples[0];
    const last = track.samples.at(-1)!;
    const relVel = sub(sub(last.secondary, last.primary), sub(first.secondary, first.primary));
    const miss = sub(track.closest.secondary, track.closest.primary);
    expect(norm(view)).toBeCloseTo(distance, 6);
    expect(Math.abs(dot(unit(view), unit(relVel)))).toBeLessThan(1e-6);
    expect(Math.abs(dot(unit(view), unit(miss)))).toBeLessThan(1e-6);
    expect(dot(view, up)).toBeGreaterThanOrEqual(0);
  });
});
