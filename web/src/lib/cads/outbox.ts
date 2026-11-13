
import type { AlertOccurrence } from "./store";

export type DeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "suppressed";

export type DeliveryLog = {
  at: number;
  status: DeliveryStatus;
  detail: string;
};

export type OutboxEntry = {
  id: string;
  alertId: number;
  eventId: number;
  ruleName: string;
  channel: "local";
  status: DeliveryStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  logs: DeliveryLog[];
};

export function enqueueAlerts(
  entries: OutboxEntry[],
  alerts: AlertOccurrence[],
  pausedEventIds: ReadonlySet<number>,
  at: number,
): OutboxEntry[] {
  const known = new Set(entries.map((entry) => entry.id));
  const next = [...entries];

  for (const alert of alerts) {
    if (alert.superseded) continue;

    const id = `local:alert:${alert.id}`;

    if (known.has(id)) continue;

    known.add(id);

    const suppressed = pausedEventIds.has(alert.eventId);

    const status: DeliveryStatus = suppressed
      ? "suppressed"
      : "pending";

    next.unshift({
      id,
      alertId: alert.id,
      eventId: alert.eventId,
      ruleName: alert.ruleName,
      channel: "local",
      status,
      attempts: 0,
      createdAt: at,
      updatedAt: at,
      logs: [
        {
          at,
          status,
          detail: suppressed
            ? "Event muted or snoozed at enqueue time"
            : "Queued for local delivery",
        },
      ],
    });
  }

  return next;
}

export function deliverOutbox(
  entries: OutboxEntry[],
  id: string,
  at: number,
  fail = false,
  pausedEventIds: ReadonlySet<number> = new Set<number>(),
): OutboxEntry[] {
  return entries.map((entry) => {
    if (
      entry.id !== id ||
      entry.status !== "pending"
    ) {
      return entry;
    }

    if (pausedEventIds.has(entry.eventId)) {
      return {
        ...entry,
        status: "suppressed" as const,
        updatedAt: at,
        logs: [
          {
            at,
            status: "suppressed" as const,
            detail: "Event notifications are currently paused",
          },
          ...entry.logs,
        ],
      };
    }

    const status: DeliveryStatus = fail
      ? "failed"
      : "sent";

    return {
      ...entry,
      status,
      attempts: entry.attempts + 1,
      updatedAt: at,
      logs: [
        {
          at,
          status,
          detail: fail
            ? "Simulated delivery failure"
            : "Recorded in local channel (no external message sent)",
        },
        ...entry.logs,
      ],
    };
  });
}

export function retryOutbox(
  entries: OutboxEntry[],
  id: string,
  at: number,
  pausedEventIds: ReadonlySet<number> = new Set<number>(),
): OutboxEntry[] {
  return entries.map((entry) => {
    if (
      entry.id !== id ||
      entry.status !== "failed"
    ) {
      return entry;
    }

    const suppressed = pausedEventIds.has(entry.eventId);

    const status: DeliveryStatus = suppressed
      ? "suppressed"
      : "pending";

    return {
      ...entry,
      status,
      updatedAt: at,
      logs: [
        {
          at,
          status,
          detail: suppressed
            ? "Retry suppressed because event notifications are paused"
            : "Manually queued for retry",
        },
        ...entry.logs,
      ],
    };
  });
}

export function synchronizeOutbox(
  entries: OutboxEntry[],
  alerts: AlertOccurrence[],
  pausedEventIds: ReadonlySet<number>,
  at: number,
): OutboxEntry[] {
  const activeAlerts = new Set(
    alerts
      .filter((alert) => !alert.superseded)
      .map((alert) => alert.id),
  );

  return entries.map((entry) => {
    if (entry.status !== "pending") return entry;

    const reason = !activeAlerts.has(entry.alertId)
      ? "Alert is no longer active"
      : pausedEventIds.has(entry.eventId)
        ? "Event notifications are paused"
        : null;

    if (!reason) return entry;

    return {
      ...entry,
      status: "suppressed" as const,
      updatedAt: at,
      logs: [
        {
          at,
          status: "suppressed" as const,
          detail: reason,
        },
        ...entry.logs,
      ],
    };
  });
}
