// Orbit positions around the closest approach, for the 3D replay (issue #27).
//
// Method: two-body propagation.
//   1. Start from each object's state vector at TCA in the CDM (Earth-fixed, ITRF).
//   2. Convert to an inertial frame: the Earth-fixed axes frozen at TCA, with velocity v + omega x r.
//   3. Propagate under Earth's gravity only, a = -MU r / |r|^3, with fourth-order Runge-Kutta (RK4).
//   4. Rotate back to Earth-fixed axes at each time (the Earth turns by omega * t), which is what CesiumJS draws in.
//
// Assumptions: two-body only (no J2, drag, Sun or Moon). Over +/-10 s these change the positions by far less than
// a metre. Positions are in metres. The output has the same shape as replayTrack() in replay.ts.

import { MU, OMEGA_EARTH, inertialVelocity, isEarthFixed } from "./frames";
import { add, dot, norm, scale, sub, type V3 } from "./linalg";
import type { NormalizedCdm } from "./parser";
import type { ReplayResult, ReplaySample } from "./replay";

interface State {
  r: V3; // km, inertial
  v: V3; // km/s, inertial
}

const gravity = (r: V3): V3 => scale(r, -MU / norm(r) ** 3);

/** One RK4 step of length h seconds. */
function rk4Step(s: State, h: number): State {
  const k1v = gravity(s.r);
  const k1r = s.v;
  const k2v = gravity(add(s.r, scale(k1r, h / 2)));
  const k2r = add(s.v, scale(k1v, h / 2));
  const k3v = gravity(add(s.r, scale(k2r, h / 2)));
  const k3r = add(s.v, scale(k2v, h / 2));
  const k4v = gravity(add(s.r, scale(k3r, h)));
  const k4r = add(s.v, scale(k3v, h));
  return {
    r: add(s.r, scale(add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), h / 6)),
    v: add(s.v, scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), h / 6)),
  };
}

/** Inertial state t seconds from TCA (t may be negative), in steps of at most 1 s. */
export function propagate(s: State, t: number): State {
  const n = Math.max(1, Math.ceil(Math.abs(t)));
  let out = s;
  for (let i = 0; i < n; i++) out = rk4Step(out, t / n);
  return out;
}

/** Inertial position (km) at time t, expressed in the Earth-fixed axes of that moment, in metres. */
function toEarthFixedM(r: V3, t: number): V3 {
  const th = OMEGA_EARTH * t;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [(r[0] * c + r[1] * s) * 1000, (-r[0] * s + r[1] * c) * 1000, r[2] * 1000];
}

export function orbitTrack(cdm: NormalizedCdm, { fromS = -10, toS = 10, stepS = 0.25 } = {}): ReplayResult {
  if (!(stepS > 0) || !(fromS < toS)) throw new RangeError("stepS must be positive and fromS must be before toS");

  // 1. Both objects need a state vector in an Earth-fixed frame.
  for (const [label, o] of [["primary", cdm.sat1], ["secondary", cdm.sat2]] as const) {
    if (!o.positionKm || !o.velocityKms) return { available: false, reason: `The CDM has no position and velocity for the ${label} object, so its orbit cannot be propagated.` };
    if (!isEarthFixed(o.refFrame)) return { available: false, reason: `The ${label} object's state vector is in the ${o.refFrame ?? "unstated"} frame. Orbit propagation for the 3D view needs Earth-fixed (ITRF) state vectors.` };
  }

  // 2. Inertial starting states at TCA.
  const start = (o: NormalizedCdm["sat1"]): State => ({ r: o.positionKm!, v: inertialVelocity(o.positionKm!, o.velocityKms!, o.refFrame).v });
  const p0 = start(cdm.sat1);
  const s0 = start(cdm.sat2);

  // 3 and 4. Propagate to time t and rotate back to Earth-fixed.
  const sample = (t: number): ReplaySample => {
    const primary = toEarthFixedM(propagate(p0, t).r, t);
    const secondary = toEarthFixedM(propagate(s0, t).r, t);
    return { t, primary, secondary, separationM: norm(sub(secondary, primary)) };
  };

  // 5. Evenly spaced samples across the window.
  const samples: ReplaySample[] = [];
  const n = Math.round((toS - fromS) / stepS);
  for (let i = 0; i <= n; i++) samples.push(sample(fromS + i * stepS));

  // 6. Closest moment: over a few seconds the relative motion is a straight line, closest at -(dr.dv)/|dv|^2.
  const dr = sub(s0.r, p0.r);
  const dv = sub(s0.v, p0.v);
  const vv = dot(dv, dv);
  const tMin = vv > 0 ? Math.min(Math.max(-dot(dr, dv) / vv, fromS), toS) : 0;
  const c = sample(tMin);
  return { available: true, tcaMs: cdm.tca, samples, closest: { t: c.t, separationM: c.separationM, primary: c.primary, secondary: c.secondary } };
}
