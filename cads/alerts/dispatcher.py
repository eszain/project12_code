"""Outbox dispatcher: delivers pending notifications with retries (FR09, NFR05).

Every attempt is recorded in ``delivery_attempts``. A failed delivery is retried with
exponential back-off (``retry_base_s * 2**(attempt-1)``) until ``max_delivery_attempts``,
then marked ``dead`` so it is visible and never silently dropped. A ``sent`` delivery is
never re-sent. Delivery is at-least-once (a crash between send and commit can repeat a
send); messages carry ``occurrence_id`` so receivers can de-duplicate.

In a multi-worker deployment this loop needs row locking (e.g. PostgreSQL
``SELECT ... FOR UPDATE SKIP LOCKED``); the MVP runs a single in-process worker.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, sessionmaker

from ..config import Settings
from ..models import DeliveryAttempt, NotificationDelivery
from ..timeutil import utcnow
from .channels import send

log = logging.getLogger("cads.dispatcher")
_lock = threading.Lock()


def process_due(session_factory: sessionmaker[Session], settings: Settings, now: datetime | None = None, limit: int = 100) -> dict:
    stats = {"attempted": 0, "sent": 0, "failed": 0, "dead": 0}
    with _lock, session_factory() as session:
        now = now or utcnow()
        due = session.scalars(
            select(NotificationDelivery)
            .where(NotificationDelivery.status.in_(("pending", "failed")))
            .where(or_(NotificationDelivery.next_attempt_at.is_(None), NotificationDelivery.next_attempt_at <= now))
            .order_by(NotificationDelivery.id)
            .limit(limit)
        ).all()
        for delivery in due:
            attempt_no = delivery.attempts + 1
            error = None
            try:
                send(delivery.channel_type, delivery.target, delivery.occurrence.message, settings)
            except Exception as exc:  # any channel failure is recorded, never raised
                error = f"{type(exc).__name__}: {exc}"
            session.add(DeliveryAttempt(delivery_id=delivery.id, attempt_no=attempt_no, attempted_at=now, success=error is None, error=error))
            delivery.attempts = attempt_no
            stats["attempted"] += 1
            if error is None:
                delivery.status, delivery.sent_at, delivery.last_error, delivery.next_attempt_at = "sent", now, None, None
                stats["sent"] += 1
            elif attempt_no >= settings.max_delivery_attempts:
                delivery.status, delivery.last_error, delivery.next_attempt_at = "dead", error, None
                stats["dead"] += 1
                log.error("delivery %s dead after %s attempts: %s", delivery.id, attempt_no, error)
            else:
                delivery.status, delivery.last_error = "failed", error
                delivery.next_attempt_at = now + timedelta(seconds=settings.retry_base_s * 2 ** (attempt_no - 1))
                stats["failed"] += 1
            session.commit()
    return stats


class DispatcherThread(threading.Thread):
    """Background worker that drains the outbox every ``dispatcher_interval_s`` seconds."""

    def __init__(self, session_factory: sessionmaker[Session], settings: Settings):
        super().__init__(name="cads-dispatcher", daemon=True)
        self._session_factory = session_factory
        self._settings = settings
        self._stop_event = threading.Event()

    def run(self) -> None:
        while not self._stop_event.is_set():
            try:
                process_due(self._session_factory, self._settings)
            except Exception:  # keep the worker alive; failures are logged
                log.exception("dispatcher cycle failed")
            self._stop_event.wait(self._settings.dispatcher_interval_s)

    def stop(self) -> None:
        self._stop_event.set()
        self.join(timeout=5)
