
"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  analyzeEvent,
  type EventAnalysis,
} from "@/lib/cads/analyze";

import {
  loadDemoDocuments,
  loadScaleDocuments,
  sortByCreation,
} from "@/lib/cads/demo";

import {
  CONFIG,
  Store,
  type AlertRule,
  type ImportReport,
  type RecordOutcome,
  type Snapshot,
} from "@/lib/cads/store";

const EMPTY: Snapshot = {
  events: [],
  rules: [],
  alerts: [],
  ruleChanges: [],
};

export const SCALE_BATCH = 60;

type Doc = {
  name: string;
  content: string;
  label: string;
};

const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

export function useCadsSession({
  stepDelayMs = 900,
}: {
  stepDelayMs?: number;
} = {}) {
  const [store] = useState(() => new Store());

  const snap = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY,
  );

  const [analysis, setAnalysis] =
    useState<Record<number, EventAnalysis> | null>(null);

  const [status, setStatus] = useState(
    "The table is empty. Press “1. Load data”.",
  );

  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);

  const scaleCount = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
    };
  }, []);

  const run = async (
    fn: () => Promise<string> | string,
  ) => {
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
    if (!store.getSnapshot().rules.length) {
      store.addRule({
        name: "Pc >= 1e-4 (CSA action level)",
        pcMin: CONFIG.pcAction,
        missDistanceMaxM: null,
        hoursToTcaMax: null,
        objectIds: [],
      });
    }
  };

  const analyseAll = () => {
    const t = Date.now();
    const next: Record<number, EventAnalysis> = {};

    store.getSnapshot().events.forEach((e) => {
      next[e.id] = analyzeEvent(e, t);
    });

    return next;
  };

  const feedDocuments = async (
    docs: Doc[],
    intro: string,
  ) => {
    ensureDefaultRule();

    const ordered = sortByCreation(docs);

    const total = {
      imported: 0,
      duplicate: 0,
      rejected: 0,
    };
    const records: RecordOutcome[] = [];
    // The nine-file demo pauses between messages. Larger loads stay in the same order
    // but yield every batch so the status line can update without a long pause.
    const pauseEach = ordered.length <= 12;

    for (let i = 0; i < ordered.length; i++) {
      if (!alive.current) {
        return "Loading stopped.";
      }

      setNow(Date.now());

      setStatus(
        `Loading CDM ${i + 1} of ${ordered.length}: ${ordered[i].name}`,
      );

      const r = store.importDocuments([ordered[i]]);

      total.imported += r.counts.imported;
      total.duplicate += r.counts.duplicate;
      total.rejected += r.counts.rejected;
      records.push(...r.records);

      if (i < ordered.length - 1) {
        if (pauseEach) {
          if (stepDelayMs > 0) await sleep(stepDelayMs);
        } else if ((i + 1) % 20 === 0) {
          await sleep(0);
        }
      }
    }

    setImportReport({ records, counts: total });

    return (
      `Loaded ${total.imported} CDMs one at a time, ` +
      `oldest first (${total.duplicate} repeats, ${total.rejected} rejected). ${intro}`
    );
  };

  const loadData = (before?: () => void) =>
    run(async () => {
      const { docs, shiftHours } =
        await loadDemoDocuments();

      setAnalysis(null);
      before?.();

      return feedDocuments(
        docs,
        `Sample dates shifted by ${shiftHours} h ` +
          "so the encounters are upcoming. " +
          "Now run the risk analysis.",
      );
    });

  const loadFiles = (files: FileList | null) => {
    if (!files?.length) return;

    return run(async () => {
      const docs: Doc[] = await Promise.all(
        Array.from(files).map(async (f) => ({
          name: f.name,
          content: await f.text(),
          label: "uploaded",
        })),
      );

      setAnalysis(null);

      return feedDocuments(
        docs,
        "Dates are used as they are in your files. " +
          "Now run the risk analysis.",
      );
    });
  };

  const addTestEvents = () =>
    run(async () => {
      const docs = await loadScaleDocuments(
        SCALE_BATCH,
        scaleCount.current,
      );

      scaleCount.current += SCALE_BATCH;

      const hadAnalysis = analysis !== null;
      const summary = await feedDocuments(
        docs,
        `Added ${SCALE_BATCH} generated test events ` +
          `(${docs.length} CDMs) with invented values. ` +
          (hadAnalysis
            ? "Risk analysis refreshed."
            : "Run the risk analysis to rate them."),
      );

      if (hadAnalysis) setAnalysis(analyseAll());

      return summary;
    });

  const runAnalysis = () =>
    run(() => {
      setAnalysis(analyseAll());

      return store.getSnapshot().events.length
        ? "Risk analysis done: severity is shown for every event. " +
            "Switch to the Specialist view for the full explanation."
        : "Nothing to analyse yet. Load data first.";
    });

  const reset = (after?: () => void) =>
    run(() => {
      store.reset();
      setAnalysis(null);
      setImportReport(null);
      scaleCount.current = 0;

      after?.();

      return "Reset. The table is empty.";
    });

  const createRule = (
    input: Omit<AlertRule, "id">,
  ) => store.addRule(input);

  const updateRule = (
    id: number,
    input: Omit<AlertRule, "id">,
  ) => store.updateRule(id, input);

  const deleteRule = (id: number) =>
    store.deleteRule(id);

  return {
    snap,
    analysis,
    status,
    importReport,
    busy,
    now,
    loadData,
    loadFiles,
    addTestEvents,
    runAnalysis,
    reset,
    createRule,
    updateRule,
    deleteRule,
  };
}
