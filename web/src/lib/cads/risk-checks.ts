// Risk analysis checks, shown after "Run risk analysis" (issue #9: the numbers behind the specialist view).
//
// Four checks on the latest CDM of an event, each built from numbers the dashboard already shows:
//   1. Probability level  Pc from the CDM against the action level (1 in 10,000) and watch level (1 in 10 million)
//   2. Trend              this CDM's Pc compared with the previous CDM's Pc
//   3. Confidence         miss distance / combined position uncertainty along the miss direction
//   4. Time to act        TCA - now
// The severity itself still comes only from the CDM's Pc; these checks add context for the operator.

import { formatShortOdds } from "./analyze";
import { missVsUncertainty } from "./details";
import { CONFIG, latestRevision, severityOf, type CdmEvent } from "./store";
import { hoursBetween } from "./time";
import { pcChange } from "./trend";

export interface RiskCheck {
  name: string;
  result: string;
}

const fmtM = (m: number) => (m >= 10000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m).toLocaleString("en-US")} m`);

export function riskChecks(event: CdmEvent, nowMs: number): RiskCheck[] {
  const cdm = latestRevision(event).cdm;
  const previous = event.revisions.length > 1 ? event.revisions[event.revisions.length - 2].cdm : null;
  const odds = formatShortOdds;

  // 1. Probability level: Pc against the action and watch levels.
  const severity = severityOf(cdm.pc);
  const level =
    severity === "UNKNOWN" ? "Not provided in the CDM, so the event cannot be rated"
    : severity === "ZERO" ? "Exactly 0 in the CDM: CLEAR"
    : severity === "ACTION" ? `${odds(cdm.pc)}: at or above the action level of ${odds(CONFIG.pcAction)}, so ACTION`
    : severity === "WATCH" ? `${odds(cdm.pc)}: between the watch level of ${odds(CONFIG.pcWatch)} and the action level of ${odds(CONFIG.pcAction)}, so WATCH`
    : `${odds(cdm.pc)}: below the watch level of ${odds(CONFIG.pcWatch)}, so LOW`;

  // 2. Trend: is the collision chance going up or down since the previous CDM?
  const change = previous ? pcChange(previous.pc, cdm.pc) : null;
  const trend =
    change === null ? "Only one CDM so far, nothing to compare yet"
    : change === "higher" ? `Rising: ${odds(previous!.pc)} to ${odds(cdm.pc)}`
    : change === "lower" ? `Falling: ${odds(previous!.pc)} to ${odds(cdm.pc)}`
    : change === "same" ? `No change: ${odds(cdm.pc)}`
    : "Cannot compare: a CDM has no Pc";

  // 3. Confidence: how many "uncertainty widths" the objects miss by.
  const m = missVsUncertainty(cdm);
  const confidence = m.available
    ? `${fmtM(m.missPlaneM)} miss / ${fmtM(m.sigmaAlongMissM)} uncertainty = ${m.ratio >= 10 ? m.ratio.toFixed(0) : m.ratio.toFixed(1)}x, so ${m.confidence} confidence`
    : `Not available (${m.reason})`;

  // 4. Time to act: hours until the closest approach.
  const h = hoursBetween(nowMs, cdm.tca);
  const time = h >= 0 ? `${h.toFixed(1)} h until closest approach` : `Closest approach passed ${(-h).toFixed(1)} h ago`;

  return [
    { name: "Probability level", result: level },
    { name: "Trend", result: trend },
    { name: "Confidence", result: confidence },
    { name: "Time to act", result: time },
  ];
}
