import {
    describe,
    expect,
    it,
  } from "vitest";
  
  import { readFileSync } from "node:fs";
  import { join } from "node:path";
  
  import { Store } from "./store";
  
  import {
    isAcknowledged,
    getUnacknowledgedAlerts,
    countUnacknowledgedAlerts,
  } from "./notification-acknowledgement";
  
  const sample = readFileSync(
    join(
      process.cwd(),
      "..",
      "data",
      "fixtures",
      "reconstructed",
      "cdm_set_1.json"
    ),
    "utf8"
  );
  
  function populatedStore(): Store {
    const store = new Store();
  
    store.addRule({
      name: "Test notification rule",
      pcMin: null,
      missDistanceMaxM: 1000000000,
      hoursToTcaMax: null,
      objectIds: [],
    });
  
    store.importDocuments([
      {
        name: "cdm_set_1.json",
        content: sample,
        label: "test",
      },
    ]);
  
    expect(
      store.getSnapshot().alerts.length
    ).toBeGreaterThan(0);
  
    return store;
  }
  
  describe("notification acknowledgement", () => {
    it("records the operator, time and note", () => {
      const store = populatedStore();
  
      const alert =
        store.getSnapshot().alerts[0];
  
      const result =
        store.acknowledgeNotification(
          alert.id,
          "Operator A",
          "Risk reviewed",
          1000
        );
  
      expect(result).toBe(true);
  
      const updated =
        store.getSnapshot().alerts.find(
          (item) => item.id === alert.id
        );
  
      expect(updated?.acknowledgement).toEqual({
        acknowledgedBy: "Operator A",
        acknowledgedAt: 1000,
        note: "Risk reviewed",
      });
    });
  
    it("reduces the unacknowledged count", () => {
      const store = populatedStore();
  
      const alerts =
        store.getSnapshot().alerts;
  
      const before =
        countUnacknowledgedAlerts(alerts);
  
      store.acknowledgeNotification(
        alerts[0].id,
        "Operator A"
      );
  
      const after =
        countUnacknowledgedAlerts(
          store.getSnapshot().alerts
        );
  
      expect(after).toBe(before - 1);
    });
  
    it("keeps acknowledged notifications in history", () => {
      const store = populatedStore();
  
      const before =
        store.getSnapshot().alerts.length;
  
      const alert =
        store.getSnapshot().alerts[0];
  
      store.acknowledgeNotification(
        alert.id,
        "Operator A"
      );
  
      const alerts =
        store.getSnapshot().alerts;
  
      expect(alerts).toHaveLength(before);
  
      expect(
        isAcknowledged(alerts[0])
      ).toBe(true);
  
      expect(
        getUnacknowledgedAlerts(alerts).some(
          (item) => item.id === alert.id
        )
      ).toBe(false);
    });
  
    it("preserves the original acknowledgement", () => {
      const store = populatedStore();
  
      const alert =
        store.getSnapshot().alerts[0];
  
      store.acknowledgeNotification(
        alert.id,
        "Operator A",
        "First note",
        1000
      );
  
      const result =
        store.acknowledgeNotification(
          alert.id,
          "Operator B",
          "Second note",
          2000
        );
  
      expect(result).toBe(false);
  
      expect(
        store.getSnapshot().alerts[0]
          .acknowledgement
      ).toEqual({
        acknowledgedBy: "Operator A",
        acknowledgedAt: 1000,
        note: "First note",
      });
    });
  
    it("preserves acknowledgement after restoration", () => {
      const store = populatedStore();
  
      const alert =
        store.getSnapshot().alerts[0];
  
      store.acknowledgeNotification(
        alert.id,
        "Operator A",
        "Reviewed",
        1000
      );
  
      const restored = new Store();
  
      restored.restoreState(
        store.exportState()
      );
  
      expect(
        restored.getSnapshot().alerts[0]
          .acknowledgement
      ).toEqual({
        acknowledgedBy: "Operator A",
        acknowledgedAt: 1000,
        note: "Reviewed",
      });
  
      expect(
        countUnacknowledgedAlerts(
          restored.getSnapshot().alerts
        )
      ).toBe(
        countUnacknowledgedAlerts(
          store.getSnapshot().alerts
        )
      );
    });
  
    it("supports acknowledgement without a note", () => {
      const store = populatedStore();
  
      const alert =
        store.getSnapshot().alerts[0];
  
      store.acknowledgeNotification(
        alert.id,
        "Operator A"
      );
  
      expect(
        store.getSnapshot().alerts[0]
          .acknowledgement?.note
      ).toBeNull();
    });
  
    it("rejects an empty operator name", () => {
      const store = populatedStore();
  
      const alert =
        store.getSnapshot().alerts[0];
  
      expect(() =>
        store.acknowledgeNotification(
          alert.id,
          "   "
        )
      ).toThrow(
        "Operator name is required."
      );
    });
  
    it("rejects an unknown notification", () => {
      const store = populatedStore();
  
      expect(() =>
        store.acknowledgeNotification(
          -1,
          "Operator A"
        )
      ).toThrow(
        "Notification not found."
      );
    });
  });