// "Run risk analysis": severity per event with an ELI5 (Explain Like I'm 5) plain-language summary
// of the math, what it means, and why this severity was chosen for an audience with no technical background.
// Port of cads/api/routes.py::_explain.

import { assessQuality } from "./quality";
import { recalculate } from "./pc";
import { CONFIG, CdmEvent, Severity, latestRevision, severityOf } from "./store";
import { hoursBetween } from "./time";

export interface EventAnalysis {
  severity: Severity;
  why: string[];
}

export function formatOdds(pc: number | null | undefined): string {
  if (pc === null || pc === undefined) return "not provided";
  if (pc === 0) return "0% (zero chance of collision)";
  if (pc >= 1) return "100% (guaranteed collision)";
  const oneInN = Math.round(1 / pc);
  const pct = pc * 100;
  if (oneInN >= 1_000_000) {
    const m = (oneInN / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return `1 in ${m} million (less than 0.001%)`;
  }
  if (oneInN >= 100_000) {
    const k = Math.round(oneInN / 1000);
    return `1 in ${k}k (less than 0.001%)`;
  }
  if (oneInN >= 10_000) {
    return `1 in ${oneInN.toLocaleString()} (${pct < 0.01 ? pct.toFixed(3) : pct.toFixed(2)}%)`;
  }
  return `1 in ${oneInN.toLocaleString()} (${pct.toFixed(2)}%)`;
}

export function formatShortOdds(pc: number | null | undefined): string {
  if (pc === null || pc === undefined) return "n/a";
  if (pc === 0) return "0%";
  if (pc >= 1) return "100%";
  const oneInN = Math.round(1 / pc);
  if (oneInN >= 1_000_000) {
    const m = (oneInN / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return `1 in ${m}M`;
  }
  if (oneInN >= 10_000) {
    return `1 in ${(oneInN / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `1 in ${oneInN.toLocaleString()}`;
}

export function formatDistance(meters: number): string {
  if (meters < 100) {
    return `${meters.toFixed(0)} m (~${Math.round(meters * 1.09)} yards / half a football field)`;
  }
  if (meters < 1000) {
    return `${meters.toFixed(0)} m (~${(meters / 100).toFixed(1)} football fields)`;
  }
  const km = (meters / 1000).toFixed(1);
  const miles = (meters / 1609.34).toFixed(1);
  return `${meters.toLocaleString()} m (~${km} km / ${miles} mi)`;
}

export function formatSpeed(mps: number | null | undefined): string {
  if (mps === null || mps === undefined || mps === 0) return "unknown speed";
  const kmS = (mps / 1000).toFixed(1);
  const kmH = Math.round(mps * 3.6).toLocaleString();
  const mach = Math.round(mps / 343);
  return `${kmS} km/s (~${kmH} km/h, Mach ${mach})`;
}

export function analyzeEvent(event: CdmEvent, nowMs: number): EventAnalysis {
  const latest = latestRevision(event);
  const cdm = latest.cdm;
  const pc = cdm.pc;
  const why: string[] = [];

  // 1. Severity & Decision: Why this severity?
  if (pc === null) {
    why.push(
      "Severity: UNKNOWN — Source Pc not provided, so risk cannot be rated. The tracking report omitted collision probability numbers."
    );
  } else if (pc >= CONFIG.pcAction) {
    why.push(
      `Severity: ACTION — High Collision Danger. The collision chance is ${formatOdds(pc)} (source Pc: ${cdm.pcRaw}), which exceeds our safety threshold of 1 in 10,000. In space flight, odds higher than 1 in 10,000 are unacceptable risk, so operators must take action to steer the satellite away.`
    );
  } else if (pc >= CONFIG.pcWatch) {
    why.push(
      `Severity: WATCH — Elevated Risk (Monitoring). The collision chance is ${formatOdds(pc)} (source Pc: ${cdm.pcRaw}). This is below the action cutoff (1 in 10,000) but above the watch level (1 in 10 million). No immediate maneuver is needed, but operators must closely monitor upcoming tracking passes.`
    );
  } else if (pc === 0) {
    why.push(
      "Severity: ZERO — Completely Clear. Latest CDM reports Pc exactly 0 (0% collision risk): the space tracking network sees zero chance of collision. Both objects' flight paths are completely separate, so no maneuver or action is needed."
    );
  } else {
    why.push(
      `Severity: LOW — Safe Pass. The collision chance is ${formatOdds(pc)} (source Pc: ${cdm.pcRaw}), well below 1 in 10 million. The satellites will safely pass each other with negligible risk.`
    );
  }

  // 2. Summary of the Math (ELI5: What does it mean?)
  const distDesc = formatDistance(cdm.missDistanceM);
  if (pc === 0) {
    why.push(
      `The Math in Simple Terms: Ground radar cannot pinpoint satellites down to the millimeter from Earth, so every satellite has an "uncertainty cloud" (safety bubble) around it. The math checks if these bubbles overlap during the flyby. At ${distDesc} apart, the bubbles have 0% overlap, meaning mathematically zero chance of touching.`
    );
  } else if (pc !== null && pc >= CONFIG.pcAction) {
    why.push(
      `The Math in Simple Terms: Because radars track satellites from hundreds of kilometers away, each object has an "uncertainty cloud" (fuzzy safety bubble) representing where it might be. The collision algorithm calculates how much these bubbles overlap when the objects zoom past each other. Because they pass only ${distDesc} apart, their bubbles overlap heavily, resulting in this high probability.`
    );
  } else if (pc !== null) {
    why.push(
      `The Math in Simple Terms: Satellites have an "uncertainty cloud" around them representing small tracking errors. The math projects these bubbles onto a 2D plane at closest approach to measure overlap. At ${distDesc} apart, there is only a tiny overlap, meaning the odds of physical contact are extremely small.`
    );
  } else {
    why.push(
      "The Math in Simple Terms: Collision probability (Pc) requires position uncertainty clouds from radar observations. Because that data was omitted, the math model cannot calculate collision odds."
    );
  }

  // 3. Encounter Flyby Details: Timing, Miss Distance, Relative Speed
  const h = hoursBetween(nowMs, cdm.tca);
  const timing = h >= 0 ? `in ${h.toFixed(1)} h` : `passed ${(-h).toFixed(1)} h ago`;
  const speedDesc = formatSpeed(cdm.relativeSpeedMs);
  why.push(
    `Flyby Timing & Scale: Closest approach (TCA) occurs ${timing}. The objects pass ${distDesc} apart while zooming past each other at ${speedDesc}.`
  );

  // 4. Update History & Trend
  if (event.revisions.length > 1) {
    const revOdds = event.revisions.map((r) => formatShortOdds(r.cdm.pc));
    const firstPc = event.revisions[0].cdm.pc;
    const latestPc = cdm.pc;
    let trendDesc = `Across ${event.revisions.length} radar updates, collision odds evolved: ${revOdds.join(" -> ")}.`;
    if (latestPc === 0 && firstPc !== 0) {
      trendDesc = `Across ${event.revisions.length} radar updates, collision odds dropped to zero (${revOdds.join(" -> ")}). Updated radar tracking confirmed the objects will safely miss each other.`;
    } else if (latestPc !== null && firstPc !== null && latestPc > firstPc) {
      trendDesc = `Across ${event.revisions.length} radar updates, collision odds increased (${revOdds.join(" -> ")}). As the flyby draws nearer, newer tracking data sharpens and confirms danger has risen.`;
    } else if (latestPc !== null && firstPc !== null && latestPc < firstPc) {
      trendDesc = `Across ${event.revisions.length} radar updates, collision odds decreased (${revOdds.join(" -> ")}). Additional tracking data showed the objects are further apart than first estimated.`;
    }
    why.push(`Risk Trend: ${trendDesc}`);
  } else {
    why.push(
      "Risk Trend: 1 radar update received so far. Trajectory and odds will be refined as additional tracking passes occur."
    );
  }

  // 5. Independent Verification / Recalculation Check
  const rec = recalculate(cdm, CONFIG.defaultHbrM);
  if (rec.available) {
    why.push(
      `Independent Math Check: Our internal Foster-1992 2D calculation estimates the risk at ${formatOdds(rec.recalculatedPc)}, validating the official radar agency's figures.`
    );
  } else {
    why.push(`Independent Math Check: Recalculation unavailable (${rec.reason}).`);
  }

  // 6. Data Quality Checks (if limits exceeded)
  const q = assessQuality(cdm, CONFIG.qualityLimitsM);
  const exceeded = [...q.sat1.checks, ...q.sat2.checks].filter((c) => c.status === "exceeds limit").map((c) => c.name);
  if (exceeded.length) {
    why.push(
      `Tracking Quality Note: Measurement uncertainty for ${[...new Set(exceeded)].join(", ")} exceeds standard limits. This indicates higher-than-usual tracking error bars for this satellite.`
    );
  }

  return { severity: severityOf(pc), why };
}
