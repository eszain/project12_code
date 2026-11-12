"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Navigation } from "@/components/navigation";
import { dataSourceLabel, ConjunctionEvent } from "@/lib/cads/models";
import { formatDistance, formatSpeed, formatUtc } from "@/lib/cads/format";
import { demonstrationDataService } from "@/lib/cads/service";

function DetailMetric({ label, value, note }: { label: string; value: string; note?: string }) { return <div className="detail-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>; }
function DetailStatus({ children, review = false }: { children: React.ReactNode; review?: boolean }) { return <span className={`status-badge ${review ? "status-review" : "status-neutral"}`}><span className="status-badge-dot" aria-hidden="true" />{children}</span>; }

export function EventDetailClient({ id }: { id: string }) {
  const [event, setEvent] = useState<ConjunctionEvent | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "missing">("loading");
  useEffect(() => { demonstrationDataService.getEvent(id).then((result) => { setEvent(result); setState(result ? "ready" : "missing"); }).catch(() => setState("error")); }, [id]);
  return <main className="console-shell"><Navigation /><div className="console-content detail-content"><Link href="/dashboard" className="back-link">← Back to conjunction overview</Link>{state === "loading" && <div className="dashboard-state" role="status"><span className="loading-orbit" aria-hidden="true" /><h1>Loading event detail</h1><p>Reading the local demonstration provider.</p></div>}{state === "error" && <div className="dashboard-state" role="alert"><h1>Event detail unavailable</h1><p>The data provider returned an error.</p></div>}{state === "missing" && <div className="dashboard-state"><span className="state-symbol" aria-hidden="true">?</span><h1>Event not found</h1><p>This event is not present in the current demonstration set.</p><Link className="button button-secondary" href="/dashboard">Return to dashboard</Link></div>}{state === "ready" && event && <EventDetail event={event} />}</div></main>;
}

function EventDetail({ event }: { event: ConjunctionEvent }) {
  return <>
    <header className="detail-header"><div><p className="eyebrow"><span className="eyebrow-dot" /> EVENT DETAIL / {event.id}</p><h1>{event.primaryObject}<span className="pair-divider">×</span>{event.secondaryObject}</h1><p>{event.secondaryObjectType} conjunction · {dataSourceLabel}</p></div><div className="detail-statuses"><DetailStatus>{event.status}</DetailStatus><DetailStatus review={event.reviewStatus === "Review recommended"}>{event.reviewStatus}</DetailStatus></div></header>
    <div className="data-banner" role="note"><span className="data-banner-icon" aria-hidden="true">i</span><span><strong>Operator context</strong><br />This view preserves source values and revision history. Collision risk has not been assessed and no maneuver recommendation is available.</span></div>
    <section className="detail-metrics" aria-label="Event key values"><DetailMetric label="Time of closest approach" value={formatUtc(event.tca)} note={event.temporalState === "upcoming" ? `Demonstration window · ${event.timeToTcaLabel}` : "Occurred · no countdown"} /><DetailMetric label="Miss distance" value={formatDistance(event.missDistanceM)} note="Source value · total" /><DetailMetric label="Relative speed" value={formatSpeed(event.relativeSpeedMps)} note="Source value" /><DetailMetric label="Reported Pc" value={event.sourcePc} note="Not independently assessed" /></section>
    <section className="detail-panel" aria-labelledby="history-heading"><div className="panel-heading"><div><p className="eyebrow">REVISION HISTORY</p><h2 id="history-heading">CDM snapshots</h2></div><span className="panel-count">{event.revisions.length} revisions</span></div><div className="dashboard-table-wrap"><table className="dashboard-table revision-table"><caption className="sr-only">CDM revision history for {event.primaryObject} and {event.secondaryObject}</caption><thead><tr><th scope="col">Revision</th><th scope="col">Created <span className="unit-label">UTC</span></th><th scope="col">TCA <span className="unit-label">UTC</span></th><th scope="col">Miss distance</th><th scope="col">Relative speed</th><th scope="col">Reported Pc</th><th scope="col">Data quality</th></tr></thead><tbody>{event.revisions.map((revision, index) => <tr key={revision.id}><th scope="row">CDM {String(index + 1).padStart(2, "0")}</th><td><time dateTime={revision.createdAt}>{formatUtc(revision.createdAt)}</time></td><td><time dateTime={revision.tca}>{formatUtc(revision.tca)}</time></td><td>{formatDistance(revision.missDistanceM)}</td><td>{formatSpeed(revision.relativeSpeedMps)}</td><td><code>{revision.sourcePc}</code></td><td><DetailStatus>{revision.dataQuality}</DetailStatus></td></tr>)}</tbody></table></div></section>
  </>;
}
