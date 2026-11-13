"""Runtime configuration.

Settings come from environment variables (optionally from a local ``.env`` file),
never from source code, so credentials stay out of the repository (NFR04). Every
setting has a local-development default, which lets a new developer run the MVP and
its tests without production credentials (AC06). See ``.env.example``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field, replace
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from .timeutil import parse_utc, utcnow

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path | None = None) -> None:
    """Load KEY=VALUE lines from ``.env`` without overriding real environment variables."""
    env_path = path or PROJECT_ROOT / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _get(name: str, default: str) -> str:
    value = os.environ.get(name, "")
    return value.strip() if value.strip() else default


def _resolve_sqlite_url(url: str) -> str:
    """Make relative SQLite paths relative to the project folder, not the shell's cwd."""
    prefix = "sqlite:///"
    if url.startswith(prefix) and url != "sqlite:///:memory:":
        raw_path = url[len(prefix):]
        path = Path(raw_path)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return prefix + path.as_posix()
    return url


def _resolve_dir(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else PROJECT_ROOT / path


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///" + (PROJECT_ROOT / "var" / "cads.db").as_posix()
    clock: str = "system"
    correlation_window_s: float = 60.0
    pc_action_threshold: float = 1e-4
    pc_watch_threshold: float = 1e-7
    default_hbr_m: float = 10.0
    quality_limits_m: tuple[float, float, float] = (200.0, 1000.0, 1000.0)
    notification_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "var" / "notifications")
    retry_base_s: float = 30.0
    max_delivery_attempts: int = 5
    dispatcher_interval_s: float = 5.0
    dispatcher_enabled: bool = True
    persist: bool = False  # False: the database is wiped each time the server starts
    public_base_url: str = "http://127.0.0.1:8000"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "cads-alerts@example.org"
    smtp_starttls: bool = True
    spacetrack_identity: str = ""
    spacetrack_password: str = ""

    def reference_now(self) -> datetime:
        """The clock used for time-to-TCA and event status (fixed in replay mode)."""
        if self.clock.lower() == "system":
            return utcnow()
        return parse_utc(self.clock)

    @property
    def replay_mode(self) -> bool:
        return self.clock.lower() != "system"

    def with_overrides(self, **changes) -> "Settings":
        return replace(self, **changes)

    def public_summary(self) -> dict:
        """Non-secret configuration, safe to expose through the API."""
        return {
            "clock": self.clock,
            "replay_mode": self.replay_mode,
            "correlation_window_s": self.correlation_window_s,
            "pc_action_threshold": self.pc_action_threshold,
            "pc_watch_threshold": self.pc_watch_threshold,
            "default_hbr_m": self.default_hbr_m,
            "quality_limits_m": {
                "radial": self.quality_limits_m[0],
                "in_track": self.quality_limits_m[1],
                "cross_track": self.quality_limits_m[2],
            },
            "max_delivery_attempts": self.max_delivery_attempts,
            "retry_base_s": self.retry_base_s,
            "email_configured": bool(self.smtp_host),
            "spacetrack_configured": bool(self.spacetrack_identity and self.spacetrack_password),
            "database": "postgresql" if self.database_url.startswith("postgresql") else "sqlite",
        }


def settings_from_env() -> Settings:
    load_dotenv()
    limits = tuple(float(x) for x in _get("CADS_QUALITY_LIMITS_M", "200,1000,1000").split(","))
    if len(limits) != 3:
        raise ValueError("CADS_QUALITY_LIMITS_M must have three comma-separated values (R,T,N)")
    defaults = Settings()
    return Settings(
        database_url=_resolve_sqlite_url(_get("CADS_DATABASE_URL", defaults.database_url)),
        clock=_get("CADS_CLOCK", "system"),
        correlation_window_s=float(_get("CADS_CORRELATION_WINDOW_S", "60")),
        pc_action_threshold=float(_get("CADS_PC_ACTION_THRESHOLD", "1e-4")),
        pc_watch_threshold=float(_get("CADS_PC_WATCH_THRESHOLD", "1e-7")),
        default_hbr_m=float(_get("CADS_DEFAULT_HBR_M", "10")),
        quality_limits_m=limits,  # type: ignore[arg-type]
        notification_dir=_resolve_dir(_get("CADS_NOTIFICATION_DIR", "var/notifications")),
        retry_base_s=float(_get("CADS_RETRY_BASE_S", "30")),
        max_delivery_attempts=int(_get("CADS_MAX_DELIVERY_ATTEMPTS", "5")),
        dispatcher_interval_s=float(_get("CADS_DISPATCHER_INTERVAL_S", "5")),
        dispatcher_enabled=_get("CADS_DISPATCHER_ENABLED", "true").lower() in {"1", "true", "yes"},
        persist=_get("CADS_PERSIST", "false").lower() in {"1", "true", "yes"},
        public_base_url=_get("CADS_PUBLIC_BASE_URL", defaults.public_base_url).rstrip("/"),
        smtp_host=_get("CADS_SMTP_HOST", ""),
        smtp_port=int(_get("CADS_SMTP_PORT", "587")),
        smtp_user=_get("CADS_SMTP_USER", ""),
        smtp_password=_get("CADS_SMTP_PASSWORD", ""),
        smtp_from=_get("CADS_SMTP_FROM", defaults.smtp_from),
        smtp_starttls=_get("CADS_SMTP_STARTTLS", "true").lower() in {"1", "true", "yes"},
        spacetrack_identity=_get("SPACETRACK_IDENTITY", ""),
        spacetrack_password=_get("SPACETRACK_PASSWORD", ""),
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return settings_from_env()
