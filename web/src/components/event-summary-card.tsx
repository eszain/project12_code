"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatShortOdds, type EventAnalysis } from "@/lib/cads/analyze";
import type { ObjectInfo } from "@/lib/cads/parser";
import { positionSigmasM } from "@/lib/cads/quality";
import { latestRevision, type CdmEvent, type Severity } from "@/lib/cads/store";
import { hoursBetween, isoZ } from "@/lib/cads/time";

const SEVERITY_STYLE: Record<Severity, { variant: "destructive" | "secondary" | "outline"; className?: string }> = {
  ACTION: { variant: "destructive" },
  WATCH: { variant: "secondary", className: "bg-amber-500/20 text-amber-700 dark:text-amber-300" },
  LOW: { variant: "outline" },
  ZERO: { variant: "outline" },
  UNKNOWN: { variant: "outline" },
};

const fmtHours = (h: number) => (h >= 0 ? `in ${h.toFixed(1)} h` : `${(-h).toFixed(1)} h ago`);
const fmtM = (m: number) => (m >= 10000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m).toLocaleString()} m`);

function Metric({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold leading-tight">{children}</dd>
      {note && <dd className="text-[11px] text-muted-foreground">{note}</dd>}
    </div>
  );
}

function Uncertainty({ o }: { o: ObjectInfo }) {
  const s = positionSigmasM(o);
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{o.name ?? o.designator}: </span>
      {s ? <span className="font-medium">R {fmtM(s[0])} · I {fmtM(s[1])} · C {fmtM(s[2])}</span> : <span className="text-muted-foreground">not provided</span>}
    </div>
  );
}

/** Front-line summary for one event: the four numbers an operator needs, and nothing else. */
export function EventSummaryCard({
  event,
  analysis,
  now,
  selected,
  onSelect,
}: {
  event: CdmEvent;
  analysis?: EventAnalysis;
  now: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const c = latestRevision(event).cdm;
  const title = `${c.sat1.name ?? c.sat1.designator} / ${c.sat2.name ?? c.sat2.designator}`;
  const sev = analysis ? SEVERITY_STYLE[analysis.severity] : null;

  return (
    <Card className={selected ? "ring-2 ring-primary" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <button className="text-left text-base font-semibold underline-offset-2 hover:underline focus-visible:underline" onClick={onSelect}>
          {title}
        </button>
        {analysis && sev ? (
          <Badge variant={sev.variant} className={sev.className}>
            {analysis.severity}
          </Badge>
        ) : (
          <span className="text-xs italic text-muted-foreground">run risk analysis</span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-3 gap-3">
          <Metric label="Closest approach (TCA)" note={isoZ(c.tca)}>
            {fmtHours(hoursBetween(now, c.tca))}
          </Metric>
          <Metric label="Miss distance">{fmtM(c.missDistanceM)}</Metric>
          <Metric label="Collision chance (Pc)" note={<span className="font-mono">{c.pcRaw ?? ""}</span>}>
            {c.pc === null ? <span className="text-muted-foreground">not provided</span> : formatShortOdds(c.pc)}
          </Metric>
        </dl>
        <div className="space-y-0.5 rounded-md bg-muted/40 p-2">
          <div className="text-xs text-muted-foreground">Position uncertainty, 1σ (R radial · I in-track · C cross-track)</div>
          <Uncertainty o={c.sat1} />
          <Uncertainty o={c.sat2} />
        </div>
      </CardContent>
    </Card>
  );
}
