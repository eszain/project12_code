
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IndexedDbEventPersistence } from "./event-persistence";
import { Store } from "./store";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("IndexedDB event persistence", () => {

it("restores real CDM events, revisions and archive states", async () => {
  const store = new Store();

  // Load the six reconstructed CDMs.
  const fixtureDir = join(
    __dirname,
    "../../../../data/fixtures/reconstructed"
  );

  const docs = [1, 2, 3, 4, 5, 6].map((n) => {
    const name = `cdm_set_${n}.json`;

    return {
      name,
      content: readFileSync(join(fixtureDir, name), "utf8"),
      label: "test",
    };
  });

  store.importDocuments(docs);

  // Six CDMs should form two encounters.
  const original = store.getSnapshot();
  expect(original.events).toHaveLength(2);
  expect(
    original.events.map((e) => e.revisions.length).sort()
  ).toEqual([2, 4]);

  const archivedEventId = original.events[0].id;

  // Save the full state and a manual archive decision.
  await persistence.save({
    store: store.exportState(),
    archiveOverrides: {
      [archivedEventId]: true,
    },
  });

  // Simulate a fresh dashboard session.
  const saved = await persistence.load();
  expect(saved).not.toBeNull();

  const restoredStore = new Store();
  restoredStore.restoreState(saved!.store);

  const restored = restoredStore.getSnapshot();

  // The event and revision data should be identical.
  expect(restored.events).toEqual(original.events);

  // The archive decision must also survive.
  expect(saved!.archiveOverrides[archivedEventId]).toBe(true);

  // New IDs must not collide with restored IDs.
  const maxOldRevisionId = Math.max(
    ...original.events.flatMap((e) =>
      e.revisions.map((r) => r.id)
    )
  );

  expect(saved!.store.nextIds.revision)
    .toBeGreaterThan(maxOldRevisionId);

  // Reimporting the same documents must not duplicate them.
  const result = restoredStore.importDocuments(docs);
  expect(result.counts.duplicate).toBe(6);
  expect(restoredStore.getSnapshot().events).toHaveLength(2);
});

  const persistence = new IndexedDbEventPersistence();

  beforeEach(async () => {
    await persistence.clear();
  });

  it("saves and restores the store state", async () => {
    const store = new Store();

    store.addRule({
      name: "Test collision rule",
      pcMin: 0.0001,
      missDistanceMaxM: null,
      hoursToTcaMax: null,
      objectIds: [],
    });

    await persistence.save({
      store: store.exportState(),
      archiveOverrides: {},
    });

    // Simulate a newly opened dashboard session.
    const restoredData = await persistence.load();

    expect(restoredData).not.toBeNull();

    const restoredStore = new Store();
    restoredStore.restoreState(restoredData!.store);

    expect(restoredStore.getSnapshot().rules).toHaveLength(1);
    expect(restoredStore.getSnapshot().rules[0].name)
      .toBe("Test collision rule");
  });

  it("preserves manual archive decisions", async () => {
    const store = new Store();

    await persistence.save({
      store: store.exportState(),
      archiveOverrides: {
        1: true,
        2: false,
      },
    });

    const restored = await persistence.load();

    expect(restored?.archiveOverrides).toEqual({
      1: true,
      2: false,
    });
  });

  it("clears persisted data on reset", async () => {
    const store = new Store();

    await persistence.save({
      store: store.exportState(),
      archiveOverrides: {},
    });

    expect(await persistence.load()).not.toBeNull();

    await persistence.clear();

    expect(await persistence.load()).toBeNull();
  });
});
