
import { describe, expect, it } from "vitest";

import {
  deliverOutbox,
  enqueueAlerts,
  retryOutbox,
  synchronizeOutbox,
} from "./outbox";

import type { AlertOccurrence } from "./store";

const alert = {
  id: 7,
  eventId: 3,
  ruleName: "Action",
  superseded: false,
} as AlertOccurrence;

describe("outbox and delivery", () => {
  it("creates one entry for each alert", () => {
    const entries = enqueueAlerts(
      [],
      [alert],
      new Set<number>(),
      1000,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("local:alert:7");
    expect(entries[0].channel).toBe("local");
    expect(entries[0].status).toBe("pending");
    expect(entries[0].attempts).toBe(0);
  });

  it("prevents duplicate entries", () => {
    const first = enqueueAlerts(
      [],
      [alert],
      new Set<number>(),
      1000,
    );

    const second = enqueueAlerts(
      first,
      [alert],
      new Set<number>(),
      2000,
    );

    expect(second).toEqual(first);
    expect(second).toHaveLength(1);
  });

  it("suppresses alerts when the event is muted", () => {
    const entries = enqueueAlerts(
      [],
      [alert],
      new Set([3]),
      1000,
    );

    expect(entries[0].status).toBe("suppressed");
    expect(entries[0].attempts).toBe(0);
  });

  it("records successful local delivery", () => {
    const queued = enqueueAlerts(
      [],
      [alert],
      new Set<number>(),
      1000,
    );

    const sent = deliverOutbox(
      queued,
      queued[0].id,
      2000,
    );

    expect(sent[0].status).toBe("sent");
    expect(sent[0].attempts).toBe(1);
    expect(sent[0].logs[0].status).toBe("sent");
  });

  it("records failure and supports retry", () => {
    const queued = enqueueAlerts(
      [],
      [alert],
      new Set<number>(),
      1000,
    );

    const failed = deliverOutbox(
      queued,
      queued[0].id,
      2000,
      true,
    );

    expect(failed[0].status).toBe("failed");
    expect(failed[0].attempts).toBe(1);

    const retried = retryOutbox(
      failed,
      queued[0].id,
      3000,
    );

    expect(retried[0].status).toBe("pending");
    expect(retried[0].attempts).toBe(1);

    const sent = deliverOutbox(
      retried,
      queued[0].id,
      4000,
    );

    expect(sent[0].status).toBe("sent");
    expect(sent[0].attempts).toBe(2);
    expect(sent[0].logs).toHaveLength(4);
  });

  it("does not send the same entry twice", () => {
    const queued = enqueueAlerts(
      [],
      [alert],
      new Set<number>(),
      1000,
    );

    const sent = deliverOutbox(
      queued,
      queued[0].id,
      2000,
    );

    const repeated = deliverOutbox(
      sent,
      queued[0].id,
      3000,
    );

    expect(repeated).toEqual(sent);
    expect(repeated[0].attempts).toBe(1);
  });

  it("blocks delivery when notifications are paused", () => {
    const queued = enqueueAlerts(
      [],
      [alert],
      new Set<number>(),
      1000,
    );

    const result = deliverOutbox(
      queued,
      queued[0].id,
      2000,
      false,
      new Set([3]),
    );

    expect(result[0].status).toBe("suppressed");
    expect(result[0].attempts).toBe(0);
  });

  it("suppresses pending delivery after a rule is superseded", () => {
    const queued = enqueueAlerts(
      [],
      [alert],
      new Set<number>(),
      1000,
    );

    const superseded = {
      ...alert,
      superseded: true,
    };

    const result = synchronizeOutbox(
      queued,
      [superseded],
      new Set<number>(),
      2000,
    );

    expect(result[0].status).toBe("suppressed");
    expect(result[0].attempts).toBe(0);
  });

  it("does not retry failed delivery while muted", () => {
    const queued = enqueueAlerts(
      [],
      [alert],
      new Set<number>(),
      1000,
    );

    const failed = deliverOutbox(
      queued,
      queued[0].id,
      2000,
      true,
    );

    const result = retryOutbox(
      failed,
      queued[0].id,
      3000,
      new Set([3]),
    );

    expect(result[0].status).toBe("suppressed");
    expect(result[0].attempts).toBe(1);
  });
});
