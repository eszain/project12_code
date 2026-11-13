"""Notification channels. Each ``send_*`` raises :class:`ChannelError` on failure.

* ``file``    appends one JSON line per alert to a file in CADS_NOTIFICATION_DIR (the
              "file-based" alert named in the CSA project brief; also the test path).
* ``log``     writes to the server log (console demos).
* ``webhook`` HTTP POST of the JSON message (ground-system integration, Casey's scenario).
* ``email``   SMTP, enabled only when CADS_SMTP_HOST is configured.

SMS/text is deferred until CSA confirms which channels are approved (Open Decision 5).
"""

from __future__ import annotations

import json
import logging
import re
import smtplib
from email.message import EmailMessage
from urllib.parse import urlparse

import httpx

from ..config import Settings

log = logging.getLogger("cads.alerts")

CHANNEL_TYPES = ("file", "log", "webhook", "email")
_SAFE_FILE = re.compile(r"^[A-Za-z0-9_.-]{1,80}\.(jsonl|log|txt)$")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ChannelError(Exception):
    pass


def validate_channel(channel_type: str, target: str) -> str | None:
    """Return an error message if the channel configuration is invalid."""
    if channel_type not in CHANNEL_TYPES:
        return f"unknown channel type {channel_type!r}"
    if channel_type == "file" and target and not _SAFE_FILE.match(target):
        return "file target must be a plain file name ending in .jsonl, .log or .txt (written inside CADS_NOTIFICATION_DIR)"
    if channel_type == "webhook":
        parsed = urlparse(target)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return "webhook target must be an http(s) URL"
    if channel_type == "email":
        addresses = [a.strip() for a in target.split(",") if a.strip()]
        if not addresses or not all(_EMAIL.match(a) for a in addresses):
            return "email target must be one or more comma-separated addresses"
    return None


def render_text(message: dict) -> str:
    rev, event = message["revision"], message["event"]
    lines = [
        f"CADS {message['severity']} alert - rule '{message['rule']['name']}'",
        f"Event: {event['key']}  ({event['primary']} vs {event['secondary']})",
        f"TCA: {rev['tca']}   lead time at issue: {rev['lead_time_h']} h",
        f"Source Pc: {rev['pc_source']} ({rev['pc_method'] or 'method not stated'})   miss distance: {rev['miss_distance_m']:.1f} m",
        f"CDM: {rev['cdm_id'] or rev['message_id']}   file: {rev['source_file']}   data: {rev['source_label']}",
        "Matched: " + "; ".join(message["matched_conditions"]),
        f"Open: {event['url']}",
        "",
        message["caveat"],
    ]
    return "\n".join(lines)


def send(channel_type: str, target: str, message: dict, settings: Settings) -> None:
    if channel_type == "file":
        _send_file(target, message, settings)
    elif channel_type == "log":
        log.warning("%s", render_text(message))
    elif channel_type == "webhook":
        _send_webhook(target, message)
    elif channel_type == "email":
        _send_email(target, message, settings)
    else:
        raise ChannelError(f"unknown channel type {channel_type!r}")


def _send_file(target: str, message: dict, settings: Settings) -> None:
    name = target or "alerts.jsonl"
    if not _SAFE_FILE.match(name):
        raise ChannelError(f"refusing unsafe file target {name!r}")
    try:
        settings.notification_dir.mkdir(parents=True, exist_ok=True)
        with (settings.notification_dir / name).open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(message, ensure_ascii=False) + "\n")
    except OSError as exc:
        raise ChannelError(f"could not write {name}: {exc}") from exc


def _send_webhook(target: str, message: dict) -> None:
    try:
        response = httpx.post(target, json=message, timeout=5.0)
    except httpx.HTTPError as exc:
        raise ChannelError(f"webhook request failed: {exc}") from exc
    if response.status_code >= 400:
        raise ChannelError(f"webhook returned HTTP {response.status_code}")


def _send_email(target: str, message: dict, settings: Settings) -> None:
    if not settings.smtp_host:
        raise ChannelError("SMTP is not configured (set CADS_SMTP_HOST)")
    rev, event = message["revision"], message["event"]
    email = EmailMessage()
    email["Subject"] = f"[CADS {message['severity']}] {event['primary']} vs {event['secondary']} - Pc {rev['pc_source']} at {rev['tca']}"
    email["From"] = settings.smtp_from
    email["To"] = target
    email.set_content(render_text(message))
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(email)
    except (OSError, smtplib.SMTPException) as exc:
        raise ChannelError(f"SMTP delivery failed: {exc}") from exc
