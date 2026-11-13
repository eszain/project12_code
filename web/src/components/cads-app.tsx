"use client";

import { useRef, useState } from "react";

import { Navigation } from "@/components/navigation";
import { EventSummaryCard } from "./event-summary-card";
import { CalculationDetails } from "./calculation-details";
import { ImportReportSheet } from "./import-report-sheet";
import { OriginalCdm } from "./original-cdm";
import { CdmHistory } from "./cdm-history";
import { EncounterPictureCard } from "./encounter-picture";
import { ExplanationCard } from "./explanation-card";
import { SeverityLegend } from "./severity-legend";
import { DEFAULT_FILTERS, PAGE_SIZE, filterAndSort, isArchived, paginate, statusCounts, type RegisterFilters } from "@/lib/cads/register";
import { latestRevision } from "@/lib/cads/store";
import { SCALE_BATCH, useCadsSession } from "./use-cads-session";
import { hoursBetween } from "@/lib/cads/time";

function SummaryCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: string; tone: "cyan" | "amber" | "purple" | "green" }) {
  return (
    <article className={`summary-card summary-${tone}`}>
      <span className="summary-icon" aria-hidden="true">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function CadsApp({ stepDelayMs = 900 }: { stepDelayMs?: number } = {}) {
  const session = useCadsSession({ stepDelayMs });
  const { snap, analysis, status, importReport, busy, now } = session;
  const [reportOpen, setReportOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  // Operator view: only the key numbers and a one-line call summary. Specialist view: full detail.
  const [view, setView] = useState<"operator" | "specialist">("operator");
  const [filters, setFilters] = useState<RegisterFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  // Events the user archived (true) or kept active (false) by hand; otherwise a passed closest approach archives it.
  const { archiveOverride, setArchiveOverride } = session;
  const fileInput = useRef<HTMLInputElement>(null);

  const loadData = () => session.loadData(() => setSelected(null));
  const loadFiles = session.loadFiles;
  const addTestEvents = session.addTestEvents;
  const runAnalysis = session.runAnalysis;
  const reset = () =>
    session.reset(() => {
      setSelected(null);
      setFilters(DEFAULT_FILTERS);
      setPage(1);
      setReportOpen(false);
    });

  const updateFilters = (patch: Partial<RegisterFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const analysed = analysis !== null;
  const counts = statusCounts(snap.events, now, archiveOverride);
  const visible = filterAndSort(snap.events, filters, analysed, now, archiveOverride);
  const pageData = paginate(visible, page);
  const selectedEvent = snap.events.find((e) => e.id === selected) ?? null;

  const cdmCount = snap.events.reduce((n, e) => n + e.revisions.length, 0);
  const actionCount = analysis ? Object.values(analysis).filter((a) => a.severity === "ACTION").length : null;
  const upcoming = snap.events.map((e) => hoursBetween(now, latestRevision(e).cdm.tca)).filter((h) => h >= 0);
  const nextTcaH = upcoming.length ? Math.min(...upcoming) : null;

  return (
    <main className="console-shell">
      <Navigation />
      <div className="console-content dashboard-redesign">
        <header className="console-header">
          <div>
            <p className="eyebrow"><span className="eyebrow-dot" /> OPERATOR DASHBOARD</p>
            <h1>Conjunction Overview</h1>
            <p className="console-intro">Load the sample CDMs, run the risk analysis, and review each encounter.</p>
          </div>
          <div className="console-header-meta">
            <span className="status-badge"><span className="status-badge-dot" aria-hidden="true" />Demo data</span>
            <span>Sample CDMs, not an operational feed</span>
          </div>
        </header>

        <div className="data-banner" role="note">
          <span className="data-banner-icon" aria-hidden="true">i</span>
          <span>
            Severity is rated from the source Pc exactly as reported in each CDM. Recalculated values are experimental and not validated. CADS is decision support only and does not command spacecraft. Everything runs in this browser tab; nothing is stored or sent anywhere.
          </span>
        </div>

        <div className="console-actions">
          <button className="button button-primary" onClick={loadData} disabled={busy}>1. Load data</button>
          <button className="button button-secondary" onClick={runAnalysis} disabled={busy || !snap.events.length}>2. Run risk analysis</button>
          <button className="button button-secondary" onClick={reset} disabled={busy}>Reset</button>
          <button className="button button-tertiary" onClick={() => fileInput.current?.click()} disabled={busy}>Load my own CDM files</button>
          <button className="button button-tertiary" onClick={addTestEvents} disabled={busy}>Add {SCALE_BATCH} test events</button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".json,.kvn,.txt,.xml"
            className="sr-only"
            aria-label="Choose CDM files (JSON or KVN)"
            onChange={(e) => {
              loadFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p aria-live="polite" className="console-status">{status}</p>
          <button type="button" className="button button-tertiary" onClick={() => setReportOpen(true)} disabled={!importReport}>View import report</button>
          <ImportReportSheet report={importReport} open={reportOpen} onOpenChange={setReportOpen} />
        </div>

        <section className="summary-grid" aria-label="Event summary">
          <SummaryCard label="Active events" value={pad2(counts.active)} detail={`${counts.archived} archived`} icon="◌" tone="cyan" />
          <SummaryCard label="Above action level" value={actionCount === null ? "–" : pad2(actionCount)} detail={actionCount === null ? "Shown after the risk analysis" : "Pc of 1 in 10,000 or higher"} icon="!" tone="amber" />
          <SummaryCard label="CDMs loaded" value={pad2(cdmCount)} detail="Loaded one at a time, oldest first" icon="↻" tone="purple" />
          <SummaryCard label="Next closest approach" value={nextTcaH === null ? "–" : `${nextTcaH.toFixed(1)} h`} detail={nextTcaH === null ? "No upcoming encounters" : "Soonest upcoming TCA"} icon="◷" tone="green" />
        </section>

        <SeverityLegend />

        <section aria-label="Events" className="events-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">EVENT REGISTER</p>
              <h2>Tracked Encounters</h2>
            </div>
            <div role="group" aria-label="View" className="view-switch">
              {(["operator", "specialist"] as const).map((v) => (
                <button key={v} className="view-option" aria-pressed={view === v} onClick={() => setView(v)}>
                  {v === "operator" ? "Operator view" : "Specialist view"}
                </button>
              ))}
            </div>
          </div>
          <p className="panel-note">
            {view === "operator" ? "Operator view: the key numbers and a one-line summary for a phone call." : "Specialist view: full detail, history, and explanation."}
          </p>

          {snap.events.length > 0 && (
            <div className="filter-bar register-bar" role="search" aria-label="Filter events">
              <label className="filter-search">
                <span className="sr-only">Search by object name or number</span>
                <span aria-hidden="true">⌕</span>
                <input value={filters.query} onChange={(e) => updateFilters({ query: e.target.value })} placeholder="Search object name or number" />
              </label>
              <div role="group" aria-label="Status" className="view-switch">
                {(["active", "archived"] as const).map((s) => (
                  <button key={s} className="view-option" aria-pressed={filters.status === s} onClick={() => updateFilters({ status: s })}>
                    {s === "active" ? `Active (${counts.active})` : `Archived (${counts.archived})`}
                  </button>
                ))}
              </div>
              <label>
                <span>Severity</span>
                <select value={filters.severity} disabled={!analysed} onChange={(e) => updateFilters({ severity: e.target.value as RegisterFilters["severity"] })}>
                  <option value="all">All</option>
                  <option value="ACTION">Action</option>
                  <option value="WATCH">Watch</option>
                  <option value="LOW">Low</option>
                  <option value="ZERO">Zero</option>
                  <option value="UNKNOWN">Unknown</option>
                </select>
              </label>
              <label>
                <span>Sort</span>
                <select value={filters.sort} onChange={(e) => updateFilters({ sort: e.target.value as RegisterFilters["sort"] })}>
                  <option value="tca">Closest approach: soonest first</option>
                  <option value="risk" disabled={!analysed}>Collision chance: highest first</option>
                </select>
              </label>
              <label className="check-filter">
                <input type="checkbox" checked={filters.attentionOnly} disabled={!analysed} onChange={(e) => updateFilters({ attentionOnly: e.target.checked })} />
                <span>Needs attention only</span>
              </label>
              {!analysed && <p className="panel-note filter-hint">Severity filters and sorting by risk turn on after “2. Run risk analysis”.</p>}
            </div>
          )}

          {snap.events.length === 0 ? (
            <div className="dashboard-state">
              <span className="state-symbol" aria-hidden="true">⌁</span>
              <p>Empty. Press “1. Load data”.</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="dashboard-state">
              <span className="state-symbol" aria-hidden="true">⌕</span>
              <p>
                No {filters.status} events match these filters.
                {filters.status === "active" && counts.archived > 0 && ` ${counts.archived} archived event${counts.archived === 1 ? "" : "s"} (closest approach already passed): open the Archived tab.`}
              </p>
            </div>
          ) : (
            <>
              <ul aria-label="Event list" className="ops-grid">
                {pageData.items.map((e) => {
                  const archived = isArchived(e, now, archiveOverride);
                  return (
                    <li key={e.id}>
                      <EventSummaryCard
                        event={e}
                        analysis={analysis?.[e.id]}
                        now={now}
                        selected={e.id === selected}
                        view={view}
                        archived={archived}
                        onToggleArchive={() => setArchiveOverride((o) => ({ ...o, [e.id]: !archived }))}
                        onSelect={() => { setSelected(e.id); setView("specialist"); }}
                      />
                    </li>
                  );
                })}
              </ul>
              <nav className="pager" aria-label="Pages of events">
                <span>Showing {(pageData.page - 1) * PAGE_SIZE + 1}–{(pageData.page - 1) * PAGE_SIZE + pageData.items.length} of {pageData.total}</span>
                <button className="view-option pager-button" onClick={() => setPage(pageData.page - 1)} disabled={pageData.page <= 1}>Previous</button>
                <span aria-current="page">Page {pageData.page} of {pageData.pages}</span>
                <button className="view-option pager-button" onClick={() => setPage(pageData.page + 1)} disabled={pageData.page >= pageData.pages}>Next</button>
              </nav>
            </>
          )}
          {view === "specialist" && snap.events.length > 0 && selected === null && (
            <p className="panel-note">Tip: Press any event card above to open its detailed Explanation below.</p>
          )}
        </section>

        {view === "specialist" && selectedEvent && (
          <>
            <EncounterPictureCard event={selectedEvent} />
            <CdmHistory event={selectedEvent} />
            <OriginalCdm raw={latestRevision(selectedEvent).cdm.raw} />
            <ExplanationCard event={selectedEvent} analysis={analysis?.[selectedEvent.id]} now={now} />
            <CalculationDetails event={selectedEvent} />
          </>
        )}

        <div className="console-disclaimer">
          <span aria-hidden="true">◈</span>
          <p><strong>Sample data, not live operational data.</strong> The six SCISAT CDMs are rebuilt from Progress Report 1 and the three CADS TEST CDMs are synthetic. Events named SAMPLE SAT are generated test events with invented values. CADS does not issue maneuver commands.</p>
        </div>
      </div>
    </main>
  );
}
