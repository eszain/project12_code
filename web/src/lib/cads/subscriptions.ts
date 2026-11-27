import type { CdmEvent } from "./store";

export type UserRole = "admin" | "operator" | "specialist";

export interface SubscriptionGroup {
  id: string;
  name: string;
  satelliteDesignators: string[];
}

export interface SubscriptionUser {
  id: string;
  name: string;
  role: UserRole;
  groupIds: string[];
  satelliteDesignators: string[];
}

export const MOCK_GROUPS: SubscriptionGroup[] = [
  {
    id: "csa",
    name: "CSA",
    satelliteDesignators: ["27858"],
  },
];

export const MOCK_USERS: SubscriptionUser[] = [
  {
    id: "admin",
    name: "Admin",
    role: "admin",
    groupIds: [],
    satelliteDesignators: [],
  },
  {
    id: "csa-operator",
    name: "CSA operator",
    role: "operator",
    groupIds: ["csa"],
    satelliteDesignators: [],
  },
  {
    id: "test-operator",
    name: "Test operator",
    role: "operator",
    groupIds: [],
    satelliteDesignators: ["99901"],
  },
];

export function getSubscribedDesignators(
  user: SubscriptionUser,
  groups: SubscriptionGroup[] = MOCK_GROUPS
): Set<string> {
  const designators = new Set(
    user.satelliteDesignators.map((id) => id.trim())
  );

  for (const group of groups) {
    if (user.groupIds.includes(group.id)) {
      for (const designator of group.satelliteDesignators) {
        designators.add(designator.trim());
      }
    }
  }

  return designators;
}

export function visibleEvents(
  events: CdmEvent[],
  user: SubscriptionUser,
  groups: SubscriptionGroup[] = MOCK_GROUPS
): CdmEvent[] {
  if (user.role === "admin") {
    return events;
  }

  const subscribedDesignators = getSubscribedDesignators(
    user,
    groups
  );

  return events.filter((event) =>
    event.revisions.some(({ cdm }) =>
      subscribedDesignators.has(cdm.sat1.designator.trim()) ||
      subscribedDesignators.has(cdm.sat2.designator.trim())
    )
  );
}