import type { AlertOccurrence } from "./store";
import { getNotificationHandler, resolveNotificationHandlerIds, type NotificationHandlerId } from "./notification-handlers";

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
  channel: NotificationHandlerId;
  status: DeliveryStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  logs: DeliveryLog[];
  alert?: AlertOccurrence;
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

    for (const channel of resolveNotificationHandlerIds(alert.handlerIds)) {
      const id = `${channel}:alert:${alert.id}`;

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
        channel,
        status,
        attempts: 0,
        createdAt: at,
        updatedAt: at,
        alert: structuredClone(alert),
        logs: [
          {
            at,
            status,
            detail: suppressed
              ? "Event muted or snoozed at enqueue time"
              : `Queued for ${channel} delivery`,
          },
        ],
      });
    }
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

    let status: DeliveryStatus = "sent";
    let detail: string;

    try {
      if (fail) {
        throw new Error("Simulated delivery failure");
      }

      if (!entry.alert) {
        throw new Error("Alert payload is unavailable");
      }

      const handler = getNotificationHandler(entry.channel);
      const result = handler.send(entry.alert);

      detail = entry.channel === "local"
        ? `Recorded in local channel (no external message sent): ${result}`
        : `Recorded by ${handler.label} (no external message sent): ${result}`;
    } catch (error) {
      status = "failed";
      detail = error instanceof Error
        ? error.message
        : String(error);
    }

    return {
      ...entry,
      status,
      attempts: entry.attempts + 1,
      updatedAt: at,
      logs: [
        {
          at,
          status,
          detail,
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

  const alertsById = new Map(
    alerts.map((alert) => [alert.id, alert]),
  );

  return entries.map((entry) => {
    const alert = alertsById.get(entry.alertId);

    if (alert && !entry.alert) {
      entry = {
        ...entry,
        alert: structuredClone(alert),
      };
    }

    if (alert && entry.eventId !== alert.eventId) {
      entry = {
        ...entry,
        eventId: alert.eventId,
        alert: structuredClone(alert),
      };
    }

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