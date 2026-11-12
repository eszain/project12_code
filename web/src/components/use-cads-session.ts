"use client";

// One CADS session in the browser: the event store, the risk analysis and the actions that change them.
// Shared by the full dashboard (/old-dashboard) and the new visual dashboard (/dashboard), so loading,
// analysis and reset behave the same in both. UI-only state (selection, filters, views) stays in each page.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { analyzeEvent, type EventAnalysis } from "@/lib/cads/analyze";
import { loadDemoDocuments, loadScaleDocuments, sortByCreation } from "@/lib/cads/demo";
import { CONFIG, Store, type Snapshot } from "@/lib/cads/store";

const EMPTY: Snapshot = { events: [], rules: [], alerts: [] };
export const SCALE_BATCH = 60;

type Doc = { name: string; content: string; label: string };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useCadsSession({ stepDelayMs = 900 }: { stepDelayMs?: number } = {}) {
  const [store] = useState(() => new Store());
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
  const [analysis, setAnalysis] = useState<Record<number, EventAnalysis> | null>(null);
  const [status, setStatus] = useState("The table is empty. Press “1. Load data”.");
  const [busy, setBusy] = useState(false);
  // "Now" lives in state (refreshed by every action) because reading the clock during render is not allowed here.
  const [now, setNow] = useState(0);
  const scaleCount = useRef(0);
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

  const analyseAll = () => {
    const t = Date.now();
    const next: Record<number, EventAnalysis> = {};
    store.getSnapshot().events.forEach((e) => (next[e.id] = analyzeEvent(e, t)));
    return next;
  };

  // D2: feed the CDMs in creation order, one at a time; each is fully stored (and alert rules evaluated) before the next.
  const feedDocuments = async (docs: Doc[], intro: string) => {
    ensureDefaultRule();
    const ordered = sortByCreation(docs);
    const total = { imported: 0, duplicate: 0, rejected: 0 };
    const problems: string[] = [];
    for (let i = 0; i < ordered.length; i++) {
      if (!alive.current) return "Loading stopped.";
      setNow(Date.now());
      setStatus(`Loading CDM ${i + 1} of ${ordered.length}: ${ordered[i].name}`);
      const r = store.importDocuments([ordered[i]]);
      total.imported += r.counts.imported;
      total.duplicate += r.counts.duplicate;
      total.rejected += r.counts.rejected;
      r.records.filter((x) => x.status === "rejected").forEach((x) => problems.push(`${x.file}: ${x.errors[0] ?? "rejected"}`));
      if (i < ordered.length - 1) await sleep(stepDelayMs);
    }
    const rejected = total.rejected ? ` ${total.rejected} rejected (${problems.slice(0, 2).join("; ")}${problems.length > 2 ? "; …" : ""}).` : "";
    return `Loaded ${total.imported} CDMs one at a time, oldest first (${total.duplicate} repeats ignored).${rejected} ${intro}`;
  };

  /** Load the bundled sample CDMs. `before` runs first (for example to clear the page's selection). */
  const loadData = (before?: () => void) =>
    run(async () => {
      const { docs, shiftHours } = await loadDemoDocuments();
      setAnalysis(null);
      before?.();
      return feedDocuments(docs, `Sample dates shifted by ${shiftHours} h so the encounters are upcoming. Now run the risk analysis.`);
    });

  /** E2: the same one-at-a-time loading for CDM files chosen by the user (JSON or CCSDS KVN). */
  const loadFiles = (files: FileList | null) => {
    if (!files?.length) return;
    return run(async () => {
      const docs: Doc[] = await Promise.all(Array.from(files).map(async (f) => ({ name: f.name, content: await f.text(), label: "uploaded" })));
      setAnalysis(null);
      return feedDocuments(docs, "Dates are used as they are in your files. Now run the risk analysis.");
    });
  };

  /** G5: add generated test events (invented values) so a layout can be tried with many events. */
  const addTestEvents = () =>
    run(async () => {
      const docs = await loadScaleDocuments(SCALE_BATCH, scaleCount.current);
      scaleCount.current += SCALE_BATCH;
      ensureDefaultRule();
      store.importDocuments(sortByCreation(docs));
      if (analysis) setAnalysis(analyseAll());
      return `Added ${SCALE_BATCH} generated test events (${docs.length} CDMs) with invented values, to try the layout with many events. ${analysis ? "Risk analysis refreshed." : "Run the risk analysis to rate them."}`;
    });

  const runAnalysis = () =>
    run(() => {
      setAnalysis(analyseAll());
      return store.getSnapshot().events.length ? "Risk analysis done: severity is shown for every event. Switch to the Specialist view for the full explanation." : "Nothing to analyse yet. Load data first.";
    });

  /** Clear everything. `after` lets the page clear its own state (selection, filters). */
  const reset = (after?: () => void) =>
    run(() => {
      store.reset();
      setAnalysis(null);
      scaleCount.current = 0;
      after?.();
      return "Reset. The table is empty.";
    });

  return { snap, analysis, status, busy, now, loadData, loadFiles, addTestEvents, runAnalysis, reset };
}
