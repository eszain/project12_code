// Maneuver trade study for the primary object (US08, FR12, AC05). Prototype only. Port of cads/analysis/maneuver.py.
// Impulsive burn of SAT1 + linearised Clohessy-Wiltshire motion about a circular reference orbit;
// the secondary, both covariances and the relative velocity are unchanged (short-term encounter);
// propellant from the ideal rocket equation. CADS never generates commands.

import { inertialVelocity, meanMotion, meanMotionFromAltitudes } from "./frames";
import { V3, dot, norm, sub } from "./linalg";
import type { NormalizedCdm } from "./parser";
import { objectLabel } from "./quality";
import { EncounterContext, buildContext, pcCircle } from "./pc";
import { isoZ } from "./time";

const G0 = 9.80665;

export const ASSUMPTIONS = [
  "Impulsive burn of the primary (SAT1) only; the secondary's trajectory is unchanged.",
  "Linearised Clohessy-Wiltshire motion about a circular reference orbit (no J2, drag or SRP).",
  "Covariances and relative velocity at TCA are unchanged by the burn (short-term encounter).",
  "New miss vector = baseline relative position minus the primary's CW displacement, projected on the baseline encounter plane.",
  "Pc uses the experimental 2D method (not validated); propellant uses the ideal rocket equation.",
];
export const LIMITATIONS = [
  "Prototype decision support only: fidelity has not been agreed with CSA (Open Decision 4).",
  "CW accuracy degrades for long lead times, large delta-v or eccentric orbits; confirm with a numerical propagator.",
  "Does not check attitude, thruster or operational constraints and does not produce spacecraft commands.",
  "Post-maneuver conjunctions with other objects are not screened.",
];

export function cwDisplacement(dv: V3, n: number, dt: number): V3 {
  const [dvr, dvt, dvn] = dv;
  const s = Math.sin(n * dt);
  const c = Math.cos(n * dt);
  return [(dvr / n) * s + ((2 * dvt) / n) * (1 - c), ((2 * dvr) / n) * (c - 1) + (dvt / n) * (4 * s - 3 * n * dt), (dvn / n) * s];
}

export const propellantKg = (dvMs: number, massKg: number, ispS: number) => massKg * (1 - Math.exp(-Math.abs(dvMs) / (ispS * G0)));

export interface Candidate {
  label: string;
  dvRtnMs: V3;
  leadTimeH: number;
}
export interface Spacecraft {
  massKg: number;
  ispS: number;
  propellantAvailableKg: number;
}

function primaryMeanMotion(cdm: NormalizedCdm): { n: number; source: string } {
  const s = cdm.sat1;
  if (s.positionKm && s.velocityKms) {
    const n = meanMotion(s.positionKm, inertialVelocity(s.positionKm, s.velocityKms, s.refFrame).v);
    if (n) return { n, source: "from SAT1 state vector (vis-viva)" };
  }
  if (s.apogeeKm !== null && s.perigeeKm !== null) return { n: meanMotionFromAltitudes(s.apogeeKm, s.perigeeKm), source: "from SAT1 apogee/perigee comments" };
  throw new Error("cannot determine the primary's mean motion (no state vector or apogee/perigee)");
}

function evaluate(ctx: EncounterContext, n: number, dv: V3, leadH: number) {
  const shift = cwDisplacement(dv, n, leadH * 3600);
  const relNew = sub(ctx.relPos, shift);
  const miss2d: [number, number] = [dot(ctx.plane.basis[0], relNew), dot(ctx.plane.basis[1], relNew)];
  const speed = norm(ctx.relVel);
  return {
    displacementRtnM: shift,
    missDistanceM: Math.hypot(miss2d[0], miss2d[1]),
    pc: pcCircle(miss2d, ctx.plane.cov2d, ctx.hbr.valueM, 48, 96),
    tcaShiftS: -dot(relNew, ctx.relVel) / (speed * speed),
  };
}

/** Smallest single-axis burn (per direction) that brings Pc to <= target, by scan + bisection. */
function suggestMinimumBurns(ctx: EncounterContext, n: number, leadH: number, target: number, maxDv = 1, steps = 100) {
  const dirs: Record<string, V3> = { "+in-track": [0, 1, 0], "-in-track": [0, -1, 0], "+radial": [1, 0, 0], "-radial": [-1, 0, 0], "+cross-track": [0, 0, 1], "-cross-track": [0, 0, -1] };
  if (evaluate(ctx, n, [0, 0, 0], leadH).pc <= target) return [];
  const out = [];
  for (const [direction, u] of Object.entries(dirs)) {
    const pcAt = (m: number) => evaluate(ctx, n, [m * u[0], m * u[1], m * u[2]], leadH).pc;
    let lo = 0;
    let hi = -1;
    for (let k = 1; k <= steps; k++) {
      const m = (maxDv * k) / steps;
      if (pcAt(m) <= target) {
        hi = m;
        break;
      }
      lo = m;
    }
    if (hi < 0) continue;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (pcAt(mid) <= target) hi = mid;
      else lo = mid;
    }
    const dv: V3 = [hi * u[0], hi * u[1], hi * u[2]];
    out.push({ direction, dvMs: hi, dvRtnMs: dv, ...evaluate(ctx, n, dv, leadH), leadTimeH: leadH });
  }
  return out.sort((a, b) => a.dvMs - b.dvMs);
}

export function tradeStudy(cdm: NormalizedCdm, candidates: Candidate[], sc: Spacecraft, pcThreshold: number, defaultHbrM: number, hbrOverrideM?: number | null, suggestLeadH?: number | null) {
  const ctx = buildContext(cdm, defaultHbrM, hbrOverrideM);
  const { n, source } = primaryMeanMotion(cdm);
  const baseline = evaluate(ctx, n, [0, 0, 0], 1);
  const rows = candidates.map((c) => {
    const dvTotal = norm(c.dvRtnMs);
    const r = evaluate(ctx, n, c.dvRtnMs, c.leadTimeH);
    const prop = propellantKg(dvTotal, sc.massKg, sc.ispS);
    return { label: c.label, dvRtnMs: c.dvRtnMs, dvTotalMs: dvTotal, leadTimeH: c.leadTimeH, burnEpoch: isoZ(cdm.tca - c.leadTimeH * 3600000), ...r, meetsThreshold: r.pc < pcThreshold, propellantKg: prop, enoughPropellant: prop <= sc.propellantAvailableKg };
  });
  const suggestions = (suggestLeadH ? suggestMinimumBurns(ctx, n, suggestLeadH, pcThreshold) : []).map((s) => {
    const prop = propellantKg(s.dvMs, sc.massKg, sc.ispS);
    return { ...s, propellantKg: prop, enoughPropellant: prop <= sc.propellantAvailableKg };
  });
  const warnings = [...ctx.notes];
  const man = (cdm.sat1.maneuverable ?? "").toUpperCase();
  if (man === "NO" || man === "N") warnings.unshift(`Source CDM marks ${objectLabel(cdm.sat1)} as NOT maneuverable (SAT1_MANEUVERABLE = ${cdm.sat1.maneuverable}); results are hypothetical.`);
  else if (man !== "YES" && man !== "Y") warnings.unshift(`Maneuverability of ${objectLabel(cdm.sat1)} is not stated in the CDM (${cdm.sat1.maneuverable ?? "not provided"}).`);
  return {
    status: "prototype - fidelity not agreed with CSA",
    primary: objectLabel(cdm.sat1),
    pcThreshold,
    hbrM: ctx.hbr.valueM,
    orbitalPeriodMin: (2 * Math.PI) / n / 60,
    meanMotionSource: source,
    baseline: { missDistanceM: baseline.missDistanceM, pc: baseline.pc, sourcePcRaw: cdm.pcRaw, meetsThreshold: baseline.pc < pcThreshold },
    candidates: rows,
    suggestions,
    assumptions: ASSUMPTIONS,
    limitations: LIMITATIONS,
    warnings,
    issuesCommands: false as const,
  };
}

export type TradeStudy = ReturnType<typeof tradeStudy>;