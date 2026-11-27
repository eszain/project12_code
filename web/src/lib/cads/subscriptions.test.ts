import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Store } from "./store";
import {
  MOCK_USERS,
  getSubscribedDesignators,
  visibleEvents,
} from "./subscriptions";
import type { SubscriptionUser } from "./subscriptions";

const DATA = join(__dirname, "../../../../data/fixtures");

const admin = MOCK_USERS.find((user) => user.id === "admin")!;
const csaOperator = MOCK_USERS.find(
  (user) => user.id === "csa-operator"
)!;
const testOperator = MOCK_USERS.find(
  (user) => user.id === "test-operator"
)!;

function loadCdm(store: Store, folder: string, file: string) {
  const report = store.importDocuments([
    {
      name: file,
      content: readFileSync(join(DATA, folder, file), "utf8"),
      label: "test",
    },
  ]);

  expect(report.counts.imported).toBe(1);
}

function createStore() {
  const store = new Store();

  loadCdm(store, "reconstructed", "cdm_set_1.json");
  loadCdm(store, "synthetic", "synthetic_high_risk_1.json");

  return store;
}

describe("satellite subscriptions", () => {
  it("allows the admin to see all events", () => {
    const store = createStore();
    const events = store.getSnapshot().events;

    expect(events).toHaveLength(2);
    expect(visibleEvents(events, admin)).toEqual(events);
  });

  it("allows the CSA operator to see only SCISAT 1 events", () => {
    const store = createStore();
    const events = store.getSnapshot().events;

    const visible = visibleEvents(events, csaOperator);

    expect(visible).toHaveLength(1);
    expect(visible[0].revisions[0].cdm.sat1.designator)
      .toBe("27858");
  });

  it("allows the test operator to see only CADS TEST SAT events", () => {
    const store = createStore();
    const events = store.getSnapshot().events;

    const visible = visibleEvents(events, testOperator);

    expect(visible).toHaveLength(1);
    expect(visible[0].revisions[0].cdm.sat1.designator)
      .toBe("99901");
  });

  it("shows events when the secondary object is subscribed", () => {
    const store = createStore();

    const user: SubscriptionUser = {
      id: "secondary-operator",
      name: "Secondary operator",
      role: "operator",
      groupIds: [],
      satelliteDesignators: ["99999"],
    };

    const visible = visibleEvents(
      store.getSnapshot().events,
      user
    );

    expect(visible).toHaveLength(1);
    expect(visible[0].revisions[0].cdm.sat2.designator)
      .toBe("99999");
  });

  it("combines direct and group subscriptions", () => {
    const user: SubscriptionUser = {
      ...csaOperator,
      satelliteDesignators: ["99901"],
    };

    expect(getSubscribedDesignators(user)).toEqual(
      new Set(["27858", "99901"])
    );

    const store = createStore();

    expect(
      visibleEvents(store.getSnapshot().events, user)
    ).toHaveLength(2);
  });

  it("hides all events from an operator without subscriptions", () => {
    const store = createStore();

    const user: SubscriptionUser = {
      id: "unsubscribed",
      name: "Unsubscribed operator",
      role: "operator",
      groupIds: [],
      satelliteDesignators: [],
    };

    expect(
      visibleEvents(store.getSnapshot().events, user)
    ).toEqual([]);
  });

  it("keeps a newly loaded unsubscribed CDM hidden", () => {
    const store = new Store();

    loadCdm(store, "reconstructed", "cdm_set_1.json");

    const before = visibleEvents(
      store.getSnapshot().events,
      csaOperator
    );

    expect(before).toHaveLength(1);

    loadCdm(store, "synthetic", "synthetic_high_risk_1.json");

    const events = store.getSnapshot().events;
    const after = visibleEvents(events, csaOperator);

    expect(events).toHaveLength(2);
    expect(after).toEqual(before);
    expect(visibleEvents(events, admin)).toHaveLength(2);
    expect(visibleEvents(events, testOperator)).toHaveLength(1);
  });

  it("applies subscription filtering to specialists", () => {
    const store = createStore();

    const specialist: SubscriptionUser = {
      ...csaOperator,
      id: "specialist",
      role: "specialist",
    };

    expect(
      visibleEvents(store.getSnapshot().events, specialist)
    ).toEqual(
      visibleEvents(store.getSnapshot().events, csaOperator)
    );
  });
});