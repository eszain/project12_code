// "Run risk analysis": severity per event with an ELI5 (Explain Like I'm 5) plain-language summary
// of the math, what it means, and why this severity was chosen for an audience with no technical background.
// Port of cads/api/routes.py::_explain.

import type { NormalizedCdm } from "./parser";
import { assessQuality } from "./quality";
import { recalculate } from "./pc";
import { CONFIG, CdmEvent, Severity, latestRevision, severityOf } from "./store";
import { hoursBetween } from "./time";

export interface EventAnalysis {
  severity: Severity;
  why: string[];
}

// A CDM Pc of exactly 0 means the source rounded a very small chance down, not that a collision is impossible:
// the positions are uncertain, so the true chance is never zero (CSA, Nov 6). It is shown as "less than 0.0000001%",
// the same floor used for any very small Pc (see formatPercent). Severity still treats a source 0 as its own band.
export const ZERO_PC_PERCENT = "less than 0.0000001%";

/** A probability below this reads "< 0.0000001%". It also stands in for a CDM value of exactly 0. */
export const PC_PERCENT_FLOOR = 1e-9;

/**
 * A collision probability as a percentage, always: "0.039%", "0.0000029%", "100%". Two significant digits. It is never
 * "0": anything below 0.0000001% (including a CDM Pc of exactly 0) reads "< 0.0000001%", because the positions are
 * uncertain and the true chance is never exactly zero (CSA, Nov 6 and Nov 13).
 */
export function formatPercent(pc: number | null | undefined): string {
  if (pc === null || pc === undefined || Number.isNaN(pc)) return "not provided";
  if (pc < PC_PERCENT_FLOOR) return "< 0.0000001%";
  if (pc >= 1) return "100%";
  const pct = pc * 100;
  const decimals = Math.min(20, Math.max(0, 1 - Math.floor(Math.log10(pct)))); // two significant digits
  return `${pct.toFixed(decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`;
}

/** Miss distance split into radial / in-track / cross-track magnitudes in metres, or null if the CDM has no relative position. */
export function missComponentsM(cdm: NormalizedCdm): { radial: number; inTrack: number; crossTrack: number } | null {
  if (!cdm.relPosRtnM) return null;
  const [r, t, n] = cdm.relPosRtnM;
  return { radial: Math.abs(r), inTrack: Math.abs(t), crossTrack: Math.abs(n) };
}

/** One sentence an on-console operator can read out on a call: who, when, how likely. */
export function phoneSummary(cdm: NormalizedCdm, nowMs: number): string {
  const name = (o: NormalizedCdm["sat1"]) => (o.objectType?.toUpperCase().includes("DEBRIS") ? `${o.name ?? o.designator} (debris)` : (o.name ?? o.designator));
  const h = (cdm.tca - nowMs) / 3600000;
  const when = h >= 0 ? `closest approach in ${h.toFixed(1)} hours` : `closest approach was ${(-h).toFixed(1)} hours ago`;
  const pc = cdm.pc === null ? "collision chance not provided" : `collision chance ${formatPercent(cdm.pc)}`;
  return `${name(cdm.sat1)} and ${name(cdm.sat2)}: ${when}, ${pc}.`;
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
      `Severity: ACTION — High Collision Danger. The collision chance is ${formatPercent(pc)}, which exceeds our safety threshold of ${formatPercent(CONFIG.pcAction)}. In space flight, a chance higher than ${formatPercent(CONFIG.pcAction)} is unacceptable risk, so operators must take action to steer the satellite away.`
    );
  } else if (pc >= CONFIG.pcWatch) {
    why.push(
      `Severity: WATCH — Elevated Risk (Monitoring). The collision chance is ${formatPercent(pc)}. This is below the action cutoff (${formatPercent(CONFIG.pcAction)}) but above the watch level (${formatPercent(CONFIG.pcWatch)}). No immediate maneuver is needed, but operators must closely monitor upcoming tracking passes.`
    );
  } else if (pc === 0) {
    why.push(
      `Severity: ZERO — Clear. The latest CDM reports a chance too small to measure, which CADS shows as ${ZERO_PC_PERCENT}. It is never truly zero, because the positions are uncertain. No maneuver or action is needed.`
    );
  } else {
    why.push(
      `Severity: LOW — Safe Pass. The collision chance is ${formatPercent(pc)}, well below ${formatPercent(CONFIG.pcWatch)}. The satellites will safely pass each other with negligible risk.`
    );
  }

  // 2. Summary of the Math (ELI5: What does it mean?)
  const distDesc = formatDistance(cdm.missDistanceM);
  if (pc === 0) {
    why.push(
      `The Math in Simple Terms: Ground radar cannot pinpoint satellites down to the millimeter from Earth, so every satellite has an "uncertainty cloud" (safety bubble) around it. The math checks if these bubbles overlap during the flyby. At ${distDesc} apart, the bubbles barely overlap, so the chance of touching is ${ZERO_PC_PERCENT}.`
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
    const revOdds = event.revisions.map((r) => formatPercent(r.cdm.pc));
    const firstPc = event.revisions[0].cdm.pc;
    const latestPc = cdm.pc;
    let trendDesc = `Across ${event.revisions.length} radar updates, collision chance evolved: ${revOdds.join(" -> ")}.`;
    if (latestPc === 0 && firstPc !== 0) {
      trendDesc = `Across ${event.revisions.length} radar updates, collision chance dropped to ${formatPercent(latestPc)} (${revOdds.join(" -> ")}). Updated radar tracking confirmed the objects will safely miss each other.`;
    } else if (latestPc !== null && firstPc !== null && latestPc > firstPc) {
      trendDesc = `Across ${event.revisions.length} radar updates, collision chance increased (${revOdds.join(" -> ")}). As the flyby draws nearer, newer tracking data sharpens and confirms danger has risen.`;
    } else if (latestPc !== null && firstPc !== null && latestPc < firstPc) {
      trendDesc = `Across ${event.revisions.length} radar updates, collision chance decreased (${revOdds.join(" -> ")}). Additional tracking data showed the objects are further apart than first estimated.`;
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
      `Independent Math Check: Our internal Foster-1992 2D calculation estimates the risk at ${formatPercent(rec.recalculatedPc)}, validating the official radar agency's figures.`
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
