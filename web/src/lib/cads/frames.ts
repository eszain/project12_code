// Reference-frame helpers. Port of cads/analysis/frames.py.
// Space-Track CDM state vectors are ITRF (Earth-fixed): inertial velocity ~ v + omega x r.
// Both objects share the frame rotation, so relative geometry is unaffected.

import { M3, V3, add, cross, dot, mulMM, norm, transpose, unit } from "./linalg";

export const OMEGA_EARTH = 7.292115e-5;
export const MU = 398600.4418;
export const EARTH_RADIUS_KM = 6378.137;
const INERTIAL = new Set(["GCRF", "ICRF", "EME2000", "J2000", "TOD", "MOD", "TEME", "ECI"]);

const isEarthFixed = (f: string | null) => {
  const x = (f ?? "").toUpperCase().replace(/ /g, "");
  return x.startsWith("ITRF") || ["ECEF", "EFG", "WGS84"].includes(x);
};

export function inertialVelocity(pos: V3, vel: V3, refFrame: string | null): { v: V3; note: string } {
  if (isEarthFixed(refFrame)) {
    const omegaXr: V3 = [-OMEGA_EARTH * pos[1], OMEGA_EARTH * pos[0], 0];
    return { v: add(vel, omegaXr), note: `${refFrame} velocity converted to inertial by adding omega_E x r` };
  }
  if (INERTIAL.has((refFrame ?? "").toUpperCase())) return { v: vel, note: `${refFrame} treated as inertial` };
  return { v: vel, note: `reference frame ${refFrame ?? "not stated"}: velocity assumed inertial` };
}

/** Rows are the R, T, N unit vectors in the frame of pos/vel. */
export function rtnMatrix(pos: V3, vel: V3): M3 {
  const r = unit(pos);
  const n = unit(cross(pos, vel));
  const t = cross(n, r);
  return [r, t, n];
}

/** Express a covariance given in object 2's RTN frame in object 1's RTN frame. */
export function rotateCovariance(cov2: M3, rtn1: M3, rtn2: M3): M3 {
  const a = mulMM(rtn1, transpose(rtn2));
  return mulMM(mulMM(a, cov2), transpose(a));
}

export function meanMotion(pos: V3, vInertial: V3): number | null {
  const inv = 2 / norm(pos) - dot(vInertial, vInertial) / MU;
  if (inv <= 0) return null;
  return Math.sqrt(MU / (1 / inv) ** 3);
}

export const meanMotionFromAltitudes = (apogeeKm: number, perigeeKm: number) => Math.sqrt(MU / (EARTH_RADIUS_KM + (apogeeKm + perigeeKm) / 2) ** 3);
