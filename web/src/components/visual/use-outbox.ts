
"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import type { AlertOccurrence } from "@/lib/cads/store";

import {
  deliverOutbox,
  enqueueAlerts,
  retryOutbox,
  synchronizeOutbox,
  type OutboxEntry,
} from "@/lib/cads/outbox";

const STORAGE_KEY = "cads-outbox-v1";
const LEGACY_STORAGE_KEY = "cads-demo-outbox-v1";

const EMPTY_ENTRIES: OutboxEntry[] = [];

function isOutboxEntry(value: unknown): value is OutboxEntry {
  if (!value || typeof value !== "object") return false;

  const entry = value as Partial<OutboxEntry>;

  return (
    typeof entry.id === "string" &&
    typeof entry.alertId === "number" &&
    typeof entry.eventId === "number" &&
    typeof entry.ruleName === "string" &&
    typeof entry.attempts === "number" &&
    typeof entry.createdAt === "number" &&
    typeof entry.updatedAt === "number" &&
    Array.isArray(entry.logs) &&
    (
      entry.status === "pending" ||
      entry.status === "sent" ||
      entry.status === "failed" ||
      entry.status === "suppressed"
    )
  );
}

function readOutbox(): OutboxEntry[] {
  const saved =
    window.localStorage.getItem(STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_STORAGE_KEY);

  if (!saved) return [];

  const parsed: unknown = JSON.parse(saved);

  if (!Array.isArray(parsed)) return [];

  const seen = new Set<number>();

  return parsed
    .filter(isOutboxEntry)
    .map((entry) => ({
      ...entry,
      id: `local:alert:${entry.alertId}`,
      channel: "local" as const,
    }))
    .filter((entry) => {
      if (seen.has(entry.alertId)) return false;

      seen.add(entry.alertId);
      return true;
    });
}

class OutboxStore {
  private entries: OutboxEntry[] = EMPTY_ENTRIES;
  private listeners = new Set<() => void>();
  private initialized = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.entries;

  getServerSnapshot = () => EMPTY_ENTRIES;

  private publish(next: OutboxEntry[]) {
    if (next === this.entries) return;

    this.entries = next;

    for (const listener of this.listeners) {
      listener();
    }
  }

  private persist() {
    if (!this.initialized) return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(this.entries),
      );

      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (error) {
      console.error("Could not save outbox", error);
    }
  }

  initialize() {
    if (this.initialized) return;

    this.initialized = true;

    try {
      this.publish(readOutbox());
    } catch (error) {
      console.error("Could not restore outbox", error);
      this.publish([]);
    }
  }

  synchronize(
    alerts: AlertOccurrence[],
    pausedEventIds: ReadonlySet<number>,
  ) {
    if (!this.initialized) return;

    const time = Date.now();

    const synchronized = synchronizeOutbox(
      this.entries,
      alerts,
      pausedEventIds,
      time,
    );

    const next = enqueueAlerts(
      synchronized,
      alerts,
      pausedEventIds,
      time,
    );

    const unchanged =
      next.length === this.entries.length &&
      next.every(
        (entry, index) => entry === this.entries[index],
      );

    if (unchanged) return;

    this.publish(next);
    this.persist();
  }

  deliver(
    id: string,
    fail: boolean,
    pausedEventIds: ReadonlySet<number>,
  ) {
    const next = deliverOutbox(
      this.entries,
      id,
      Date.now(),
      fail,
      pausedEventIds,
    );

    this.publish(next);
    this.persist();
  }

  retry(
    id: string,
    pausedEventIds: ReadonlySet<number>,
  ) {
    const next = retryOutbox(
      this.entries,
      id,
      Date.now(),
      pausedEventIds,
    );

    this.publish(next);
    this.persist();
  }

  clear() {
    this.publish([]);

    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (error) {
      console.error("Could not clear outbox", error);
    }
  }
}

const outboxStore = new OutboxStore();

export function useOutbox(
  alerts: AlertOccurrence[],
  pausedEventIds: ReadonlySet<number>,
  ready: boolean,
) {
  const entries = useSyncExternalStore(
    outboxStore.subscribe,
    outboxStore.getSnapshot,
    outboxStore.getServerSnapshot,
  );

  const [simulateFailure, setSimulateFailure] =
    useState(false);

  useEffect(() => {
    if (!ready) return;

    outboxStore.initialize();
    outboxStore.synchronize(alerts, pausedEventIds);
  }, [ready, alerts, pausedEventIds]);

  const deliver = useCallback(
    (id: string) => {
      outboxStore.deliver(
        id,
        simulateFailure,
        pausedEventIds,
      );
    },
    [simulateFailure, pausedEventIds],
  );

  const retry = useCallback(
    (id: string) => {
      outboxStore.retry(id, pausedEventIds);
    },
    [pausedEventIds],
  );

  const clear = useCallback(() => {
    outboxStore.clear();
  }, []);

  return {
    entries,
    deliver,
    retry,
    clear,
    simulateFailure,
    setSimulateFailure,
  };
}
