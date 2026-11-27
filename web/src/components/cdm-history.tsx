"use client";

import { formatShortOdds } from "@/lib/cads/analyze";
import { CONFIG, type CdmEvent } from "@/lib/cads/store";
import { isoZ } from "@/lib/cads/time";
import { pcAxis, pcChange, pcFraction, trendPoints, type Change, type TrendPoint } from "@/lib/cads/trend";

const W = 560;
const H = 230;
// Reserve room for the vertical axis title/ticks and the horizontal title/ticks.
const PAD = { l: 116, r: 20, t: 18, b: 52 };
const px = (hours: number | null, points: TrendPoint[]) => {
  const values = points.map((p) => p.hoursToTca).filter((v): v is number => v !== null);
  if (hours === null || values.length < 2) return (PAD.l + W - PAD.r) / 2;
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === min) return (PAD.l + W - PAD.r) / 2;
  // Oldest revision (largest hours before TCA) is on the left; newest is on the right.
  return PAD.l + ((max - hours) / (max - min)) * (W - PAD.l - PAD.r);
};
const py = (frac: number) => PAD.t + (1 - frac) * (H - PAD.t - PAD.b);
const PLOT_W = W - PAD.l - PAD.r;
// One "164" label needs about this much horizontal room, in chart units.
const MIN_LABEL_GAP = 64;

function formatHour(hours: number, span: number): string {
  if (span >= 48) return String(Math.round(hours));
  if (span >= 8) return hours.toFixed(1);
  return hours.toFixed(2);
}

/** A few evenly spaced times across the plot, including both ends, so the labels do not collide. */
function xAxisTicks(points: TrendPoint[]): { hours: number; label: string }[] {
  const values = points.map((p) => p.hoursToTca).filter((v): v is number => v !== null);
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (span < 1e-6) return [{ hours: min, label: formatHour(min, 0) }];
  const count = Math.max(2, Math.min(values.length, Math.floor(PLOT_W / MIN_LABEL_GAP) + 1));
  return Array.from({ length: count }, (_, i) => {
    const hours = min + (span * i) / (count - 1);
    return { hours, label: formatHour(hours, span) };
  });
}

const CHANGE_LABEL: Record<Change, string> = { higher: "▲ higher", lower: "▼ lower", same: "= same", "n/a": "–" };

function Frame({ points, yTicks, yAxisTitle }: { points: TrendPoint[]; yTicks: { frac: number; label: string }[]; yAxisTitle: string }) {
  return (
    <>
      {yTicks.map((t) => (
        <g key={t.label}>
          <line x1={PAD.l} x2={W - PAD.r} y1={py(t.frac)} y2={py(t.frac)} className="chart-grid" strokeDasharray="3 3" />
        <text x={PAD.l - 12} y={py(t.frac) + 4} textAnchor="end" className="chart-label">{t.label}</text>
        </g>
      ))}
      {xAxisTicks(points).map((tick) => (
        <g key={tick.hours}>
          <line x1={px(tick.hours, points)} x2={px(tick.hours, points)} y1={H - PAD.b} y2={H - PAD.b + 5} className="chart-grid" />
          <text x={px(tick.hours, points)} y={H - 28} textAnchor="middle" className="chart-label">{tick.label}</text>
        </g>
      ))}
      <text x={(PAD.l + W - PAD.r) / 2} y={H - 7} textAnchor="middle" className="chart-axis-title">Hours before TCA</text>
      <g transform={`translate(26 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}>
        <text x="0" y="0" textAnchor="middle" className="chart-axis-title">{yAxisTitle}</text>
      </g>
    </>
  );
}

function PcChart({ points }: { points: TrendPoint[] }) {
  const sourceAxis = pcAxis(points);
  if (!sourceAxis) {
    const summary = points.map((p) => `CDM ${p.n}: ${p.pc === 0 ? "exactly 0" : "not provided"}`).join("; ");
    return <p className="panel-note" role="img" aria-label={`Pc history. ${summary}`}>All available source Pc values are exactly 0; no non-zero values are present for a logarithmic scale.</p>;
  }
  const axis = {
    ...sourceAxis,
    floorExp: Math.min(sourceAxis.floorExp, Math.floor(Math.log10(CONFIG.pcWatch)) - 1),
    maxExp: Math.max(sourceAxis.maxExp, Math.ceil(Math.log10(CONFIG.pcAction))),
  };
  const ticks = [{ frac: 0, label: "0" }];
  for (let e = axis.minExp; e <= axis.maxExp; e++) ticks.push({ frac: pcFraction(10 ** e, axis), label: `1e${e}` });
  const pts = points.filter((p) => p.hoursToTca !== null).map((p) => ({ x: px(p.hoursToTca, points), y: py(pcFraction(p.pc, axis)), zero: p.pc === 0, p }));
  const thresholdLines = [
    { value: CONFIG.pcWatch, label: "watch" },
    { value: CONFIG.pcAction, label: "action" },
  ];
  const known = pts.filter((q) => q.p.pc !== null);
  const summary = points.map((p) => `CDM ${p.n}: ${p.pc === null ? "not provided" : formatShortOdds(p.pc)}`).join("; ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pc trend across CDMs. ${summary}`} className="chart">
      <Frame points={points} yTicks={ticks} yAxisTitle="Probability of collision (Pc)" />
      {thresholdLines.map(({ value, label }) => (
        <g key={label}>
          <line x1={PAD.l} x2={W - PAD.r} y1={py(pcFraction(value, axis))} y2={py(pcFraction(value, axis))} className="chart-threshold" strokeDasharray="5 3" />
          <text x={W - PAD.r} y={py(pcFraction(value, axis)) - 3} textAnchor="end" className="chart-threshold-label">{label}</text>
        </g>
      ))}
      <polyline points={known.map((q) => `${q.x},${q.y}`).join(" ")} className="chart-line" />
      {known.map((q) => (
        <circle key={q.p.n} cx={q.x} cy={q.y} r={3.5} className={q.zero ? "chart-dot is-zero" : "chart-dot"}>
          <title>{`CDM ${q.p.n}: Pc ${q.p.pcRaw ?? "not provided"}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function MissChart({ points }: { points: TrendPoint[] }) {
  const valid = points.filter((p) => p.hoursToTca !== null && p.missM !== null);
  const max = Math.max(...valid.map((p) => p.missM ?? 0), 1) * 1.1;
  const pts = valid.map((p) => ({ x: px(p.hoursToTca, points), y: py((p.missM ?? 0) / max), p }));
  const ticks = [0, 0.5, 1].map((f) => ({ frac: f, label: `${Math.round((f * max) / 10) * 10} m` }));
  const summary = points.map((p) => `CDM ${p.n}: ${p.missM === null ? "not provided" : `${Math.round(p.missM)} m`}`).join("; ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Miss distance trend across CDMs. ${summary}`} className="chart">
      <Frame points={points} yTicks={ticks} yAxisTitle="Miss distance (m)" />
      <polyline points={pts.map((q) => `${q.x},${q.y}`).join(" ")} className="chart-line" />
      {pts.map((q) => (
        <circle key={q.p.n} cx={q.x} cy={q.y} r={3.5} className="chart-dot">
          <title>{`CDM ${q.p.n}: miss distance ${Math.round(q.p.missM ?? 0)} m`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** B1: every CDM of the selected event in time order. B2: how Pc and miss distance changed across them. */
export function CdmHistory({ event, chartsOnly = false }: { event: CdmEvent; chartsOnly?: boolean }) {
  const points = trendPoints(event);
  return (
    <section className="detail-panel ops-panel" aria-labelledby="cdm-history-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">REVISION HISTORY</p>
          <h2 id="cdm-history-heading">CDM history ({points.length} update{points.length === 1 ? "" : "s"}, oldest first)</h2>
        </div>
        <span className="panel-count">Source values, not recalculated</span>
      </div>
      {!chartsOnly && <div className="dashboard-table-wrap">
        <table className="dashboard-table ops-history-table" aria-label="CDM history">
          <thead>
            <tr>
              <th scope="col">#</th><th scope="col">Created <span className="unit-label">UTC</span></th><th scope="col">Before TCA</th>
              <th scope="col">Collision chance (Pc)</th><th scope="col">Pc vs previous</th><th scope="col">Miss (m)</th><th scope="col">Source file</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => {
              const change = i === 0 ? "n/a" : pcChange(points[i - 1].pc, p.pc);
              return (
                <tr key={p.n}>
                  <th scope="row">{p.n}</th>
                  <td>{Number.isFinite(p.createdMs) ? isoZ(p.createdMs) : "unavailable"}</td>
                  <td>{p.hoursToTca === null ? "unavailable" : `${p.hoursToTca.toFixed(1)} h`}</td>
                  <td>
                    <div>{p.pc === null ? "not provided" : formatShortOdds(p.pc)}</div>
                    <code className="table-subline">{p.pcRaw ?? ""}</code>
                  </td>
                  <td className={`change-${change}`}>{i === 0 ? "–" : CHANGE_LABEL[change]}</td>
                  <td>{p.missM === null ? "unavailable" : p.missM.toFixed(0)}</td>
                  <td className="ops-file">{p.file}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
      <div className="ops-charts">
        <figure>
          <figcaption>Probability of collision (Pc), log scale; watch {CONFIG.pcWatch.toExponential(0)}, action {CONFIG.pcAction.toExponential(0)}. Hollow dots are source Pc = 0.</figcaption>
          <PcChart points={points} />
        </figure>
        <figure>
          <figcaption>Miss distance (metres)</figcaption>
          <MissChart points={points} />
        </figure>
      </div>
      <p className="panel-note ops-foot">Each revision uses its own source creation time and TCA; revisions are ordered oldest first and plotted at their actual hours before TCA. Invalid timestamps are shown as unavailable and omitted from the plot.</p>
    </section>
  );
}
