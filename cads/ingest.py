"""Ingestion pipeline: parse -> validate -> de-duplicate -> correlate -> store -> alert.

Every record of every file gets an :class:`ImportRecord` (imported / duplicate /
rejected, with errors and warnings), so processing failures are inspectable (US14,
FR17) and successfully ingested messages are never lost because a sibling failed
(NFR05).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from .alerts.rules import evaluate_revision
from .cdm.parser import NormalizedCDM, parse_document
from .config import Settings
from .correlation import EventCandidate, correlate, pair_key
from .db import audit
from .models import CDMRevision, ConjunctionEvent, ImportBatch, ImportRecord
from .sources.base import RetrievalCriteria
from .timeutil import iso_z, utcnow


@dataclass
class RecordOutcome:
    file_name: str
    record_index: int
    status: str
    message_key: str | None = None
    event_id: int | None = None
    event_key: str | None = None
    revision_id: int | None = None
    new_event: bool = False
    alerts_created: int = 0
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class ImportReport:
    batch_id: int
    source_label: str
    records: list[RecordOutcome]

    @property
    def counts(self) -> dict[str, int]:
        out = {"imported": 0, "duplicate": 0, "rejected": 0, "filtered": 0}
        for record in self.records:
            out[record.status] += 1
        return out

    def as_dict(self) -> dict:
        return {
            "batch_id": self.batch_id,
            "source_label": self.source_label,
            "counts": self.counts,
            "records": [record.__dict__ for record in self.records],
        }


def _event_key(cdm: NormalizedCDM) -> str:
    return f"{cdm.sat1.designator}-{cdm.sat2.designator}-{cdm.tca:%Y%m%dT%H%M%S}"


def refresh_event_summary(event: ConjunctionEvent) -> CDMRevision:
    """Recompute the denormalised 'current state' from the latest revision by creation date."""
    revisions = sorted(event.revisions, key=lambda r: (r.creation_date, r.id or 0))
    latest = revisions[-1]
    event.tca = latest.tca
    event.latest_creation_date = latest.creation_date
    event.latest_pc = latest.pc
    event.latest_pc_raw = latest.pc_raw
    event.latest_miss_distance_m = latest.miss_distance_m
    pcs = [r.pc for r in revisions if r.pc is not None]
    event.max_pc = max(pcs) if pcs else None
    event.revision_count = len(revisions)
    event.data_labels = sorted({r.source_label for r in revisions})
    event.primary_name = latest.sat1_name or event.primary_name
    event.secondary_name = latest.sat2_name or event.secondary_name
    event.updated_at = utcnow()
    return latest


def _revision_from(cdm: NormalizedCDM, file_name: str, sha256: str, source_label: str, note: str) -> CDMRevision:
    rel_pos = cdm.rel_pos_rtn_m or (None, None, None)
    rel_vel = cdm.rel_vel_rtn_ms or (None, None, None)
    return CDMRevision(
        message_key=cdm.message_key,
        cdm_id=cdm.cdm_id,
        message_id=cdm.message_id,
        originator=cdm.originator,
        message_for=cdm.message_for,
        constellation=cdm.constellation,
        creation_date=cdm.creation_date,
        tca=cdm.tca,
        miss_distance_m=cdm.miss_distance_m,
        relative_speed_ms=cdm.relative_speed_ms,
        rel_pos_r_m=rel_pos[0],
        rel_pos_t_m=rel_pos[1],
        rel_pos_n_m=rel_pos[2],
        rel_vel_r_ms=rel_vel[0],
        rel_vel_t_ms=rel_vel[1],
        rel_vel_n_ms=rel_vel[2],
        pc=cdm.pc,
        pc_raw=cdm.pc_raw,
        pc_method=cdm.pc_method,
        sat1_designator=cdm.sat1.designator,
        sat1_name=cdm.sat1.name,
        sat1_object_type=cdm.sat1.object_type,
        sat1_maneuverable=cdm.sat1.maneuverable,
        sat2_designator=cdm.sat2.designator,
        sat2_name=cdm.sat2.name,
        sat2_object_type=cdm.sat2.object_type,
        sat2_maneuverable=cdm.sat2.maneuverable,
        source_format=cdm.source_format,
        source_file=file_name,
        source_sha256=sha256,
        source_label=source_label,
        correlation_note=note,
        warnings=list(cdm.warnings),
        raw=cdm.raw,
        ingested_at=utcnow(),
    )


def ingest_cdm(
    session: Session,
    cdm: NormalizedCDM,
    settings: Settings,
    *,
    file_name: str,
    sha256: str,
    source_label: str,
    actor: str,
) -> RecordOutcome:
    outcome = RecordOutcome(file_name=file_name, record_index=0, status="imported", message_key=cdm.message_key)
    outcome.warnings = list(cdm.warnings)
    existing = session.scalar(select(CDMRevision).where(CDMRevision.message_key == cdm.message_key))
    if existing is not None:
        outcome.status = "duplicate"
        outcome.event_id = existing.event_id
        outcome.revision_id = existing.id
        outcome.warnings.append(f"already imported ({cdm.message_key}); not stored again")
        return outcome

    pk = pair_key(cdm.sat1.designator, cdm.sat2.designator)
    events = session.scalars(select(ConjunctionEvent).where(ConjunctionEvent.pair_key == pk)).all()
    decision = correlate(
        cdm.tca,
        [EventCandidate(e.id, tuple(r.tca for r in e.revisions)) for e in events],
        settings.correlation_window_s,
    )
    if decision.is_new_event:
        event = ConjunctionEvent(
            event_key=_event_key(cdm),
            pair_key=pk,
            primary_designator=cdm.sat1.designator,
            primary_name=cdm.sat1.name,
            secondary_designator=cdm.sat2.designator,
            secondary_name=cdm.sat2.name,
            organization=cdm.constellation,
            status="new",
            tca=cdm.tca,
            latest_creation_date=cdm.creation_date,
            latest_miss_distance_m=cdm.miss_distance_m,
            created_at=utcnow(),
        )
        session.add(event)
        session.flush()
        outcome.new_event = True
        audit(session, actor, "event.created", "event", event.id, event_key=event.event_key, reason=decision.note)
    else:
        event = next(e for e in events if e.id == decision.event_id)
        if decision.ambiguous:
            event.correlation_note = decision.note
            outcome.warnings.append(decision.note)

    revision = _revision_from(cdm, file_name, sha256, source_label, decision.note)
    event.revisions.append(revision)
    session.flush()
    latest = refresh_event_summary(event)
    outcome.event_id, outcome.event_key, outcome.revision_id = event.id, event.event_key, revision.id
    audit(
        session,
        actor,
        "cdm.imported",
        "revision",
        revision.id,
        event_id=event.id,
        message_key=cdm.message_key,
        source_file=file_name,
        source_sha256=sha256,
        tca=iso_z(cdm.tca),
        pc_source=cdm.pc_raw,
        correlation=decision.note,
    )
    if latest.id == revision.id:
        outcome.alerts_created = len(evaluate_revision(session, revision, event, settings))
    else:
        outcome.warnings.append(
            "superseded on arrival: a newer CDM for this event is already stored, so alert rules were not evaluated"
        )
    return outcome


def import_documents(
    session: Session,
    documents: list[tuple[str, bytes]],
    settings: Settings,
    *,
    source_label: str = "upload",
    actor: str = "system",
    criteria: RetrievalCriteria | None = None,
) -> ImportReport:
    batch = ImportBatch(source_label=source_label, actor=actor, created_at=utcnow())
    session.add(batch)
    session.flush()
    outcomes: list[RecordOutcome] = []
    for file_name, content in documents:
        sha256 = hashlib.sha256(content).hexdigest()
        for result in parse_document(content, file_name):
            rejection = criteria.rejects(result.cdm) if (criteria and result.ok) else None
            if not result.ok:
                outcome = RecordOutcome(file_name, result.record_index, "rejected", errors=result.errors, warnings=result.warnings)
            elif rejection:
                outcome = RecordOutcome(
                    file_name, result.record_index, "filtered", message_key=result.cdm.message_key, warnings=[rejection]
                )
            else:
                try:
                    with session.begin_nested():  # SAVEPOINT: a failing record cannot undo its siblings
                        outcome = ingest_cdm(
                            session, result.cdm, settings, file_name=file_name, sha256=sha256, source_label=source_label, actor=actor
                        )
                except Exception as exc:  # recorded, not raised (NFR05)
                    outcome = RecordOutcome(
                        file_name,
                        result.record_index,
                        "rejected",
                        message_key=result.cdm.message_key,
                        errors=[f"processing failed: {type(exc).__name__}: {exc}"],
                        warnings=result.warnings,
                    )
                outcome.record_index = result.record_index
            outcomes.append(outcome)
            session.add(
                ImportRecord(
                    batch_id=batch.id,
                    file_name=file_name,
                    file_sha256=sha256,
                    record_index=outcome.record_index,
                    status=outcome.status,
                    message_key=outcome.message_key,
                    event_id=outcome.event_id,
                    revision_id=outcome.revision_id,
                    errors=outcome.errors,
                    warnings=outcome.warnings,
                )
            )
    report = ImportReport(batch.id, source_label, outcomes)
    counts = report.counts
    batch.imported, batch.duplicates, batch.rejected = counts["imported"], counts["duplicate"], counts["rejected"]
    batch.filtered = counts["filtered"]
    audit(session, actor, "import.batch", "import_batch", batch.id, source_label=source_label, **counts)
    session.commit()
    return report
