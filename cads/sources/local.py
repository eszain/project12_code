"""Local directory adapter: the approved offline test adapter (Progress Report 1, risk table).

Reads ``*.json``, ``*.kvn`` and ``*.txt`` CDM files from a folder. Retrieval criteria are
applied after parsing by the ingestion pipeline, because a plain folder cannot filter.
"""

from __future__ import annotations

from pathlib import Path

from .base import RetrievalCriteria

PATTERNS = ("*.json", "*.kvn", "*.txt")


class LocalDirectorySource:
    name = "local-directory"

    def __init__(self, directory: Path | str):
        self.directory = Path(directory)

    def fetch(self, criteria: RetrievalCriteria | None = None) -> list[tuple[str, bytes]]:
        if not self.directory.is_dir():
            raise FileNotFoundError(f"CDM directory not found: {self.directory}")
        files = sorted({p for pattern in PATTERNS for p in self.directory.glob(pattern) if p.is_file()})
        return [(path.name, path.read_bytes()) for path in files]
