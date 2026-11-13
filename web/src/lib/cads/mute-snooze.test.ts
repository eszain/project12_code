
import { describe, expect, it } from "vitest";
import { Store, isNotificationPaused } from "./store";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sample = readFileSync(join(process.cwd(), "..", "data", "fixtures", "reconstructed", "cdm_set_1.json"), "utf8");

function populatedStore() {
  const store = new Store();
  store.importDocuments([{ name: "cdm_set_1.json", content: sample, label: "test" }]);
  return store;
}

describe("event notification pause", () => {
  it("mutes one event without modifying the event or its alerts", () => {
    const store = populatedStore();
    const eventId = store.getSnapshot().events[0].id;
    const originalAlerts = store.getSnapshot().alerts.length;
    store.pauseNotifications(eventId, "mute", "Operator reviewing", null, 1000);
    const snap = store.getSnapshot();
    expect(isNotificationPaused(snap.notificationPauses?.[eventId], 500000)).toBe(true);
    expect(snap.events).toHaveLength(1);
    expect(snap.alerts).toHaveLength(originalAlerts);
    expect(snap.notificationPauseHistory?.[0].action).toBe("mute");
    store.resumeNotifications(eventId, 2000);
    expect(store.getSnapshot().notificationPauses?.[eventId]).toBeUndefined();
    expect(store.getSnapshot().notificationPauseHistory?.[0].action).toBe("resume");
  });

  it("expires a snooze at its deadline and records the expiry", () => {
    const store = populatedStore();
    const eventId = store.getSnapshot().events[0].id;
    store.pauseNotifications(eventId, "snooze", "Waiting for new CDM", 6000, 1000);
    store.expireSnoozes(5999);
    expect(isNotificationPaused(store.getSnapshot().notificationPauses?.[eventId], 5999)).toBe(true);
    store.expireSnoozes(6000);
    expect(store.getSnapshot().notificationPauses?.[eventId]).toBeUndefined();
    expect(store.getSnapshot().notificationPauseHistory?.[0].action).toBe("expire");
    store.expireSnoozes(7000);
    expect(store.getSnapshot().notificationPauseHistory).toHaveLength(2);
  });

  it("persists, restores and resets pause settings", () => {
    const store = populatedStore();
    const eventId = store.getSnapshot().events[0].id;
    store.pauseNotifications(eventId, "mute", "Test", null, 1000);
    const restored = new Store();
    restored.restoreState(store.exportState());
    expect(restored.getSnapshot().notificationPauses?.[eventId]?.reason).toBe("Test");
    restored.reset();
    expect(restored.getSnapshot().notificationPauses).toEqual({});
    expect(restored.getSnapshot().notificationPauseHistory).toEqual([]);
  });

  it("rejects missing reasons and invalid snooze deadlines", () => {
    const store = populatedStore();
    const eventId = store.getSnapshot().events[0].id;
    expect(() => store.pauseNotifications(eventId, "mute", "  ", null)).toThrow();
    expect(() => store.pauseNotifications(eventId, "snooze", "Test", 1000, 1000)).toThrow();
  });
});
