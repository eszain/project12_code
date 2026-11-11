"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatShortOdds } from "@/lib/cads/analyze";
import type { CdmEvent } from "@/lib/cads/store";
import { isoZ } from "@/lib/cads/time";
import { pcAxis, pcChange, pcFraction, trendPoints, type Change, type TrendPoint } from "@/lib/cads/trend";

const W = 360;
const H = 150;
const PAD = { l: 48, r: 12, t: 10, b: 24 };
const px = (i: number, n: number) => (n === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + (i * (W - PAD.l - PAD.r)) / (n - 1));
const py = (frac: number) => PAD.t + (1 - frac) * (H - PAD.t - PAD.b);

const CHANGE_LABEL: Record<Change, string> = { higher: "▲ higher", lower: "▼ lower", same: "= same", "n/a": "–" };

function Frame({ points, yTicks }: { points: TrendPoint[]; yTicks: { frac: number; label: string }[] }) {
  return (
    <>
      {yTicks.map((t) => (
        <g key={t.label}>
          <line x1={PAD.l} x2={W - PAD.r} y1={py(t.frac)} y2={py(t.frac)} className="stroke-border" strokeDasharray="3 3" />
          <text x={PAD.l - 6} y={py(t.frac) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">{t.label}</text>
        </g>
      ))}
      {points.map((p, i) => (
        <text key={p.n} x={px(i, points.length)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">#{p.n}</text>
      ))}
    </>
  );
}

function PcChart({ points }: { points: TrendPoint[] }) {
  const axis = pcAxis(points);
  if (!axis) return <p className="text-xs text-muted-foreground">No non-zero Pc values to chart.</p>;
  const ticks = [{ frac: 0, label: "0" }];
  for (let e = axis.minExp; e <= axis.maxExp; e++) ticks.push({ frac: pcFraction(10 ** e, axis), label: `1e${e}` });
  const pts = points.map((p, i) => ({ x: px(i, points.length), y: py(pcFraction(p.pc, axis)), zero: p.pc === 0, p }));
  const known = pts.filter((q) => q.p.pc !== null);
  const summary = points.map((p) => `CDM ${p.n}: ${p.pc === null ? "not provided" : p.pc === 0 ? "0" : formatShortOdds(p.pc)}`).join("; ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pc trend across CDMs. ${summary}`} className="w-full">
      <Frame points={points} yTicks={ticks} />
      <polyline points={known.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" className="stroke-primary" strokeWidth={1.5} />
      {known.map((q) => (
        <circle key={q.p.n} cx={q.x} cy={q.y} r={3.5} strokeWidth={1.5} className={q.zero ? "fill-background stroke-primary" : "fill-primary stroke-primary"}>
          <title>{`CDM ${q.p.n}: Pc ${q.p.pcRaw ?? "not provided"}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function MissChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(...points.map((p) => p.missM), 1) * 1.1;
  const pts = points.map((p, i) => ({ x: px(i, points.length), y: py(p.missM / max), p }));
  const ticks = [0, 0.5, 1].map((f) => ({ frac: f, label: `${Math.round((f * max) / 10) * 10} m` }));
  const summary = points.map((p) => `CDM ${p.n}: ${Math.round(p.missM)} m`).join("; ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Miss distance trend across CDMs. ${summary}`} className="w-full">
      <Frame points={points} yTicks={ticks} />
      <polyline points={pts.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" className="stroke-primary" strokeWidth={1.5} />
      {pts.map((q) => (
        <circle key={q.p.n} cx={q.x} cy={q.y} r={3.5} className="fill-primary stroke-primary">
          <title>{`CDM ${q.p.n}: miss distance ${Math.round(q.p.missM)} m`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** B1: every CDM of the selected event in time order. B2: how Pc and miss distance changed across them. */
export function CdmHistory({ event }: { event: CdmEvent }) {
  const points = trendPoints(event);
  return (
    <Card>
      <CardHeader><CardTitle>CDM history ({points.length} update{points.length === 1 ? "" : "s"}, oldest first)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table aria-label="CDM history">
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead><TableHead>Created (UTC)</TableHead><TableHead>Before TCA</TableHead>
                <TableHead>Collision chance (Pc)</TableHead><TableHead>Pc vs previous</TableHead><TableHead>Miss (m)</TableHead><TableHead>Source file</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((p, i) => (
                <TableRow key={p.n}>
                  <TableCell>{p.n}</TableCell>
                  <TableCell className="whitespace-nowrap">{isoZ(p.createdMs)}</TableCell>
                  <TableCell className="whitespace-nowrap">{p.hoursToTca.toFixed(1)} h</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-xs font-medium">{p.pc === null ? "not provided" : formatShortOdds(p.pc)}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{p.pcRaw ?? ""}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{i === 0 ? "–" : CHANGE_LABEL[pcChange(points[i - 1].pc, p.pc)]}</TableCell>
                  <TableCell>{p.missM.toFixed(0)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.file}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <figure className="space-y-1">
            <figcaption className="text-xs font-medium">Collision chance (Pc), log scale; a hollow dot on the bottom line means Pc is exactly 0</figcaption>
            <PcChart points={points} />
          </figure>
          <figure className="space-y-1">
            <figcaption className="text-xs font-medium">Miss distance</figcaption>
            <MissChart points={points} />
          </figure>
        </div>
        <p className="text-xs text-muted-foreground">CDMs are spaced equally; times are in the table. Values are the source CDM values, not recalculated.</p>
      </CardContent>
    </Card>
  );
}
