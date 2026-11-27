// Expanded collision-probability analysis (issue #27; asked for by CSA on Nov 13).
//
// CSA runs several Pc calculators, because each treats the position uncertainty differently, then looks at the
// worst case ("expanded covariance analysis"). Three methods here, all in the encounter plane from buildContext():
//   1. Foster      numerical integration of the 2D Gaussian over the hard-body circle (pcCircle, the existing method)
//   2. Chan        analytical series (Chan 1997): the same problem solved with a Poisson-series formula
//   3. Expanded    Foster with the covariance scaled by s^2 for s = 0.5 ... 3, keeping the largest Pc
// Zones from the action and watch levels: red at or above the action level, yellow at or above the watch level,
// otherwise green. Yellow is where CSA does this extra analysis. Advisory only: severity still comes from the CDM's Pc.

import { buildContext, pcCircle } from "./pc";
import { eig2, type M2 } from "./linalg";
import type { NormalizedCdm } from "./parser";
import { CONFIG } from "./store";

export type Zone = "green" | "yellow" | "red";

export interface PcMethodResult {
  name: string;
  pc: number;
  note?: string;
}

export type ExpandedPc =
  | { available: false; reason: string }
  | { available: true; methods: PcMethodResult[]; worst: PcMethodResult; zone: Zone };

export const COVARIANCE_SCALES = [0.5, 0.75, 1, 1.5, 2, 3];

/** Poisson probabilities p_0 ... p_(k-1) for mean mu, built one from the next (no factorials). */
function poisson(mu: number, k: number): number[] {
  const p = [Math.exp(-mu)];
  for (let i = 1; i < k; i++) p.push((p[i - 1] * mu) / i);
  return p;
}

/**
 * Chan's series: Pc = sum over m of P(m; v/2) * Q(m; u/2), with P the Poisson probability and Q its upper tail,
 * u = R^2 / (s1 s2) and v = x1^2/s1^2 + x2^2/s2^2 in the covariance's principal axes. Exact for a round covariance.
 */
export function chanPc(miss: [number, number], cov: M2, hbrM: number): number {
  // 1. Rotate the miss into the principal axes of the covariance.
  const { major: s1, minor: s2, angleDeg } = eig2(cov);
  const a = (angleDeg * Math.PI) / 180;
  const x1 = miss[0] * Math.cos(a) + miss[1] * Math.sin(a);
  const x2 = -miss[0] * Math.sin(a) + miss[1] * Math.cos(a);
  const lam = (x1 * x1) / (s1 * s1) / 2 + (x2 * x2) / (s2 * s2) / 2; // v / 2
  const mu = (hbrM * hbrM) / (s1 * s2) / 2; // u / 2
  if (lam > 700) return 0; // the miss is far outside the uncertainty: Pc is below 1e-300
  if (mu > 700) return 1; // the objects are much bigger than the uncertainty

  // 2. Enough terms to cover both Poisson distributions.
  const k = Math.ceil(Math.max(lam + 40 * Math.sqrt(lam + 1), mu + 40 * Math.sqrt(mu + 1))) + 60;
  const pLam = poisson(lam, k);
  const pMu = poisson(mu, k + 1);

  // 3. Upper tails Q(m) = p_(m+1) + p_(m+2) + ..., summed from the small end so tiny values keep their precision.
  const tail = new Array<number>(k + 1).fill(0);
  for (let i = k - 1; i >= 0; i--) tail[i] = tail[i + 1] + pMu[i + 1];

  // 4. Sum the series.
  let pc = 0;
  for (let m = 0; m < k; m++) pc += pLam[m] * tail[m];
  return Math.min(Math.max(pc, 0), 1);
}

export function zoneOf(pc: number): Zone {
  return pc >= CONFIG.pcAction ? "red" : pc >= CONFIG.pcWatch ? "yellow" : "green";
}

export function expandedPc(cdm: NormalizedCdm): ExpandedPc {
  try {
    const ctx = buildContext(cdm, CONFIG.defaultHbrM);
    const { miss2d, cov2d } = ctx.plane;
    const r = ctx.hbr.valueM;

    // Method 1 and 2.
    const methods: PcMethodResult[] = [
      { name: "Foster", pc: pcCircle(miss2d, cov2d, r) },
      { name: "Chan", pc: chanPc(miss2d, cov2d, r) },
    ];

    // Method 3: scale the uncertainty and keep the worst case.
    let worstScaled = { s: 1, pc: methods[0].pc };
    for (const s of COVARIANCE_SCALES) {
      const scaled: M2 = [
        [cov2d[0][0] * s * s, cov2d[0][1] * s * s],
        [cov2d[1][0] * s * s, cov2d[1][1] * s * s],
      ];
      const pc = pcCircle(miss2d, scaled, r);
      if (pc > worstScaled.pc) worstScaled = { s, pc };
    }
    methods.push({ name: "Expanded covariance", pc: worstScaled.pc, note: `uncertainty x${worstScaled.s}` });

    const worst = methods.reduce((a, b) => (b.pc > a.pc ? b : a));
    return { available: true, methods, worst, zone: zoneOf(worst.pc) };
  } catch (e) {
    return { available: false, reason: (e as Error).message };
  }
}
