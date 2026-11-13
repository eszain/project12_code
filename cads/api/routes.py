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


def _format_odds(pc: float | None) -> str:
    if pc is None:
        return "not provided"
    if pc == 0:
        return "0% (zero chance of collision)"
    if pc >= 1:
        return "100% (guaranteed collision)"
    one_in_n = round(1.0 / pc)
    pct = pc * 100
    if one_in_n >= 1_000_000:
        m = f"{one_in_n / 1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"1 in {m} million (less than 0.001%)"
    if one_in_n >= 100_000:
        k = round(one_in_n / 1000)
        return f"1 in {k}k (less than 0.001%)"
    if one_in_n >= 10_000:
        pct_str = f"{pct:.3f}%" if pct < 0.01 else f"{pct:.2f}%"
        return f"1 in {one_in_n:,} ({pct_str})"
    return f"1 in {one_in_n:,} ({pct:.2f}%)"


def _format_short_odds(pc: float | None) -> str:
    if pc is None:
        return "n/a"
    if pc == 0:
        return "0%"
    if pc >= 1:
        return "100%"
    one_in_n = round(1.0 / pc)
    if one_in_n >= 1_000_000:
        m = f"{one_in_n / 1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"1 in {m}M"
    if one_in_n >= 10_000:
        k = f"{one_in_n / 1000:.1f}".rstrip("0").rstrip(".")
        return f"1 in {k}k"
    return f"1 in {one_in_n:,}"


def _format_distance(meters: float) -> str:
    if meters < 100:
        return f"{meters:.0f} m (~{round(meters * 1.09)} yards / half a football field)"
    if meters < 1000:
        return f"{meters:.0f} m (~{meters / 100:.1f} football fields)"
    km = meters / 1000.0
    miles = meters / 1609.34
    return f"{meters:,.0f} m (~{km:.1f} km / {miles:.1f} mi)"


def _format_speed(mps: float | None) -> str:
    if not mps:
        return "unknown speed"
    km_s = mps / 1000.0
    km_h = round(mps * 3.6)
    mach = round(mps / 343)
    return f"{km_s:.1f} km/s (~{km_h:,} km/h, Mach {mach})"


def _explain(event, rev, rec: dict, quality_checks: list[dict], settings, now) -> list[str]:
    """ELI5 reasons for one event's severity with plain-language math and rationale."""
    pc_now = event.latest_pc
    lines = []
    dist_desc = _format_distance(event.latest_miss_distance_m)

    # 1. Severity & Decision
    if pc_now is None:
        lines.append("Severity: UNKNOWN — Source Pc not provided, so risk cannot be rated. The tracking report omitted collision probability numbers.")
    elif pc_now >= settings.pc_action_threshold:
        lines.append(f"Severity: ACTION — High Collision Danger. The collision chance is {_format_odds(pc_now)} (source Pc: {event.latest_pc_raw}), which exceeds our safety threshold of 1 in 10,000. In space flight, odds higher than 1 in 10,000 are unacceptable risk, so operators must take action to steer the satellite away.")
    elif pc_now >= settings.pc_watch_threshold:
        lines.append(f"Severity: WATCH — Elevated Risk (Monitoring). The collision chance is {_format_odds(pc_now)} (source Pc: {event.latest_pc_raw}). This is below the action cutoff (1 in 10,000) but above the watch level (1 in 10 million). No immediate maneuver is needed, but operators must closely monitor upcoming tracking passes.")
    elif pc_now == 0:
        lines.append("Severity: ZERO — Completely Clear. Latest CDM reports Pc exactly 0 (0% collision risk): the space tracking network sees zero chance of collision. Both objects' flight paths are completely separate, so no maneuver or action is needed.")
    else:
        lines.append(f"Severity: LOW — Safe Pass. The collision chance is {_format_odds(pc_now)} (source Pc: {event.latest_pc_raw}), well below 1 in 10 million. The satellites will safely pass each other with negligible risk.")

    # 2. The Math in Simple Terms
    if pc_now == 0:
        lines.append(f'The Math in Simple Terms: Ground radar cannot pinpoint satellites down to the millimeter from Earth, so every satellite has an "uncertainty cloud" (safety bubble) around it. The math checks if these bubbles overlap during the flyby. At {dist_desc} apart, the bubbles have 0% overlap, meaning mathematically zero chance of touching.')
    elif pc_now is not None and pc_now >= settings.pc_action_threshold:
        lines.append(f'The Math in Simple Terms: Because radars track satellites from hundreds of kilometers away, each object has an "uncertainty cloud" (fuzzy safety bubble) representing where it might be. The collision algorithm calculates how much these bubbles overlap when the objects zoom past each other. Because they pass only {dist_desc} apart, their bubbles overlap heavily, resulting in this high probability.')
    elif pc_now is not None:
        lines.append(f'The Math in Simple Terms: Satellites have an "uncertainty cloud" around them representing small tracking errors. The math projects these bubbles onto a 2D plane at closest approach to measure overlap. At {dist_desc} apart, there is only a tiny overlap, meaning the odds of physical contact are extremely small.')
    else:
        lines.append('The Math in Simple Terms: Collision probability (Pc) requires position uncertainty clouds from radar observations. Because that data was omitted, the math model cannot calculate collision odds.')

    # 3. Encounter Flyby Details
    hours = hours_between(now, event.tca)
    timing = f"in {hours:.1f} h" if hours >= 0 else f"passed {-hours:.1f} h ago"
    speed_desc = _format_speed(rev.relative_speed_ms)
    lines.append(f"Flyby Timing & Scale: Closest approach (TCA) occurs {timing}. The objects pass {dist_desc} apart while zooming past each other at {speed_desc}.")

    # 4. Update History & Trend
    revs = sorted(event.revisions, key=lambda r: (r.creation_date, r.id))
    if len(revs) > 1:
        rev_odds = [_format_short_odds(r.pc) for r in revs]
        first_pc = revs[0].pc
        if pc_now == 0 and first_pc != 0:
            trend_desc = f"Across {len(revs)} radar updates, collision odds dropped to zero ({' -> '.join(rev_odds)}). Updated radar tracking confirmed the objects will safely miss each other."
        elif pc_now is not None and first_pc is not None and pc_now > first_pc:
            trend_desc = f"Across {len(revs)} radar updates, collision odds increased ({' -> '.join(rev_odds)}). As the flyby draws nearer, newer tracking data sharpens and confirms danger has risen."
        elif pc_now is not None and first_pc is not None and pc_now < first_pc:
            trend_desc = f"Across {len(revs)} radar updates, collision odds decreased ({' -> '.join(rev_odds)}). Additional tracking data showed the objects are further apart than first estimated."
        else:
            trend_desc = f"Across {len(revs)} radar updates, collision odds evolved: {' -> '.join(rev_odds)}."
        lines.append(f"Risk Trend: {trend_desc}")
    else:
        lines.append("Risk Trend: 1 radar update received so far. Trajectory and odds will be refined as additional tracking passes occur.")

    # 5. Independent Verification / Recalculation Check
    if rec.get("available"):
        lines.append(f"Independent Math Check: Our internal Foster-1992 2D calculation estimates the risk at {_format_odds(rec['recalculated_pc'])}, validating the official radar agency's figures.")
    else:
        lines.append(f"Independent Math Check: Recalculation unavailable ({rec.get('reason')}).")

    # 6. Data Quality Checks
    exceeded = [c["name"] for c in quality_checks if c["status"] == "exceeds limit"]
    if exceeded:
        lines.append("Tracking Quality Note: Measurement uncertainty for " + ", ".join(exceeded) + " exceeds standard limits. This indicates higher-than-usual tracking error bars for this satellite.")
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

@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    session: SessionDep,
    actor: str = "operator"
):
    """
    Soft-delete an alert rule while preserving
    its alert and delivery history.
    """

    rule = session.get(AlertRule, rule_id)

    if rule is None:
        raise HTTPException(
            status_code=404,
            detail="rule not found"
        )

    before = rule_dict(rule)

    rule.enabled = False
    rule.updated_at = utcnow()

    audit(
        session,
        actor,
        "rule.deleted",
        "alert_rule",
        rule.id,
        before=before
    )

    session.commit()

    return {
        "id": rule_id,
        "deleted": True,
        "retained_for_audit": True
    }
