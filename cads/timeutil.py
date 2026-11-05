"""UTC timestamp helpers.

CCSDS CDM epochs are UTC. Internally CADS stores *naive* datetimes that are always
UTC (SQLite has no time-zone type) and serialises them with an explicit ``Z``.
Microseconds are preserved end to end (NFR01).
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

_DAY_OF_YEAR = re.compile(r"^(\d{4})-(\d{3})(?:[T ](.*))?$")
_EXTRA_FRACTION = re.compile(r"(\.\d{6})\d+")


def parse_utc(value: object) -> datetime:
    """Parse a CDM / Space-Track timestamp into a naive UTC datetime.

    Accepted forms: ``YYYY-MM-DDThh:mm:ss[.ffffff][Z|+hh:mm]``, the same with a space
    instead of ``T`` (Space-Track ``INSERT_EPOCH`` style) and the CCSDS day-of-year
    form ``YYYY-DDDThh:mm:ss[.f]``. Raises ``ValueError`` for anything else.
    """
    if not isinstance(value, str):
        raise ValueError(f"timestamp must be text, got {type(value).__name__}")
    text = value.strip()
    if not text:
        raise ValueError("timestamp is empty")
    match = _DAY_OF_YEAR.match(text)
    if match:
        year, day_of_year, rest = match.groups()
        day = datetime(int(year), 1, 1) + timedelta(days=int(day_of_year) - 1)
        text = f"{day:%Y-%m-%d}T{rest or '00:00:00'}"
    text = text.replace(" ", "T", 1)
    if text[-1] in "Zz":
        text = text[:-1] + "+00:00"
    text = _EXTRA_FRACTION.sub(r"\1", text)  # keep microsecond precision, drop the rest
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"not an ISO-8601/CCSDS timestamp: {value!r}") from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def to_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def iso_z(value: datetime | None) -> str | None:
    """Serialise a UTC datetime as ``YYYY-MM-DDThh:mm:ss.ffffffZ`` (None stays None)."""
    if value is None:
        return None
    return to_naive_utc(value).isoformat(timespec="microseconds") + "Z"


def utcnow() -> datetime:
    """Wall-clock UTC now (naive). Used for audit records and delivery scheduling."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hours_between(start: datetime, end: datetime) -> float:
    return (end - start).total_seconds() / 3600.0
