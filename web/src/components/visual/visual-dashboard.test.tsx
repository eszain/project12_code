// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
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

it("renders the left sidebar, the player and the event details sidebar", () => {
  render(<VisualDashboard stepDelayMs={0} />);

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
});

it("loads the sample events, selects a row, and switches the detail view", async () => {
  const user = userEvent.setup();
  render(<VisualDashboard stepDelayMs={0} />);

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
  render(<VisualDashboard stepDelayMs={0} />);

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

const upload = (name: string, file: string) =>
  new File([readFileSync(path.join(process.cwd(), file), "utf8")], name, { type: "application/json" });

it("shows which uploaded files were accepted and why others were not", async () => {
  const user = userEvent.setup();
  render(<VisualDashboard stepDelayMs={0} />);
  await user.upload(screen.getByLabelText("Choose CDM files (JSON or KVN)"), [
    upload("mine.json", "public/fixtures/synthetic/synthetic_high_risk_3.json"),
    upload("missing_tca.json", "../data/fixtures/invalid/missing_tca.json"),
  ]);
  await waitFor(() => expect(screen.getByText(/1 rejected/)).toBeTruthy());
  await user.click(screen.getByRole("button", { name: /View import report/ }));
  expect(screen.getByText("mine.json")).toBeTruthy();
  expect(screen.getByText("missing_tca.json")).toBeTruthy();
  expect(screen.getByText("Accepted")).toBeTruthy();
  expect(screen.getByText("Rejected")).toBeTruthy();
  expect(screen.getByText("TCA is missing.")).toBeTruthy();
});

it("shows the stored CDM fields unchanged in the specialist view", async () => {
  const user = userEvent.setup();
  render(<VisualDashboard stepDelayMs={0} />);
  await user.upload(screen.getByLabelText("Choose CDM files (JSON or KVN)"), upload("mine.json", "public/fixtures/synthetic/synthetic_high_risk_3.json"));
  const [row] = await screen.findAllByRole("button", { name: /Select .*Severity/ });
  await user.click(row);
  await user.click(screen.getByRole("button", { name: "Specialist" }));
  await user.click(screen.getByRole("button", { name: "View original CDM" }));
  const raw = screen.getByLabelText("Original CDM fields").textContent ?? "";
  expect(raw).toContain("COLLISION_PROBABILITY");
  expect(raw).toContain("3.888786E-04");
});
