"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated, Iterator

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..config import Settings
from ..models import CDMRevision, ConjunctionEvent


def get_session(request: Request) -> Iterator[Session]:
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def load_event(session: Session, event_id: int) -> ConjunctionEvent:
    event = session.get(ConjunctionEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"event {event_id} not found")
    return event


def pick_revision(event: ConjunctionEvent, revision_id: int | None) -> CDMRevision:
    """The requested revision of this event, or its latest one by creation date."""
    revisions = sorted(event.revisions, key=lambda r: (r.creation_date, r.id))
    if revision_id is None:
        return revisions[-1]
    for revision in revisions:
        if revision.id == revision_id:
            return revision
    raise HTTPException(status_code=404, detail=f"revision {revision_id} does not belong to event {event.id}")
