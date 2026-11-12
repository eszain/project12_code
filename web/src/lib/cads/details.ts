// "How was this calculated" (A5) and "miss distance compared with uncertainty" (A4).
// Everything here reuses the encounter-plane code in pc.ts; nothing new is invented.

import { CONFIG } from "./store";
import { buildContext, recalculate, type Recalculation } from "./pc";
import type { M3 } from "./linalg";
import { eig2 } from "./linalg";
import type { NormalizedCdm, ObjectInfo } from "./parser";
import { positionSigmasM } from "./quality";

export type Confidence = "high" | "moderate" | "low";

export type MissVsUncertainty =
  | { available: false; reason: string }
  | {
      available: true;
      /** Miss distance in the encounter plane (the part that matters for the collision chance). */
      missPlaneM: number;
      /** Combined 1-sigma position uncertainty of both objects, measured along the miss direction. */
      sigmaAlongMissM: number;
      sigmaMajorM: number;
      sigmaMinorM: number;
      /** missPlaneM / sigmaAlongMissM: how many "uncertainty widths" the objects miss by. */
      ratio: number;
      confidence: Confidence;
      sentence: string;
    };

/** Thresholds for turning the ratio into words. They are a reading aid, not a CSA limit. */
export const CONFIDENCE_LIMITS = { high: 3, low: 1 };

export function confidenceOf(ratio: number): Confidence {
  return ratio >= CONFIDENCE_LIMITS.high ? "high" : ratio >= CONFIDENCE_LIMITS.low ? "moderate" : "low";
}

const fmtM = (m: number) => (m >= 10000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m).toLocaleString("en-US")} m`);

export function missVsUncertainty(cdm: NormalizedCdm): MissVsUncertainty {
  try {
    const { plane } = buildContext(cdm, CONFIG.defaultHbrM);
    const [mx, mz] = plane.miss2d;
    const missPlaneM = Math.hypot(mx, mz);
    const c = plane.cov2d;
    const { major, minor } = eig2(c);
    // Uncertainty along the miss direction: u' C u. With a zero miss any direction will do, so use the major axis.
    const sigmaAlongMissM = missPlaneM > 0 ? Math.sqrt(Math.max((mx * mx * c[0][0] + 2 * mx * mz * c[0][1] + mz * mz * c[1][1]) / (missPlaneM * missPlaneM), 0)) : major;
    const ratio = sigmaAlongMissM > 0 ? missPlaneM / sigmaAlongMissM : Infinity;
    const confidence = confidenceOf(ratio);
    const lead = `The objects miss by ${fmtM(missPlaneM)}; the combined position uncertainty along that direction is about ${fmtM(sigmaAlongMissM)}.`;
    const tail =
      confidence === "high"
        ? "The miss is much larger than the uncertainty, so we can trust it."
        : confidence === "moderate"
          ? "The miss is only a few times the uncertainty, so keep watching new CDMs."
          : "The miss is smaller than the uncertainty, so the real distance could be close to zero. Treat this number with low confidence.";
    return { available: true, missPlaneM, sigmaAlongMissM, sigmaMajorM: major, sigmaMinorM: minor, ratio, confidence, sentence: `${lead} ${tail}` };
  } catch (e) {
    return { available: false, reason: (e as Error).message };
  }
}

export type EncounterPicture =
  | { available: false; reason: string }
  | {
      available: true;
      /** Position of the secondary relative to the primary in the encounter plane (metres). */
      missX: number;
      missZ: number;
      /** 1, 2 and 3 sigma ellipses of the combined uncertainty, centred on the miss point. */
      ellipses: { k: 1 | 2 | 3; majorM: number; minorM: number; angleDeg: number }[];
      /** Combined size of the two objects (hard-body radius), centred on the primary. */
      hbrM: number;
      /** Half-width of a square view that fits everything, in metres. */
      extentM: number;
    };

/** Geometry for the conjunction picture (G4): everything in metres, in the plane perpendicular to the relative velocity. */
export function encounterPicture(cdm: NormalizedCdm): EncounterPicture {
  try {
    const ctx = buildContext(cdm, CONFIG.defaultHbrM);
    const [mx, mz] = ctx.plane.miss2d;
    const { major, minor, angleDeg } = eig2(ctx.plane.cov2d);
    const ellipses = ([1, 2, 3] as const).map((k) => ({ k, majorM: major * k, minorM: minor * k, angleDeg }));
    const extentM = Math.max(Math.hypot(mx, mz) + 3 * major, ctx.hbr.valueM * 4) * 1.08;
    return { available: true, missX: mx, missZ: mz, ellipses, hbrM: ctx.hbr.valueM, extentM };
  } catch (e) {
    return { available: false, reason: (e as Error).message };
  }
}

export interface ObjectUncertainty {
  label: string;
  radialM: number;
  inTrackM: number;
  crossTrackM: number;
  /** Root-sum-square of the three 1-sigma values: one number for "how uncertain is this object". */
  rssM: number;
  covariance: M3 | null;
  method: string | null;
}

export function objectUncertainty(o: ObjectInfo): ObjectUncertainty | null {
  const s = positionSigmasM(o);
  if (!s) return null;
  return { label: o.name ?? o.designator, radialM: s[0], inTrackM: s[1], crossTrackM: s[2], rssM: Math.hypot(...s), covariance: o.covarianceRtn, method: o.covarianceMethod };
}

export interface CalculationDetails {
  source: { missM: number; speedMs: number | null; pcRaw: string | null; pcMethod: string | null };
  objects: ObjectUncertainty[];
  missVsUncertainty: MissVsUncertainty;
  recalculation: Recalculation;
}

export function calculationDetails(cdm: NormalizedCdm): CalculationDetails {
  return {
    source: { missM: cdm.missDistanceM, speedMs: cdm.relativeSpeedMs, pcRaw: cdm.pcRaw, pcMethod: cdm.pcMethod },
    objects: [objectUncertainty(cdm.sat1), objectUncertainty(cdm.sat2)].filter((x): x is ObjectUncertainty => x !== null),
    missVsUncertainty: missVsUncertainty(cdm),
    recalculation: recalculate(cdm, CONFIG.defaultHbrM),
  };
}
