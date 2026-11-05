"""Adapter interface and retrieval criteria (FR02, US05 "configure retrieval criteria")."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from ..cdm.parser import NormalizedCDM


@dataclass
class RetrievalCriteria:
    """Which CDMs a source should deliver. Empty criteria accept everything."""

    object_ids: list[str] = field(default_factory=list)
    tca_from: datetime | None = None
    tca_to: datetime | None = None
    min_pc: float | None = None

    def rejects(self, cdm: NormalizedCDM) -> str | None:
        """Return why ``cdm`` falls outside the criteria, or None if it is accepted."""
        if self.object_ids and not {cdm.sat1.designator, cdm.sat2.designator} & set(self.object_ids):
            return f"outside retrieval criteria: objects {cdm.sat1.designator}/{cdm.sat2.designator} not in {self.object_ids}"
        if self.tca_from and cdm.tca < self.tca_from:
            return f"outside retrieval criteria: TCA before {self.tca_from:%Y-%m-%dT%H:%M:%SZ}"
        if self.tca_to and cdm.tca > self.tca_to:
            return f"outside retrieval criteria: TCA after {self.tca_to:%Y-%m-%dT%H:%M:%SZ}"
        if self.min_pc is not None and (cdm.pc is None or cdm.pc < self.min_pc):
            return f"outside retrieval criteria: source Pc {cdm.pc_raw} below {self.min_pc:.1E}"
        return None


class CDMSource(Protocol):
    """A source returns raw documents; parsing/validation stays in :mod:`cads.cdm` (NFR08)."""

    name: str

    def fetch(self, criteria: RetrievalCriteria) -> list[tuple[str, bytes]]:
        ...
