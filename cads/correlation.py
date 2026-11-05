"""Event correlator: is an incoming CDM a revision of a known encounter or a new one?

Progress Report 1 (Appendix A) showed that the six CSA sample CDMs involve one object
pair (SCISAT 1 and a Fengyun-1C debris object) but describe *two* close approaches about
1.6 h (roughly one SCISAT orbit) apart. Grouping by object pair alone would merge them.

Rule implemented here (team proposal "Option A", to be confirmed with CSA):

    A CDM belongs to an existing event when the event has the same *unordered* object
    pair and at least one of its revisions has a TCA within +/- ``window_s`` seconds.

* Single linkage over all revisions keeps the result independent of import order (AC01),
  because TCA drift between revisions (~1 s in the samples) is tiny compared with the
  spacing between distinct encounters of one pair (~half an orbit or more).
* If more than one event qualifies, the closest TCA wins and the decision is flagged
  ``ambiguous`` so an analyst can review it; events are never merged silently.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable


def pair_key(designator_a: str, designator_b: str) -> str:
    """Order-independent key for an object pair."""
    a, b = sorted((designator_a.strip(), designator_b.strip()))
    return f"{a}|{b}"


@dataclass(frozen=True)
class EventCandidate:
    event_id: int
    tcas: tuple[datetime, ...]


@dataclass(frozen=True)
class CorrelationDecision:
    event_id: int | None
    delta_s: float | None
    ambiguous: bool
    note: str

    @property
    def is_new_event(self) -> bool:
        return self.event_id is None


def correlate(tca: datetime, candidates: Iterable[EventCandidate], window_s: float) -> CorrelationDecision:
    matches: list[tuple[float, int]] = []
    for candidate in candidates:
        if not candidate.tcas:
            continue
        delta = min(abs((tca - other).total_seconds()) for other in candidate.tcas)
        if delta <= window_s:
            matches.append((delta, candidate.event_id))
    if not matches:
        return CorrelationDecision(None, None, False, f"no event of this object pair within +/-{window_s:g} s of TCA: new encounter")
    matches.sort()
    delta, event_id = matches[0]
    if len(matches) > 1:
        others = ", ".join(str(e) for _, e in matches[1:])
        return CorrelationDecision(
            event_id,
            delta,
            True,
            f"AMBIGUOUS: TCA within +/-{window_s:g} s of several events; attached to event {event_id} "
            f"(closest, dt = {delta:.3f} s); also matched {others}. Analyst review required.",
        )
    return CorrelationDecision(event_id, delta, False, f"revision of event {event_id} (TCA differs by {delta:.3f} s)")


def group_messages(messages: Iterable[tuple[str, str, str, datetime]], window_s: float) -> list[list[str]]:
    """Group (message_key, sat1, sat2, tca) tuples exactly as incremental ingestion would.

    Used by tests and offline analysis; the database path in :mod:`cads.ingest` applies
    the same :func:`correlate` rule one message at a time.
    """
    events: dict[int, dict] = {}
    for key, sat1, sat2, tca in messages:
        pk = pair_key(sat1, sat2)
        candidates = [EventCandidate(eid, tuple(e["tcas"])) for eid, e in events.items() if e["pair"] == pk]
        decision = correlate(tca, candidates, window_s)
        if decision.event_id is None:
            events[len(events) + 1] = {"pair": pk, "tcas": [tca], "keys": [key]}
        else:
            events[decision.event_id]["tcas"].append(tca)
            events[decision.event_id]["keys"].append(key)
    return [sorted(e["keys"]) for e in events.values()]
