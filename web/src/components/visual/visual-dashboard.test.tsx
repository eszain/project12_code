
// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import {
  afterEach,
  beforeAll,
  expect,
  it,
  vi,
} from "vitest";

import { VisualDashboard } from "./visual-dashboard";

beforeAll(() => {
  const mq = (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  });

  vi.stubGlobal("matchMedia", mq);
  window.matchMedia = mq as never;

  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}

    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal("ResizeObserver", Observer);
  vi.stubGlobal("IntersectionObserver", Observer);

  // Load sample fixtures from local files.
  vi.stubGlobal("fetch", async (url: string) => ({
    json: async () =>
      JSON.parse(
        readFileSync(
          join(__dirname, "../../../public", url),
          "utf8",
        ),
      ),
  }));
});

afterEach(() => {
  cleanup();
});

const state = (label: string) =>
  screen
    .getByLabelText(label)
    .closest("[data-state]")
    ?.getAttribute("data-state");

it("renders the dashboard controls and an empty notification panel", async () => {
  const user = userEvent.setup();

  render(<VisualDashboard stepDelayMs={0} />);

  expect(
    screen.getByLabelText("Data and events"),
  ).toBeTruthy();

  expect(
    screen.getByLabelText("Event details"),
  ).toBeTruthy();

  expect(
    screen.getByRole("main", {
      name: "Conjunction player",
    }).textContent,
  ).toBe("");

  expect(
    screen.getByRole("button", {
      name: "Load sample data",
    }),
  ).toBeTruthy();

  expect(
    screen.getByText("No events loaded."),
  ).toBeTruthy();

  await user.click(
    screen.getByRole("button", {
      name: "Open notifications",
    }),
  );

  expect(
    screen.getByText("No notifications yet."),
  ).toBeTruthy();
});

it("loads sample data with one alerted event and shows notifications", async () => {
  const user = userEvent.setup();

  render(<VisualDashboard stepDelayMs={0} />);

  // Load sample data.
  await user.click(
    screen.getByRole("button", {
      name: "Load sample data",
    }),
  );

  // Wait until all sample CDMs are loaded.
  await waitFor(() => {
    expect(
      screen.getByText(
        /Loaded 9 CDMs one at a time, oldest first/,
      ),
    ).toBeTruthy();
  });

  // Exactly one event should have an alert marker.
  expect(
    screen.getAllByText(
      "Alert triggered — review event",
    ),
  ).toHaveLength(1);

  // Open notifications.
  await user.click(
    screen.getByRole("button", {
      name: "Open notifications",
    }),
  );

  // Two alert occurrences may come from different CDM revisions.
  expect(
    screen.getByText("Notifications (2)"),
  ).toBeTruthy();

  // Select an alert.
  const alertButtons = screen.getAllByRole("button", {
    name: /View alert for Event/,
  });

  expect(alertButtons).toHaveLength(2);

  await user.click(alertButtons[0]);

  // The selected event should show its alert occurrences.
  expect(
    screen.getByText(
      "2 alert(s) triggered. Review this event.",
    ),
  ).toBeTruthy();
});

it("collapses and reopens each sidebar on its own", async () => {
  const user = userEvent.setup();

  render(<VisualDashboard stepDelayMs={0} />);

  const [leftRail, rightRail] =
    screen.getAllByRole("button", {
      name: "Toggle Sidebar",
    });

  expect(state("Data and events")).toBe("expanded");

  await user.click(leftRail);

  expect(state("Data and events")).toBe("collapsed");

  expect(state("Event details")).toBe("expanded");

  await user.click(rightRail);

  expect(state("Event details")).toBe("collapsed");

  await user.click(leftRail);

  expect(state("Data and events")).toBe("expanded");
});
