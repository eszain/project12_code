"""Regenerate the test/demo CDM fixtures in data/fixtures/ (deterministic, no randomness).

    python scripts/build_fixtures.py

WHY RECONSTRUCTED FIXTURES EXIST
The six original Space-Track CDM JSON files supplied by CSA are not in this repository
(redistribution has not been confirmed). ``data/fixtures/reconstructed/`` rebuilds them
in the full Space-Track ``cdm`` field layout so the pipeline can be developed and tested:

* REPRODUCED from Progress Report 1, Appendix A: creation date/time (to the minute),
  TCA (to the second), source Pc, the SCISAT 1 identity, the Fengyun-1C debris object
  type and the A/B encounter grouping. Seconds and sub-seconds are placeholders.
* PLACEHOLDER (invented here, physically consistent): miss vectors, covariances,
  state vectors, OD statistics, object sizes and the debris catalogue number (99999).
  Each miss distance is SOLVED so that the experimental Pc recalculation reproduces the
  documented source Pc, i.e. agreement on these files is by construction and is NOT
  validation evidence. Run the real files through CADS for a genuine comparison.

``synthetic/``, ``kvn/`` and ``invalid/`` hold clearly fictitious test cases.
See data/fixtures/PROVENANCE.md.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from cads.analysis.frames import MU_EARTH_KM3_S2 as MU, EARTH_RADIUS_KM as RE, OMEGA_EARTH_RAD_S, rtn_matrix  # noqa: E402
from cads.analysis.pc import encounter_plane, pc_circle  # noqa: E402
from cads.cdm.fields import COVARIANCE_EXTENDED_ROWS, COVARIANCE_6X6  # noqa: E402

OUT = ROOT / "data" / "fixtures"
FIXTURE_NOTE = (
    "RECONSTRUCTED FIXTURE - not CSA/Space-Track source data. Creation date, TCA and source Pc follow "
    "Progress Report 1 Appendix A; all other values are placeholders, with the miss distance solved so the "
    "recalculated Pc matches the source Pc by construction. See data/fixtures/PROVENANCE.md"
)
SYNTHETIC_NOTE = "SYNTHETIC TEST FIXTURE - fictitious objects; see data/fixtures/PROVENANCE.md"

# ----------------------------------------------------------------------------- orbit maths


def circular_state(a_km, inc_deg, raan_deg, u_deg):
    i, raan, u = (math.radians(x) for x in (inc_deg, raan_deg, u_deg))
    r = a_km * np.array(
        [
            math.cos(u) * math.cos(raan) - math.sin(u) * math.cos(i) * math.sin(raan),
            math.cos(u) * math.sin(raan) + math.sin(u) * math.cos(i) * math.cos(raan),
            math.sin(u) * math.sin(i),
        ]
    )
    speed = math.sqrt(MU / a_km)
    v = speed * np.array(
        [
            -math.sin(u) * math.cos(raan) - math.cos(u) * math.cos(i) * math.sin(raan),
            -math.sin(u) * math.sin(raan) + math.cos(u) * math.cos(i) * math.cos(raan),
            math.cos(u) * math.sin(i),
        ]
    )
    return r, v


def gmst_rad(t: datetime) -> float:
    jd = 2440587.5 + t.replace(tzinfo=timezone.utc).timestamp() / 86400.0
    return math.radians((280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360.0)


def eci_to_itrf(r, v, t):
    th = gmst_rad(t)
    rot = np.array([[math.cos(th), math.sin(th), 0.0], [-math.sin(th), math.cos(th), 0.0], [0.0, 0.0, 1.0]])
    r_f = rot @ r
    v_f = rot @ v - np.cross([0.0, 0.0, OMEGA_EARTH_RAD_S], r_f)
    return r_f, v_f


def inclination_deg(r, v):
    h = np.cross(r, v)
    return math.degrees(math.acos(h[2] / np.linalg.norm(h)))


def apsides_km(r, v):
    rn, vn = np.linalg.norm(r), np.linalg.norm(v)
    a = 1.0 / (2.0 / rn - vn * vn / MU)
    e_vec = ((vn * vn - MU / rn) * r - np.dot(r, v) * v) / MU
    e = np.linalg.norm(e_vec)
    return a * (1 + e) - RE, a * (1 - e) - RE


def secondary_velocity(r1, v1, crossing_deg, radial_ms):
    """Secondary velocity at r1: same semi-major axis as the primary (same period, so
    consecutive-orbit encounters are possible), heading rotated by ``crossing_deg``."""
    m1 = rtn_matrix(r1, v1)
    a1 = 1.0 / (2.0 / np.linalg.norm(r1) - np.dot(v1, v1) / MU)
    speed = math.sqrt(MU * (2.0 / np.linalg.norm(r1) - 1.0 / a1))
    vr = radial_ms / 1000.0
    vh = math.sqrt(speed * speed - vr * vr)
    th = math.radians(crossing_deg)
    return m1.T @ np.array([vr, vh * math.cos(th), vh * math.sin(th)])


def solve_crossing(r1, v1, target_inc_deg, radial_ms):
    """Heading rotation (deg) that gives the secondary the target inclination."""
    f = lambda c: inclination_deg(r1, secondary_velocity(r1, v1, c, radial_ms)) - target_inc_deg  # noqa: E731
    for lo, hi in ((90.0, 179.0), (-179.0, -90.0), (10.0, 90.0), (-90.0, -10.0)):
        if f(lo) * f(hi) > 0:
            continue
        for _ in range(80):
            mid = 0.5 * (lo + hi)
            lo, hi = (lo, mid) if f(lo) * f(mid) <= 0 else (mid, hi)
        return 0.5 * (lo + hi)
    raise RuntimeError("no crossing angle reaches the target inclination")


def miss_vector(rel_vel_rtn_ms, miss_m, radial_m):
    """Miss vector perpendicular to the relative velocity with the given radial part."""
    y = rel_vel_rtn_ms / np.linalg.norm(rel_vel_rtn_ms)
    e1 = np.array([1.0, 0.0, 0.0]) - y[0] * y
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(y, e1)
    return radial_m * e1 + math.sqrt(miss_m**2 - radial_m**2) * e2


# ----------------------------------------------------------------------------- covariance


def covariance(sig_rtn_m, rho_rt=-0.25, n=1.1e-3):
    sr, st, sn = sig_rtn_m
    srd, std, snd = st * n, 2.0 * sr * n, sn * n
    c = np.zeros((6, 6))
    c[0, 0], c[1, 1], c[2, 2] = sr**2, st**2, sn**2
    c[0, 1] = c[1, 0] = rho_rt * sr * st
    c[3, 3], c[4, 4], c[5, 5] = srd**2, std**2, snd**2
    c[3, 1] = c[1, 3] = -0.8 * st * srd
    assert np.min(np.linalg.eigvalsh(c)) > 0, "placeholder covariance must be positive definite"
    return c


def _kind(axis: str) -> str:
    if axis in ("R", "T", "N", "CR", "CT", "CN"):
        return "pos"
    if axis in ("RDOT", "TDOT", "NDOT", "CRDOT", "CTDOT", "CNDOT"):
        return "vel"
    return "par"  # drag / SRP consider parameters


# CCSDS 508.0-B-1 units for each covariance block
_BLOCK_UNITS = {
    ("pos", "pos"): "m**2",
    ("vel", "pos"): "m**2/s",
    ("vel", "vel"): "m**2/s**2",
    ("par", "pos"): "m**3/kg",
    ("par", "vel"): "m**3/(kg*s)",
    ("par", "par"): "m**4/kg**2",
}


def covariance_fields(c, drag=1.2e-3, srp=8.0e-4):
    fields = {}
    for i, row in enumerate(COVARIANCE_6X6):
        for j, name in enumerate(row):
            fields[name] = f"{c[i, j]:.6E}"
            fields[name + "_UNIT"] = _unit_product(name)
    for row_name in ("CDRG", "CSRP"):
        for col in COVARIANCE_EXTENDED_ROWS[row_name]:
            name = f"{row_name}_{col}"
            value = 0.0
            if name == "CDRG_DRG":
                value = drag
            elif name == "CSRP_SRP":
                value = srp
            fields[name] = f"{value:.6E}"
            fields[name + "_UNIT"] = _unit_product(name)
    return fields


def _unit_product(name):
    row, col = name.split("_", 1)
    return _BLOCK_UNITS[(_kind(row), _kind(col))]


# ----------------------------------------------------------------------------- CDM records


def fmt_time(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%S.%f")


def object_block(prefix, meta, r_f, v_f, cov, od, comments):
    fields = {
        "COMMENT_SCREENING_DATA_SOURCE": None,
        "OBJECT": "OBJECT1" if prefix == "SAT1_" else "OBJECT2",
        "OBJECT_DESIGNATOR": meta["designator"],
        "CATALOG_NAME": "SATCAT",
        "OBJECT_NAME": meta["name"],
        "INTERNATIONAL_DESIGNATOR": meta["intl"],
        "OBJECT_TYPE": meta["type"],
        "OPERATOR_CONTACT_POSITION": None,
        "OPERATOR_ORGANIZATION": meta.get("operator"),
        "OPERATOR_PHONE": None,
        "OPERATOR_EMAIL": None,
        "EPHEMERIS_NAME": "NONE",
        "COVARIANCE_METHOD": "CALCULATED",
        "MANEUVERABLE": meta["maneuverable"],
        "REF_FRAME": "ITRF",
        "GRAVITY_MODEL": "EGM-96: 36D 36O",
        "ATMOSPHERIC_MODEL": "JBH09",
        "N_BODY_PERTURBATIONS": "MOON,SUN",
        "SOLAR_RAD_PRESSURE": "YES",
        "EARTH_TIDES": "YES",
        "INTRACK_THRUST": "NO",
        "COMMENT_COVARIANCE_SCALE_FACTOR": None,
        "COMMENT_EXCLUSION_VOLUME_RADIUS": None,
        "TIME_LASTOB_START": fmt_time(od["lastob_start"]),
        "TIME_LASTOB_END": fmt_time(od["lastob_end"]),
        "RECOMMENDED_OD_SPAN": f"{od['rec_span']:.2f}",
        "RECOMMENDED_OD_SPAN_UNIT": "d",
        "ACTUAL_OD_SPAN": f"{od['act_span']:.2f}",
        "ACTUAL_OD_SPAN_UNIT": "d",
        "OBS_AVAILABLE": str(od["obs_avail"]),
        "OBS_USED": str(od["obs_used"]),
        "RESIDUALS_ACCEPTED": f"{od['resid']:.1f}",
        "RESIDUALS_ACCEPTED_UNIT": "%",
        "WEIGHTED_RMS": f"{od['wrms']:.3f}",
        "COMMENT_APOGEE": f"Apogee Altitude = {comments['apogee']:.0f}   [km]",
        "COMMENT_PERIGEE": f"Perigee Altitude = {comments['perigee']:.0f}   [km]",
        "COMMENT_INCLINATION": f"Inclination = {comments['inclination']:.1f}  [deg]",
        "COMMENT_DCP_DENSITY_FORECAST_UNCERTAINTY": None,
        "COMMENT_DCP_SENSITIVITY_VECTOR_POSITION": None,
        "COMMENT_DCP_SENSITIVITY_VECTOR_VELOCITY": None,
        "AREA_PC": f"{meta['area_pc']:.4f}",
        "AREA_PC_UNIT": "m**2",
        "CD_AREA_OVER_MASS": f"{meta['cd_am']:.6f}",
        "CD_AREA_OVER_MASS_UNIT": "m**2/kg",
        "CR_AREA_OVER_MASS": f"{meta['cr_am']:.6f}",
        "CR_AREA_OVER_MASS_UNIT": "m**2/kg",
        "THRUST_ACCELERATION": "0",
        "THRUST_ACCELERATION_UNIT": "m/s**2",
        "SEDR": f"{meta['sedr']:.6E}",
        "SEDR_UNIT": "W/kg",
        "X": f"{r_f[0]:.6f}",
        "X_UNIT": "km",
        "Y": f"{r_f[1]:.6f}",
        "Y_UNIT": "km",
        "Z": f"{r_f[2]:.6f}",
        "Z_UNIT": "km",
        "X_DOT": f"{v_f[0]:.9f}",
        "X_DOT_UNIT": "km/s",
        "Y_DOT": f"{v_f[1]:.9f}",
        "Y_DOT_UNIT": "km/s",
        "Z_DOT": f"{v_f[2]:.9f}",
        "Z_DOT_UNIT": "km/s",
    }
    fields.update(covariance_fields(cov))
    return {prefix + k: v for k, v in fields.items()}


def build_cdm(spec, primary, secondary, encounter, note):
    tca, created = spec["tca"], spec["created"]
    dt_s = (tca - encounter["tca_ref"]).total_seconds()
    u = encounter["u_deg"] + math.degrees(math.sqrt(MU / primary["a_km"] ** 3) * dt_s)
    r1, v1 = circular_state(primary["a_km"], primary["inc_deg"], primary["raan_deg"], u)
    v2 = secondary_velocity(r1, v1, encounter["crossing_deg"], encounter["radial_ms"])
    m1 = rtn_matrix(r1, v1)
    rel_vel_rtn = m1 @ (v2 - v1) * 1000.0
    c1, c2 = covariance(spec["sig1"]), covariance(spec["sig2"])
    direction = miss_vector(rel_vel_rtn, 1.0, spec["radial_m"] / spec["miss_m"])
    scale = spec["miss_m"]
    if spec.get("target_pc"):
        # Placeholder geometry: solve the miss distance (fixed direction) so that the 2D Pc
        # reproduces the documented source Pc. Agreement is therefore BY CONSTRUCTION.
        a = m1 @ rtn_matrix(r1, v2).T
        combined = c1[:3, :3] + a @ c2[:3, :3] @ a.T
        hbr = math.sqrt(primary["area_pc"] / math.pi) + math.sqrt(secondary["area_pc"] / math.pi)

        def pc_for(s):
            plane = encounter_plane(direction * s, rel_vel_rtn, combined)
            return pc_circle(plane.miss_2d, plane.cov_2d, hbr)

        lo, hi = 0.0, 50_000.0
        for _ in range(200):
            mid = 0.5 * (lo + hi)
            lo, hi = (mid, hi) if pc_for(mid) > spec["target_pc"] else (lo, mid)
        scale = 0.5 * (lo + hi)
    rel_pos_rtn = direction * scale
    r2 = r1 + m1.T @ rel_pos_rtn / 1000.0
    r1_f, v1_f = eci_to_itrf(r1, v1, tca)
    r2_f, v2_f = eci_to_itrf(r2, v2, tca)
    ap1, pe1 = apsides_km(r1, v1)
    ap2, pe2 = apsides_km(r2, v2)
    pc_text = spec.get("pc_raw")
    if pc_text is None:  # synthetic: the "source" Pc is our own calculation
        m2 = rtn_matrix(r2, v2)
        a = m1 @ m2.T
        combined = c1[:3, :3] + a @ c2[:3, :3] @ a.T
        plane = encounter_plane(rel_pos_rtn, rel_vel_rtn, combined)
        hbr = math.sqrt(primary["area_pc"] / math.pi) + math.sqrt(secondary["area_pc"] / math.pi)
        pc_text = f"{pc_circle(plane.miss_2d, plane.cov_2d, hbr):.6E}"
    doy = tca.timetuple().tm_yday
    record = {
        "CONSTELLATION": spec["constellation"],
        "CDM_ID": spec["cdm_id"],
        "FILENAME": spec["filename"],
        "INSERT_EPOCH": (created + timedelta(minutes=3)).strftime("%Y-%m-%d %H:%M:%S"),
        "CCSDS_CDM_VERS": "1.0",
        "CREATION_DATE": fmt_time(created),
        "ORIGINATOR": "CSpOC",
        "MESSAGE_FOR": primary["name"],
        "MESSAGE_ID": f"{primary['designator']}_conj_{secondary['designator']}_{tca:%Y}{doy:03d}{tca:%H%M%S}_{spec['cdm_id']}",
        "COMMENT_EMERGENCY_REPORTABLE": None,
        "TCA": fmt_time(tca),
        "MISS_DISTANCE": f"{np.linalg.norm(rel_pos_rtn):.0f}",
        "MISS_DISTANCE_UNIT": "m",
        "RELATIVE_SPEED": f"{np.linalg.norm(rel_vel_rtn):.0f}",
        "RELATIVE_SPEED_UNIT": "m/s",
        "RELATIVE_POSITION_R": f"{rel_pos_rtn[0]:.1f}",
        "RELATIVE_POSITION_R_UNIT": "m",
        "RELATIVE_POSITION_T": f"{rel_pos_rtn[1]:.1f}",
        "RELATIVE_POSITION_T_UNIT": "m",
        "RELATIVE_POSITION_N": f"{rel_pos_rtn[2]:.1f}",
        "RELATIVE_POSITION_N_UNIT": "m",
        "RELATIVE_VELOCITY_R": f"{rel_vel_rtn[0]:.1f}",
        "RELATIVE_VELOCITY_R_UNIT": "m/s",
        "RELATIVE_VELOCITY_T": f"{rel_vel_rtn[1]:.1f}",
        "RELATIVE_VELOCITY_T_UNIT": "m/s",
        "RELATIVE_VELOCITY_N": f"{rel_vel_rtn[2]:.1f}",
        "RELATIVE_VELOCITY_N_UNIT": "m/s",
        "COMMENT_SCREENING_OPTION": "Screening Option = Covariance",
        "COLLISION_PROBABILITY": pc_text,
        "COLLISION_PROBABILITY_METHOD": "FOSTER-1992",
        "COMMENT_EFFECTIVE_HBR": None,
    }
    od1 = {**primary["od"], "lastob_start": created - timedelta(days=1.6), "lastob_end": created - timedelta(hours=5)}
    od2 = {**secondary["od"], "lastob_start": created - timedelta(days=3.1), "lastob_end": created - timedelta(hours=9)}
    record.update(
        object_block("SAT1_", primary, r1_f, v1_f, c1, od1, {"apogee": ap1, "perigee": pe1, "inclination": inclination_deg(r1, v1)})
    )
    record.update(
        object_block("SAT2_", secondary, r2_f, v2_f, c2, od2, {"apogee": ap2, "perigee": pe2, "inclination": inclination_deg(r2, v2)})
    )
    return {"_FIXTURE_NOTE": note, **record}


# ----------------------------------------------------------------------------- data sets

SCISAT = {
    "designator": "27858",
    "name": "SCISAT 1",
    "intl": "2003-036A",
    "type": "PAYLOAD",
    "operator": "Canadian Space Agency",
    "maneuverable": "NO",
    "a_km": RE + 641.0,
    "inc_deg": 73.92,
    "raan_deg": 210.0,
    "area_pc": 2.5,
    "cd_am": 0.0118,
    "cr_am": 0.0074,
    "sedr": 2.1e-4,
    "od": {"rec_span": 3.5, "act_span": 3.5, "obs_avail": 182, "obs_used": 176, "resid": 98.9, "wrms": 1.021},
}
FY1C_DEB = {
    "designator": "99999",  # placeholder: the real catalogue number is in the original files
    "name": "FENGYUN 1C DEB",
    "intl": "1999-025XXX",  # placeholder piece designator
    "type": "DEBRIS",
    "operator": None,
    "maneuverable": "N/A",
    "area_pc": 0.05,
    "cd_am": 0.0410,
    "cr_am": 0.0260,
    "sedr": 6.4e-4,
    "od": {"rec_span": 7.0, "act_span": 7.0, "obs_avail": 96, "obs_used": 88, "resid": 92.6, "wrms": 1.312},
}

T = lambda s: datetime.fromisoformat(s)  # noqa: E731
REC_A = {"tca_ref": T("2026-02-26T17:17:37.412"), "u_deg": 35.0, "radial_ms": -38.0}
REC_B = {"tca_ref": T("2026-02-26T18:55:05.233"), "u_deg": 34.7, "radial_ms": -36.0}

# Documented values (Progress Report 1, Appendix A): created HH:MM, TCA HH:MM:SS, Pc, group.
# miss/radial only fix the miss *direction* (radial fraction); the magnitude is solved so the
# 2D Pc equals the target. For the two "Pc = 0" messages the target is a placeholder tiny
# positive value, illustrating "reported zero" vs "very small positive" (NFR01, AC02).
RECONSTRUCTED = [
    # set, group, created,              TCA,                       source Pc,      target Pc,  miss, radial, sigma SAT1 (R,T,N), sigma SAT2
    (1, REC_A, "2026-02-24T14:32:41", "2026-02-26T17:17:37.412", "1.009416E-06", 1.009416e-06, 620.0, 85.0, (12, 160, 8), (55, 1450, 35)),
    (5, REC_B, "2026-02-25T03:29:15", "2026-02-26T18:55:05.233", "7.854690E-07", 7.854690e-07, 1000.0, 100.0, (10, 130, 7), (48, 1200, 30)),
    (2, REC_B, "2026-02-25T09:50:02", "2026-02-26T18:55:04.691", "2.885737E-08", 2.885737e-08, 1400.0, 110.0, (9, 115, 7), (40, 950, 28)),
    (3, REC_B, "2026-02-25T15:58:37", "2026-02-26T18:55:04.518", "7.665263E-09", 7.665263e-09, 1550.0, 95.0, (8, 95, 6), (35, 760, 25)),
    (4, REC_A, "2026-02-26T08:19:53", "2026-02-26T17:17:36.874", "0", 1.0e-22, 1450.0, -210.0, (6, 45, 5), (22, 260, 15)),
    (6, REC_B, "2026-02-26T14:45:20", "2026-02-26T18:55:05.106", "0", 1.0e-35, 2900.0, -160.0, (5, 30, 4), (15, 140, 10)),
]

TEST_SAT = {
    "designator": "99901",
    "name": "CADS TEST SAT",
    "intl": "2026-900A",
    "type": "PAYLOAD",
    "operator": "CADS Synthetic Test Org",
    "maneuverable": "YES",
    "a_km": RE + 552.0,
    "inc_deg": 53.0,
    "raan_deg": 40.0,
    "area_pc": 4.0,
    "cd_am": 0.0150,
    "cr_am": 0.0090,
    "sedr": 3.0e-4,
    "od": {"rec_span": 2.0, "act_span": 2.0, "obs_avail": 240, "obs_used": 236, "resid": 99.2, "wrms": 0.984},
}
TEST_DEB = {
    "designator": "99902",
    "name": "CADS TEST DEBRIS",
    "intl": "2026-900B",
    "type": "DEBRIS",
    "operator": None,
    "maneuverable": "N/A",
    "area_pc": 0.5,
    "cd_am": 0.0300,
    "cr_am": 0.0200,
    "sedr": 5.0e-4,
    "od": {"rec_span": 5.0, "act_span": 4.2, "obs_avail": 64, "obs_used": 55, "resid": 90.4, "wrms": 1.450},
}
SYN = {"tca_ref": T("2026-02-27T06:42:10.250"), "u_deg": 120.0, "radial_ms": 25.0}
SYNTHETIC = [
    (1, "2026-02-25T10:12:00", "2026-02-27T06:42:10.250", 380.0, 30.0, (8, 60, 5), (30, 600, 20)),
    (2, "2026-02-26T01:40:00", "2026-02-27T06:42:10.871", 120.0, 12.0, (6, 40, 4), (22, 330, 15)),
    (3, "2026-02-26T13:05:00", "2026-02-27T06:42:10.433", 62.0, 9.0, (4, 25, 3), (18, 220, 12)),
]


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def to_kvn(record: dict) -> str:
    lines = [f"COMMENT {SYNTHETIC_NOTE}"]
    header = ["CCSDS_CDM_VERS", "CREATION_DATE", "ORIGINATOR", "MESSAGE_FOR", "MESSAGE_ID", "TCA", "MISS_DISTANCE", "RELATIVE_SPEED"]
    header += [f"RELATIVE_POSITION_{a}" for a in "RTN"] + [f"RELATIVE_VELOCITY_{a}" for a in "RTN"]
    header += ["COLLISION_PROBABILITY", "COLLISION_PROBABILITY_METHOD"]
    for key in header:
        lines.append(_kvn_line(key, record[key], record.get(key + "_UNIT")))
        if key == "RELATIVE_VELOCITY_N":
            lines.append("COMMENT " + record["COMMENT_SCREENING_OPTION"])
    for prefix in ("SAT1_", "SAT2_"):
        for key, value in record.items():
            if not key.startswith(prefix) or key.endswith("_UNIT") or value is None:
                continue
            name = key[len(prefix):]
            if name.startswith("COMMENT_"):
                lines.append(f"COMMENT {value}")
            else:
                lines.append(_kvn_line(name, value, record.get(key + "_UNIT")))
    return "\n".join(lines) + "\n"


def _kvn_line(key, value, unit):
    return f"{key:<32} = {value}" + (f" [{unit}]" if unit else "")


def main() -> None:
    recon_dir = OUT / "reconstructed"
    for n, enc, created, tca, pc_raw, target_pc, miss, radial, sig1, sig2 in RECONSTRUCTED:
        crossing = solve_crossing(*circular_state(SCISAT["a_km"], SCISAT["inc_deg"], SCISAT["raan_deg"], enc["u_deg"]), 98.8, enc["radial_ms"])
        spec = {
            "cdm_id": f"RECON-{n}",
            "filename": f"RECONSTRUCTED_cdm_set_{n}",
            "constellation": "Canadian_Space_Agency",
            "created": T(created),
            "tca": T(tca),
            "pc_raw": pc_raw,
            "target_pc": target_pc,
            "miss_m": miss,
            "radial_m": radial,
            "sig1": sig1,
            "sig2": sig2,
        }
        write_json(recon_dir / f"cdm_set_{n}.json", build_cdm(spec, SCISAT, FY1C_DEB, {**enc, "crossing_deg": crossing}, FIXTURE_NOTE))

    syn_dir = OUT / "synthetic"
    syn_records = []
    for n, created, tca, miss, radial, sig1, sig2 in SYNTHETIC:
        spec = {
            "cdm_id": f"SYNTH-{n}",
            "filename": f"SYNTHETIC_high_risk_{n}",
            "constellation": "CADS_Synthetic_Test_Org",
            "created": T(created),
            "tca": T(tca),
            "pc_raw": None,
            "miss_m": miss,
            "radial_m": radial,
            "sig1": sig1,
            "sig2": sig2,
        }
        record = build_cdm(spec, TEST_SAT, TEST_DEB, {**SYN, "crossing_deg": 115.0}, SYNTHETIC_NOTE)
        syn_records.append(record)
        write_json(syn_dir / f"synthetic_high_risk_{n}.json", record)

    kvn_dir = OUT / "kvn"
    kvn_record = {k: v for k, v in syn_records[-1].items() if k != "_FIXTURE_NOTE"}
    (kvn_dir).mkdir(parents=True, exist_ok=True)
    (kvn_dir / "synthetic_high_risk_3.kvn").write_text(to_kvn(kvn_record), encoding="utf-8")

    invalid_dir = OUT / "invalid"
    base = json.loads((recon_dir / "cdm_set_1.json").read_text(encoding="utf-8"))
    base["_FIXTURE_NOTE"] = "INVALID TEST FIXTURE derived from a reconstructed fixture"
    variants = {
        "missing_tca.json": {"TCA": None, "CDM_ID": "INVALID-1"},
        "pc_out_of_range.json": {"COLLISION_PROBABILITY": "1.5E+00", "CDM_ID": "INVALID-2"},
        "identical_objects.json": {"SAT2_OBJECT_DESIGNATOR": base["SAT1_OBJECT_DESIGNATOR"], "CDM_ID": "INVALID-3"},
        "bad_timestamp.json": {"CREATION_DATE": "26/02/2026 08:19", "CDM_ID": "INVALID-4"},
    }
    for name, changes in variants.items():
        write_json(invalid_dir / name, {**base, **changes})
    (invalid_dir / "truncated.json").write_text(json.dumps(base, indent=2)[:900], encoding="utf-8")
    (invalid_dir / "not_a_cdm.txt").write_text("This is a meeting note, not a conjunction data message.\n", encoding="utf-8")

    print(f"fixtures written under {OUT}")


if __name__ == "__main__":
    main()
