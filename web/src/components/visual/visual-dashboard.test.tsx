
// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
});

afterEach(cleanup);

beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    const relative = url.replace(/^\//, "");
    const file = path.join(process.cwd(), "public", relative);
    const contents = await readFile(file, "utf8");
    return { json: async () => JSON.parse(contents) };
  });
});

it("renders the dashboard with a notifications trigger and rule editor", () => {
  render(<VisualDashboard />);

  expect(
    screen.getByLabelText("Data and events")
  ).toBeTruthy();

  expect(
    screen.getByLabelText("Event details")
  ).toBeTruthy();

  expect(
    screen.getByRole("main", {
      name: "Conjunction player",
    })
  ).toBeTruthy();

  expect(
    screen.getByRole("button", {
      name: /Notifications/,
    })
  ).toBeTruthy();

  expect(
    screen.getByRole("button", {
      name: /Alert rules/,
    })
  ).toBeTruthy();
});

it("loads the sample events, selects a row, and switches the detail view", async () => {
  const user = userEvent.setup();
  render(<VisualDashboard />);

  await user.click(screen.getByRole("button", { name: /Load sample data/ }));
  const rows = await screen.findAllByRole("button", { name: /Select .*Severity/ });
  expect(rows.length).toBeGreaterThan(0);

  await user.click(rows[0]);
  expect(screen.getByTestId("selected-player")).toBeTruthy();
  expect(screen.getByText("Selected event")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Operator" }).getAttribute("aria-pressed")).toBe("true");
  const selectedPlayerTitle = screen.getByTestId("selected-player").querySelector("h2")?.textContent;
  await user.click(screen.getByRole("button", { name: /Open full details/ }));
  expect(screen.getByRole("button", { name: "Specialist" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByTestId("selected-player").querySelector("h2")?.textContent).toBe(selectedPlayerTitle);

  expect(screen.getByText(/REVISION HISTORY/)).toBeTruthy();
  expect(screen.getByTestId("details-scroll")).toBeTruthy();
  expect(screen.getByRole("table", { name: "CDM history" })).toBeTruthy();
  expect(screen.getByText(/Position uncertainty, 1σ/)).toBeTruthy();
  expect(screen.getByText("How this was calculated")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Specialist" }).getAttribute("aria-pressed")).toBe("true");
});

it("supports keyboard event selection and detail-view switching", async () => {
  const user = userEvent.setup();
  render(<VisualDashboard />);

  const loadButton = screen.getByRole("button", { name: /Load sample data/ });
  await user.click(loadButton);
  const rows = await screen.findAllByRole("button", { name: /Select .*Severity/ });

  loadButton.focus();
  let reachedEvent = false;
  for (let i = 0; i < 20 && !reachedEvent; i += 1) {
    await user.tab();
    reachedEvent = document.activeElement === rows[0];
  }
  expect(reachedEvent).toBe(true);

  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.getByTestId("selected-player")).toBeTruthy());
  const selectedHeading = screen.getByText("Selected event").parentElement?.querySelector("h2");
  await waitFor(() => expect(document.activeElement).toBe(selectedHeading));

  const specialist = screen.getByRole("button", { name: "Specialist" });
  specialist.focus();
  fireEvent.keyDown(specialist, { key: " ", code: "Space" });
  await waitFor(() => expect(specialist.getAttribute("aria-pressed")).toBe("true"));

  const operator = screen.getByRole("button", { name: "Operator" });
  operator.focus();
  fireEvent.keyDown(operator, { key: "Enter", code: "Enter" });
  await waitFor(() => expect(operator.getAttribute("aria-pressed")).toBe("true"));

  const fullDetails = screen.getByRole("button", { name: /Open full details/ });
  fullDetails.focus();
  fireEvent.keyDown(fullDetails, { key: "Enter", code: "Enter" });
  await waitFor(() => expect(specialist.getAttribute("aria-pressed")).toBe("true"));
  fireEvent.keyDown(fullDetails, { key: " ", code: "Space" });
  expect(specialist.getAttribute("aria-pressed")).toBe("true");
});
