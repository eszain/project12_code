"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { GradientBackground } from "@/components/animate-ui/backgrounds/gradient";
import { LiquidButton } from "@/components/animate-ui/buttons/liquid";
import {
  ThemeTogglerButton,
  ThemeTogglerButtonIcon,
  type Resolved,
  type ThemeSelection,
} from "@/components/animate-ui/buttons/theme-toggler";
import { EventSummaryCard } from "./event-summary-card";
import { Button } from "@/components/ui/button";
import { CdmHistory } from "./cdm-history";
import { ExplanationCard } from "./explanation-card";
import { analyzeEvent, type EventAnalysis } from "@/lib/cads/analyze";
import { loadDemoDocuments, sortByCreation } from "@/lib/cads/demo";
import { CONFIG, Store, latestRevision, type Snapshot } from "@/lib/cads/store";

const EMPTY: Snapshot = { events: [], rules: [], alerts: [] };
function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <ThemeTogglerButton
      variant="outline"
      theme={(theme as ThemeSelection) ?? "system"}
      resolvedTheme={(resolvedTheme as Resolved) ?? "light"}
      setTheme={setTheme}
      aria-label="Switch colour theme (light, dark, system)"
      title="Switch colour theme"
    >
      <ThemeTogglerButtonIcon light={<Sun />} dark={<Moon />} system={<Monitor />} />
    </ThemeTogglerButton>
  );
}

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

  return (
    <>
      <GradientBackground className="fixed inset-0 -z-10 from-sky-100 via-indigo-50 to-slate-100 opacity-70 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-900 dark:opacity-100" />
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="mr-auto text-lg font-semibold">CADS · Conjunction decision support</h1>
          <LiquidButton onClick={loadData} disabled={busy}>1. Load data</LiquidButton>
          <LiquidButton onClick={runAnalysis} disabled={busy || !snap.events.length}>2. Run risk analysis</LiquidButton>
          <LiquidButton onClick={reset} disabled={busy}>Reset</LiquidButton>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-4">
        <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Severity is rated from the source Pc exactly as reported in each CDM. Recalculated values are experimental and not validated. CADS is decision support only and does not command spacecraft. Everything runs in this browser tab; nothing is stored or sent anywhere.
        </p>
        <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{status}</p>

        <section aria-label="Events" className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-base font-semibold">Events</h2>
            <div role="group" aria-label="View" className="flex gap-1">
              {(["operator", "specialist"] as const).map((v) => (
                <Button key={v} variant={view === v ? "default" : "outline"} aria-pressed={view === v} onClick={() => setView(v)}>
                  {v === "operator" ? "Operator view" : "Specialist view"}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {view === "operator" ? "Operator view: the key numbers and a one-line summary for a phone call." : "Specialist view: full detail, history, and explanation."}
          </p>
          {events.length === 0 ? (
            <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Empty. Press “1. Load data”.</p>
          ) : (
            <ul aria-label="Event list" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {events.map((e) => (
                <li key={e.id}>
                  <EventSummaryCard event={e} analysis={analysis?.[e.id]} now={now} selected={e.id === selected} view={view} onSelect={() => { setSelected(e.id); setView("specialist"); }} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {view === "specialist" && snap.events.length > 0 && selected === null && (
          <p className="text-xs text-muted-foreground italic px-1">
            Tip: Press any event card above to open its detailed Explanation below.
          </p>
        )}

        {view === "specialist" && selectedEvent && (
          <>
            <CdmHistory event={selectedEvent} />
            <ExplanationCard event={selectedEvent} analysis={analysis?.[selectedEvent.id]} now={now} />
          </>
        )}
      </main>
    </>
  );
}
