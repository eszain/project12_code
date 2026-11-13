
import { describe, expect, it } from "vitest";
import { Store } from "./store";

const action = {
  name: "Action Pc",
  pcMin: 1e-4,
  missDistanceMaxM: null,
  hoursToTcaMax: null,
  objectIds: [] as string[],
};

describe("rule management", () => {
  it("creates, updates, deletes, and records all changes", () => {
    const store = new Store();

    const created = store.addRule(action);

    expect(
      store.getSnapshot().rules,
    ).toHaveLength(1);

    expect(
      store.getSnapshot().ruleChanges?.[0].action,
    ).toBe("created");

    store.updateRule(created.id, {
      ...action,
      pcMin: 1e-6,
    });

    expect(
      store.getSnapshot().rules[0].pcMin,
    ).toBe(1e-6);

    expect(
      store.getSnapshot().ruleChanges?.[0].before?.pcMin,
    ).toBe(1e-4);

    store.deleteRule(created.id);

    expect(
      store.getSnapshot().rules,
    ).toHaveLength(0);

    expect(
      store
        .getSnapshot()
        .ruleChanges?.map((x) => x.action),
    ).toEqual([
      "deleted",
      "updated",
      "created",
    ]);
  });

  it("does not modify source severity thresholds", () => {
    const store = new Store();

    store.addRule(action);

    expect(
      store.getSnapshot().rules[0].pcMin,
    ).toBe(1e-4);
  });
});
