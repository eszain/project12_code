
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
  type Snapshot,
} from "@/lib/cads/store";

const EMPTY: Snapshot = {
  events: [],
  rules: [],
  alerts: [],
};

export const SCALE_BATCH = 60;

type Doc = {
  name: string;
  content: string;
  label: string;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useCadsSession(
  { stepDelayMs = 900 }: { stepDelayMs?: number } = {}
) {
  const [store] = useState(() => new Store());

  const snap = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY
  );

  const [analysis, setAnalysis] =
    useState<Record<number, EventAnalysis> | null>(null);

  const [status, setStatus] = useState(
    "The table is empty. Press “1. Load data”."
  );

  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const scaleCount = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
    };
  }, []);

  const run = async (
    fn: () => Promise<string> | string
  ) => {
    setBusy(true);
    setNow(Date.now());

    try {
      setStatus(await fn());
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
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

    store.getSnapshot().events.forEach((event) => {
      next[event.id] = analyzeEvent(event, t);
    });

    return next;
  };

  const feedDocuments = async (
    docs: Doc[],
    intro: string
  ) => {
    ensureDefaultRule();

    const ordered = sortByCreation(docs);

    const total = {
      imported: 0,
      duplicate: 0,
      rejected: 0,
    };

    const problems: string[] = [];

    for (let i = 0; i < ordered.length; i++) {
      if (!alive.current) {
        return "Loading stopped.";
      }

      setNow(Date.now());

      setStatus(
        `Loading CDM ${i + 1} of ${ordered.length}: ${ordered[i].name}`
      );

      const report = store.importDocuments([
        ordered[i],
      ]);

      total.imported += report.counts.imported;
      total.duplicate += report.counts.duplicate;
      total.rejected += report.counts.rejected;

      report.records
        .filter((record) => record.status === "rejected")
        .forEach((record) => {
          problems.push(
            `${record.file}: ${record.errors[0] ?? "rejected"}`
          );
        });

      if (i < ordered.length - 1) {
        await sleep(stepDelayMs);
      }
    }

    const rejected = total.rejected
      ? ` ${total.rejected} rejected (${problems.slice(0, 2).join("; ")}${problems.length > 2 ? "; …" : ""}).`
      : "";

    return (
      `Loaded ${total.imported} CDMs one at a time, oldest first ` +
      `(${total.duplicate} repeats ignored).` +
      rejected +
      ` ${intro}`
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
        `Sample dates shifted by ${shiftHours} h so the encounters are upcoming. Now run the risk analysis.`
      );
    });

  const loadFiles = (files: FileList | null) => {
    if (!files?.length) return;

    return run(async () => {
      const docs: Doc[] = await Promise.all(
        Array.from(files).map(async (file) => ({
          name: file.name,
          content: await file.text(),
          label: "uploaded",
        }))
      );

      setAnalysis(null);

      return feedDocuments(
        docs,
        "Dates are used as they are in your files. Now run the risk analysis."
      );
    });
  };

  const addTestEvents = () =>
    run(async () => {
      const docs = await loadScaleDocuments(
        SCALE_BATCH,
        scaleCount.current
      );

      scaleCount.current += SCALE_BATCH;

      ensureDefaultRule();

      store.importDocuments(sortByCreation(docs));

      if (analysis) {
        setAnalysis(analyseAll());
      }

      return (
        `Added ${SCALE_BATCH} generated test events ` +
        `(${docs.length} CDMs) with invented values, ` +
        `to try the layout with many events. ` +
        (analysis
          ? "Risk analysis refreshed."
          : "Run the risk analysis to rate them.")
      );
    });

  const runAnalysis = () =>
    run(() => {
      setAnalysis(analyseAll());

      return store.getSnapshot().events.length
        ? "Risk analysis done: severity is shown for every event. Switch to the Specialist view for the full explanation."
        : "Nothing to analyse yet. Load data first.";
    });

  const reset = (after?: () => void) =>
    run(() => {
      store.reset();
      setAnalysis(null);
      scaleCount.current = 0;
      after?.();

      return "Reset. The table is empty.";
    });

  return {
    store,
    snap,
    analysis,
    status,
    busy,
    now,
    loadData,
    loadFiles,
    addTestEvents,
    runAnalysis,
    reset,
  };
}
