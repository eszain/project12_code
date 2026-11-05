"""Database engine/session setup (SQLite by default, PostgreSQL via CADS_DATABASE_URL)."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from .models import AuditEntry, Base
from .timeutil import utcnow


def make_engine(url: str) -> Engine:
    kwargs: dict = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 15}
        path = url.removeprefix("sqlite:///")
        if path and path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        # pysqlite issues its own BEGIN statements, which breaks SAVEPOINT (used so one bad
        # record cannot roll back its siblings). Let SQLAlchemy emit BEGIN instead, as the
        # SQLAlchemy SQLite dialect documentation recommends.
        @event.listens_for(engine, "connect")
        def _sqlite_connect(dbapi_connection, _record):  # pragma: no cover - driver hook
            dbapi_connection.isolation_level = None
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        @event.listens_for(engine, "begin")
        def _sqlite_begin(connection):  # pragma: no cover - driver hook
            connection.exec_driver_sql("BEGIN")

    return engine


def init_db(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def reset_db(engine: Engine) -> None:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


def audit(session: Session, actor: str, action: str, entity_type: str, entity_id: int | None, **details) -> AuditEntry:
    """Append an audit entry (FR15, NFR10). Caller commits."""
    entry = AuditEntry(at=utcnow(), actor=actor, action=action, entity_type=entity_type, entity_id=entity_id, details=details)
    session.add(entry)
    return entry
