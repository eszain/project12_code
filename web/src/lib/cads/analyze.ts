// "Run risk analysis": severity per event (from the SOURCE Pc) with a plain-language explanation.
// Port of cads/api/routes.py::_explain.

import { assessQuality } from "./quality";
import { recalculate } from "./pc";
import { CONFIG, CdmEvent, Severity, latestRevision, severityOf } from "./store";
import { hoursBetween } from "./time";

export interface EventAnalysis {
  severity: Severity;
  why: string[];
}

export function analyzeEvent(event: CdmEvent, nowMs: number): EventAnalysis {
  const latest = latestRevision(event);
  const cdm = latest.cdm;
  const pc = cdm.pc;
  const why: string[] = [];
  if (pc === null) why.push("Source Pc not provided, so risk cannot be rated.");
  else if (pc >= CONFIG.pcAction) why.push(`Latest source Pc ${cdm.pcRaw} is at or above the action level ${CONFIG.pcAction.toExponential(0)}: ACTION.`);
  else if (pc >= CONFIG.pcWatch) why.push(`Latest source Pc ${cdm.pcRaw} is below the action level ${CONFIG.pcAction.toExponential(0)} but at or above the watch level ${CONFIG.pcWatch.toExponential(0)}: WATCH.`);
  else if (pc === 0) why.push("Latest CDM reports Pc exactly 0: the source sees no collision risk at this update.");
  else why.push(`Latest source Pc ${cdm.pcRaw} is below the watch level ${CONFIG.pcWatch.toExponential(0)}: LOW.`);

  if (event.revisions.length > 1) why.push(`${event.revisions.length} CDMs: Pc went ${event.revisions.map((r) => r.cdm.pcRaw ?? "n/a").join(" → ")}.`);
  const h = hoursBetween(nowMs, cdm.tca);
  why.push(h >= 0 ? `TCA is in ${h.toFixed(1)} h.` : `TCA passed ${(-h).toFixed(1)} h ago.`);
  why.push(`Miss distance ${cdm.missDistanceM.toFixed(0)} m, relative speed ${(cdm.relativeSpeedMs ?? 0).toFixed(0)} m/s.`);

  const rec = recalculate(cdm, CONFIG.defaultHbrM);
  if (rec.available) why.push(`Experimental recalculated Pc ${rec.recalculatedPc.toExponential(2)} (not validated; severity uses the source Pc).`);
  else why.push(`Recalculation unavailable: ${rec.reason}.`);

  const q = assessQuality(cdm, CONFIG.qualityLimitsM);
  const exceeded = [...q.sat1.checks, ...q.sat2.checks].filter((c) => c.status === "exceeds limit").map((c) => c.name);
  if (exceeded.length) why.push(`Data quality: ${[...new Set(exceeded)].join(", ")} exceed the provisional limits.`);
  return { severity: severityOf(pc), why };
}
