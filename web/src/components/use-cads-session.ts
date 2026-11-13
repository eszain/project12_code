
"use client";

// One CADS session in the browser: the event store,
// risk analysis, and actions that change them.
// Shared by /old-dashboard and /dashboard.

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

import {
  IndexedDbEventPersistence,
} from "@/lib/cads/event-persistence";

const EMPTY: Snapshot = {
  events: [],
  rules: [],
  alerts: [],
};

const eventPersistence = new IndexedDbEventPersistence();

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

  // IndexedDB persistence state.
  const [hydrated, setHydrated] = useState(false);
  const [persistenceError, setPersistenceError] =
    useState(false);

  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  // Manual archive and restore decisions.
  const [archiveOverride, setArchiveOverride] =
    useState<Record<number, boolean>>({});

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

  // Keep the clock updated for the dashboard.
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

  // Restore the previous session from IndexedDB.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        if (typeof indexedDB === "undefined") {
          return;
        }

        const saved = await eventPersistence.load();

        if (cancelled) return;

        if (saved) {
          store.restoreState(saved.store);

          setArchiveOverride(
            saved.archiveOverrides ?? {}
          );

          setStatus("Previous session restored.");
        }
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Failed to restore CADS session:",
            error
          );

          setPersistenceError(true);

          setStatus(
            "Could not restore saved events. Previous data has not been cleared."
          );
        }
      } finally {
        if (!cancelled) {
          setNow(Date.now());
          setHydrated(true);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [store]);

  // Automatically save changes to IndexedDB.
  useEffect(() => {
    if (!hydrated || persistenceError) return;

    // Do not recreate storage after a complete reset.
    if (
      snap.events.length === 0 &&
      snap.rules.length === 0 &&
      snap.alerts.length === 0 &&
      Object.keys(archiveOverride).length === 0
    ) {
      return;
    }

    const state = {
      store: store.exportState(),
      archiveOverrides: { ...archiveOverride },
    };

    // Save sequentially so older writes cannot
    // overwrite newer writes.
    saveQueue.current = saveQueue.current
      .then(() => eventPersistence.save(state))
      .catch((error) => {
        console.error(
          "Failed to save CADS session:",
          error
        );

        setPersistenceError(true);
        setStatus("Could not save dashboard data.");
      });
  }, [
    snap,
    archiveOverride,
    hydrated,
    persistenceError,
    store,
  ]);

  // Run an application action with status handling.
  const run = async (
    fn: () => Promise<string> | string
  ) => {
    setBusy(true);
    setNow(Date.now());

    try {
      setStatus(await fn());
    } catch (error) {
      setStatus(
        `Error: ${(error as Error).message}`
      );
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

  // Load CDMs one at a time in creation order.
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

  // Load bundled sample CDMs.
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

  // Load user-selected CDM files.
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

  // Generate synthetic events for testing scale.
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

  // Analyze all currently loaded events.
  const runAnalysis = () =>
    run(() => {
      setAnalysis(analyseAll());

      return store.getSnapshot().events.length
        ? "Risk analysis done: severity is shown for every event. Switch to the Specialist view for the full explanation."
        : "Nothing to analyse yet. Load data first.";
    });

  // Reset the session and remove saved IndexedDB data.
  const reset = (after?: () => void) =>
    run(async () => {
      if (!hydrated || persistenceError) {
        throw new Error(
          "Storage is not ready. Reset was not performed."
        );
      }

      // Finish all previously queued saves.
      await saveQueue.current;

      // Delete the persistent session.
      await eventPersistence.clear();

      // Reset the in-memory application state.
      store.reset();
      setArchiveOverride({});
      setAnalysis(null);
      scaleCount.current = 0;

      after?.();

      return "Reset. The table is empty.";
    });

  // Expose both the original dashboard API and
  // the new data/persistence functionality.
  return {
    store,
    snap,
    analysis,
    status,
    busy: busy || !hydrated,
    hydrated,
    now,
    loadData,
    loadFiles,
    addTestEvents,
    runAnalysis,
    reset,
    archiveOverride,
    setArchiveOverride,
  };
}
