"""CDM ingestion validator: raw message -> :class:`NormalizedCDM` (US01, FR01, FR17).

Design rules (Progress Report 1, NFR01 / NFR10):

* The original payload is kept verbatim in ``raw``. JSON numbers are captured as their
  literal text (``parse_float=str``), so ``1.009416E-06`` is never re-formatted.
* Source Pc is kept twice: ``pc_raw`` (exact source text) and ``pc`` (float). A source
  zero (``pc == 0``) stays distinct from "not provided" (``pc is None``) and from very
  small positive values.
* Problems that make a message unusable are *errors* (the record is rejected); anything
  suspicious but usable is a *warning* that travels with the stored revision.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass, field
from datetime import datetime

from ..timeutil import parse_utc
from .fields import (
    COVARIANCE_6X6,
    OBJECT_UNITS,
    REQUIRED_FIELDS,
    TOP_LEVEL_UNITS,
    normalise_unit,
)
from .kvn import KVNError, looks_like_kvn, parse_kvn

_NUMBER = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
_MISSING = {"", "null", "none", "n/a", "na"}


@dataclass
class ObjectInfo:
    """One conjunction object (SAT1 = primary / the CDM recipient's asset, SAT2 = secondary)."""

    designator: str
    name: str | None = None
    international_designator: str | None = None
    catalog_name: str | None = None
    object_type: str | None = None
    operator_organization: str | None = None
    maneuverable: str | None = None
    ref_frame: str | None = None
    covariance_method: str | None = None
    ephemeris_name: str | None = None
    time_lastob_start: datetime | None = None
    time_lastob_end: datetime | None = None
    recommended_od_span_d: float | None = None
    actual_od_span_d: float | None = None
    obs_available: float | None = None
    obs_used: float | None = None
    residuals_accepted_pct: float | None = None
    weighted_rms: float | None = None
    area_pc_m2: float | None = None
    cd_area_over_mass: float | None = None
    cr_area_over_mass: float | None = None
    sedr: float | None = None
    apogee_km: float | None = None
    perigee_km: float | None = None
    inclination_deg: float | None = None
    exclusion_volume_radius_m: float | None = None
    position_km: tuple[float, float, float] | None = None
    velocity_kms: tuple[float, float, float] | None = None
    #: Position (3x3) or position/velocity (6x6) covariance in this object's RTN frame (m, s).
    covariance_rtn: list[list[float]] | None = None

    @property
    def label(self) -> str:
        return f"{self.name} ({self.designator})" if self.name else self.designator


@dataclass
class NormalizedCDM:
    message_key: str
    cdm_id: str | None
    message_id: str | None
    originator: str | None
    message_for: str | None
    constellation: str | None
    ccsds_version: str | None
    creation_date: datetime
    tca: datetime
    miss_distance_m: float
    relative_speed_ms: float | None
    rel_pos_rtn_m: tuple[float, float, float] | None
    rel_vel_rtn_ms: tuple[float, float, float] | None
    pc: float | None
    pc_raw: str | None
    pc_method: str | None
    screening_option: str | None
    effective_hbr_m: float | None
    sat1: ObjectInfo
    sat2: ObjectInfo
    source_format: str
    raw: dict
    warnings: list[str] = field(default_factory=list)

    @property
    def lead_time_h(self) -> float:
        """Hours from message creation to TCA (how much warning this CDM gave)."""
        return (self.tca - self.creation_date).total_seconds() / 3600.0


@dataclass
class ParseResult:
    record_index: int
    cdm: NormalizedCDM | None
    errors: list[str]
    warnings: list[str]
    raw: dict | None

    @property
    def ok(self) -> bool:
        return self.cdm is not None and not self.errors


# --------------------------------------------------------------------------- documents


def parse_document(content: bytes | str, filename: str = "") -> list[ParseResult]:
    """Parse a file that holds one CDM (JSON object or KVN) or many (JSON array)."""
    if isinstance(content, bytes):
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            return [ParseResult(0, None, ["file is not UTF-8 text"], [], None)]
    else:
        text = content
    stripped = text.lstrip()
    if not stripped:
        return [ParseResult(0, None, ["file is empty"], [], None)]
    if stripped[0] in "{[":
        try:
            data = json.loads(text, parse_float=str, parse_int=str, parse_constant=str)
        except json.JSONDecodeError as exc:
            return [ParseResult(0, None, [f"invalid JSON: {exc.msg} (line {exc.lineno}, column {exc.colno})"], [], None)]
        records = data if isinstance(data, list) else [data]
        if not records:
            return [ParseResult(0, None, ["JSON array contains no CDM records"], [], None)]
        results = []
        for index, record in enumerate(records):
            if not isinstance(record, dict):
                results.append(ParseResult(index, None, ["record is not a JSON object"], [], None))
                continue
            results.append(normalize_record(record, "spacetrack-json", index))
        return results
    if looks_like_kvn(text):
        try:
            record = parse_kvn(text)
        except KVNError as exc:
            return [ParseResult(0, None, [f"invalid CCSDS KVN: {exc}"], [], None)]
        return [normalize_record(record, "ccsds-kvn", 0)]
    hint = f" ({filename})" if filename else ""
    return [ParseResult(0, None, [f"unrecognised format{hint}: expected Space-Track CDM JSON or CCSDS CDM KVN"], [], None)]


# --------------------------------------------------------------------------- records


class _Reader:
    """Field access with error/warning collection for one flattened record."""

    def __init__(self, record: dict):
        self.record = record
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def text(self, key: str) -> str | None:
        value = self.record.get(key)
        if value is None or isinstance(value, (dict, list)):
            return None
        text = str(value).strip()
        return None if text.lower() in _MISSING else text

    def time(self, key: str, required: bool = False) -> datetime | None:
        value = self.text(key)
        if value is None:
            if required:
                self.errors.append(f"missing required field {key}")
            return None
        try:
            return parse_utc(value)
        except ValueError as exc:
            (self.errors if required else self.warnings).append(f"{key}: {exc}")
            return None

    def number(self, key: str, units: tuple | None = None, required: bool = False) -> float | None:
        value = self.text(key)
        if value is None:
            if required:
                self.errors.append(f"missing required field {key}")
            return None
        try:
            number = float(value)
        except ValueError:
            (self.errors if required else self.warnings).append(f"{key} is not numeric: {value!r}")
            return None
        if math.isnan(number) or math.isinf(number):
            (self.errors if required else self.warnings).append(f"{key} is not a finite number: {value!r}")
            return None
        if units is not None:
            canonical, accepted = units
            unit = normalise_unit(self.text(key + "_UNIT"))
            if unit is not None and unit != normalise_unit(canonical):
                factor = accepted.get(unit)
                if factor is None:
                    (self.errors if required else self.warnings).append(
                        f"{key}_UNIT {unit!r} is not supported (expected {canonical})"
                    )
                    return None
                number *= factor
                self.warnings.append(f"{key} converted from {unit} to {canonical}")
        return number

    def comment_number(self, key: str) -> float | None:
        """Extract the value from 18 SDS comment strings such as 'Apogee Altitude = 646 [km]'."""
        value = self.text(key)
        if value is None:
            return None
        tail = value.split("=", 1)[1] if "=" in value else value
        match = _NUMBER.search(tail)
        return float(match.group()) if match else None

    def vector(self, keys: list[str], units: tuple) -> tuple[float, float, float] | None:
        values = [self.number(k, units) for k in keys]
        if any(v is None for v in values):
            return None
        return (values[0], values[1], values[2])  # type: ignore[return-value]


def _covariance(reader: _Reader, prefix: str) -> list[list[float]] | None:
    """Assemble the symmetric 6x6 (or 3x3 position-only) RTN covariance, if present."""
    values: dict[str, float] = {}
    for row in COVARIANCE_6X6:
        for name in row:
            units = OBJECT_UNITS.get(name)
            number = reader.number(prefix + name, units)
            if number is not None:
                values[name] = number
    size = 6 if len(values) == 21 else 3 if all(n in values for row in COVARIANCE_6X6[:3] for n in row) else 0
    if size == 0:
        if values:
            reader.warnings.append(f"{prefix}covariance incomplete; recalculated Pc unavailable for this object")
        return None
    matrix = [[0.0] * size for _ in range(size)]
    for i in range(size):
        for j in range(i + 1):
            matrix[i][j] = matrix[j][i] = values[COVARIANCE_6X6[i][j]]
    for i in range(3):
        if matrix[i][i] < 0:
            reader.warnings.append(f"{prefix}covariance has a negative variance on the diagonal")
            return None
    return matrix


def _object(reader: _Reader, prefix: str) -> ObjectInfo:
    p = prefix
    return ObjectInfo(
        designator=reader.text(p + "OBJECT_DESIGNATOR") or "",
        name=reader.text(p + "OBJECT_NAME"),
        international_designator=reader.text(p + "INTERNATIONAL_DESIGNATOR"),
        catalog_name=reader.text(p + "CATALOG_NAME"),
        object_type=reader.text(p + "OBJECT_TYPE"),
        operator_organization=reader.text(p + "OPERATOR_ORGANIZATION"),
        maneuverable=reader.text(p + "MANEUVERABLE"),
        ref_frame=reader.text(p + "REF_FRAME"),
        covariance_method=reader.text(p + "COVARIANCE_METHOD"),
        ephemeris_name=reader.text(p + "EPHEMERIS_NAME"),
        time_lastob_start=reader.time(p + "TIME_LASTOB_START"),
        time_lastob_end=reader.time(p + "TIME_LASTOB_END"),
        recommended_od_span_d=reader.number(p + "RECOMMENDED_OD_SPAN", OBJECT_UNITS["RECOMMENDED_OD_SPAN"]),
        actual_od_span_d=reader.number(p + "ACTUAL_OD_SPAN", OBJECT_UNITS["ACTUAL_OD_SPAN"]),
        obs_available=reader.number(p + "OBS_AVAILABLE"),
        obs_used=reader.number(p + "OBS_USED"),
        residuals_accepted_pct=reader.number(p + "RESIDUALS_ACCEPTED", OBJECT_UNITS["RESIDUALS_ACCEPTED"]),
        weighted_rms=reader.number(p + "WEIGHTED_RMS"),
        area_pc_m2=reader.number(p + "AREA_PC", OBJECT_UNITS["AREA_PC"]),
        cd_area_over_mass=reader.number(p + "CD_AREA_OVER_MASS"),
        cr_area_over_mass=reader.number(p + "CR_AREA_OVER_MASS"),
        sedr=reader.number(p + "SEDR"),
        apogee_km=reader.comment_number(p + "COMMENT_APOGEE"),
        perigee_km=reader.comment_number(p + "COMMENT_PERIGEE"),
        inclination_deg=reader.comment_number(p + "COMMENT_INCLINATION"),
        exclusion_volume_radius_m=reader.comment_number(p + "COMMENT_EXCLUSION_VOLUME_RADIUS"),
        position_km=reader.vector([p + "X", p + "Y", p + "Z"], OBJECT_UNITS["X"]),
        velocity_kms=reader.vector([p + "X_DOT", p + "Y_DOT", p + "Z_DOT"], OBJECT_UNITS["X_DOT"]),
        covariance_rtn=_covariance(reader, p),
    )


def message_key_for(record: dict) -> str:
    """Stable identity used to detect repeat imports of the same message."""
    for key in ("CDM_ID", "MESSAGE_ID"):
        value = record.get(key)
        if value not in (None, ""):
            return f"{key}:{str(value).strip()}"
    canonical = json.dumps(record, sort_keys=True, separators=(",", ":"))
    return "SHA256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalize_record(record: dict, source_format: str, index: int = 0) -> ParseResult:
    reader = _Reader(record)
    creation = reader.time("CREATION_DATE", required=True)
    tca = reader.time("TCA", required=True)
    miss = reader.number("MISS_DISTANCE", TOP_LEVEL_UNITS["MISS_DISTANCE"], required=True)
    for key in REQUIRED_FIELDS:
        if key.startswith("SAT") and reader.text(key) is None:
            reader.errors.append(f"missing required field {key}")
    if miss is not None and miss < 0:
        reader.errors.append(f"MISS_DISTANCE is negative ({miss})")

    pc_raw = reader.text("COLLISION_PROBABILITY")
    pc: float | None = None
    if pc_raw is not None:
        try:
            pc = float(pc_raw)
        except ValueError:
            reader.errors.append(f"COLLISION_PROBABILITY is not numeric: {pc_raw!r}")
        else:
            if math.isnan(pc) or not 0.0 <= pc <= 1.0:
                reader.errors.append(f"COLLISION_PROBABILITY must be between 0 and 1, got {pc_raw!r}")
                pc = None
    else:
        reader.warnings.append("COLLISION_PROBABILITY not provided by the source (shown as 'not provided', not zero)")

    relative_speed = reader.number("RELATIVE_SPEED", TOP_LEVEL_UNITS["RELATIVE_SPEED"])
    rel_pos = reader.vector(
        ["RELATIVE_POSITION_R", "RELATIVE_POSITION_T", "RELATIVE_POSITION_N"], TOP_LEVEL_UNITS["RELATIVE_POSITION_R"]
    )
    rel_vel = reader.vector(
        ["RELATIVE_VELOCITY_R", "RELATIVE_VELOCITY_T", "RELATIVE_VELOCITY_N"], TOP_LEVEL_UNITS["RELATIVE_VELOCITY_R"]
    )
    sat1 = _object(reader, "SAT1_")
    sat2 = _object(reader, "SAT2_")
    if sat1.designator and sat1.designator == sat2.designator:
        reader.errors.append("SAT1 and SAT2 have the same OBJECT_DESIGNATOR")

    # Consistency checks: usable, but worth surfacing to an analyst.
    if rel_pos is not None and miss is not None:
        norm = math.dist((0.0, 0.0, 0.0), rel_pos)
        if abs(norm - miss) > max(1.0, 0.01 * miss):
            reader.warnings.append(f"|RELATIVE_POSITION| = {norm:.1f} m differs from MISS_DISTANCE = {miss:.1f} m")
    if rel_vel is not None and relative_speed is not None:
        norm = math.dist((0.0, 0.0, 0.0), rel_vel)
        if abs(norm - relative_speed) > max(1.0, 0.01 * relative_speed):
            reader.warnings.append(f"|RELATIVE_VELOCITY| = {norm:.1f} m/s differs from RELATIVE_SPEED = {relative_speed:.1f} m/s")
    if creation is not None and tca is not None and tca < creation:
        reader.warnings.append("TCA is earlier than CREATION_DATE (message issued after the predicted closest approach)")
    for obj, prefix in ((sat1, "SAT1"), (sat2, "SAT2")):
        if obj.covariance_method and obj.covariance_method.upper() == "DEFAULT":
            reader.warnings.append(f"{prefix} covariance method is DEFAULT; risk estimates are less reliable")

    effective_hbr = reader.comment_number("COMMENT_EFFECTIVE_HBR")
    if reader.errors or creation is None or tca is None or miss is None:
        return ParseResult(index, None, reader.errors or ["message could not be normalised"], reader.warnings, record)

    cdm = NormalizedCDM(
        message_key=message_key_for(record),
        cdm_id=reader.text("CDM_ID"),
        message_id=reader.text("MESSAGE_ID"),
        originator=reader.text("ORIGINATOR"),
        message_for=reader.text("MESSAGE_FOR"),
        constellation=reader.text("CONSTELLATION"),
        ccsds_version=reader.text("CCSDS_CDM_VERS"),
        creation_date=creation,
        tca=tca,
        miss_distance_m=miss,
        relative_speed_ms=relative_speed,
        rel_pos_rtn_m=rel_pos,
        rel_vel_rtn_ms=rel_vel,
        pc=pc,
        pc_raw=pc_raw,
        pc_method=reader.text("COLLISION_PROBABILITY_METHOD"),
        screening_option=reader.text("COMMENT_SCREENING_OPTION"),
        effective_hbr_m=effective_hbr,
        sat1=sat1,
        sat2=sat2,
        source_format=source_format,
        raw=record,
        warnings=list(reader.warnings),
    )
    return ParseResult(index, cdm, [], reader.warnings, record)


def normalize_stored(raw: dict, source_format: str) -> NormalizedCDM:
    """Re-normalise a stored raw payload (analysis always starts from the source)."""
    result = normalize_record(raw, source_format)
    if result.cdm is None:
        raise ValueError("stored CDM no longer validates: " + "; ".join(result.errors))
    return result.cdm
