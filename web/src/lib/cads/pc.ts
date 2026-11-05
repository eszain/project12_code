// Experimental 2D probability-of-collision recalculation (FR10, FR11). Port of cads/analysis/pc.py.
//
// STATUS: NOT VALIDATED. Source Pc from the CDM stays authoritative; this only exists to compare
// against CSA/CRAMS and NASA CARA reference cases once available. It never drives severity or alerts.
//
// Method (short-term encounter, Foster-style): project the relative position and the combined
// position covariance onto the plane perpendicular to the relative velocity and integrate the 2D
// Gaussian over a disk of the combined hard-body radius (Gauss-Legendre in radius, trapezoid in angle).

import { M2, M3, V3, addMM, cross, det2, dot, eig2, inv2, isPositiveDefinite3, mulMV, norm, scale, sub, unit } from "./linalg";
import { inertialVelocity, rotateCovariance, rtnMatrix } from "./frames";
import type { NormalizedCdm } from "./parser";

export const PC_METHOD = "2D Gaussian over HBR disk in the encounter plane (short-term encounter, Foster-style numerical integration)";
export const PC_STATUS = "experimental - not validated";

const nodeCache = new Map<number, [number[], number[]]>();
/** Gauss-Legendre nodes/weights on [-1, 1] by Newton iteration on the Legendre polynomial. */
function gaussLegendre(n: number): [number[], number[]] {
  const hit = nodeCache.get(n);
  if (hit) return hit;
  const x: number[] = [];
  const w: number[] = [];
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let pp = 1;
    for (let it = 0; it < 100; it++) {
      let p1 = 1;
      let p2 = 0;
      for (let j = 0; j < n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1);
      }
      pp = (n * (z * p1 - p2)) / (z * z - 1);
      const dz = p1 / pp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x.push(z);
    w.push(2 / ((1 - z * z) * pp * pp));
  }
  nodeCache.set(n, [x, w]);
  return [x, w];
}

export interface EncounterPlane {
  basis: [V3, V3];
  miss2d: [number, number];
  cov2d: M2;
}

export function encounterPlane(relPos: V3, relVel: V3, cov: M3): EncounterPlane {
  const speed = norm(relVel);
  if (speed === 0) throw new Error("relative velocity is zero; encounter plane undefined");
  const y = unit(relVel);
  const along = dot(relPos, y);
  const rPerp = sub(relPos, scale(y, along));
  let x: V3;
  if (norm(rPerp) > 1e-9) x = unit(rPerp);
  else x = unit(cross(y, Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])); // zero miss: any perpendicular
  const z = cross(y, x);
  const cx = mulMV(cov, x);
  const cz = mulMV(cov, z);
  return {
    basis: [x, z],
    miss2d: [dot(x, relPos), dot(z, relPos)],
    cov2d: [
      [dot(x, cx), dot(x, cz)],
      [dot(z, cx), dot(z, cz)],
    ],
  };
}

export function pcCircle(miss: [number, number], cov: M2, hbr: number, nR = 64, nA = 128): number {
  if (hbr <= 0) throw new Error("hard-body radius must be positive");
  const det = det2(cov);
  if (!(det > 0) || cov[0][0] <= 0) throw new Error("encounter-plane covariance is not positive definite");
  const pinv = inv2(cov);
  const [xs, ws] = gaussLegendre(nR);
  const norm2 = 1 / (2 * Math.PI * Math.sqrt(det));
  let sum = 0;
  for (let i = 0; i < nR; i++) {
    const rho = 0.5 * hbr * (xs[i] + 1);
    const wr = 0.5 * hbr * ws[i];
    for (let k = 0; k < nA; k++) {
      const th = (2 * Math.PI * k) / nA;
      const px = miss[0] + rho * Math.cos(th);
      const pz = miss[1] + rho * Math.sin(th);
      const q = pinv[0][0] * px * px + 2 * pinv[0][1] * px * pz + pinv[1][1] * pz * pz;
      sum += wr * rho * Math.exp(-0.5 * q) * norm2;
    }
  }
  return Math.min(Math.max(sum * ((2 * Math.PI) / nA), 0), 1);
}

export function hardBodyRadius(cdm: NormalizedCdm, defaultM: number, overrideM?: number | null): { valueM: number; source: string } {
  if (overrideM) return { valueM: overrideM, source: "user override" };
  if (cdm.effectiveHbrM) return { valueM: cdm.effectiveHbrM, source: "COMMENT_EFFECTIVE_HBR in CDM" };
  const a1 = cdm.sat1.areaPcM2;
  const a2 = cdm.sat2.areaPcM2;
  if (a1 && a2 && a1 > 0 && a2 > 0) return { valueM: Math.sqrt(a1 / Math.PI) + Math.sqrt(a2 / Math.PI), source: "sqrt(AREA_PC/pi) of SAT1 + SAT2 (convention to confirm with CSA)" };
  return { valueM: defaultM, source: `default ${defaultM} m (CDM gives no usable size)` };
}

export interface EncounterContext {
  relPos: V3;
  relVel: V3;
  plane: EncounterPlane;
  hbr: { valueM: number; source: string };
  notes: string[];
}

export function buildContext(cdm: NormalizedCdm, defaultHbrM: number, hbrOverrideM?: number | null): EncounterContext {
  if (!cdm.relPosRtnM || !cdm.relVelRtnMs) throw new Error("CDM has no RELATIVE_POSITION/RELATIVE_VELOCITY (RTN)");
  for (const [label, o] of [["SAT1", cdm.sat1], ["SAT2", cdm.sat2]] as const) {
    if (!o.covarianceRtn) throw new Error(`${label} position covariance not provided`);
    if (!o.positionKm || !o.velocityKms) throw new Error(`${label} state vector not provided (needed to align the RTN frames)`);
  }
  const { sat1, sat2 } = cdm;
  const i1 = inertialVelocity(sat1.positionKm!, sat1.velocityKms!, sat1.refFrame);
  const i2 = inertialVelocity(sat2.positionKm!, sat2.velocityKms!, sat2.refFrame);
  const rtn1 = rtnMatrix(sat1.positionKm!, i1.v);
  const rtn2 = rtnMatrix(sat2.positionKm!, i2.v);
  const combined = addMM(sat1.covarianceRtn!, rotateCovariance(sat2.covarianceRtn!, rtn1, rtn2));
  if (!isPositiveDefinite3(combined)) throw new Error("combined position covariance is not positive definite");
  const notes = [`SAT1: ${i1.note}`, `SAT2: ${i2.note}`, "Combined covariance = SAT1 + SAT2 position covariance (no scale factors, no cross-correlation)"];
  const stateRel = mulMV(rtn1, scale(sub(sat2.positionKm!, sat1.positionKm!), 1000));
  const mismatch = norm(sub(stateRel, cdm.relPosRtnM));
  if (mismatch > Math.max(5, 0.01 * norm(cdm.relPosRtnM))) notes.push(`WARNING: state vectors imply a relative position ${mismatch.toFixed(1)} m away from RELATIVE_POSITION`);
  return { relPos: cdm.relPosRtnM, relVel: cdm.relVelRtnMs, plane: encounterPlane(cdm.relPosRtnM, cdm.relVelRtnMs, combined), hbr: hardBodyRadius(cdm, defaultHbrM, hbrOverrideM), notes };
}

export type Recalculation =
  | { available: false; reason: string; status: string }
  | {
      available: true;
      status: string;
      method: string;
      recalculatedPc: number;
      ratioToSource: number | null;
      hbrM: number;
      hbrSource: string;
      mahalanobis: number;
      sigmaMajorM: number;
      sigmaMinorM: number;
      notes: string[];
    };

export function recalculate(cdm: NormalizedCdm, defaultHbrM: number, hbrOverrideM?: number | null): Recalculation {
  try {
    const ctx = buildContext(cdm, defaultHbrM, hbrOverrideM);
    const value = pcCircle(ctx.plane.miss2d, ctx.plane.cov2d, ctx.hbr.valueM);
    const { major, minor } = eig2(ctx.plane.cov2d);
    const pinv = inv2(ctx.plane.cov2d);
    const m = ctx.plane.miss2d;
    const maha = Math.sqrt(m[0] * (pinv[0][0] * m[0] + pinv[0][1] * m[1]) + m[1] * (pinv[1][0] * m[0] + pinv[1][1] * m[1]));
    return {
      available: true,
      status: PC_STATUS,
      method: PC_METHOD,
      recalculatedPc: value,
      ratioToSource: cdm.pc && value > 0 ? value / cdm.pc : null,
      hbrM: ctx.hbr.valueM,
      hbrSource: ctx.hbr.source,
      mahalanobis: maha,
      sigmaMajorM: major,
      sigmaMinorM: minor,
      notes: ctx.notes,
    };
  } catch (e) {
    return { available: false, reason: (e as Error).message, status: PC_STATUS };
  }
}
