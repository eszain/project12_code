// Positions for the 3D replay (issue #26): both objects from 10 s before the closest approach (TCA) to 10 s after,
// as Earth-fixed (ITRF) positions in metres, which is the frame CesiumJS draws in.
// The 3D view draws the positions from orbitTrack() (orbit-track.ts, two-body propagation). replayTrack() below is the
// straight-line version it replaced: over ±10 s its absolute positions drift a few hundred metres from the orbit, but
// both objects drift alike, so the gap stays right. It is kept as the reference the orbit track is checked against.

import { isEarthFixed } from "./frames";
import { add, cross, dot, norm, scale, sub, unit, type V3 } from "./linalg";
import type { NormalizedCdm } from "./parser";

export const REPLAY_HALF_SPAN_S = 10;

export interface ReplaySample {
  /** Seconds from the closest approach (negative before it). */
  t: number;
  /** Earth-fixed positions in metres. */
  primary: V3;
  secondary: V3;
  separationM: number;
}

export interface ReplayTrack {
  tcaMs: number;
  samples: ReplaySample[];
  /** When the objects are closest within the window, and how far apart they are then. */
  closest: { t: number; separationM: number; primary: V3; secondary: V3 };
}

export type ReplayResult = ({ available: true } & ReplayTrack) | { available: false; reason: string };

const stateM = (o: NormalizedCdm["sat1"]) => ({ r: scale(o.positionKm!, 1000), v: scale(o.velocityKms!, 1000) });
const at = (s: { r: V3; v: V3 }, t: number): V3 => add(s.r, scale(s.v, t));

export function replayTrack(cdm: NormalizedCdm, stepS = 0.25): ReplayResult {
  for (const [label, o] of [["primary", cdm.sat1], ["secondary", cdm.sat2]] as const) {
    if (!o.positionKm || !o.velocityKms) return { available: false, reason: `The CDM has no position and velocity for the ${label} object, so it cannot be placed on the globe.` };
    if (!isEarthFixed(o.refFrame)) return { available: false, reason: `The ${label} object's position is in the ${o.refFrame ?? "unstated"} frame. The 3D view needs Earth-fixed (ITRF) positions for now.` };
  }
  const p = stateM(cdm.sat1);
  const s = stateM(cdm.sat2);
  const sample = (t: number): ReplaySample => {
    const primary = at(p, t);
    const secondary = at(s, t);
    return { t, primary, secondary, separationM: norm(sub(secondary, primary)) };
  };
  const samples: ReplaySample[] = [];
  const n = Math.round((2 * REPLAY_HALF_SPAN_S) / stepS);
  for (let i = 0; i <= n; i++) samples.push(sample(-REPLAY_HALF_SPAN_S + i * stepS));

  // Straight-line relative motion is closest at t = -(dr . dv) / |dv|^2; at the CDM's TCA that is ~0.
  const dr = sub(s.r, p.r);
  const dv = sub(s.v, p.v);
  const vv = dot(dv, dv);
  const tMin = vv > 0 ? Math.min(Math.max(-dot(dr, dv) / vv, -REPLAY_HALF_SPAN_S), REPLAY_HALF_SPAN_S) : 0;
  const c = sample(tMin);
  return { available: true, tcaMs: cdm.tca, samples, closest: { t: c.t, separationM: c.separationM, primary: c.primary, secondary: c.secondary } };
}

/**
 * Playback speed as a fraction of real time, `t` seconds from the closest approach. The pass itself lasts a few
 * milliseconds, so the replay runs fast while the objects are far apart and slows to 1/100 of real speed at the
 * closest approach: about 20 s of playback in all.
 */
export const playbackRate = (t: number) => Math.min(Math.max(Math.abs(t), 0.01), 2);

/** Geocentric latitude and longitude (degrees) of the point under an Earth-fixed position. */
export function subPoint(r: V3): { lat: number; lon: number } {
  return { lat: (Math.asin(r[2] / norm(r)) * 180) / Math.PI, lon: (Math.atan2(r[1], r[0]) * 180) / Math.PI };
}

/**
 * Camera offset for the close-up, in metres east, north and up of the primary at the closest approach. The camera
 * looks at right angles to both the relative motion and the miss, so the secondary crosses the screen and the full
 * miss distance (including any height difference, which CSA says matters most) is drawn flat, not foreshortened.
 * It looks from the side that is above the pass, tilted a little further up to keep the Earth in view.
 */
export const CLOSE_UP_TILT = 0.25;
export function closeUpOffset(track: ReplayTrack): V3 {
  const first = track.samples[0];
  const last = track.samples[track.samples.length - 1];
  const relVel = sub(sub(last.secondary, last.primary), sub(first.secondary, first.primary));
  const miss = sub(track.closest.secondary, track.closest.primary);
  const up = unit(track.closest.primary);
  const east = unit(cross([0, 0, 1], up));
  const north = cross(up, east);
  // Normal to the plane of the pass; for a direct hit (no miss vector) use the horizontal side of the motion.
  let normal = cross(relVel, norm(miss) > 1e-6 ? miss : up);
  if (norm(normal) < 1e-9) normal = east;
  normal = unit(normal);
  if (dot(normal, up) < 0) normal = scale(normal, -1);
  const distanceM = Math.max(300, 4 * track.closest.separationM);
  const offset = add(scale(normal, distanceM), scale(up, CLOSE_UP_TILT * distanceM));
  return [dot(offset, east), dot(offset, north), dot(offset, up)];
}
