// CDM history and trend data for one event (B1, B2): one point per CDM revision, oldest first.

import type { CdmEvent } from "./store";

export interface TrendPoint {
  n: number; // 1-based position in the history
  createdMs: number;
  hoursToTca: number | null; // hours between this CDM's creation and its source TCA
  pc: number | null;
  pcRaw: string | null;
  missM: number | null;
  file: string;
}

export const trendPoints = (e: CdmEvent): TrendPoint[] =>
  e.revisions
    .map((r, originalIndex) => ({ r, originalIndex }))
    .sort((a, b) => {
      const aTime = a.r.cdm.creationDate;
      const bTime = b.r.cdm.creationDate;
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
      if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(aTime) ? -1 : 1;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ r }, i) => {
      const createdMs = r.cdm.creationDate;
      const tca = r.cdm.tca;
      const hoursToTca = Number.isFinite(createdMs) && Number.isFinite(tca)
        ? (tca - createdMs) / 3600000
        : null;
      return {
        n: i + 1,
        createdMs,
        hoursToTca: Number.isFinite(hoursToTca) ? hoursToTca : null,
        pc: typeof r.cdm.pc === "number" && Number.isFinite(r.cdm.pc) && r.cdm.pc >= 0 ? r.cdm.pc : null,
        pcRaw: r.cdm.pcRaw,
        missM: Number.isFinite(r.cdm.missDistanceM) && r.cdm.missDistanceM >= 0 ? r.cdm.missDistanceM : null,
        file: r.sourceFile,
      };
    });

export type Change = "higher" | "lower" | "same" | "n/a";

/** How the source Pc moved from the previous CDM to this one. */
export function pcChange(prev: number | null, cur: number | null): Change {
  if (prev === null || cur === null) return "n/a";
  return cur > prev ? "higher" : cur < prev ? "lower" : "same";
}

/**
 * Log10 axis for Pc. Spans whole decades around the non-zero values; a source Pc of exactly 0 cannot
 * sit on a log axis, so it is drawn on a separate floor line one decade below (floorExp).
 * Returns null when no CDM has a non-zero Pc.
 */
export function pcAxis(points: TrendPoint[]): { floorExp: number; minExp: number; maxExp: number } | null {
  const v = points.map((p) => p.pc).filter((x): x is number => x !== null && x > 0);
  if (!v.length) return null;
  const minExp = Math.floor(Math.log10(Math.min(...v)));
  let maxExp = Math.ceil(Math.log10(Math.max(...v)));
  if (maxExp <= minExp) maxExp = minExp + 1;
  return { floorExp: minExp - 1, minExp, maxExp };
}

/** Vertical position 0 (bottom) to 1 (top) for a Pc on the axis; zero or missing Pc sits on the floor line. */
export function pcFraction(pc: number | null, axis: { floorExp: number; maxExp: number }): number {
  if (pc === null || pc <= 0) return 0;
  return (Math.log10(pc) - axis.floorExp) / (axis.maxExp - axis.floorExp);
}
