// Maneuver option space (issue #27; asked for by CSA on Nov 13).
//
// For each lead time (hours before closest approach) and each target collision probability, find the smallest
// single burn that brings the probability below the target. Plotting burn size against lead time gives one line per
// target: the "iso-lines" CSA uses to decide when a maneuver must happen ("if you wait two hours it needs to be
// bigger"). A burn about half an orbit before TCA moves the satellite furthest, so that lead time is always included.
//
// Only generated when the event is too close: the CDM's Pc must be at or above a configurable level (default: the
// action level), so no time is spent on events that will not need a maneuver.
// Built on tradeStudy() in maneuver.ts. A study only: CADS never commands a spacecraft.

import { formatShortOdds } from "./analyze";
import { ASSUMPTIONS, LIMITATIONS, tradeStudy, type Spacecraft } from "./maneuver";
import type { NormalizedCdm } from "./parser";
import { CONFIG } from "./store";

/** Labelled assumption until CSA gives real values for its satellites. */
export const DEFAULT_SPACECRAFT: Spacecraft = { massKg: 500, ispS: 220, propellantAvailableKg: 5 };
export const DEFAULT_LEAD_HOURS = [1, 2, 4, 6, 12, 24, 48];
export const DEFAULT_TARGETS = [1e-4, 1e-5, 1e-6];

export interface OptionPoint {
  leadTimeH: number;
  /** Smallest burn in m/s; 0 = no burn needed; null = not reachable with up to 1 m/s. */
  dvMs: number | null;
  direction: string | null;
  missDistanceM: number | null;
  pc: number | null;
  propellantKg: number | null;
}

export interface IsoLine {
  targetPc: number;
  points: OptionPoint[];
}

export type ManeuverSpace =
  | { available: false; reason: string }
  | {
      available: true;
      baselinePc: number;
      orbitalPeriodH: number;
      /** Half an orbit before TCA: where a burn has the most effect. */
      halfOrbitH: number;
      lines: IsoLine[];
      spacecraft: Spacecraft;
      assumptions: string[];
      limitations: string[];
      issuesCommands: false;
    };

export interface ManeuverSpaceOptions {
  leadHours?: number[];
  targets?: number[];
  /** Only generate options when the CDM's Pc is at or above this. Default: the action level. */
  minPc?: number;
  spacecraft?: Spacecraft;
}

const cache = new WeakMap<NormalizedCdm, ManeuverSpace>();

export function maneuverOptionSpace(cdm: NormalizedCdm, opts: ManeuverSpaceOptions = {}): ManeuverSpace {
  const usesDefaults = Object.keys(opts).length === 0;
  if (usesDefaults && cache.has(cdm)) return cache.get(cdm)!;
  const result = compute(cdm, opts);
  if (usesDefaults) cache.set(cdm, result);
  return result;
}

function compute(cdm: NormalizedCdm, { leadHours = DEFAULT_LEAD_HOURS, targets = DEFAULT_TARGETS, minPc = CONFIG.pcAction, spacecraft = DEFAULT_SPACECRAFT }: ManeuverSpaceOptions): ManeuverSpace {
  // 1. Gate: only when the CDM's own Pc is at or above the study level.
  if (cdm.pc === null) return { available: false, reason: "The CDM has no collision probability." };
  if (cdm.pc < minPc) return { available: false, reason: `Below the maneuver-study level (${formatShortOdds(minPc)}): no maneuver options computed.` };

  try {
    // 2. Orbit period from the primary's orbit; add the half-orbit lead time to the list.
    const first = tradeStudy(cdm, [], spacecraft, targets[0], CONFIG.defaultHbrM);
    const orbitalPeriodH = first.orbitalPeriodMin / 60;
    const halfOrbitH = orbitalPeriodH / 2;
    const leads = [...new Set([halfOrbitH, ...leadHours])].sort((a, b) => a - b);

    // 3. For each target and lead time, the smallest burn that brings Pc below the target.
    const lines: IsoLine[] = targets.map((target) => ({
      targetPc: target,
      points: leads.map((lead): OptionPoint => {
        const study = tradeStudy(cdm, [], spacecraft, target, CONFIG.defaultHbrM, null, lead);
        if (study.baseline.pc <= target) return { leadTimeH: lead, dvMs: 0, direction: null, missDistanceM: study.baseline.missDistanceM, pc: study.baseline.pc, propellantKg: 0 };
        const best = study.suggestions[0];
        if (!best) return { leadTimeH: lead, dvMs: null, direction: null, missDistanceM: null, pc: null, propellantKg: null };
        return { leadTimeH: lead, dvMs: best.dvMs, direction: best.direction, missDistanceM: best.missDistanceM, pc: best.pc, propellantKg: best.propellantKg };
      }),
    }));

    return { available: true, baselinePc: first.baseline.pc, orbitalPeriodH, halfOrbitH, lines, spacecraft, assumptions: ASSUMPTIONS, limitations: LIMITATIONS, issuesCommands: false };
  } catch (e) {
    // 4. For example a CDM without the orbit data the burn model needs.
    return { available: false, reason: (e as Error).message };
  }
}
