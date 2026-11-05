"""Event repository: the domain model of Progress Report 1, Figure 6.3.3.

One :class:`ConjunctionEvent` (a physical close approach) has many :class:`CDMRevision`
rows (successive messages about it). Alert rules, their occurrences, notification
deliveries (outbox) and every delivery attempt are stored so an alert can be traced back
to the exact source message (NFR10). Organisation/role tables arrive with R2 (FR14);
``organization`` is already captured from the Space-Track ``CONSTELLATION`` field.

All datetimes are naive UTC (see :mod:`cads.timeutil`).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from .timeutil import utcnow

EVENT_STATUSES = ("new", "acknowledged", "investigating", "closed")


class Base(DeclarativeBase):
    pass


class ConjunctionEvent(Base):
    __tablename__ = "conjunction_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_key: Mapped[str] = mapped_column(String(160), unique=True)
    pair_key: Mapped[str] = mapped_column(String(100), index=True)
    primary_designator: Mapped[str] = mapped_column(String(40))
    primary_name: Mapped[str | None] = mapped_column(String(160))
    secondary_designator: Mapped[str] = mapped_column(String(40))
    secondary_name: Mapped[str | None] = mapped_column(String(160))
    organization: Mapped[str | None] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(20), default="new")
    correlation_note: Mapped[str | None] = mapped_column(Text)
    # Summary of the latest revision (by CDM creation date), denormalised for sorting/filtering.
    tca: Mapped[datetime] = mapped_column(DateTime)
    latest_creation_date: Mapped[datetime] = mapped_column(DateTime)
    latest_pc: Mapped[float | None] = mapped_column(Float)
    latest_pc_raw: Mapped[str | None] = mapped_column(String(40))
    max_pc: Mapped[float | None] = mapped_column(Float)
    latest_miss_distance_m: Mapped[float] = mapped_column(Float)
    revision_count: Mapped[int] = mapped_column(Integer, default=0)
    data_labels: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    revisions: Mapped[list[CDMRevision]] = relationship(
        back_populates="event", order_by="CDMRevision.creation_date", cascade="all, delete-orphan"
    )


class CDMRevision(Base):
    __tablename__ = "cdm_revisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("conjunction_events.id"), index=True)
    message_key: Mapped[str] = mapped_column(String(200), unique=True)
    cdm_id: Mapped[str | None] = mapped_column(String(80))
    message_id: Mapped[str | None] = mapped_column(String(200))
    originator: Mapped[str | None] = mapped_column(String(80))
    message_for: Mapped[str | None] = mapped_column(String(160))
    constellation: Mapped[str | None] = mapped_column(String(160))
    creation_date: Mapped[datetime] = mapped_column(DateTime, index=True)
    tca: Mapped[datetime] = mapped_column(DateTime, index=True)
    miss_distance_m: Mapped[float] = mapped_column(Float)
    relative_speed_ms: Mapped[float | None] = mapped_column(Float)
    rel_pos_r_m: Mapped[float | None] = mapped_column(Float)
    rel_pos_t_m: Mapped[float | None] = mapped_column(Float)
    rel_pos_n_m: Mapped[float | None] = mapped_column(Float)
    rel_vel_r_ms: Mapped[float | None] = mapped_column(Float)
    rel_vel_t_ms: Mapped[float | None] = mapped_column(Float)
    rel_vel_n_ms: Mapped[float | None] = mapped_column(Float)
    pc: Mapped[float | None] = mapped_column(Float)
    pc_raw: Mapped[str | None] = mapped_column(String(40))
    pc_method: Mapped[str | None] = mapped_column(String(80))
    sat1_designator: Mapped[str] = mapped_column(String(40))
    sat1_name: Mapped[str | None] = mapped_column(String(160))
    sat1_object_type: Mapped[str | None] = mapped_column(String(40))
    sat1_maneuverable: Mapped[str | None] = mapped_column(String(20))
    sat2_designator: Mapped[str] = mapped_column(String(40))
    sat2_name: Mapped[str | None] = mapped_column(String(160))
    sat2_object_type: Mapped[str | None] = mapped_column(String(40))
    sat2_maneuverable: Mapped[str | None] = mapped_column(String(20))
    source_format: Mapped[str] = mapped_column(String(40))
    source_file: Mapped[str | None] = mapped_column(String(260))
    source_sha256: Mapped[str | None] = mapped_column(String(64))
    source_label: Mapped[str] = mapped_column(String(60), default="upload")
    correlation_note: Mapped[str | None] = mapped_column(Text)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    raw: Mapped[dict] = mapped_column(JSON)
    ingested_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    event: Mapped[ConjunctionEvent] = relationship(back_populates="revisions")


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    source_label: Mapped[str] = mapped_column(String(60))
    actor: Mapped[str] = mapped_column(String(120), default="system")
    imported: Mapped[int] = mapped_column(Integer, default=0)
    duplicates: Mapped[int] = mapped_column(Integer, default=0)
    rejected: Mapped[int] = mapped_column(Integer, default=0)
    filtered: Mapped[int] = mapped_column(Integer, default=0)

    records: Mapped[list[ImportRecord]] = relationship(back_populates="batch", cascade="all, delete-orphan")


class ImportRecord(Base):
    __tablename__ = "import_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(260))
    file_sha256: Mapped[str] = mapped_column(String(64))
    record_index: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20))  # imported | duplicate | rejected
    message_key: Mapped[str | None] = mapped_column(String(200))
    event_id: Mapped[int | None] = mapped_column(Integer)
    revision_id: Mapped[int | None] = mapped_column(Integer)
    errors: Mapped[list] = mapped_column(JSON, default=list)
    warnings: Mapped[list] = mapped_column(JSON, default=list)

    batch: Mapped[ImportBatch] = relationship(back_populates="records")


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    pc_min: Mapped[float | None] = mapped_column(Float)
    miss_distance_max_m: Mapped[float | None] = mapped_column(Float)
    hours_to_tca_max: Mapped[float | None] = mapped_column(Float)
    object_ids: Mapped[list] = mapped_column(JSON, default=list)
    channels: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AlertOccurrence(Base):
    __tablename__ = "alert_occurrences"
    __table_args__ = (UniqueConstraint("rule_id", "revision_id", name="uq_occurrence_rule_revision"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("alert_rules.id"), index=True)
    revision_id: Mapped[int] = mapped_column(ForeignKey("cdm_revisions.id"), index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("conjunction_events.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    matched: Mapped[list] = mapped_column(JSON, default=list)
    message: Mapped[dict] = mapped_column(JSON)

    rule: Mapped[AlertRule] = relationship()
    deliveries: Mapped[list[NotificationDelivery]] = relationship(back_populates="occurrence", cascade="all, delete-orphan")


class NotificationDelivery(Base):
    """Outbox row: one per (occurrence, channel). Retries update this row, never add one."""

    __tablename__ = "notification_deliveries"
    __table_args__ = (UniqueConstraint("occurrence_id", "channel_type", "target", name="uq_delivery_channel"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    occurrence_id: Mapped[int] = mapped_column(ForeignKey("alert_occurrences.id"), index=True)
    channel_type: Mapped[str] = mapped_column(String(20))
    target: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | sent | failed | dead
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime, default=utcnow)
    last_error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    occurrence: Mapped[AlertOccurrence] = relationship(back_populates="deliveries")
    attempt_log: Mapped[list[DeliveryAttempt]] = relationship(
        back_populates="delivery", order_by="DeliveryAttempt.attempt_no", cascade="all, delete-orphan"
    )


class DeliveryAttempt(Base):
    __tablename__ = "delivery_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    delivery_id: Mapped[int] = mapped_column(ForeignKey("notification_deliveries.id"), index=True)
    attempt_no: Mapped[int] = mapped_column(Integer)
    attempted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    success: Mapped[bool] = mapped_column(Boolean)
    error: Mapped[str | None] = mapped_column(Text)

    delivery: Mapped[NotificationDelivery] = relationship(back_populates="attempt_log")


class AuditEntry(Base):
    __tablename__ = "audit_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    actor: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
