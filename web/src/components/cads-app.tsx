"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";

import { GradientBackground } from "@/components/animate-ui/backgrounds/gradient";
import { LiquidButton } from "@/components/animate-ui/buttons/liquid";
import {
  ThemeTogglerButton,
  ThemeTogglerButtonIcon,
  type Resolved,
  type ThemeSelection,
} from "@/components/animate-ui/buttons/theme-toggler";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExplanationCard } from "./explanation-card";
import { analyzeEvent, formatShortOdds, type EventAnalysis } from "@/lib/cads/analyze";
import { loadDemoDocuments } from "@/lib/cads/demo";
import { CONFIG, Store, latestRevision, type Severity, type Snapshot } from "@/lib/cads/store";
import { hoursBetween, isoZ } from "@/lib/cads/time";

const EMPTY: Snapshot = { events: [], rules: [], alerts: [] };
const SEVERITY_STYLE: Record<Severity, { variant: "destructive" | "secondary" | "outline"; className?: string }> = {
  ACTION: { variant: "destructive" },
  WATCH: { variant: "secondary", className: "bg-amber-500/20 text-amber-700 dark:text-amber-300" },
  LOW: { variant: "outline" },
  ZERO: { variant: "outline" },
  UNKNOWN: { variant: "outline" },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <Badge variant={s.variant} className={s.className}>
      {severity}
    </Badge>
  );
}

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

const fmtHours = (h: number) => (h >= 0 ? `${h.toFixed(1)} h` : `${(-h).toFixed(1)} h ago`);

export function CadsApp() {
  const [store] = useState(() => new Store());
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
  const [analysis, setAnalysis] = useState<Record<number, EventAnalysis> | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("The table is empty. Press “1. Load data”.");
  const [busy, setBusy] = useState(false);
  // "Now" lives in state (refreshed by every action) because reading the clock during render is not allowed here.
  const [now, setNow] = useState(0);

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

  const loadData = () =>
    run(async () => {
      const { docs, shiftHours } = await loadDemoDocuments();
      ensureDefaultRule();
      const r = store.importDocuments(docs);
      setAnalysis(null);
      setSelected(null);
      return `Loaded ${r.counts.imported} CDMs (${r.counts.duplicate} repeats ignored); sample dates shifted by ${shiftHours} h so the encounters are upcoming. Now run the risk analysis.`;
    });

  const runAnalysis = () =>
    run(() => {
      const now = Date.now();
      const next: Record<number, EventAnalysis> = {};
      store.getSnapshot().events.forEach((e) => (next[e.id] = analyzeEvent(e, now)));
      setAnalysis(next);
      return store.getSnapshot().events.length ? "Risk analysis done: severity is shown for every event. Click any row to view its explanation below." : "Nothing to analyse yet. Load data first.";
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

        <Card>
          <CardHeader><CardTitle>Events</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Objects</TableHead><TableHead>TCA (UTC)</TableHead><TableHead>To TCA</TableHead><TableHead>Collision Risk (Pc)</TableHead>
                  <TableHead>Miss (m)</TableHead><TableHead>CDMs</TableHead><TableHead>Data</TableHead><TableHead>Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-muted-foreground">Empty. Press “1. Load data”.</TableCell></TableRow>
                )}
                {events.map((e) => {
                  const c = latestRevision(e).cdm;
                  const a = analysis?.[e.id];
                  return (
                    <TableRow key={e.id} data-state={e.id === selected ? "selected" : undefined} className="cursor-pointer" onClick={() => setSelected(e.id)}>
                      <TableCell>
                        <button className="text-left font-medium underline-offset-2 hover:underline focus-visible:underline" onClick={() => setSelected(e.id)}>
                          {c.sat1.name ?? c.sat1.designator} / {c.sat2.name ?? c.sat2.designator}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{isoZ(c.tca)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtHours(hoursBetween(now, c.tca))}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="text-xs font-medium">
                          {c.pc === null ? (
                            <span className="text-muted-foreground">not provided</span>
                          ) : c.pc === 0 ? (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">0% (0 risk)</span>
                          ) : (
                            <span>{formatShortOdds(c.pc)}</span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">{c.pcRaw ?? ""}</div>
                      </TableCell>
                      <TableCell>{c.missDistanceM.toFixed(0)}</TableCell>
                      <TableCell>{e.revisions.length}</TableCell>
                      <TableCell className="space-x-1">{[...new Set(e.revisions.map((r) => r.sourceLabel))].map((l) => <Badge key={l} variant="outline">{l}</Badge>)}</TableCell>
                      <TableCell>{a ? <SeverityBadge severity={a.severity} /> : <span className="italic text-muted-foreground">run risk analysis</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {snap.events.length > 0 && selected === null && (
          <p className="text-xs text-muted-foreground italic px-1">
            Tip: Press any row in the table above to open its detailed Explanation below.
          </p>
        )}

        {selectedEvent && (
          <ExplanationCard event={selectedEvent} analysis={analysis?.[selectedEvent.id]} now={now} />
        )}
      </main>
    </>
  );
}
