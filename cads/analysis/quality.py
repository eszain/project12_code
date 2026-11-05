"""Data-quality indicators shown next to each CDM (FR04 "available quality measures", O3).

The 1-sigma position limits default to radial 200 m, in-track 1000 m and cross-track
1000 m, the "Data Quality Limits (m)" visible in the CSA spreadsheet screenshot from our
first meeting. Their exact meaning (data-quality gate vs. screening volume) is an open
question for CSA, so they are configurable (CADS_QUALITY_LIMITS_M) and only *flag*.
"""

from __future__ import annotations

import math

from ..cdm.parser import NormalizedCDM, ObjectInfo


def _check(name, value, unit, status, limit=None, note=None):
    return {"name": name, "value": value, "unit": unit, "limit": limit, "status": status, "note": note}


def object_quality(obj: ObjectInfo, cdm: NormalizedCDM, limits_m: tuple[float, float, float]) -> list[dict]:
    checks = []
    labels = ("radial", "in-track", "cross-track")
    if obj.covariance_rtn is not None:
        for i, label in enumerate(labels):
            sigma = math.sqrt(max(obj.covariance_rtn[i][i], 0.0))
            status = "within limit" if sigma <= limits_m[i] else "exceeds limit"
            checks.append(_check(f"1-sigma {label} position uncertainty", sigma, "m", status, limits_m[i]))
    else:
        for label in labels:
            checks.append(_check(f"1-sigma {label} position uncertainty", None, "m", "not provided"))

    if obj.actual_od_span_d is not None and obj.recommended_od_span_d:
        ratio = obj.actual_od_span_d / obj.recommended_od_span_d
        checks.append(
            _check(
                "OD span actual / recommended",
                ratio,
                "",
                "info" if ratio >= 1 else "shorter than recommended",
                note=f"{obj.actual_od_span_d:g} d of {obj.recommended_od_span_d:g} d",
            )
        )
    else:
        checks.append(_check("OD span actual / recommended", None, "", "not provided"))

    if obj.obs_used is not None and obj.obs_available:
        checks.append(
            _check(
                "Observations used / available",
                obj.obs_used / obj.obs_available * 100.0,
                "%",
                "info",
                note=f"{obj.obs_used:g} of {obj.obs_available:g}",
            )
        )
    else:
        checks.append(_check("Observations used / available", None, "%", "not provided"))

    checks.append(
        _check("Residuals accepted", obj.residuals_accepted_pct, "%", "info" if obj.residuals_accepted_pct is not None else "not provided")
    )
    checks.append(_check("Weighted RMS", obj.weighted_rms, "", "info" if obj.weighted_rms is not None else "not provided"))

    if obj.time_lastob_end is not None:
        gap_d = (cdm.tca - obj.time_lastob_end).total_seconds() / 86400.0
        checks.append(_check("Propagation from last observation to TCA", gap_d, "d", "info"))
    else:
        checks.append(_check("Propagation from last observation to TCA", None, "d", "not provided"))

    method = obj.covariance_method
    checks.append(
        _check(
            "Covariance method",
            method,
            "",
            "not provided" if method is None else ("caution" if method.upper() == "DEFAULT" else "info"),
        )
    )
    return checks


def assess(cdm: NormalizedCDM, limits_m: tuple[float, float, float]) -> dict:
    return {
        "limits_m": {"radial": limits_m[0], "in_track": limits_m[1], "cross_track": limits_m[2]},
        "limits_note": "Provisional limits read from the CSA spreadsheet screenshot; meaning to be confirmed with CSA.",
        "sat1": {"label": cdm.sat1.label, "checks": object_quality(cdm.sat1, cdm, limits_m)},
        "sat2": {"label": cdm.sat2.label, "checks": object_quality(cdm.sat2, cdm, limits_m)},
    }
