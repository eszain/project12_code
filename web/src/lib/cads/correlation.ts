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


/**
 * Group CDMs by unordered object pair and connected TCA windows.
 * The result is independent of message arrival order.
 */
export function groupMessages(
  msgs: [string, string, string, number][],
  windowS: number
): string[][] {
  const parent = msgs.map((_, i) => i);

  function find(i: number): number {
    if (parent[i] !== i) {
      parent[i] = find(parent[i]);
    }
    return parent[i];
  }

  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);

    if (rootA !== rootB) {
      parent[rootB] = rootA;
    }
  }

  // Connect messages with matching object pairs
  // and TCAs within the configured window.
  for (let i = 0; i < msgs.length; i++) {
    for (let j = i + 1; j < msgs.length; j++) {
      const [, a1, a2, tcaA] = msgs[i];
      const [, b1, b2, tcaB] = msgs[j];

      const samePair =
        pairKey(a1, a2) === pairKey(b1, b2);

      const withinWindow =
        Math.abs(tcaA - tcaB) <= windowS * 1000;

      if (samePair && withinWindow) {
        union(i, j);
      }
    }
  }

  // Collect all connected messages into events.
  const groups = new Map<number, string[]>();

  msgs.forEach(([key], i) => {
    const root = find(i);
    const group = groups.get(root) ?? [];

    group.push(key);
    groups.set(root, group);
  });

  return [...groups.values()]
    .map((group) => group.sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
}
