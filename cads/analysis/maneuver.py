"""Maneuver trade study for the primary object (US08, FR12, AC05). Prototype only.

Answers the questions CSA framed in our first meeting ("Is the probability high enough?
What maneuver can be performed? Is there enough fuel?") at the fidelity the team proposed
as "Option A", which CSA has not yet confirmed:

* impulsive burn of the primary, given as radial / in-track / cross-track delta-v at a
  lead time before TCA;
* linearised Clohessy-Wiltshire relative motion about a circular reference orbit with the
  primary's mean motion, giving the primary's displacement at the original TCA;
* the secondary's trajectory, both covariances and the relative velocity are unchanged
  (short-term encounter), so the new miss vector is projected on the original encounter
  plane and the 2D Pc of :mod:`cads.analysis.pc` is re-evaluated;
* propellant from the rocket equation, compared with the propellant the user says is
  available.

CADS never generates commands; results are decision support for flight dynamics review.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import timedelta

import numpy as np

from ..cdm.parser import NormalizedCDM
from ..timeutil import iso_z
from .frames import inertial_velocity, mean_motion_from_altitudes, mean_motion_rad_s
from .pc import EncounterContext, build_context, pc_circle

G0 = 9.80665

ASSUMPTIONS = [
    "Impulsive burn of the primary (SAT1) only; the secondary's trajectory is unchanged.",
    "Linearised Clohessy-Wiltshire motion about a circular reference orbit (no J2, drag or SRP).",
    "Covariances and relative velocity at TCA are unchanged by the burn (short-term encounter).",
    "New miss vector = baseline relative position minus the primary's CW displacement, projected on the baseline encounter plane.",
    "Pc uses the experimental 2D method (not validated); propellant uses the ideal rocket equation.",
]

LIMITATIONS = [
    "Prototype decision support only: fidelity has not been agreed with CSA (Open Decision 4).",
    "CW accuracy degrades for long lead times, large delta-v or eccentric orbits; confirm with a numerical propagator.",
    "Does not check attitude, thruster or operational constraints and does not produce spacecraft commands.",
    "Post-maneuver conjunctions with other objects are not screened.",
]


def cw_displacement(dv_rtn_ms, mean_motion: float, dt_s: float) -> np.ndarray:
    """Position change (m, RTN at the end of ``dt_s``) caused by an impulsive delta-v at t = 0."""
    dvr, dvt, dvn = (float(x) for x in dv_rtn_ms)
    n = mean_motion
    s, c = math.sin(n * dt_s), math.cos(n * dt_s)
    radial = dvr / n * s + 2.0 * dvt / n * (1.0 - c)
    in_track = 2.0 * dvr / n * (c - 1.0) + dvt / n * (4.0 * s - 3.0 * n * dt_s)
    cross_track = dvn / n * s
    return np.array([radial, in_track, cross_track])


def propellant_kg(dv_ms: float, wet_mass_kg: float, isp_s: float) -> float:
    return wet_mass_kg * (1.0 - math.exp(-abs(dv_ms) / (isp_s * G0)))


@dataclass
class Candidate:
    label: str
    dv_rtn_ms: tuple[float, float, float]
    lead_time_h: float


@dataclass
class Spacecraft:
    mass_kg: float
    isp_s: float
    propellant_available_kg: float


def primary_mean_motion(cdm: NormalizedCDM) -> tuple[float, str]:
    sat1 = cdm.sat1
    if sat1.position_km is not None and sat1.velocity_kms is not None:
        v_inertial, _ = inertial_velocity(sat1.position_km, sat1.velocity_kms, sat1.ref_frame)
        n = mean_motion_rad_s(sat1.position_km, v_inertial)
        if n:
            return n, "from SAT1 state vector (vis-viva)"
    if sat1.apogee_km is not None and sat1.perigee_km is not None:
        return mean_motion_from_altitudes(sat1.apogee_km, sat1.perigee_km), "from SAT1 apogee/perigee comments"
    raise ValueError("cannot determine the primary's mean motion (no state vector or apogee/perigee)")


def _evaluate(ctx: EncounterContext, n: float, dv, lead_time_h: float, fine: bool = True) -> dict:
    shift = cw_displacement(dv, n, lead_time_h * 3600.0)
    rel_new = ctx.rel_pos_m - shift
    miss_2d = ctx.plane.basis @ rel_new
    speed = float(np.linalg.norm(ctx.rel_vel_ms))
    tca_shift_s = -float(np.dot(rel_new, ctx.rel_vel_ms)) / (speed * speed)
    pc = pc_circle(miss_2d, ctx.plane.cov_2d, ctx.hbr.value_m, *((64, 128) if fine else (24, 48)))
    return {
        "displacement_rtn_m": [float(x) for x in shift],
        "miss_distance_m": float(np.linalg.norm(miss_2d)),
        "pc": pc,
        "tca_shift_s": tca_shift_s,
    }


def suggest_minimum_burns(ctx, n, lead_time_h, target_pc, max_dv_ms=1.0, steps=200) -> list[dict]:
    """Smallest single-axis burn (per direction) that brings Pc to <= target_pc."""
    directions = {
        "+in-track": (0.0, 1.0, 0.0),
        "-in-track": (0.0, -1.0, 0.0),
        "+radial": (1.0, 0.0, 0.0),
        "-radial": (-1.0, 0.0, 0.0),
        "+cross-track": (0.0, 0.0, 1.0),
        "-cross-track": (0.0, 0.0, -1.0),
    }
    baseline = _evaluate(ctx, n, (0.0, 0.0, 0.0), lead_time_h)
    if baseline["pc"] <= target_pc:
        return []
    out = []
    for name, unit in directions.items():
        def pc_at(mag: float, fine: bool = False) -> float:
            return _evaluate(ctx, n, tuple(mag * u for u in unit), lead_time_h, fine)["pc"]

        previous = 0.0
        found = None
        for k in range(1, steps + 1):
            mag = max_dv_ms * k / steps
            if pc_at(mag) <= target_pc:
                found = (previous, mag)
                break
            previous = mag
        if found is None:
            continue
        lo, hi = found
        for _ in range(30):
            mid = 0.5 * (lo + hi)
            lo, hi = (lo, mid) if pc_at(mid, fine=True) <= target_pc else (mid, hi)
        dv = tuple(hi * u for u in unit)
        result = _evaluate(ctx, n, dv, lead_time_h)
        out.append({"direction": name, "dv_ms": hi, "dv_rtn_ms": list(dv), **result})
    out.sort(key=lambda row: row["dv_ms"])
    return out


def trade_study(
    cdm: NormalizedCDM,
    candidates: list[Candidate],
    spacecraft: Spacecraft,
    pc_threshold: float,
    default_hbr_m: float,
    hbr_override_m: float | None = None,
    suggest_lead_time_h: float | None = None,
) -> dict:
    ctx = build_context(cdm, default_hbr_m, hbr_override_m)
    n, n_source = primary_mean_motion(cdm)
    period_min = 2.0 * math.pi / n / 60.0
    baseline = _evaluate(ctx, n, (0.0, 0.0, 0.0), 1.0)
    rows = []
    for cand in candidates:
        dv_mag = math.sqrt(sum(x * x for x in cand.dv_rtn_ms))
        result = _evaluate(ctx, n, cand.dv_rtn_ms, cand.lead_time_h)
        prop = propellant_kg(dv_mag, spacecraft.mass_kg, spacecraft.isp_s)
        rows.append(
            {
                "label": cand.label,
                "dv_rtn_ms": list(cand.dv_rtn_ms),
                "dv_total_ms": dv_mag,
                "lead_time_h": cand.lead_time_h,
                "burn_epoch": iso_z(cdm.tca - timedelta(hours=cand.lead_time_h)),
                **result,
                "meets_threshold": result["pc"] < pc_threshold,
                "propellant_kg": prop,
                "enough_propellant": prop <= spacecraft.propellant_available_kg,
            }
        )
    suggestions = []
    if suggest_lead_time_h:
        suggestions = suggest_minimum_burns(ctx, n, suggest_lead_time_h, pc_threshold)
        for row in suggestions:
            row["lead_time_h"] = suggest_lead_time_h
            row["propellant_kg"] = propellant_kg(row["dv_ms"], spacecraft.mass_kg, spacecraft.isp_s)
            row["enough_propellant"] = row["propellant_kg"] <= spacecraft.propellant_available_kg
    maneuverable = (cdm.sat1.maneuverable or "").upper()
    warnings = list(ctx.notes)
    if maneuverable in {"NO", "N"}:
        warnings.insert(0, f"Source CDM marks {cdm.sat1.label} as NOT maneuverable (SAT1_MANEUVERABLE = {cdm.sat1.maneuverable}); results are hypothetical.")
    elif maneuverable not in {"YES", "Y"}:
        warnings.insert(0, f"Maneuverability of {cdm.sat1.label} is not stated in the CDM ({cdm.sat1.maneuverable or 'not provided'}).")
    return {
        "status": "prototype - fidelity not agreed with CSA",
        "primary": cdm.sat1.label,
        "tca": iso_z(cdm.tca),
        "pc_threshold": pc_threshold,
        "hbr_m": ctx.hbr.value_m,
        "hbr_source": ctx.hbr.source,
        "mean_motion_rad_s": n,
        "mean_motion_source": n_source,
        "orbital_period_min": period_min,
        "baseline": {
            "miss_distance_m": baseline["miss_distance_m"],
            "pc": baseline["pc"],
            "source_pc_raw": cdm.pc_raw,
            "meets_threshold": baseline["pc"] < pc_threshold,
        },
        "candidates": rows,
        "suggestions": suggestions,
        "spacecraft": {
            "mass_kg": spacecraft.mass_kg,
            "isp_s": spacecraft.isp_s,
            "propellant_available_kg": spacecraft.propellant_available_kg,
        },
        "assumptions": ASSUMPTIONS,
        "limitations": LIMITATIONS,
        "warnings": warnings,
        "issues_commands": False,
    }
