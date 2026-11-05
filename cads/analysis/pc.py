"""Experimental 2D probability-of-collision recalculation (FR10, FR11; B14 investigation).

STATUS: NOT VALIDATED. Source Pc values reported in the CDM remain the authoritative
values in CADS. This module exists so the team can compare against CSA/CRAMS and NASA
CARA reference cases (US09, NFR03) once they are available. Nothing here drives alerts.

Method (short-term encounter, as in Foster & Estes 1992 / Chan): at TCA, project the
relative position and the *combined* position covariance onto the encounter plane
(perpendicular to the relative velocity) and integrate the 2D Gaussian over a disk with
the combined hard-body radius (HBR). Integration uses Gauss-Legendre nodes in radius and
the trapezoidal rule in angle, which is spectrally accurate for this smooth periodic
integrand.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np

from ..cdm.parser import NormalizedCDM
from .frames import inertial_velocity, rotate_rtn_covariance, rtn_matrix

METHOD = "2D Gaussian over HBR disk in the encounter plane (short-term encounter, Foster-style numerical integration)"


@lru_cache(maxsize=8)
def _radial_nodes(n: int) -> tuple[np.ndarray, np.ndarray]:
    x, w = np.polynomial.legendre.leggauss(n)
    return x, w


@dataclass
class EncounterPlane:
    basis: np.ndarray  # 2x3 rows (x_hat, z_hat) expressed in the primary's RTN frame
    miss_2d: np.ndarray  # relative position projected on the plane (m)
    cov_2d: np.ndarray  # combined covariance projected on the plane (m^2)
    along_velocity_m: float  # component of the relative position along the relative velocity


def encounter_plane(rel_pos_m, rel_vel_ms, combined_cov_m2) -> EncounterPlane:
    r = np.asarray(rel_pos_m, dtype=float)
    v = np.asarray(rel_vel_ms, dtype=float)
    speed = float(np.linalg.norm(v))
    if speed == 0.0:
        raise ValueError("relative velocity is zero; encounter plane undefined")
    y_hat = v / speed
    along = float(np.dot(r, y_hat))
    r_perp = r - along * y_hat
    if np.linalg.norm(r_perp) > 1e-9:
        x_hat = r_perp / np.linalg.norm(r_perp)
    else:  # zero miss distance: any direction perpendicular to v will do
        trial = np.array([1.0, 0.0, 0.0]) if abs(y_hat[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
        x_hat = np.cross(y_hat, trial)
        x_hat /= np.linalg.norm(x_hat)
    z_hat = np.cross(y_hat, x_hat)
    basis = np.vstack([x_hat, z_hat])
    cov = np.asarray(combined_cov_m2, dtype=float)
    return EncounterPlane(basis, basis @ r, basis @ cov @ basis.T, along)


def pc_circle(miss_2d, cov_2d, hbr_m: float, n_radial: int = 64, n_angular: int = 128) -> float:
    """Integral of N(0, cov_2d) over the disk of radius ``hbr_m`` centred on ``miss_2d``."""
    if hbr_m <= 0:
        raise ValueError("hard-body radius must be positive")
    p = np.asarray(cov_2d, dtype=float)
    det = float(np.linalg.det(p))
    if not det > 0.0 or p[0, 0] <= 0.0:
        raise ValueError("encounter-plane covariance is not positive definite")
    p_inv = np.linalg.inv(p)
    m = np.asarray(miss_2d, dtype=float)
    x, w = _radial_nodes(n_radial)
    rho = 0.5 * hbr_m * (x + 1.0)
    w_rho = 0.5 * hbr_m * w
    theta = np.linspace(0.0, 2.0 * math.pi, n_angular, endpoint=False)
    px = m[0] + rho[:, None] * np.cos(theta)[None, :]
    pz = m[1] + rho[:, None] * np.sin(theta)[None, :]
    q = p_inv[0, 0] * px * px + 2.0 * p_inv[0, 1] * px * pz + p_inv[1, 1] * pz * pz
    density = np.exp(-0.5 * q) / (2.0 * math.pi * math.sqrt(det))
    integral = (w_rho[:, None] * rho[:, None] * density).sum() * (2.0 * math.pi / n_angular)
    return float(min(max(integral, 0.0), 1.0))


def ellipse_axes(cov_2d) -> tuple[float, float, float]:
    """1-sigma semi-major, semi-minor (m) and orientation (deg from plane x-axis)."""
    values, vectors = np.linalg.eigh(np.asarray(cov_2d, dtype=float))
    order = np.argsort(values)[::-1]
    values, vectors = values[order], vectors[:, order]
    angle = math.degrees(math.atan2(vectors[1, 0], vectors[0, 0]))
    return math.sqrt(max(values[0], 0.0)), math.sqrt(max(values[1], 0.0)), angle


@dataclass
class HardBodyRadius:
    value_m: float
    source: str


def hard_body_radius(cdm: NormalizedCDM, default_m: float, override_m: float | None = None) -> HardBodyRadius:
    if override_m is not None:
        return HardBodyRadius(float(override_m), "user override")
    if cdm.effective_hbr_m:
        return HardBodyRadius(cdm.effective_hbr_m, "COMMENT_EFFECTIVE_HBR in CDM")
    a1, a2 = cdm.sat1.area_pc_m2, cdm.sat2.area_pc_m2
    if a1 and a2 and a1 > 0 and a2 > 0:
        value = math.sqrt(a1 / math.pi) + math.sqrt(a2 / math.pi)
        return HardBodyRadius(value, "sqrt(AREA_PC/pi) of SAT1 + SAT2 (convention to confirm with CSA)")
    return HardBodyRadius(default_m, f"default CADS_DEFAULT_HBR_M = {default_m:g} m (CDM gives no usable size)")


@dataclass
class EncounterContext:
    """Everything needed to evaluate Pc for one CDM, in the primary's RTN frame."""

    rel_pos_m: np.ndarray
    rel_vel_ms: np.ndarray
    combined_cov_m2: np.ndarray
    plane: EncounterPlane
    hbr: HardBodyRadius
    notes: list[str] = field(default_factory=list)


def build_context(cdm: NormalizedCDM, default_hbr_m: float, hbr_override_m: float | None = None) -> EncounterContext:
    """Assemble the encounter geometry; raises ValueError with the missing input if impossible."""
    notes: list[str] = []
    if cdm.rel_pos_rtn_m is None or cdm.rel_vel_rtn_ms is None:
        raise ValueError("CDM has no RELATIVE_POSITION/RELATIVE_VELOCITY (RTN)")
    for label, obj in (("SAT1", cdm.sat1), ("SAT2", cdm.sat2)):
        if obj.covariance_rtn is None:
            raise ValueError(f"{label} position covariance not provided")
        if obj.position_km is None or obj.velocity_kms is None:
            raise ValueError(f"{label} state vector not provided (needed to align the RTN frames)")
    v1, note1 = inertial_velocity(cdm.sat1.position_km, cdm.sat1.velocity_kms, cdm.sat1.ref_frame)
    v2, note2 = inertial_velocity(cdm.sat2.position_km, cdm.sat2.velocity_kms, cdm.sat2.ref_frame)
    notes.append(f"SAT1: {note1}")
    notes.append(f"SAT2: {note2}")
    rtn1 = rtn_matrix(cdm.sat1.position_km, v1)
    rtn2 = rtn_matrix(cdm.sat2.position_km, v2)
    c1 = np.asarray(cdm.sat1.covariance_rtn, dtype=float)[:3, :3]
    c2 = rotate_rtn_covariance(np.asarray(cdm.sat2.covariance_rtn, dtype=float)[:3, :3], rtn1, rtn2)
    combined = c1 + c2
    if np.min(np.linalg.eigvalsh(combined)) <= 0:
        raise ValueError("combined position covariance is not positive definite")
    notes.append("Combined covariance = SAT1 + SAT2 position covariance (no scale factors, no cross-correlation)")
    rel_pos = np.asarray(cdm.rel_pos_rtn_m, dtype=float)
    rel_vel = np.asarray(cdm.rel_vel_rtn_ms, dtype=float)
    # Integrity cross-check: state vectors vs the CDM's reported relative position.
    state_rel = rtn1 @ ((np.asarray(cdm.sat2.position_km) - np.asarray(cdm.sat1.position_km)) * 1000.0)
    mismatch = float(np.linalg.norm(state_rel - rel_pos))
    if mismatch > max(5.0, 0.01 * float(np.linalg.norm(rel_pos))):
        notes.append(f"WARNING: state vectors imply a relative position {mismatch:.1f} m away from RELATIVE_POSITION")
    hbr = hard_body_radius(cdm, default_hbr_m, hbr_override_m)
    return EncounterContext(rel_pos, rel_vel, combined, encounter_plane(rel_pos, rel_vel, combined), hbr, notes)


def recalculate(cdm: NormalizedCDM, default_hbr_m: float, hbr_override_m: float | None = None) -> dict:
    """Recalculated Pc next to the source Pc, with inputs and provenance (FR10)."""
    base = {
        "status": "experimental - not validated (FR11, US09)",
        "method": METHOD,
        "source_pc_raw": cdm.pc_raw,
        "source_pc": cdm.pc,
        "source_pc_method": cdm.pc_method,
    }
    try:
        ctx = build_context(cdm, default_hbr_m, hbr_override_m)
        value = pc_circle(ctx.plane.miss_2d, ctx.plane.cov_2d, ctx.hbr.value_m)
    except ValueError as exc:
        return {**base, "available": False, "reason": str(exc)}
    major, minor, angle = ellipse_axes(ctx.plane.cov_2d)
    p_inv = np.linalg.inv(ctx.plane.cov_2d)
    mahalanobis = math.sqrt(float(ctx.plane.miss_2d @ p_inv @ ctx.plane.miss_2d))
    ratio = None
    if cdm.pc and value > 0:
        ratio = value / cdm.pc
    return {
        **base,
        "available": True,
        "recalculated_pc": value,
        "ratio_to_source": ratio,
        "hbr_m": ctx.hbr.value_m,
        "hbr_source": ctx.hbr.source,
        "miss_distance_plane_m": float(np.linalg.norm(ctx.plane.miss_2d)),
        "mahalanobis_distance": mahalanobis,
        "sigma_major_m": major,
        "sigma_minor_m": minor,
        "ellipse_angle_deg": angle,
        "miss_2d_m": [float(x) for x in ctx.plane.miss_2d],
        "cov_2d_m2": [[float(x) for x in row] for row in ctx.plane.cov_2d],
        "notes": ctx.notes,
    }
