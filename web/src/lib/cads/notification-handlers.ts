import type { AlertOccurrence } from "./store";

export type NotificationHandlerId =
  | "local"
  | "webhook"
  | "email";

export interface NotificationHandler {
  id: NotificationHandlerId;
  label: string;
  send(alert: AlertOccurrence): string;
}

export const notificationHandlers: Record<
  NotificationHandlerId,
  NotificationHandler
> = {
  local: {
    id: "local",
    label: "In-app",
    send(alert) {
      return JSON.stringify({
        channel: "local",
        alertId: alert.id,
        message: alert.message,
      });
    },
  },

  webhook: {
    id: "webhook",
    label: "Mock webhook",
    send(alert) {
      return JSON.stringify({
        channel: "webhook",
        alertId: alert.id,
        method: "POST",
        body: alert.message,
      });
    },
  },

  email: {
    id: "email",
    label: "Mock email",
    send(alert) {
      return JSON.stringify({
        channel: "email",
        alertId: alert.id,
        subject: `CADS Alert: ${alert.ruleName}`,
        body: alert.message,
      });
    },
  },
};

export function isNotificationHandlerId(
  value: unknown
): value is NotificationHandlerId {
  return (
    value === "local" ||
    value === "webhook" ||
    value === "email"
  );
}

export function getNotificationHandler(
  id: NotificationHandlerId
): NotificationHandler {
  return notificationHandlers[id];
}

export function getNotificationHandlers(): NotificationHandler[] {
  return Object.values(notificationHandlers);
}

export function resolveNotificationHandlerIds(
  ids?: readonly NotificationHandlerId[]
): NotificationHandlerId[] {
  return [...new Set<NotificationHandlerId>(ids ?? ["local"])];
}