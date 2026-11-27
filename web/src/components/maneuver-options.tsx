"use client";

// Maneuver options chart for the specialist view (issue #27; asked for by CSA on Nov 13).
// One line per target collision probability: the smallest burn that reaches the target, against how many hours
// before the closest approach it is done. A dashed marker shows half an orbit before TCA, where a burn moves the
// satellite furthest. A study only: CADS never commands a spacecraft.

import { useMemo } from "react";
import { formatShortOdds } from "@/lib/cads/analyze";
import { maneuverOptionSpace, type IsoLine } from "@/lib/cads/maneuver-space";
import type { NormalizedCdm } from "@/lib/cads/parser";

const W = 560;
const H = 250;
const PAD = { l: 76, r: 20, t: 20, b: 56 };
const DASH = ["", "6 3", "2 3"]; // one line style per target

export function ManeuverOptions({ cdm }: { cdm: NormalizedCdm }) {
  const space = useMemo(() => maneuverOptionSpace(cdm), [cdm]);

  if (!space.available) {
    return (
      <section className="ops-block" aria-label="Maneuver options">
        <div className="ops-block-title">Maneuver options (study only, never a command)</div>
        <div className="ops-row">{space.reason}</div>
      </section>
    );
  }

  // 1. Axes: lead time on a log scale (0.8 h to 48 h spreads out evenly), burn size in cm/s from 0.
  const leads = space.lines[0].points.map((p) => p.leadTimeH);
  const lo = Math.log10(Math.min(...leads));
  const hi = Math.log10(Math.max(...leads));
  const px = (h: number) => PAD.l + ((Math.log10(h) - lo) / (hi - lo)) * (W - PAD.l - PAD.r);
  const burns = space.lines.flatMap((l) => l.points.map((p) => (p.dvMs ?? 0) * 100));
  const top = Math.max(0.5, Math.ceil(Math.max(...burns) * 2) / 2);
  const py = (cm: number) => PAD.t + (1 - cm / top) * (H - PAD.t - PAD.b);
  const yTicks = [0, top / 2, top];

  // 2. One polyline per target, over the lead times where a burn of up to 1 m/s reaches it.
  const path = (l: IsoLine) => l.points.filter((p) => p.dvMs !== null).map((p) => `${px(p.leadTimeH)},${py(p.dvMs! * 100)}`).join(" ");
  const summary = space.lines.map((l) => `to reach ${formatShortOdds(l.targetPc)}: ` + l.points.map((p) => `${p.leadTimeH.toFixed(1)} h ${p.dvMs === null ? "not reachable" : `${(p.dvMs * 100).toFixed(2)} cm/s`}`).join(", ")).join("; ");
  const first = space.lines[0];

  return (
    <section className="ops-block" aria-label="Maneuver options">
      <div className="ops-block-title">Maneuver options (study only, never a command)</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Smallest burn against hours before closest approach. ${summary}`} className="chart">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(v)} y2={py(v)} className="chart-grid" strokeDasharray="3 3" />
            <text x={PAD.l - 10} y={py(v) + 4} textAnchor="end" className="chart-label">{v.toFixed(1)}</text>
          </g>
        ))}
        {leads.map((h) => (
          <text key={h} x={px(h)} y={H - 32} textAnchor="middle" className="chart-label">{h < 1 ? h.toFixed(1) : h}</text>
        ))}
        {/* 3. Best timing: half an orbit before TCA. */}
        <line x1={px(space.halfOrbitH)} x2={px(space.halfOrbitH)} y1={PAD.t} y2={H - PAD.b} className="chart-threshold" strokeDasharray="5 3" />
        <text x={px(space.halfOrbitH) + 6} y={PAD.t + 10} className="chart-threshold-label">best timing (half an orbit)</text>
        {space.lines.map((l, i) => (
          <polyline key={l.targetPc} points={path(l)} className="chart-line" strokeDasharray={DASH[i % DASH.length]} />
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 8} textAnchor="middle" className="chart-axis-title">Hours before closest approach (h, log scale)</text>
        <g transform={`translate(20 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}>
          <text x="0" y="0" textAnchor="middle" className="chart-axis-title">Burn size (cm/s)</text>
        </g>
      </svg>

      {/* 4. Legend: which line is which target. */}
      <div className="ops-row">
        {space.lines.map((l, i) => (
          <span key={l.targetPc} style={{ marginRight: 16 }}>
            <svg width="28" height="8" aria-hidden="true"><line x1="0" x2="28" y1="4" y2="4" className="chart-line" strokeDasharray={DASH[i % DASH.length]} /></svg>{" "}
            to reach {formatShortOdds(l.targetPc)}
          </span>
        ))}
      </div>

      {/* 5. Table for the first target. */}
      <table className="ops-row" aria-label={`Burns to reach ${formatShortOdds(first.targetPc)}`}>
        <thead>
          <tr><th>Hours before TCA</th><th>Burn (cm/s)</th><th>Direction</th><th>New miss (m)</th><th>Fuel (g)</th></tr>
        </thead>
        <tbody>
          {first.points.map((p) => (
            <tr key={p.leadTimeH}>
              <td>{p.leadTimeH < 1 ? p.leadTimeH.toFixed(1) : p.leadTimeH}</td>
              <td>{p.dvMs === null ? "not reachable (over 1 m/s)" : (p.dvMs * 100).toFixed(2)}</td>
              <td>{p.direction ?? "-"}</td>
              <td>{p.missDistanceM === null ? "-" : Math.round(p.missDistanceM)}</td>
              <td>{p.propellantKg === null ? "-" : (p.propellantKg * 1000).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ops-row ops-row-label">
        Assumed spacecraft: {space.spacecraft.massKg} kg, Isp {space.spacecraft.ispS} s (to be confirmed with CSA). {space.limitations[0]}
      </div>
    </section>
  );
}
