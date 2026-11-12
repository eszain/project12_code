"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Navigation } from "@/components/navigation";
import { EventSummaryCard } from "./event-summary-card";
import { CalculationDetails } from "./calculation-details";
import { CdmHistory } from "./cdm-history";
import { EncounterPictureCard } from "./encounter-picture";
import { ExplanationCard } from "./explanation-card";
import { SeverityLegend } from "./severity-legend";
import { analyzeEvent, type EventAnalysis } from "@/lib/cads/analyze";
import { loadDemoDocuments, sortByCreation } from "@/lib/cads/demo";
import { CONFIG, Store, latestRevision, type Snapshot } from "@/lib/cads/store";
import { hoursBetween } from "@/lib/cads/time";

const EMPTY: Snapshot = { events: [], rules: [], alerts: [] };
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function CadsApp({ stepDelayMs = 900 }: { stepDelayMs?: number } = {}) {
  const [store] = useState(() => new Store());
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
  const [analysis, setAnalysis] = useState<Record<number, EventAnalysis> | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("The table is empty. Press “1. Load data”.");
  const [busy, setBusy] = useState(false);
  // Operator view: only the key numbers and a one-line call summary. Specialist view: full detail.
  const [view, setView] = useState<"operator" | "specialist">("operator");
  // "Now" lives in state (refreshed by every action) because reading the clock during render is not allowed here.
  const [now, setNow] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = async (fn: () => Promise<string> | string) => {
    setBusy(true);
    setNow(Date.now());
    try {
      setStatus(await fn());
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const ensureDefaultRule = () => {
    if (!store.getSnapshot().rules.length) store.addRule({ name: "Pc >= 1e-4 (CSA action level)", pcMin: CONFIG.pcAction, missDistanceMaxM: null, hoursToTcaMax: null, objectIds: [] });
  };

  // D2: feed the CDMs in creation order, one at a time; each is fully stored (and alert rules evaluated) before the next.
  const loadData = () =>
    run(async () => {
      const { docs, shiftHours } = await loadDemoDocuments();
      ensureDefaultRule();
      setAnalysis(null);
      setSelected(null);
      const ordered = sortByCreation(docs);
      const total = { imported: 0, duplicate: 0, rejected: 0 };
      for (let i = 0; i < ordered.length; i++) {
        if (!alive.current) return "Loading stopped.";
        setNow(Date.now());
        setStatus(`Loading CDM ${i + 1} of ${ordered.length}: ${ordered[i].name}`);
        const r = store.importDocuments([ordered[i]]);
        total.imported += r.counts.imported;
        total.duplicate += r.counts.duplicate;
        total.rejected += r.counts.rejected;
        if (i < ordered.length - 1) await sleep(stepDelayMs);
      }
      return `Loaded ${total.imported} CDMs one at a time, oldest first (${total.duplicate} repeats ignored); sample dates shifted by ${shiftHours} h so the encounters are upcoming. Now run the risk analysis.`;
    });

  const runAnalysis = () =>
    run(() => {
      const now = Date.now();
      const next: Record<number, EventAnalysis> = {};
      store.getSnapshot().events.forEach((e) => (next[e.id] = analyzeEvent(e, now)));
      setAnalysis(next);
      return store.getSnapshot().events.length ? "Risk analysis done: severity is shown for every event. Switch to the Specialist view for the full explanation." : "Nothing to analyse yet. Load data first.";
    });

  const reset = () =>
    run(() => {
      store.reset();
      setAnalysis(null);
      setSelected(null);
      return "Reset. The table is empty.";
    });

  const events = [...snap.events].sort((a, b) => latestRevision(a).cdm.tca - latestRevision(b).cdm.tca);
  const selectedEvent = snap.events.find((e) => e.id === selected) ?? null;

  const cdmCount = snap.events.reduce((n, e) => n + e.revisions.length, 0);
  const actionCount = analysis ? Object.values(analysis).filter((a) => a.severity === "ACTION").length : null;
  const upcoming = events.map((e) => hoursBetween(now, latestRevision(e).cdm.tca)).filter((h) => h >= 0);
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
          <p aria-live="polite" className="console-status">{status}</p>
        </div>

        <section className="summary-grid" aria-label="Event summary">
          <SummaryCard label="Events" value={pad2(snap.events.length)} detail="Encounters grouped from the CDMs" icon="◌" tone="cyan" />
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
          {events.length === 0 ? (
            <div className="dashboard-state">
              <span className="state-symbol" aria-hidden="true">⌁</span>
              <p>Empty. Press “1. Load data”.</p>
            </div>
          ) : (
            <ul aria-label="Event list" className="ops-grid">
              {events.map((e) => (
                <li key={e.id}>
                  <EventSummaryCard event={e} analysis={analysis?.[e.id]} now={now} selected={e.id === selected} view={view} onSelect={() => { setSelected(e.id); setView("specialist"); }} />
                </li>
              ))}
            </ul>
          )}
          {view === "specialist" && snap.events.length > 0 && selected === null && (
            <p className="panel-note">Tip: Press any event card above to open its detailed Explanation below.</p>
          )}
        </section>

        {view === "specialist" && selectedEvent && (
          <>
            <EncounterPictureCard event={selectedEvent} />
            <CdmHistory event={selectedEvent} />
            <ExplanationCard event={selectedEvent} analysis={analysis?.[selectedEvent.id]} now={now} />
            <CalculationDetails event={selectedEvent} />
          </>
        )}

        <div className="console-disclaimer">
          <span aria-hidden="true">◈</span>
          <p><strong>Sample data, not live operational data.</strong> The six SCISAT CDMs are rebuilt from Progress Report 1 and the three CADS TEST CDMs are synthetic. CADS does not issue maneuver commands.</p>
        </div>
      </div>
    </main>
  );
}
