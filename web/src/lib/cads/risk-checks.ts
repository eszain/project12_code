// Risk analysis checks, shown after "Run risk analysis" (issue #9: the numbers behind the specialist view).
//
// Seven checks on the latest CDM of an event:
//   1. Probability level  Pc from the CDM against the action level (1 in 10,000) and watch level (1 in 10 million)
//   2. Trend              this CDM's Pc compared with the previous CDM's Pc
//   3. Confidence         miss distance / combined position uncertainty along the miss direction
//   4. Time to act        TCA - now
//   5. Radial separation  altitude difference / combined altitude uncertainty
//   6. Expanded analysis  worst case of three Pc methods (pc-methods.ts) and its green / yellow / red zone
//   7. Maneuver options   smallest burn to reach 1 in 10,000, only for events at the action level (maneuver-space.ts)
// The severity itself still comes only from the CDM's Pc; these checks add context for the operator.

import { formatShortOdds, missComponentsM } from "./analyze";
import { missVsUncertainty } from "./details";
import { maneuverOptionSpace, type OptionPoint } from "./maneuver-space";
import { expandedPc } from "./pc-methods";
import { positionSigmasM } from "./quality";
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
    : severity === "ZERO" ? "Reported as 0 in the CDM (below 1 in a billion): CLEAR"
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

  // 5. Radial separation: how far apart in altitude, against the altitude uncertainty. Objects at nearly the same
  //    altitude are more concerning than objects passing at different altitudes (CSA, Nov 13).
  const split = missComponentsM(cdm);
  const sig1 = positionSigmasM(cdm.sat1);
  const sig2 = positionSigmasM(cdm.sat2);
  let radial = "Not available (no relative position or covariance)";
  if (split && sig1 && sig2) {
    const sigmaR = Math.hypot(sig1[0], sig2[0]);
    const ratio = split.radial / sigmaR;
    radial = `${fmtM(split.radial)} radial / ${fmtM(sigmaR)} radial uncertainty = ${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}x, so ${ratio < 1 ? "nearly the same altitude" : "different altitudes"}`;
  }

  // 6. Expanded analysis: the worst case of three Pc methods, and its zone. Advisory only: severity still comes from the CDM's Pc.
  const e = expandedPc(cdm);
  const expanded = !e.available
    ? `Not available (${e.reason})`
    : e.zone === "green"
      ? `Green zone: worst of 3 methods is ${odds(e.worst.pc)}, extra analysis not needed`
      : `${e.zone.toUpperCase()} zone: worst of 3 methods is ${odds(e.worst.pc)} (${e.worst.name}${e.worst.note ? `, ${e.worst.note}` : ""})`;

  // 7. Maneuver options: generated only for events at or above the action level (maneuver-space.ts). A study only.
  const space = maneuverOptionSpace(cdm);
  let maneuver = `Not generated: ${space.available ? "" : space.reason}`;
  if (space.available) {
    const line = space.lines[0];
    const burn = (p: OptionPoint) => (p.dvMs === null ? "not reachable with up to 1 m/s" : p.dvMs === 0 ? "no burn needed" : `${(p.dvMs * 100).toFixed(2)} cm/s`);
    const half = line.points.find((p) => p.leadTimeH === space.halfOrbitH)!;
    const reachable = line.points.filter((p) => p.dvMs !== null);
    const cheapest = reachable.length ? reachable.reduce((a, b) => (b.dvMs! < a.dvMs! ? b : a)) : null;
    maneuver = `Study only: to reach ${odds(line.targetPc)}, ${burn(half)} half an orbit (${half.leadTimeH.toFixed(1)} h) before TCA` +
      (cheapest && cheapest !== half ? `, or ${burn(cheapest)} ${cheapest.leadTimeH} h before` : "");
  }

  return [
    { name: "Probability level", result: level },
    { name: "Trend", result: trend },
    { name: "Confidence", result: confidence },
    { name: "Time to act", result: time },
    { name: "Radial separation", result: radial },
    { name: "Expanded analysis", result: expanded },
    { name: "Maneuver options", result: maneuver },
  ];
}
