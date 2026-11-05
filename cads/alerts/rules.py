"""Alert-rule evaluation (US05, FR07, FR08, AC03).

Rules are evaluated on the **source** Pc reported in the CDM, never on the experimental
recalculation. Conditions are combined with AND; a rule with no conditions matches every
CDM (the UI warns about this). An occurrence is unique per (rule, revision), so
re-importing a message or re-running evaluation cannot create a duplicate alert.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings
from ..models import AlertOccurrence, AlertRule, CDMRevision, ConjunctionEvent, NotificationDelivery
from ..timeutil import hours_between, iso_z, utcnow

CAVEAT = (
    "Decision support only. Pc and miss distance are the values reported in the source CDM; "
    "verify with flight dynamics before any action. CADS does not command spacecraft."
)


def evaluate_rule(rule: AlertRule, rev: CDMRevision) -> tuple[bool, list[str]]:
    """Return (matches, reasons). Reasons explain each satisfied (or failed) condition."""
    reasons: list[str] = []
    if rule.pc_min is not None:
        if rev.pc is None:
            return False, ["source Pc not provided"]
        if rev.pc < rule.pc_min:
            return False, [f"Pc {rev.pc_raw} < {rule.pc_min:.1E}"]
        reasons.append(f"Pc {rev.pc_raw} >= {rule.pc_min:.1E}")
    if rule.miss_distance_max_m is not None:
        if rev.miss_distance_m > rule.miss_distance_max_m:
            return False, [f"miss distance {rev.miss_distance_m:.1f} m > {rule.miss_distance_max_m:g} m"]
        reasons.append(f"miss distance {rev.miss_distance_m:.1f} m <= {rule.miss_distance_max_m:g} m")
    if rule.hours_to_tca_max is not None:
        lead_h = hours_between(rev.creation_date, rev.tca)
        if lead_h < 0 or lead_h > rule.hours_to_tca_max:
            return False, [f"TCA {lead_h:.1f} h after CDM creation (limit {rule.hours_to_tca_max:g} h)"]
        reasons.append(f"TCA {lead_h:.1f} h after CDM creation <= {rule.hours_to_tca_max:g} h")
    if rule.object_ids:
        watched = {str(x).strip() for x in rule.object_ids}
        if rev.sat1_designator not in watched and rev.sat2_designator not in watched:
            return False, ["neither object is on the rule's watch list"]
        reasons.append("object on watch list")
    return True, reasons or ["rule has no conditions (matches every CDM)"]


def severity_label(pc: float | None, settings: Settings) -> str:
    if pc is None:
        return "UNKNOWN"
    if pc >= settings.pc_action_threshold:
        return "ACTION"
    if pc >= settings.pc_watch_threshold:
        return "WATCH"
    return "ZERO" if pc == 0 else "LOW"


def build_message(rule: AlertRule, rev: CDMRevision, event: ConjunctionEvent, reasons: list[str], settings: Settings) -> dict:
    return {
        "type": "cads.conjunction.alert",
        "severity": severity_label(rev.pc, settings),
        "rule": {"id": rule.id, "name": rule.name},
        "matched_conditions": reasons,
        "event": {
            "id": event.id,
            "key": event.event_key,
            "primary": f"{rev.sat1_name or ''} ({rev.sat1_designator})".strip(),
            "secondary": f"{rev.sat2_name or ''} ({rev.sat2_designator})".strip(),
            "url": f"{settings.public_base_url}/#/events/{event.id}",
        },
        "revision": {
            "id": rev.id,
            "cdm_id": rev.cdm_id,
            "message_id": rev.message_id,
            "creation_date": iso_z(rev.creation_date),
            "tca": iso_z(rev.tca),
            "lead_time_h": round(hours_between(rev.creation_date, rev.tca), 3),
            "miss_distance_m": rev.miss_distance_m,
            "pc_source": rev.pc_raw,
            "pc_method": rev.pc_method,
            "source_file": rev.source_file,
            "source_label": rev.source_label,
        },
        "caveat": CAVEAT,
        "generated_at": iso_z(utcnow()),
    }


def evaluate_revision(session: Session, rev: CDMRevision, event: ConjunctionEvent, settings: Settings) -> list[AlertOccurrence]:
    """Create occurrences + pending deliveries for every enabled rule the revision matches."""
    created = []
    rules = session.scalars(select(AlertRule).where(AlertRule.enabled.is_(True)).order_by(AlertRule.id)).all()
    for rule in rules:
        matches, reasons = evaluate_rule(rule, rev)
        if not matches:
            continue
        exists = session.scalar(
            select(AlertOccurrence.id).where(AlertOccurrence.rule_id == rule.id, AlertOccurrence.revision_id == rev.id)
        )
        if exists:
            continue
        occurrence = AlertOccurrence(
            rule_id=rule.id,
            revision_id=rev.id,
            event_id=event.id,
            matched=reasons,
            message={},
            created_at=utcnow(),
        )
        session.add(occurrence)
        session.flush()
        message = build_message(rule, rev, event, reasons, settings)
        message["occurrence_id"] = occurrence.id  # lets receivers de-duplicate at-least-once deliveries
        occurrence.message = message
        seen = set()
        for channel in rule.channels or []:
            key = (channel.get("type"), channel.get("target", ""))
            if key in seen:
                continue
            seen.add(key)
            session.add(
                NotificationDelivery(
                    occurrence_id=occurrence.id,
                    channel_type=key[0],
                    target=key[1],
                    status="pending",
                    attempts=0,
                    next_attempt_at=utcnow(),
                )
            )
        created.append(occurrence)
    return created
