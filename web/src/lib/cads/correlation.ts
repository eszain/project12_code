// Event correlator (US02, FR03, AC01). Port of cads/correlation.py.
//
// Rule (team proposal "Option A", to confirm with CSA): a CDM belongs to an existing event when
// the event has the same UNORDERED object pair and at least one revision with a TCA within
// +/- windowS seconds. Single linkage over all revisions makes the result independent of import
// order. If several events qualify the closest wins and the decision is flagged ambiguous.

export const pairKey = (a: string, b: string) => [a.trim(), b.trim()].sort().join("|");

export interface EventCandidate {
  eventId: number;
  tcas: number[];
}
export interface CorrelationDecision {
  eventId: number | null;
  deltaS: number | null;
  ambiguous: boolean;
  note: string;
}

export function correlate(tcaMs: number, candidates: EventCandidate[], windowS: number): CorrelationDecision {
  const matches: [number, number][] = [];
  for (const c of candidates) {
    if (!c.tcas.length) continue;
    const delta = Math.min(...c.tcas.map((t) => Math.abs(tcaMs - t) / 1000));
    if (delta <= windowS) matches.push([delta, c.eventId]);
  }
  if (!matches.length) return { eventId: null, deltaS: null, ambiguous: false, note: `no event of this object pair within +/-${windowS} s of TCA: new encounter` };
  matches.sort((a, b) => a[0] - b[0]);
  const [delta, eventId] = matches[0];
  if (matches.length > 1) {
    const others = matches.slice(1).map((m) => m[1]).join(", ");
    return {
      eventId,
      deltaS: delta,
      ambiguous: true,
      note: `AMBIGUOUS: TCA within +/-${windowS} s of several events; attached to event ${eventId} (closest, dt = ${delta.toFixed(3)} s); also matched ${others}. Analyst review required.`,
    };
  }
  return { eventId, deltaS: delta, ambiguous: false, note: `revision of event ${eventId} (TCA differs by ${delta.toFixed(3)} s)` };
}

/** Group (key, sat1, sat2, tca) tuples exactly as incremental ingestion would (tests / offline analysis). */
export function groupMessages(msgs: [string, string, string, number][], windowS: number): string[][] {
  const events: { pair: string; tcas: number[]; keys: string[] }[] = [];
  for (const [key, s1, s2, tca] of msgs) {
    const pk = pairKey(s1, s2);
    const cands = events.map((e, i) => ({ eventId: i, tcas: e.tcas, pair: e.pair })).filter((c) => c.pair === pk);
    const d = correlate(tca, cands, windowS);
    if (d.eventId === null) events.push({ pair: pk, tcas: [tca], keys: [key] });
    else {
      events[d.eventId].tcas.push(tca);
      events[d.eventId].keys.push(key);
    }
  }
  return events.map((e) => [...e.keys].sort());
}
