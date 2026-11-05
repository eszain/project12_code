"""Reference-frame helpers for conjunction geometry.

CDM covariances are given in each object's own RTN frame (R radial, T transverse,
N orbit normal). Combining them requires both frames' orientation, built from the CDM
state vectors at TCA. Space-Track CDMs give those vectors in ITRF (Earth-fixed), so the
inertial velocity is approximated as ``v_itrf + omega_earth x r`` in the instantaneous
Earth-fixed axes. That is exact for frame *orientation* apart from polar motion and
nutation terms, which are negligible here. Rotating both objects by a common
ITRF->GCRF rotation does not change their relative geometry, so it is not needed.
"""

from __future__ import annotations

import numpy as np

OMEGA_EARTH_RAD_S = 7.2921150e-5
MU_EARTH_KM3_S2 = 398600.4418
EARTH_RADIUS_KM = 6378.137

_INERTIAL = {"GCRF", "ICRF", "EME2000", "J2000", "TOD", "MOD", "TEME", "ECI"}


def is_earth_fixed(ref_frame: str | None) -> bool:
    frame = (ref_frame or "").upper().replace(" ", "")
    return frame.startswith("ITRF") or frame in {"ECEF", "EFG", "WGS84"}


def inertial_velocity(position_km, velocity_kms, ref_frame: str | None) -> tuple[np.ndarray, str]:
    r = np.asarray(position_km, dtype=float)
    v = np.asarray(velocity_kms, dtype=float)
    if is_earth_fixed(ref_frame):
        omega = np.array([0.0, 0.0, OMEGA_EARTH_RAD_S])
        return v + np.cross(omega, r), f"{ref_frame} velocity converted to inertial by adding omega_E x r"
    frame = (ref_frame or "").upper()
    if frame in _INERTIAL:
        return v, f"{ref_frame} treated as inertial"
    return v, f"reference frame {ref_frame or 'not stated'}: velocity assumed inertial"


def rtn_matrix(position, velocity) -> np.ndarray:
    """Rows are the R, T, N unit vectors expressed in the frame of ``position``/``velocity``."""
    r = np.asarray(position, dtype=float)
    v = np.asarray(velocity, dtype=float)
    r_hat = r / np.linalg.norm(r)
    h = np.cross(r, v)
    n_hat = h / np.linalg.norm(h)
    t_hat = np.cross(n_hat, r_hat)
    return np.vstack([r_hat, t_hat, n_hat])


def rotate_rtn_covariance(cov_in_rtn2, rtn1: np.ndarray, rtn2: np.ndarray) -> np.ndarray:
    """Express a covariance given in object 2's RTN frame in object 1's RTN frame."""
    a = rtn1 @ rtn2.T
    return a @ np.asarray(cov_in_rtn2, dtype=float) @ a.T


def mean_motion_rad_s(position_km, inertial_velocity_kms) -> float | None:
    r = float(np.linalg.norm(position_km))
    v = float(np.linalg.norm(inertial_velocity_kms))
    inverse_a = 2.0 / r - v * v / MU_EARTH_KM3_S2
    if inverse_a <= 0:
        return None
    a = 1.0 / inverse_a
    return float(np.sqrt(MU_EARTH_KM3_S2 / a**3))


def mean_motion_from_altitudes(apogee_km: float, perigee_km: float) -> float:
    a = EARTH_RADIUS_KM + (apogee_km + perigee_km) / 2.0
    return float(np.sqrt(MU_EARTH_KM3_S2 / a**3))


def angle_between_deg(a, b) -> float:
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    cosine = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))
