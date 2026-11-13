
"use client";

// One CADS session in the browser: the event store, the risk analysis and the actions that change them.
// Shared by the full dashboard (/old-dashboard) and the new visual dashboard (/dashboard), so loading,
// analysis and reset behave the same in both. UI-only state (selection, filters, views) stays in each page.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { analyzeEvent, type EventAnalysis } from "@/lib/cads/analyze";
import { loadDemoDocuments, loadScaleDocuments, sortByCreation } from "@/lib/cads/demo";
import { IndexedDbEventPersistence } from "@/lib/cads/event-persistence";
import {
  CONFIG,
  Store,
  type AlertRule,
  type ImportReport,
  type RecordOutcome,
  type Snapshot,
} from "@/lib/cads/store";

const EMPTY: Snapshot = { events: [], rules: [], alerts: [] };
const eventPersistence = new IndexedDbEventPersistence();
export const SCALE_BATCH = 60;

type Doc = { name: string; content: string; label: string };

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useCadsSession(
  { stepDelayMs = 900 }: { stepDelayMs?: number } = {}
) {
  const [store] = useState(() => new Store());

  const [hydrated, setHydrated] = useState(false);
  const [persistenceError, setPersistenceError] = useState(false);

  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  // User actions can wait for restoration without disabling the buttons.
  const hydrationTask = useRef<Promise<void>>(Promise.resolve());
  const hydratedRef = useRef(false);

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

  const [importReport, setImportReport] =
    useState<ImportReport | null>(null);

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
        if (typeof indexedDB === "undefined") return;

        const saved = await eventPersistence.load();

        if (cancelled) return;

        if (saved) {
          store.restoreState(saved.store);
          setArchiveOverride(saved.archiveOverrides ?? {});
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
          hydratedRef.current = true;
          setNow(Date.now());
          setHydrated(true);
        }
      }
    }

    hydrationTask.current = restoreSession();

    return () => {
      cancelled = true;
    };
  }, [store]);

  // Save every change to IndexedDB.
  useEffect(() => {
    if (!hydrated || persistenceError) return;

    if (
      snap.events.length === 0 &&
      snap.rules.length === 0 &&
      snap.alerts.length === 0 &&
      (snap.ruleChanges?.length ?? 0) === 0 &&
      Object.keys(archiveOverride).length === 0
    ) {
      return;
    }

    const state = {
      store: store.exportState(),
      archiveOverrides: { ...archiveOverride },
    };

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

  const run = async (
    fn: () => Promise<string> | string
  ) => {
    setBusy(true);

    try {
      // Wait for IndexedDB restoration before changing store data.
      await hydrationTask.current;

      if (!alive.current) return;

      setNow(Date.now());
      setStatus(await fn());
    } catch (error) {
      setStatus(
        `Error: ${(error as Error).message}`
      );
    } finally {
      if (alive.current) {
        setBusy(false);
      }
    }
  };

  const ensureDefaultRule = () => {
    const snapshot = store.getSnapshot();

    if (
      !snapshot.rules.length &&
      !(snapshot.ruleChanges?.length)
    ) {
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
    const time = Date.now();
    const next: Record<number, EventAnalysis> = {};

    store.getSnapshot().events.forEach((event) => {
      next[event.id] = analyzeEvent(event, time);
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

    const records: RecordOutcome[] = [];
    const pauseEach = ordered.length <= 12;

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

      records.push(...report.records);

      if (i < ordered.length - 1) {
        if (pauseEach) {
          if (stepDelayMs > 0) {
            await sleep(stepDelayMs);
          }
        } else if ((i + 1) % 20 === 0) {
          await sleep(0);
        }
      }
    }

    setImportReport({
      records,
      counts: total,
    });

    return (
      `Loaded ${total.imported} CDMs one at a time, oldest first ` +
      `(${total.duplicate} repeats, ${total.rejected} rejected). ${intro}`
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

      const hadAnalysis = analysis !== null;

      const summary = await feedDocuments(
        docs,
        `Added ${SCALE_BATCH} generated test events (${docs.length} CDMs) with invented values, to try the layout with many events. ${
          hadAnalysis
            ? "Risk analysis refreshed."
            : "Run the risk analysis to rate them."
        }`
      );

      if (hadAnalysis) {
        setAnalysis(analyseAll());
      }

      return summary;
    });

  const runAnalysis = () =>
    run(() => {
      setAnalysis(analyseAll());

      return store.getSnapshot().events.length
        ? "Risk analysis done: severity is shown for every event. Switch to the Specialist view for the full explanation."
        : "Nothing to analyse yet. Load data first.";
    });

  const reset = (after?: () => void) =>
    run(async () => {
      if (
        !hydratedRef.current ||
        persistenceError
      ) {
        throw new Error(
          "Storage is not ready. Reset was not performed."
        );
      }

      await saveQueue.current;
      await eventPersistence.clear();

      store.reset();

      setArchiveOverride({});
      setAnalysis(null);
      setImportReport(null);

      scaleCount.current = 0;

      after?.();

      return "Reset. The table is empty.";
    });

  const pauseNotifications = (
    eventId: number,
    mode: "mute" | "snooze",
    reason: string,
    resumeAt: number | null
  ) => {
    store.pauseNotifications(
      eventId,
      mode,
      reason,
      resumeAt
    );

    setNow(Date.now());
  };

  const resumeNotifications = (
    eventId: number
  ) => {
    store.resumeNotifications(eventId);
    setNow(Date.now());
  };

  // Automatically expire snoozes without requiring user interaction.
  useEffect(() => {
    if (!hydrated) return;

    const timer = window.setInterval(() => {
      const time = Date.now();

      store.expireSnoozes(time);
      setNow(time);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [hydrated, store]);

  const createRule = (
    rule: Omit<AlertRule, "id">
  ) => store.addRule(rule);

  const updateRule = (
    id: number,
    rule: Omit<AlertRule, "id">
  ) => store.updateRule(id, rule);

  const deleteRule = (id: number) =>
    store.deleteRule(id);

  return {
    createRule,
    updateRule,
    deleteRule,
    pauseNotifications,
    resumeNotifications,
    snap,
    analysis,
    status,
    importReport,
    busy,
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
