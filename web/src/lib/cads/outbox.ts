
export type DeliveryStatus =
  | "pending"
  | "sent"
  | "failed";

export type DeliveryChannel = "demo";

export interface OutboxItem {
  id: number;
  alertId: number;
  eventId: number;
  ruleName: string;
  severity: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  deliveredAt: number | null;
  lastError: string | null;
}

export interface DeliveryAttempt {
  id: number;
  outboxId: number;
  attemptedAt: number;
  status: "sent" | "failed";
  error: string | null;
}

export interface OutboxState {
  items: OutboxItem[];
  attempts: DeliveryAttempt[];
  nextItemId: number;
  nextAttemptId: number;
}

export interface AlertForDelivery {
  id: number;
  eventId: number;
  ruleName: string;
  severity: string;
}

export interface DeliveryResult {
  success: boolean;
  error?: string;
}

export const EMPTY_OUTBOX: OutboxState = {
  items: [],
  attempts: [],
  nextItemId: 1,
  nextAttemptId: 1,
};

export function enqueueAlert(
  state: OutboxState,
  alert: AlertForDelivery,
  now: number = Date.now(),
): OutboxState {
  const exists = state.items.some(
    (item) =>
      item.alertId === alert.id &&
      item.channel === "demo",
  );

  if (exists) {
    return state;
  }

  const item: OutboxItem = {
    id: state.nextItemId,
    alertId: alert.id,
    eventId: alert.eventId,
    ruleName: alert.ruleName,
    severity: alert.severity,
    channel: "demo",
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    deliveredAt: null,
    lastError: null,
  };

  return {
    ...state,
    items: [...state.items, item],
    nextItemId: state.nextItemId + 1,
  };
}

export function enqueueAlerts(
  state: OutboxState,
  alerts: AlertForDelivery[],
  now: number = Date.now(),
): OutboxState {
  return alerts.reduce(
    (current, alert) =>
      enqueueAlert(current, alert, now),
    state,
  );
}

export function recordDelivery(
  state: OutboxState,
  outboxId: number,
  result: DeliveryResult,
  now: number = Date.now(),
): OutboxState {
  const item = state.items.find(
    (entry) => entry.id === outboxId,
  );

  if (!item) {
    throw new Error("Outbox item not found.");
  }

  if (item.status === "sent") {
    throw new Error(
      "Already delivered. Duplicate delivery blocked.",
    );
  }

  const error = result.success
    ? null
    : result.error?.trim() || "Demo delivery failed.";

  const updated: OutboxItem = {
    ...item,
    status: result.success ? "sent" : "failed",
    attempts: item.attempts + 1,
    updatedAt: now,
    deliveredAt: result.success ? now : null,
    lastError: error,
  };

  const attempt: DeliveryAttempt = {
    id: state.nextAttemptId,
    outboxId,
    attemptedAt: now,
    status: result.success ? "sent" : "failed",
    error,
  };

  return {
    ...state,
    items: state.items.map((entry) =>
      entry.id === outboxId ? updated : entry,
    ),
    attempts: [...state.attempts, attempt],
    nextAttemptId: state.nextAttemptId + 1,
  };
}

export function deliverDemo(
  state: OutboxState,
  outboxId: number,
  simulateFailure = false,
  now: number = Date.now(),
): OutboxState {
  const item = state.items.find(
    (entry) => entry.id === outboxId,
  );

  if (!item) {
    throw new Error("Outbox item not found.");
  }

  if (item.status === "sent") {
    return state;
  }

  return recordDelivery(
    state,
    outboxId,
    simulateFailure
      ? {
          success: false,
          error: "Simulated demo channel failure.",
        }
      : { success: true },
    now,
  );
}

export function retryDelivery(
  state: OutboxState,
  outboxId: number,
  simulateFailure = false,
  now: number = Date.now(),
): OutboxState {
  const item = state.items.find(
    (entry) => entry.id === outboxId,
  );

  if (!item) {
    throw new Error("Outbox item not found.");
  }

  if (item.status !== "failed") {
    throw new Error(
      "Only failed deliveries can be retried.",
    );
  }

  return deliverDemo(
    state,
    outboxId,
    simulateFailure,
    now,
  );
}

export function deliverPending(
  state: OutboxState,
  simulateFailure = false,
  now: number = Date.now(),
): OutboxState {
  const pendingIds = state.items
    .filter((item) => item.status === "pending")
    .map((item) => item.id);

  return pendingIds.reduce(
    (current, id) =>
      deliverDemo(
        current,
        id,
        simulateFailure,
        now,
      ),
    state,
  );
}

export function getOutboxCounts(state: OutboxState) {
  return {
    pending: state.items.filter(
      (item) => item.status === "pending",
    ).length,
    sent: state.items.filter(
      (item) => item.status === "sent",
    ).length,
    failed: state.items.filter(
      (item) => item.status === "failed",
    ).length,
  };
}
