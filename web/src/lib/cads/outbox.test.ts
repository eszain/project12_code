
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  EMPTY_OUTBOX,
  deliverDemo,
  deliverPending,
  enqueueAlert,
  enqueueAlerts,
  getOutboxCounts,
  retryDelivery,
  type AlertForDelivery,
} from "./outbox";

describe("Outbox & Delivery", () => {
  const now = Date.UTC(2026, 10, 12, 12);

  const alert: AlertForDelivery = {
    id: 10,
    eventId: 2,
    ruleName: "High Pc",
    severity: "ACTION",
  };

  it("creates a pending demo delivery", () => {
    const state = enqueueAlert(
      EMPTY_OUTBOX,
      alert,
      now,
    );

    expect(state.items).toHaveLength(1);

    expect(state.items[0]).toMatchObject({
      alertId: 10,
      eventId: 2,
      channel: "demo",
      status: "pending",
      attempts: 0,
    });
  });

  it("prevents duplicate jobs for the same alert", () => {
    const first = enqueueAlert(
      EMPTY_OUTBOX,
      alert,
      now,
    );

    const second = enqueueAlert(
      first,
      alert,
      now + 1000,
    );

    expect(second).toBe(first);
    expect(second.items).toHaveLength(1);
  });

  it("delivers a pending job successfully", () => {
    const queued = enqueueAlert(
      EMPTY_OUTBOX,
      alert,
      now,
    );

    const delivered = deliverDemo(
      queued,
      1,
      false,
      now + 1000,
    );

    expect(delivered.items[0]).toMatchObject({
      status: "sent",
      attempts: 1,
      deliveredAt: now + 1000,
      lastError: null,
    });

    expect(delivered.attempts).toHaveLength(1);
    expect(delivered.attempts[0].status).toBe(
      "sent",
    );
  });

  it("records a simulated delivery failure", () => {
    const queued = enqueueAlert(
      EMPTY_OUTBOX,
      alert,
      now,
    );

    const failed = deliverDemo(
      queued,
      1,
      true,
      now + 1000,
    );

    expect(failed.items[0].status).toBe(
      "failed",
    );
    expect(failed.items[0].attempts).toBe(1);
    expect(failed.items[0].lastError).toBe(
      "Simulated demo channel failure.",
    );

    expect(failed.attempts[0].status).toBe(
      "failed",
    );
  });

  it("retries a failed job and keeps its history", () => {
    const queued = enqueueAlert(
      EMPTY_OUTBOX,
      alert,
      now,
    );

    const failed = deliverDemo(
      queued,
      1,
      true,
      now + 1000,
    );

    const retried = retryDelivery(
      failed,
      1,
      false,
      now + 2000,
    );

    expect(retried.items[0].status).toBe(
      "sent",
    );
    expect(retried.items[0].attempts).toBe(2);
    expect(retried.items[0].lastError).toBeNull();

    expect(
      retried.attempts.map(
        (attempt) => attempt.status,
      ),
    ).toEqual(["failed", "sent"]);
  });

  it("does not send an already delivered job twice", () => {
    const queued = enqueueAlert(
      EMPTY_OUTBOX,
      alert,
      now,
    );

    const sent = deliverDemo(
      queued,
      1,
      false,
      now + 1000,
    );

    const duplicate = deliverDemo(
      sent,
      1,
      false,
      now + 2000,
    );

    expect(duplicate).toBe(sent);
    expect(duplicate.attempts).toHaveLength(1);
  });

  it("rejects retry for a pending or sent job", () => {
    const queued = enqueueAlert(
      EMPTY_OUTBOX,
      alert,
      now,
    );

    expect(() =>
      retryDelivery(queued, 1),
    ).toThrow(
      "Only failed deliveries can be retried.",
    );

    const sent = deliverDemo(
      queued,
      1,
      false,
      now + 1000,
    );

    expect(() =>
      retryDelivery(sent, 1),
    ).toThrow(
      "Only failed deliveries can be retried.",
    );
  });

  it("delivers all pending jobs only once", () => {
    const queued = enqueueAlerts(
      EMPTY_OUTBOX,
      [
        alert,
        {
          id: 11,
          eventId: 3,
          ruleName: "Close approach",
          severity: "WATCH",
        },
      ],
      now,
    );

    const delivered = deliverPending(
      queued,
      false,
      now + 1000,
    );

    expect(getOutboxCounts(delivered)).toEqual({
      pending: 0,
      sent: 2,
      failed: 0,
    });

    const repeated = deliverPending(
      delivered,
      false,
      now + 2000,
    );

    expect(repeated.attempts).toHaveLength(2);
  });

  it("keeps delivery jobs on the demo channel", () => {
    const state = enqueueAlert(
      EMPTY_OUTBOX,
      alert,
      now,
    );

    expect(
      state.items.every(
        (item) => item.channel === "demo",
      ),
    ).toBe(true);
  });
});
