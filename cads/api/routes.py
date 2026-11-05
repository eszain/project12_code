"""REST API (US03-US07, US10 prototype). Interactive docs at /docs."""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from sqlalchemy import select

from ..alerts.dispatcher import process_due
from ..alerts.rules import severity_label
from ..analysis import maneuver, pc, quality
from ..cdm.parser import normalize_stored
from ..config import PROJECT_ROOT
from ..db import audit, reset_db
from ..ingest import import_documents
from ..models import AlertOccurrence, AlertRule, AuditEntry, ConjunctionEvent
from ..sources.local import LocalDirectorySource
from ..timeutil import hours_between, iso_z, parse_utc, utcnow
from .deps import SessionDep, SettingsDep, load_event, pick_revision
from .schemas import AlertRuleIn, ManeuverRequest, StatusChangeIn
from .serializers import audit_dict, event_summary, occurrence_dict, revision_summary, rule_dict

router = APIRouter(prefix="/api")
FIXTURES = PROJECT_ROOT / "data" / "fixtures"


@router.get("/health")
def health(settings: SettingsDep):
    return {"status": "ok", "config": settings.public_summary()}


@router.post("/import")
async def import_files(session: SessionDep, settings: SettingsDep, files: list[UploadFile] = File(...), actor: str = "anonymous"):
    docs = [(f.filename or "upload", await f.read()) for f in files]
    return import_documents(session, docs, settings, source_label="upload", actor=actor).as_dict()


@router.post("/import/fixtures/{name}")
def import_fixture_set(name: str, session: SessionDep, settings: SettingsDep):
    """Load a bundled folder: reconstructed | synthetic | kvn | invalid."""
    if name not in {"reconstructed", "synthetic", "kvn", "invalid"}:
        raise HTTPException(404, "unknown fixture set")
    label = {"reconstructed": "reconstructed-sample", "synthetic": "synthetic", "kvn": "synthetic", "invalid": "invalid-test"}[name]
    docs = LocalDirectorySource(FIXTURES / name).fetch()
    return import_documents(session, docs, settings, source_label=label, actor="fixture-loader").as_dict()


_SHIFT_KEYS = ("CREATION_DATE", "TCA", "INSERT_EPOCH", "TIME_LASTOB_START", "TIME_LASTOB_END")
_FIXTURE_NOW = datetime(2026, 2, 26, 15, 0, 0)  # "now" inside the sample data (just after the last sample CDM)


def _explain(event, rev, rec: dict, quality_checks: list[dict], settings, now) -> list[str]:
    """Plain-language reasons for one event's severity (all from source values unless stated)."""
    pc_now = event.latest_pc
    lines = []
    if pc_now is None:
        lines.append("Source Pc not provided, so risk cannot be rated.")
    elif pc_now >= settings.pc_action_threshold:
        lines.append(f"Latest source Pc {event.latest_pc_raw} is at or above the action level {settings.pc_action_threshold:.0E}: ACTION.")
    elif pc_now >= settings.pc_watch_threshold:
        lines.append(f"Latest source Pc {event.latest_pc_raw} is below the action level {settings.pc_action_threshold:.0E} but at or above the watch level {settings.pc_watch_threshold:.0E}: WATCH.")
    elif pc_now == 0:
        lines.append("Latest CDM reports Pc exactly 0: the source sees no collision risk at this update.")
    else:
        lines.append(f"Latest source Pc {event.latest_pc_raw} is below the watch level {settings.pc_watch_threshold:.0E}: LOW.")
    revs = sorted(event.revisions, key=lambda r: (r.creation_date, r.id))
    if len(revs) > 1:
        lines.append(f"{len(revs)} CDMs: Pc went " + " → ".join(r.pc_raw or "n/a" for r in revs) + ".")
    hours = hours_between(now, event.tca)
    lines.append(f"TCA is in {hours:.1f} h." if hours >= 0 else f"TCA passed {-hours:.1f} h ago.")
    lines.append(f"Miss distance {event.latest_miss_distance_m:.0f} m, relative speed {rev.relative_speed_ms or 0:.0f} m/s.")
    if rec.get("available"):
        lines.append(f"Experimental recalculated Pc {rec['recalculated_pc']:.2E} (not validated; severity uses the source Pc).")
    else:
        lines.append(f"Recalculation unavailable: {rec.get('reason')}.")
    exceeded = [c["name"] for c in quality_checks if c["status"] == "exceeds limit"]
    if exceeded:
        lines.append("Data quality: " + ", ".join(exceeded) + " exceed the provisional limits.")
    return lines


@router.post("/analyze")
def analyze_all(session: SessionDep, settings: SettingsDep):
    """Rate every event and explain why (severity from source Pc; recalculation is advisory)."""
    now = settings.reference_now()
    out = {}
    for event in session.scalars(select(ConjunctionEvent)).all():
        rev = pick_revision(event, None)
        cdm = normalize_stored(rev.raw, rev.source_format)
        rec = pc.recalculate(cdm, settings.default_hbr_m)
        q = quality.assess(cdm, settings.quality_limits_m)
        checks = q["sat1"]["checks"] + q["sat2"]["checks"]
        out[event.id] = {"severity": severity_label(event.latest_pc, settings), "why": _explain(event, rev, rec, checks, settings, now)}
    return out


@router.post("/reset")
def reset_data(request: Request):
    """Delete all events, rules, alerts and audit rows. For the local demo only."""
    reset_db(request.app.state.engine)
    return {"status": "reset"}


@router.post("/import/demo")
def import_demo(session: SessionDep, settings: SettingsDep):
    """One-click scenario: sample CDMs re-dated so the encounters are upcoming relative to now.

    Uses the reconstructed + synthetic fixtures, labelled as such. Creates a default
    'Pc >= 1e-4' file-alert rule if no rules exist yet, so alerts appear in the demo.
    """
    delta = settings.reference_now() - _FIXTURE_NOW
    docs = []
    for folder in ("reconstructed", "synthetic"):
        for name, content in LocalDirectorySource(FIXTURES / folder).fetch():
            record = json.loads(content)
            for key, value in list(record.items()):
                if value and key.split("_", 1)[-1] in _SHIFT_KEYS or key in _SHIFT_KEYS:
                    if isinstance(value, str):
                        record[key] = iso_z(parse_utc(value) + delta)[:-1].replace("T", " " if key.endswith("EPOCH") else "T")
            record["_FIXTURE_NOTE"] = "DEMO: re-dated copy of a " + folder + " fixture"
            docs.append((name, json.dumps(record).encode()))
    if session.scalar(select(AlertRule.id).limit(1)) is None:
        rule = AlertRule(name="Pc >= 1e-4 (CSA action level)", pc_min=1e-4, channels=[{"type": "file", "target": "alerts.jsonl"}])
        session.add(rule)
        session.flush()
        audit(session, "demo", "rule.created", "alert_rule", rule.id, rule=rule_dict(rule))
        session.commit()
    labelled = []
    for name, content in docs:
        labelled.append((name, content))
    reports = [import_documents(session, [d], settings, source_label="demo-reconstructed" if "RECON" in d[1].decode() else "demo-synthetic", actor="demo").as_dict() for d in labelled]
    counts = {k: sum(r["counts"][k] for r in reports) for k in reports[0]["counts"]}
    return {"counts": counts, "shift_hours": round(delta.total_seconds() / 3600, 1)}


@router.get("/events")
def list_events(session: SessionDep, settings: SettingsDep, object_id: str | None = None, status: str | None = None,
                min_pc: float | None = None, sort: str = "tca"):
    now = settings.reference_now()
    events = session.scalars(select(ConjunctionEvent)).all()
    if object_id:
        events = [e for e in events if object_id in (e.primary_designator, e.secondary_designator)]
    if status:
        events = [e for e in events if e.status == status]
    if min_pc is not None:
        events = [e for e in events if e.latest_pc is not None and e.latest_pc >= min_pc]
    keys = {"tca": lambda e: e.tca, "pc": lambda e: -(e.latest_pc or 0), "miss": lambda e: e.latest_miss_distance_m}
    events.sort(key=keys.get(sort, keys["tca"]))
    return [event_summary(e, settings, now) for e in events]


@router.get("/events/{event_id}")
def event_detail(event_id: int, session: SessionDep, settings: SettingsDep):
    event = load_event(session, event_id)
    revs = sorted(event.revisions, key=lambda r: (r.creation_date, r.id))
    return {
        **event_summary(event, settings, settings.reference_now()),
        "revisions": [revision_summary(r, revs[i - 1] if i else None) for i, r in enumerate(revs)],
        "note": "Pc and miss distance are the values reported in each source CDM.",
    }


@router.get("/events/{event_id}/analysis")
def event_analysis(event_id: int, session: SessionDep, settings: SettingsDep, revision_id: int | None = None):
    rev = pick_revision(load_event(session, event_id), revision_id)
    cdm = normalize_stored(rev.raw, rev.source_format)
    return {
        "revision_id": rev.id,
        "quality": quality.assess(cdm, settings.quality_limits_m),
        "recalculation": pc.recalculate(cdm, settings.default_hbr_m),
    }


@router.post("/events/{event_id}/maneuver")
def event_maneuver(event_id: int, body: ManeuverRequest, session: SessionDep, settings: SettingsDep):
    rev = pick_revision(load_event(session, event_id), body.revision_id)
    cdm = normalize_stored(rev.raw, rev.source_format)
    cands = [maneuver.Candidate(c.label, (c.dv_radial_ms, c.dv_intrack_ms, c.dv_crosstrack_ms), c.lead_time_h) for c in body.candidates]
    sc = maneuver.Spacecraft(body.spacecraft_mass_kg, body.isp_s, body.propellant_available_kg)
    try:
        return maneuver.trade_study(cdm, cands, sc, body.pc_threshold or settings.pc_action_threshold,
                                    settings.default_hbr_m, body.hbr_m, body.suggest_lead_time_h)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/events/{event_id}/status")
def set_status(event_id: int, body: StatusChangeIn, session: SessionDep, settings: SettingsDep):
    event = load_event(session, event_id)
    old, event.status = event.status, body.status
    audit(session, body.actor, "event.status", "event", event.id, **{"from": old, "to": body.status, "reason": body.reason})
    session.commit()
    return event_summary(event, settings, settings.reference_now())


@router.get("/rules")
def list_rules(session: SessionDep):
    return [rule_dict(r) for r in session.scalars(select(AlertRule).order_by(AlertRule.id))]


@router.post("/rules", status_code=201)
def create_rule(body: AlertRuleIn, session: SessionDep):
    rule = AlertRule(**body.model_dump(exclude={"actor", "channels"}), channels=[c.model_dump() for c in body.channels])
    session.add(rule)
    session.flush()
    audit(session, body.actor, "rule.created", "alert_rule", rule.id, rule=rule_dict(rule))
    session.commit()
    return rule_dict(rule)


@router.put("/rules/{rule_id}")
def update_rule(rule_id: int, body: AlertRuleIn, session: SessionDep):
    rule = session.get(AlertRule, rule_id)
    if rule is None:
        raise HTTPException(404, "rule not found")
    before = rule_dict(rule)
    for key, value in body.model_dump(exclude={"actor", "channels"}).items():
        setattr(rule, key, value)
    rule.channels = [c.model_dump() for c in body.channels]
    rule.updated_at = utcnow()
    audit(session, body.actor, "rule.updated", "alert_rule", rule.id, before=before, after=rule_dict(rule))
    session.commit()
    return rule_dict(rule)


@router.get("/alerts")
def list_alerts(session: SessionDep):
    occs = session.scalars(select(AlertOccurrence).order_by(AlertOccurrence.id.desc())).all()
    return [occurrence_dict(o) for o in occs]


@router.post("/alerts/dispatch")
def dispatch_now(request: Request, settings: SettingsDep):
    """Deliver due notifications immediately (the background worker also does this)."""
    return process_due(request.app.state.session_factory, settings)


@router.get("/audit")
def audit_log(session: SessionDep, limit: int = 200):
    rows = session.scalars(select(AuditEntry).order_by(AuditEntry.id.desc()).limit(min(limit, 1000))).all()
    return [audit_dict(a) for a in rows]
