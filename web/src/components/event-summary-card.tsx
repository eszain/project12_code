"use client";

import { formatShortOdds, missComponentsM, phoneSummary, type EventAnalysis } from "@/lib/cads/analyze";
import type { NormalizedCdm, ObjectInfo } from "@/lib/cads/parser";
import { lastObservations, positionSigmasM, type LastObservation } from "@/lib/cads/quality";
import { CONFIG, latestRevision, type CdmEvent } from "@/lib/cads/store";
import { actionLabel } from "@/lib/cads/severity";
import { MissVsUncertaintyBlock } from "./calculation-details";
import { SeverityBadge } from "./severity-badge";
import { hoursBetween, isoZ } from "@/lib/cads/time";

const fmtHours = (h: number) => (h >= 0 ? `in ${h.toFixed(1)} h` : `${(-h).toFixed(1)} h ago`);
const fmtM = (m: number) => (m >= 10000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m).toLocaleString()} m`);

function Metric({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="ops-value">{children}</dd>
      {note && <dd className="ops-sub">{note}</dd>}
    </div>
  );
}

function MissSplit({ cdm }: { cdm: NormalizedCdm }) {
  const m = missComponentsM(cdm);
  if (!m) return <div className="ops-block"><div className="ops-block-title">Miss-distance split: not provided</div></div>;
  const part = (label: string, v: number, key = false) => (
    <div className={key ? "ops-split-cell is-key" : "ops-split-cell"}>
      <span>{label}</span>
      <strong>{fmtM(v)}</strong>
    </div>
  );
  return (
    <div className="ops-block">
      <div className="ops-block-title">Miss distance by direction (radial matters most)</div>
      <div className="ops-split">
        {part("Radial", m.radial, true)}
        {part("In-track", m.inTrack)}
        {part("Cross-track", m.crossTrack)}
      </div>
    </div>
  );
}

const fmtH = (h: number) => `${Math.abs(h).toFixed(1)} h`;

function LastObs({ cdm, now }: { cdm: NormalizedCdm; now: number }) {
  const lo = lastObservations(cdm, now, CONFIG.obsGapWarnH);
  const row = (o: ObjectInfo, v: LastObservation | null) => (
    <div className="ops-row">
      <span className="ops-row-label">{o.name ?? o.designator}: </span>
      {v ? (
        <span>
          {fmtH(v.beforeTcaH)} before TCA · {v.beforeNowH >= 0 ? `${fmtH(v.beforeNowH)} ago` : `${fmtH(v.beforeNowH)} from now`}
        </span>
      ) : (
        <span className="ops-row-label">not provided</span>
      )}
    </div>
  );
  return (
    <div className="ops-block">
      <div className="ops-block-title">Last observation of each object</div>
      {row(cdm.sat1, lo.sat1)}
      {row(cdm.sat2, lo.sat2)}
      {lo.warn && lo.gapH !== null && (
        <p role="alert" className="ops-warning">
          ⚠ Last observations are {fmtH(lo.gapH)} apart (limit {lo.gapLimitH} h): the object seen earlier may have moved.
        </p>
      )}
    </div>
  );
}

function Uncertainty({ o }: { o: ObjectInfo }) {
  const s = positionSigmasM(o);
  return (
    <div className="ops-row">
      <span className="ops-row-label">{o.name ?? o.designator}: </span>
      {s ? <span>R {fmtM(s[0])} · I {fmtM(s[1])} · C {fmtM(s[2])}</span> : <span className="ops-row-label">not provided</span>}
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
  onOpenDetails,
  view,
  archived,
  onToggleArchive,
  cautiousLanguage = false,
}: {
  event: CdmEvent;
  analysis?: EventAnalysis;
  now: number;
  selected: boolean;
  onSelect: () => void;
  onOpenDetails?: () => void;
  view: "operator" | "specialist";
  /** Archive state and toggle; leave out to hide the Archive button (for example in a details sidebar). */
  archived?: boolean;
  onToggleArchive?: () => void;
  cautiousLanguage?: boolean;
}) {
  const c = latestRevision(event).cdm;
  const title = `${c.sat1.name ?? c.sat1.designator} / ${c.sat2.name ?? c.sat2.designator}`;

  return (
    <article className={selected ? "ops-card is-selected" : "ops-card"}>
      <header className="ops-card-head">
        {view === "specialist" ? (
          <button className="ops-title" onClick={onSelect}>
            {title}
          </button>
        ) : (
          <h3 className="ops-title">{title}</h3>
        )}
        {analysis ? <SeverityBadge severity={analysis.severity} /> : <span className="ops-pending">run risk analysis</span>}
      </header>
      <dl className="ops-metrics">
          <Metric label="Closest approach (TCA)" note={isoZ(c.tca)}>
            {fmtHours(hoursBetween(now, c.tca))}
          </Metric>
          <Metric label="Miss distance">{fmtM(c.missDistanceM)}</Metric>
          <Metric label="Collision chance (Pc)" note={<code>{c.pcRaw ?? ""}</code>}>
            {c.pc === null ? <span className="ops-row-label">not provided</span> : formatShortOdds(c.pc)}
          </Metric>
      </dl>
      {view === "operator" ? (
        <>
          {analysis && <p className={`ops-action ops-action-${analysis.severity.toLowerCase()}`}>{actionLabel(analysis.severity)}</p>}
          <p className="ops-phone" aria-label="Phone summary">{phoneSummary(c, now)}</p>
          <div className="ops-links">
            <button className="ops-link" onClick={onOpenDetails ?? onSelect} onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); (onOpenDetails ?? onSelect)(); } }}>Open full details (specialist view) <span aria-hidden="true">↗</span></button>
            {onToggleArchive && <button className="ops-link ops-link-quiet" onClick={onToggleArchive}>{archived ? "Restore to active" : "Archive"}</button>}
          </div>
        </>
      ) : (
        <>
          <MissSplit cdm={c} />
          <MissVsUncertaintyBlock cdm={c} cautiousLanguage={cautiousLanguage} />
          <LastObs cdm={c} now={now} />
          <div className="ops-block">
            <div className="ops-block-title">Position uncertainty, 1σ (R radial · I in-track · C cross-track)</div>
            <Uncertainty o={c.sat1} />
            <Uncertainty o={c.sat2} />
          </div>
          {onToggleArchive && (
            <div className="ops-links">
              <button className="ops-link ops-link-quiet" onClick={onToggleArchive}>{archived ? "Restore to active" : "Archive"}</button>
            </div>
          )}
        </>
      )}
    </article>
  );
}
