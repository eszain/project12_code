// Data-quality indicators (FR04, O3). Port of cads/analysis/quality.py.
// Default 1-sigma limits (radial 200 m, in-track 1000 m, cross-track 1000 m) come from the "Data
// Quality Limits" in the CSA spreadsheet screenshot; their exact meaning is an open question for CSA,
// so they only FLAG, they never reject.

import type { NormalizedCdm, ObjectInfo } from "./parser";

export type Limits = [number, number, number];
export interface QualityCheck {
  name: string;
  value: number | string | null;
  unit: string;
  limit?: number;
  status: "within limit" | "exceeds limit" | "info" | "caution" | "not provided" | "shorter than recommended";
  note?: string;
}

function objectQuality(o: ObjectInfo, cdm: NormalizedCdm, limits: Limits): QualityCheck[] {
  const checks: QualityCheck[] = [];
  ["radial", "in-track", "cross-track"].forEach((label, i) => {
    const name = `1-sigma ${label} position uncertainty`;
    if (!o.covarianceRtn) return checks.push({ name, value: null, unit: "m", status: "not provided" });
    const sigma = Math.sqrt(Math.max(o.covarianceRtn[i][i], 0));
    checks.push({ name, value: sigma, unit: "m", limit: limits[i], status: sigma <= limits[i] ? "within limit" : "exceeds limit" });
  });
  if (o.actualOdSpanD !== null && o.recommendedOdSpanD) {
    const ratio = o.actualOdSpanD / o.recommendedOdSpanD;
    checks.push({ name: "OD span actual / recommended", value: ratio, unit: "", status: ratio >= 1 ? "info" : "shorter than recommended", note: `${o.actualOdSpanD} d of ${o.recommendedOdSpanD} d` });
  } else checks.push({ name: "OD span actual / recommended", value: null, unit: "", status: "not provided" });
  if (o.obsUsed !== null && o.obsAvailable) checks.push({ name: "Observations used / available", value: (o.obsUsed / o.obsAvailable) * 100, unit: "%", status: "info", note: `${o.obsUsed} of ${o.obsAvailable}` });
  else checks.push({ name: "Observations used / available", value: null, unit: "%", status: "not provided" });
  checks.push({ name: "Residuals accepted", value: o.residualsAcceptedPct, unit: "%", status: o.residualsAcceptedPct === null ? "not provided" : "info" });
  checks.push({ name: "Weighted RMS", value: o.weightedRms, unit: "", status: o.weightedRms === null ? "not provided" : "info" });
  if (o.lastObEnd !== null) checks.push({ name: "Propagation from last observation to TCA", value: (cdm.tca - o.lastObEnd) / 86400000, unit: "d", status: "info" });
  else checks.push({ name: "Propagation from last observation to TCA", value: null, unit: "d", status: "not provided" });
  const m = o.covarianceMethod;
  checks.push({ name: "Covariance method", value: m, unit: "", status: m === null ? "not provided" : m.toUpperCase() === "DEFAULT" ? "caution" : "info" });
  return checks;
}

export function assessQuality(cdm: NormalizedCdm, limits: Limits) {
  return {
    limitsNote: "Provisional limits read from the CSA spreadsheet screenshot; meaning to be confirmed with CSA.",
    sat1: { label: objectLabel(cdm.sat1), checks: objectQuality(cdm.sat1, cdm, limits) },
    sat2: { label: objectLabel(cdm.sat2), checks: objectQuality(cdm.sat2, cdm, limits) },
  };
}

export const objectLabel = (o: ObjectInfo) => (o.name ? `${o.name} (${o.designator})` : o.designator);
