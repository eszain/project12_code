"""Model -> JSON conversion. Units are part of every key name (``_m``, ``_ms``, ``_h``)."""

from __future__ import annotations

from datetime import datetime

from ..alerts.rules import severity_label
from ..config import Settings
from ..models import AlertOccurrence, AlertRule, AuditEntry, CDMRevision, ConjunctionEvent, NotificationDelivery
from ..timeutil import hours_between, iso_z


def pc_display(pc: float | None, raw: str | None) -> dict:
    """Source Pc exactly as reported, plus an explicit interpretation (NFR01, AC02)."""
    if raw is None:
        meaning = "not provided by the source"
    elif pc == 0:
        meaning = "reported as exactly zero by the source"
    else:
        meaning = "as reported by the source"
    return {"raw": raw, "value": pc, "meaning": meaning}


def event_summary(event: ConjunctionEvent, settings: Settings, now: datetime) -> dict:
    hours_to_tca = hours_between(now, event.tca)
    return {
        "id": event.id,
        "event_key": event.event_key,
        "primary": {"designator": event.primary_designator, "name": event.primary_name},
        "secondary": {"designator": event.secondary_designator, "name": event.secondary_name},
        "organization": event.organization,
        "status": event.status,
        "tca": iso_z(event.tca),
        "hours_to_tca": hours_to_tca,
        "tca_passed": hours_to_tca < 0,
        "latest_cdm_created": iso_z(event.latest_creation_date),
        "pc": pc_display(event.latest_pc, event.latest_pc_raw),
        "max_pc": event.max_pc,
        "severity": severity_label(event.latest_pc, settings),
        "miss_distance_m": event.latest_miss_distance_m,
        "revision_count": event.revision_count,
        "data_labels": event.data_labels or [],
        "correlation_note": event.correlation_note,
        "updated_at": iso_z(event.updated_at),
    }


def revision_summary(rev: CDMRevision, previous: CDMRevision | None = None) -> dict:
    out = {
        "id": rev.id,
        "cdm_id": rev.cdm_id,
        "message_id": rev.message_id,
        "originator": rev.originator,
        "creation_date": iso_z(rev.creation_date),
        "tca": iso_z(rev.tca),
        "lead_time_h": hours_between(rev.creation_date, rev.tca),
        "miss_distance_m": rev.miss_distance_m,
        "relative_speed_ms": rev.relative_speed_ms,
        "relative_position_rtn_m": [rev.rel_pos_r_m, rev.rel_pos_t_m, rev.rel_pos_n_m],
        "relative_velocity_rtn_ms": [rev.rel_vel_r_ms, rev.rel_vel_t_ms, rev.rel_vel_n_ms],
        "pc": pc_display(rev.pc, rev.pc_raw),
        "pc_method": rev.pc_method,
        "sat1": {"designator": rev.sat1_designator, "name": rev.sat1_name, "object_type": rev.sat1_object_type, "maneuverable": rev.sat1_maneuverable},
        "sat2": {"designator": rev.sat2_designator, "name": rev.sat2_name, "object_type": rev.sat2_object_type, "maneuverable": rev.sat2_maneuverable},
        "source": {
            "format": rev.source_format,
            "file": rev.source_file,
            "sha256": rev.source_sha256,
            "label": rev.source_label,
            "ingested_at": iso_z(rev.ingested_at),
        },
        "correlation_note": rev.correlation_note,
        "warnings": rev.warnings or [],
    }
    if previous is not None:
        out["change_from_previous"] = {
            "tca_shift_s": (rev.tca - previous.tca).total_seconds(),
            "miss_distance_m": rev.miss_distance_m - previous.miss_distance_m,
            "pc_ratio": (rev.pc / previous.pc) if (rev.pc is not None and previous.pc) else None,
            "pc_direction": _direction(previous.pc, rev.pc),
        }
    return out


def _direction(before: float | None, after: float | None) -> str:
    if before is None or after is None:
        return "unknown"
    if after > before:
        return "increased"
    if after < before:
        return "decreased"
    return "unchanged"


def rule_dict(rule: AlertRule) -> dict:
    return {
        "id": rule.id,
        "name": rule.name,
        "description": rule.description,
        "enabled": rule.enabled,
        "pc_min": rule.pc_min,
        "miss_distance_max_m": rule.miss_distance_max_m,
        "hours_to_tca_max": rule.hours_to_tca_max,
        "object_ids": rule.object_ids or [],
        "channels": rule.channels or [],
        "created_at": iso_z(rule.created_at),
        "updated_at": iso_z(rule.updated_at),
    }


def delivery_dict(delivery: NotificationDelivery) -> dict:
    return {
        "id": delivery.id,
        "channel_type": delivery.channel_type,
        "target": delivery.target,
        "status": delivery.status,
        "attempts": delivery.attempts,
        "next_attempt_at": iso_z(delivery.next_attempt_at),
        "last_error": delivery.last_error,
        "sent_at": iso_z(delivery.sent_at),
        "attempt_log": [
            {"attempt_no": a.attempt_no, "at": iso_z(a.attempted_at), "success": a.success, "error": a.error}
            for a in delivery.attempt_log
        ],
    }


def occurrence_dict(occ: AlertOccurrence) -> dict:
    return {
        "id": occ.id,
        "created_at": iso_z(occ.created_at),
        "rule": {"id": occ.rule_id, "name": occ.rule.name if occ.rule else None},
        "event_id": occ.event_id,
        "revision_id": occ.revision_id,
        "matched": occ.matched or [],
        "severity": (occ.message or {}).get("severity"),
        "message": occ.message,
        "deliveries": [delivery_dict(d) for d in occ.deliveries],
    }


def audit_dict(entry: AuditEntry) -> dict:
    return {
        "id": entry.id,
        "at": iso_z(entry.at),
        "actor": entry.actor,
        "action": entry.action,
        "entity_type": entry.entity_type,
        "entity_id": entry.entity_id,
        "details": entry.details or {},
    }
