// Risk analysis checks, shown after "Run risk analysis" (issue #9: the numbers behind the specialist view).
//
// Seven checks on the latest CDM of an event:
//   1. Pc level           Pc from the CDM against the action level (1 in 10,000) and watch level (1 in 10 million)
//   2. Pc trend           this CDM's Pc compared with the previous CDM's Pc
//   3. Miss / σ           miss distance / combined position 1σ along the miss direction
//   4. Time to TCA        TCA - now
//   5. Radial separation  altitude difference / combined altitude uncertainty
//   6. Expanded Pc        worst case of three Pc methods (pc-methods.ts) and its green / yellow / red zone
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
const fmtRatio = (r: number) => (r >= 10 ? r.toFixed(0) : r.toFixed(1));
/** Pc as "1 in N" odds; an exact 0 stays 0. */
const odds = (pc: number | null) => (pc === 0 ? "0" : formatShortOdds(pc));

export function riskChecks(event: CdmEvent, nowMs: number): RiskCheck[] {
  const cdm = latestRevision(event).cdm;
  const previous = event.revisions.length > 1 ? event.revisions[event.revisions.length - 2].cdm : null;

  // 1. Pc level against the action and watch limits.
  const severity = severityOf(cdm.pc);
  const level =
    severity === "UNKNOWN" ? "No Pc in CDM: unrated"
    : severity === "ZERO" ? "CDM Pc = 0: CLEAR"
    : severity === "ACTION" ? `${odds(cdm.pc)}, at or above action limit ${odds(CONFIG.pcAction)}: ACTION`
    : severity === "WATCH" ? `${odds(cdm.pc)}, between watch ${odds(CONFIG.pcWatch)} and action ${odds(CONFIG.pcAction)}: WATCH`
    : `${odds(cdm.pc)}, below watch limit ${odds(CONFIG.pcWatch)}: LOW`;

  // 2. Pc trend: previous CDM to latest CDM.
  const change = previous ? pcChange(previous.pc, cdm.pc) : null;
  const step = previous ? `${odds(previous.pc)} → ${odds(cdm.pc)}` : "";
  const trend =
    change === null ? "Single CDM: no trend yet"
    : change === "higher" ? `Rising: ${step}`
    : change === "lower" ? `Falling: ${step}`
    : change === "same" ? `Unchanged: ${odds(cdm.pc)}`
    : "Unavailable: a CDM has no Pc";

  // 3. Miss distance in units of the combined 1-sigma along the miss direction.
  const m = missVsUncertainty(cdm);
  const missSigma = m.available
    ? `${fmtM(m.missPlaneM)} miss / ${fmtM(m.sigmaAlongMissM)} 1σ = ${fmtRatio(m.ratio)}σ (${m.confidence} confidence)`
    : `Unavailable: ${m.reason}`;

  // 4. Time to TCA.
  const h = hoursBetween(nowMs, cdm.tca);
  const time = h >= 0 ? `${h.toFixed(1)} h` : `TCA passed ${(-h).toFixed(1)} h ago`;

  // 5. Radial separation against the combined radial sigma. A small radial gap means the objects cross at nearly the
  //    same altitude, which CSA treats as more concerning (Nov 13).
  const split = missComponentsM(cdm);
  const sig1 = positionSigmasM(cdm.sat1);
  const sig2 = positionSigmasM(cdm.sat2);
  let radial = "Unavailable: no relative position or covariance";
  if (split && sig1 && sig2) {
    const sigmaR = Math.hypot(sig1[0], sig2[0]);
    const ratio = split.radial / sigmaR;
    radial = `|ΔR| ${fmtM(split.radial)}, σR ${fmtM(sigmaR)} = ${fmtRatio(ratio)}σ (${ratio < 1 ? "within" : "outside"} 1σ)`;
  }

  // 6. Expanded Pc: worst case of three methods, and its zone. Advisory only: severity still comes from the CDM's Pc.
  const e = expandedPc(cdm);
  let expanded = e.available ? "" : `Unavailable: ${e.reason}`;
  if (e.available) {
    const [foster, chan] = e.methods;
    expanded = `${e.zone.toUpperCase()}: worst case ${odds(e.worst.pc)} (${e.worst.note ?? e.worst.name}); Foster ${odds(foster.pc)}, Chan ${odds(chan.pc)}` +
      (e.zone === "green" ? "" : "; a worst case, not the CDM rating");
  }

  // 7. Maneuver options: generated only for events at or above the action level (maneuver-space.ts). A study only.
  // Only what the sentence needs: the 1 in 10,000 line at half an orbit and 48 h. The full chart (three targets, eight
  // lead times) takes seconds and is worked out only when the chart is shown. This runs while an event card renders.
  const space = maneuverOptionSpace(cdm, { targets: [CONFIG.pcAction], leadHours: [48] });
  let maneuver = space.available ? "" : space.reason;
  if (space.available) {
    const line = space.lines[0];
    const burn = (p: OptionPoint) => (p.dvMs === null ? "not reachable (> 1 m/s)" : p.dvMs === 0 ? "no burn needed" : `${(p.dvMs * 100).toFixed(2)} cm/s ${p.direction}`);
    const half = line.points.find((p) => p.leadTimeH === space.halfOrbitH)!;
    const reachable = line.points.filter((p) => p.dvMs !== null);
    const cheapest = reachable.length ? reachable.reduce((a, b) => (b.dvMs! < a.dvMs! ? b : a)) : null;
    maneuver = `Study only. Δv to reach ${odds(line.targetPc)}: ${burn(half)} at TCA−${half.leadTimeH.toFixed(1)} h (½ orbit)` +
      (cheapest && cheapest !== half ? `; ${burn(cheapest)} at TCA−${cheapest.leadTimeH} h` : "");
  }

  return [
    { name: "Pc level", result: level },
    { name: "Pc trend", result: trend },
    { name: "Miss / σ", result: missSigma },
    { name: "Time to TCA", result: time },
    { name: "Radial separation", result: radial },
    { name: "Expanded Pc", result: expanded },
    { name: "Maneuver options", result: maneuver },
  ];
}
