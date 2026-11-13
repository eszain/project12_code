"""Demo guardrail: sample data cannot trigger external delivery."""

from dataclasses import replace
from pathlib import Path

import pytest

from cads.alerts.channels import ChannelError, send
from cads.config import Settings


def test_demo_blocks_external_channels(tmp_path: Path):
    settings = replace(
        Settings(),
        notification_dir=tmp_path,
        demo_safe_delivery=True
    )

    for channel, target in (
        ("email", "real@example.com"),
        ("webhook", "https://example.com/hook")
    ):
        with pytest.raises(
            ChannelError,
            match="blocked in demo-safe mode"
        ):
            send(channel, target, {}, settings)


def test_demo_file_channel(tmp_path: Path):
    settings = replace(
        Settings(),
        notification_dir=tmp_path,
        demo_safe_delivery=True
    )

    send(
        "file",
        "alerts.jsonl",
        {"occurrence_id": 42},
        settings
    )

    assert '"occurrence_id": 42' in (
        tmp_path / "alerts.jsonl"
    ).read_text()