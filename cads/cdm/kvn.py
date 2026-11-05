"""CCSDS 508.0-B-1 CDM in Keyword = Value Notation (KVN) -> flattened field names.

This second adapter exists to show that an additional source format can be added
without touching event-domain logic (NFR08). It maps:

* relative-metadata keywords (``TCA``, ``MISS_DISTANCE`` ...) to the same top-level names,
* keywords after ``OBJECT = OBJECT1`` / ``OBJECT2`` to ``SAT1_`` / ``SAT2_`` prefixed names,
* bracketed units (``715 [m]``) to companion ``*_UNIT`` fields, as in Space-Track JSON,
* well-known 18 SDS comment lines (apogee, perigee, ...) to ``*_COMMENT_*`` fields.
"""

from __future__ import annotations

import re

_LINE = re.compile(r"^([A-Z0-9_]+)\s*=\s*(.*?)\s*$")
_UNIT = re.compile(r"^(.*?)\s*\[([^\]]*)\]\s*$")

# Comment lines published by 18 SDS that Space-Track exposes as separate JSON fields.
_COMMENT_FIELDS = [
    (re.compile(r"^Apogee", re.I), "COMMENT_APOGEE"),
    (re.compile(r"^Perigee", re.I), "COMMENT_PERIGEE"),
    (re.compile(r"^Inclination", re.I), "COMMENT_INCLINATION"),
    (re.compile(r"^Screening Option", re.I), "COMMENT_SCREENING_OPTION"),
    (re.compile(r"^Covariance Scale Factor", re.I), "COMMENT_COVARIANCE_SCALE_FACTOR"),
    (re.compile(r"^Exclusion Volume Radius", re.I), "COMMENT_EXCLUSION_VOLUME_RADIUS"),
    (re.compile(r"^Effective HBR|^Hard Body Radius|^HBR", re.I), "COMMENT_EFFECTIVE_HBR"),
]


class KVNError(ValueError):
    pass


def looks_like_kvn(text: str) -> bool:
    return bool(re.search(r"^\s*CCSDS_CDM_VERS\s*=", text, re.M))


def parse_kvn(text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    prefix = ""
    free_comments: dict[str, list[str]] = {}
    for line_no, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.upper().startswith("COMMENT"):
            comment = stripped[7:].strip()
            for pattern, name in _COMMENT_FIELDS:
                if pattern.search(comment):
                    key = prefix + name if name != "COMMENT_SCREENING_OPTION" else name
                    fields.setdefault(key, comment)
                    break
            else:
                free_comments.setdefault(prefix, []).append(comment)
            continue
        match = _LINE.match(stripped)
        if not match:
            raise KVNError(f"line {line_no} is not in 'KEYWORD = value' form: {stripped[:60]!r}")
        key, value = match.groups()
        unit_match = _UNIT.match(value)
        unit = None
        if unit_match:
            value, unit = unit_match.group(1).strip(), unit_match.group(2).strip()
        if key == "OBJECT":
            marker = value.upper()
            if marker == "OBJECT1":
                prefix = "SAT1_"
            elif marker == "OBJECT2":
                prefix = "SAT2_"
            else:
                raise KVNError(f"line {line_no}: OBJECT must be OBJECT1 or OBJECT2, got {value!r}")
        name = prefix + key
        if name in fields:
            raise KVNError(f"line {line_no}: keyword {name} appears twice")
        fields[name] = value
        if unit:
            fields[name + "_UNIT"] = unit
    for scope, lines in free_comments.items():
        fields[scope + "COMMENT"] = "\n".join(lines)
    if "SAT1_OBJECT" not in fields or "SAT2_OBJECT" not in fields:
        raise KVNError("KVN message must contain OBJECT = OBJECT1 and OBJECT = OBJECT2 sections")
    return fields
