"""CDM field names and units.

Field names follow the flattened Space-Track ``cdm`` class layout used in the six
sample messages supplied by CSA: top-level relative-metadata keys plus per-object keys
prefixed ``SAT1_`` / ``SAT2_``. CCSDS 508.0-B-1 KVN messages are mapped onto the same
names by :mod:`cads.cdm.kvn`, so the rest of CADS only ever sees one vocabulary (NFR08).
"""

from __future__ import annotations

# Covariance (CCSDS 508.0-B-1 section 3.5.10): lower triangle in the object's own RTN frame.
_AXES = ["R", "T", "N", "RDOT", "TDOT", "NDOT"]
_ROWS = ["CR", "CT", "CN", "CRDOT", "CTDOT", "CNDOT"]

#: 6x6 position/velocity covariance element names, row-major lower triangle.
COVARIANCE_6X6 = [[f"{_ROWS[i]}_{_AXES[j]}" for j in range(i + 1)] for i in range(6)]
#: 3x3 position block (m**2), the part required for a 2D Pc estimate.
COVARIANCE_POSITION = [name for row in COVARIANCE_6X6[:3] for name in row]

#: Extra rows that may follow the 6x6 block (drag, SRP, thrust); kept in the raw payload.
COVARIANCE_EXTENDED_ROWS = {
    "CDRG": _AXES + ["DRG"],
    "CSRP": _AXES + ["DRG", "SRP"],
    "CTHR": _AXES + ["DRG", "SRP", "THR"],
}

#: (canonical unit, accepted unit -> multiplier to canonical)
LENGTH_M = ("m", {"m": 1.0, "km": 1000.0})
SPEED_MS = ("m/s", {"m/s": 1.0, "km/s": 1000.0})
LENGTH_KM = ("km", {"km": 1.0, "m": 0.001})
SPEED_KMS = ("km/s", {"km/s": 1.0, "m/s": 0.001})
AREA_M2 = ("m**2", {"m**2": 1.0, "m^2": 1.0, "m2": 1.0, "km**2": 1.0e6})
DAYS = ("d", {"d": 1.0, "day": 1.0, "days": 1.0, "h": 1.0 / 24.0})
PERCENT = ("%", {"%": 1.0})

TOP_LEVEL_UNITS = {
    "MISS_DISTANCE": LENGTH_M,
    "RELATIVE_SPEED": SPEED_MS,
    "RELATIVE_POSITION_R": LENGTH_M,
    "RELATIVE_POSITION_T": LENGTH_M,
    "RELATIVE_POSITION_N": LENGTH_M,
    "RELATIVE_VELOCITY_R": SPEED_MS,
    "RELATIVE_VELOCITY_T": SPEED_MS,
    "RELATIVE_VELOCITY_N": SPEED_MS,
}

OBJECT_UNITS = {
    "X": LENGTH_KM,
    "Y": LENGTH_KM,
    "Z": LENGTH_KM,
    "X_DOT": SPEED_KMS,
    "Y_DOT": SPEED_KMS,
    "Z_DOT": SPEED_KMS,
    "AREA_PC": AREA_M2,
    "RECOMMENDED_OD_SPAN": DAYS,
    "ACTUAL_OD_SPAN": DAYS,
    "RESIDUALS_ACCEPTED": PERCENT,
    **{name: AREA_M2 for name in COVARIANCE_POSITION},
}

#: Fields without which a message cannot be associated with an encounter (US01, FR01).
REQUIRED_FIELDS = [
    "CREATION_DATE",
    "TCA",
    "MISS_DISTANCE",
    "SAT1_OBJECT_DESIGNATOR",
    "SAT2_OBJECT_DESIGNATOR",
]


def normalise_unit(unit: str | None) -> str | None:
    if unit is None:
        return None
    cleaned = unit.strip().strip("[]").strip().lower().replace(" ", "")
    return cleaned or None
