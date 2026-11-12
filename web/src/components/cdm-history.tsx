"use client";

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
          <line x1={PAD.l} x2={W - PAD.r} y1={py(t.frac)} y2={py(t.frac)} className="chart-grid" strokeDasharray="3 3" />
          <text x={PAD.l - 6} y={py(t.frac) + 3} textAnchor="end" className="chart-label">{t.label}</text>
        </g>
      ))}
      {points.map((p, i) => (
        <text key={p.n} x={px(i, points.length)} y={H - 8} textAnchor="middle" className="chart-label">#{p.n}</text>
      ))}
    </>
  );
}

function PcChart({ points }: { points: TrendPoint[] }) {
  const axis = pcAxis(points);
  if (!axis) return <p className="panel-note">No non-zero Pc values to chart.</p>;
  const ticks = [{ frac: 0, label: "0" }];
  for (let e = axis.minExp; e <= axis.maxExp; e++) ticks.push({ frac: pcFraction(10 ** e, axis), label: `1e${e}` });
  const pts = points.map((p, i) => ({ x: px(i, points.length), y: py(pcFraction(p.pc, axis)), zero: p.pc === 0, p }));
  const known = pts.filter((q) => q.p.pc !== null);
  const summary = points.map((p) => `CDM ${p.n}: ${p.pc === null ? "not provided" : p.pc === 0 ? "0" : formatShortOdds(p.pc)}`).join("; ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pc trend across CDMs. ${summary}`} className="chart">
      <Frame points={points} yTicks={ticks} />
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
  const max = Math.max(...points.map((p) => p.missM), 1) * 1.1;
  const pts = points.map((p, i) => ({ x: px(i, points.length), y: py(p.missM / max), p }));
  const ticks = [0, 0.5, 1].map((f) => ({ frac: f, label: `${Math.round((f * max) / 10) * 10} m` }));
  const summary = points.map((p) => `CDM ${p.n}: ${Math.round(p.missM)} m`).join("; ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Miss distance trend across CDMs. ${summary}`} className="chart">
      <Frame points={points} yTicks={ticks} />
      <polyline points={pts.map((q) => `${q.x},${q.y}`).join(" ")} className="chart-line" />
      {pts.map((q) => (
        <circle key={q.p.n} cx={q.x} cy={q.y} r={3.5} className="chart-dot">
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
    <section className="detail-panel ops-panel" aria-labelledby="cdm-history-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">REVISION HISTORY</p>
          <h2 id="cdm-history-heading">CDM history ({points.length} update{points.length === 1 ? "" : "s"}, oldest first)</h2>
        </div>
        <span className="panel-count">Source values, not recalculated</span>
      </div>
      <div className="dashboard-table-wrap">
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
                  <td>{isoZ(p.createdMs)}</td>
                  <td>{p.hoursToTca.toFixed(1)} h</td>
                  <td>
                    <div>{p.pc === null ? "not provided" : formatShortOdds(p.pc)}</div>
                    <code className="table-subline">{p.pcRaw ?? ""}</code>
                  </td>
                  <td className={`change-${change}`}>{i === 0 ? "–" : CHANGE_LABEL[change]}</td>
                  <td>{p.missM.toFixed(0)}</td>
                  <td className="ops-file">{p.file}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ops-charts">
        <figure>
          <figcaption>Collision chance (Pc), log scale; a hollow dot on the bottom line means Pc is exactly 0</figcaption>
          <PcChart points={points} />
        </figure>
        <figure>
          <figcaption>Miss distance</figcaption>
          <MissChart points={points} />
        </figure>
      </div>
      <p className="panel-note ops-foot">CDMs are spaced equally; times are in the table.</p>
    </section>
  );
}
