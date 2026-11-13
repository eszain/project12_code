
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "./store";

const fixture = (n: number) => ({
  name: `synthetic_high_risk_${n}.json`,
  content: readFileSync(
    join(
      __dirname,
      `../../../../data/fixtures/synthetic/synthetic_high_risk_${n}.json`
    ),
    "utf8"
  ),
  label: "sample",
});

const rule = {
  name: "Action",
  pcMin: 1e-4,
  missDistanceMaxM: null,
  hoursToTcaMax: null,
  objectIds: [],
};

const makeStore = () => {
  const store = new Store();
  const alertRule = store.addRule(rule);

  store.importDocuments([
    fixture(1),
    fixture(2),
    fixture(3),
  ]);

  return { store, alertRule };
};

describe("v0.3 alert history and delivery", () => {
  it("retains history but updates active event indicators when rule changes", () => {
    const { store, alertRule } = makeStore();

    expect(store.getSnapshot().alerts).toHaveLength(2);
    expect(store.activeEventCount(Date.now())).toBe(1);

    store.updateRule(alertRule.id, {
      pcMin: 0.01,
    });

    expect(store.activeEventCount(Date.now())).toBe(0);
    expect(store.getSnapshot().alerts).toHaveLength(2);

    const change = store
      .getSnapshot()
      .audit!.find(
        (entry) => entry.action === "rule.updated"
      );

    expect(change?.details).toContain('"before"');
    expect(change?.details).toContain('"after"');
  });

  it("does not duplicate alerts when the same CDM is imported again", () => {
    const { store } = makeStore();

    const count = store.getSnapshot().alerts.length;

    store.importDocuments([
      fixture(1),
      fixture(2),
      fixture(3),
    ]);

    expect(store.getSnapshot().alerts).toHaveLength(count);
  });

  it("records failure and retries without creating a new alert", () => {
    const { store } = makeStore();

    const alertId = store.getSnapshot().alerts[0].id;
    const count = store.getSnapshot().alerts.length;

    store.deliver(alertId, true, 1000);

    expect(
      store
        .getSnapshot()
        .deliveries!.find(
          (delivery) => delivery.alertId === alertId
        )?.status
    ).toBe("failed");

    store.retryNow(alertId, 1001);

    const delivery = store
      .getSnapshot()
      .deliveries!.find(
        (item) => item.alertId === alertId
      );

    expect(delivery?.status).toBe("retried");
    expect(delivery?.attempts).toBe(2);
    expect(store.getSnapshot().alerts).toHaveLength(count);
  });

  it("mutes with a reason, snoozes until expiry and avoids duplicate unmute logs", () => {
    const { store } = makeStore();

    const eventId = store.getSnapshot().alerts[0].eventId;
    const now = Date.now();

    store.suppress(
      eventId,
      "mute",
      "Operator review"
    );

    expect(store.activeEventCount(now)).toBe(0);

    store.unsuppress(eventId);

    const auditCount = store.getSnapshot().audit!.length;

    store.unsuppress(eventId);

    expect(store.getSnapshot().audit).toHaveLength(
      auditCount
    );

    store.suppress(
      eventId,
      "snooze",
      "Investigating",
      now + 10_000
    );

    expect(store.activeEventCount(now)).toBe(0);
    expect(store.activeEventCount(now + 11_000)).toBe(1);
  });
});
