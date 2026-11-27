import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlertOccurrence } from "./store";
import {
  getNotificationHandler,
  getNotificationHandlers,
  isNotificationHandlerId,
  resolveNotificationHandlerIds,
} from "./notification-handlers";
import {
  enqueueAlerts,
  deliverOutbox,
  retryOutbox,
  synchronizeOutbox,
} from "./outbox";

const alert: AlertOccurrence = {
  id: 1,
  createdAt: 1000,
  ruleId: 1,
  ruleName: "High risk conjunction",
  eventId: 1,
  revisionId: 1,
  severity: "ACTION",
  matched: ["Pc exceeds limit"],
  handlerIds: ["local", "webhook", "email"],
  message: {
    type: "cads.conjunction.alert",
    severity: "ACTION",
    pc_source: "0.0002",
  },
};

const pausedEventIds = new Set<number>();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Notification handler registry", () => {
  it("registers all three notification handlers", () => {
    expect(getNotificationHandlers().map((handler) => handler.id)).toEqual([
      "local",
      "webhook",
      "email",
    ]);
  });

  it("uses the in-app handler for legacy rules", () => {
    expect(resolveNotificationHandlerIds()).toEqual(["local"]);
  });

  it("removes duplicate handler IDs", () => {
    expect(resolveNotificationHandlerIds([
      "local",
      "local",
      "email",
      "email",
    ])).toEqual(["local", "email"]);
  });

  it("rejects unknown handler IDs", () => {
    expect(isNotificationHandlerId("local")).toBe(true);
    expect(isNotificationHandlerId("webhook")).toBe(true);
    expect(isNotificationHandlerId("email")).toBe(true);
    expect(isNotificationHandlerId("sms")).toBe(false);
    expect(isNotificationHandlerId(null)).toBe(false);
  });

  it("records the in-app notification payload", () => {
    const result = JSON.parse(getNotificationHandler("local").send(alert));

    expect(result.channel).toBe("local");
    expect(result.alertId).toBe(alert.id);
    expect(result.message).toEqual(alert.message);
  });

  it("records a mock webhook payload", () => {
    const result = JSON.parse(getNotificationHandler("webhook").send(alert));

    expect(result.channel).toBe("webhook");
    expect(result.alertId).toBe(alert.id);
    expect(result.method).toBe("POST");
    expect(result.body).toEqual(alert.message);
  });

  it("records a mock email payload", () => {
    const result = JSON.parse(getNotificationHandler("email").send(alert));

    expect(result.channel).toBe("email");
    expect(result.alertId).toBe(alert.id);
    expect(result.subject).toBe(`CADS Alert: ${alert.ruleName}`);
    expect(result.body).toEqual(alert.message);
  });
});

describe("Notification handler outbox integration", () => {
  it("creates one outbox entry per selected handler", () => {
    const entries = enqueueAlerts([], [alert], pausedEventIds, 1000);

    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.id).sort()).toEqual([
      "email:alert:1",
      "local:alert:1",
      "webhook:alert:1",
    ]);
  });

  it("only queues and calls selected handlers", () => {
    const local = vi.spyOn(getNotificationHandler("local"), "send");
    const webhook = vi.spyOn(getNotificationHandler("webhook"), "send");
    const email = vi.spyOn(getNotificationHandler("email"), "send");

    const selectedAlert: AlertOccurrence = {
      ...alert,
      handlerIds: ["webhook"],
    };

    let entries = enqueueAlerts([], [selectedAlert], pausedEventIds, 1000);

    expect(entries).toHaveLength(1);
    expect(entries[0].channel).toBe("webhook");

    entries = deliverOutbox(entries, "webhook:alert:1", 2000);

    expect(entries[0].status).toBe("sent");
    expect(webhook).toHaveBeenCalledTimes(1);
    expect(local).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();
  });

  it("does not enqueue duplicate deliveries", () => {
    let entries = enqueueAlerts([], [alert], pausedEventIds, 1000);

    entries = enqueueAlerts(entries, [alert], pausedEventIds, 2000);
    entries = enqueueAlerts(entries, [alert], pausedEventIds, 3000);

    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(3);
  });

  it("calls each selected handler exactly once", () => {
    const local = vi.spyOn(getNotificationHandler("local"), "send");
    const webhook = vi.spyOn(getNotificationHandler("webhook"), "send");
    const email = vi.spyOn(getNotificationHandler("email"), "send");

    let entries = enqueueAlerts([], [alert], pausedEventIds, 1000);

    for (const entry of entries) {
      entries = deliverOutbox(entries, entry.id, 2000);
    }

    expect(entries.every((entry) => entry.status === "sent")).toBe(true);
    expect(local).toHaveBeenCalledTimes(1);
    expect(webhook).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledTimes(1);
  });

  it("does not deliver an already sent notification again", () => {
    const local = vi.spyOn(getNotificationHandler("local"), "send");

    let entries = enqueueAlerts([], [alert], pausedEventIds, 1000);

    entries = deliverOutbox(entries, "local:alert:1", 2000);
    entries = deliverOutbox(entries, "local:alert:1", 3000);
    entries = deliverOutbox(entries, "local:alert:1", 4000);

    const entry = entries.find((item) => item.id === "local:alert:1");

    expect(entry?.status).toBe("sent");
    expect(entry?.attempts).toBe(1);
    expect(local).toHaveBeenCalledTimes(1);
  });

  it("does not retry an already successful delivery", () => {
    const local = vi.spyOn(getNotificationHandler("local"), "send");

    let entries = enqueueAlerts([], [alert], pausedEventIds, 1000);

    entries = deliverOutbox(entries, "local:alert:1", 2000);
    entries = retryOutbox(entries, "local:alert:1", 3000);
    entries = deliverOutbox(entries, "local:alert:1", 4000);

    const entry = entries.find((item) => item.id === "local:alert:1");

    expect(entry?.status).toBe("sent");
    expect(entry?.attempts).toBe(1);
    expect(local).toHaveBeenCalledTimes(1);
  });

  it("retries only the failed handler without duplicating successful deliveries", () => {
    const local = vi.spyOn(getNotificationHandler("local"), "send");
    const webhook = vi.spyOn(getNotificationHandler("webhook"), "send");
    const email = vi.spyOn(getNotificationHandler("email"), "send");

    let entries = enqueueAlerts([], [alert], pausedEventIds, 1000);

    entries = deliverOutbox(entries, "local:alert:1", 2000);
    entries = deliverOutbox(entries, "email:alert:1", 2000);
    entries = deliverOutbox(entries, "webhook:alert:1", 2000, true);

    expect(entries.find((entry) => entry.channel === "webhook")?.status).toBe("failed");
    expect(webhook).not.toHaveBeenCalled();

    entries = retryOutbox(entries, "webhook:alert:1", 3000);
    entries = deliverOutbox(entries, "webhook:alert:1", 4000);

    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.status === "sent")).toBe(true);
    expect(entries.find((entry) => entry.channel === "webhook")?.attempts).toBe(2);

    expect(local).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledTimes(1);
    expect(webhook).toHaveBeenCalledTimes(1);
  });

  it("handles a failure thrown by a handler", () => {
    const webhook = vi.spyOn(getNotificationHandler("webhook"), "send");

    webhook.mockImplementationOnce(() => {
      throw new Error("Mock webhook failure");
    });

    let entries = enqueueAlerts([], [alert], pausedEventIds, 1000);

    entries = deliverOutbox(entries, "webhook:alert:1", 2000);

    expect(entries.find((entry) => entry.channel === "webhook")?.status).toBe("failed");

    entries = retryOutbox(entries, "webhook:alert:1", 3000);
    entries = deliverOutbox(entries, "webhook:alert:1", 4000);

    expect(entries.find((entry) => entry.channel === "webhook")?.status).toBe("sent");
    expect(webhook).toHaveBeenCalledTimes(2);
    expect(entries).toHaveLength(3);
  });

  it("suppresses every selected handler when the event is paused", () => {
    const local = vi.spyOn(getNotificationHandler("local"), "send");
    const webhook = vi.spyOn(getNotificationHandler("webhook"), "send");
    const email = vi.spyOn(getNotificationHandler("email"), "send");

    const paused = new Set([alert.eventId]);

    let entries = enqueueAlerts([], [alert], paused, 1000);

    for (const entry of entries) {
      entries = deliverOutbox(entries, entry.id, 2000);
    }

    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.status === "suppressed")).toBe(true);
    expect(local).not.toHaveBeenCalled();
    expect(webhook).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();
  });

  it("does not queue superseded alerts", () => {
    const entries = enqueueAlerts(
      [],
      [{ ...alert, superseded: true }],
      pausedEventIds,
      1000,
    );

    expect(entries).toHaveLength(0);
  });

  it("suppresses pending deliveries when an alert becomes superseded", () => {
    let entries = enqueueAlerts([], [alert], pausedEventIds, 1000);

    entries = synchronizeOutbox(
      entries,
      [{ ...alert, superseded: true }],
      pausedEventIds,
      2000,
    );

    expect(entries.every((entry) => entry.status === "suppressed")).toBe(true);
  });

  it("preserves handler deliveries after serialization and restoration", () => {
    const local = vi.spyOn(getNotificationHandler("local"), "send");

    let entries = enqueueAlerts([], [alert], pausedEventIds, 1000);

    entries = deliverOutbox(entries, "local:alert:1", 2000);

    const restored: typeof entries = JSON.parse(JSON.stringify(entries));

    entries = enqueueAlerts(restored, [alert], pausedEventIds, 3000);
    entries = deliverOutbox(entries, "local:alert:1", 4000);

    expect(entries).toHaveLength(3);
    expect(entries.find((entry) => entry.channel === "local")?.status).toBe("sent");
    expect(local).toHaveBeenCalledTimes(1);
  });
});