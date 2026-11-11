// CDM history and trend data for one event (B1, B2): one point per CDM revision, oldest first.

import type { CdmEvent } from "./store";

export interface TrendPoint {
  n: number; // 1-based position in the history
  createdMs: number;
  hoursToTca: number; // hours between CDM creation and TCA
  pc: number | null;
  pcRaw: string | null;
  missM: number;
  file: string;
}

export const trendPoints = (e: CdmEvent): TrendPoint[] =>
  e.revisions.map((r, i) => ({
    n: i + 1,
    createdMs: r.cdm.creationDate,
    hoursToTca: (r.cdm.tca - r.cdm.creationDate) / 3600000,
    pc: r.cdm.pc,
    pcRaw: r.cdm.pcRaw,
    missM: r.cdm.missDistanceM,
    file: r.sourceFile,
  }));

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
