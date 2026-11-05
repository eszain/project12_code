"""FastAPI application factory. Run: ``uvicorn cads.api.app:app``."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .. import __version__
from ..alerts.dispatcher import DispatcherThread
from ..config import Settings, get_settings
from ..db import init_db, make_engine, make_session_factory, reset_db
from .routes import router

STATIC = Path(__file__).resolve().parent.parent / "static"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = make_engine(settings.database_url)
    (init_db if settings.persist else reset_db)(engine)
    factory = make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        worker = None
        if settings.dispatcher_enabled:
            worker = DispatcherThread(factory, settings)
            worker.start()
        yield
        if worker:
            worker.stop()

    app = FastAPI(title="CADS - Conjunction Assessment Decision Support (MVP)", version=__version__, lifespan=lifespan)
    app.state.settings, app.state.session_factory, app.state.engine = settings, factory, engine
    app.include_router(router)
    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(STATIC / "index.html")

    return app


def __getattr__(name: str):  # lazy so importing the module for tests creates no database
    if name == "app":
        return create_app()
    raise AttributeError(name)
