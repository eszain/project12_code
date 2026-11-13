// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { VisualDashboard } from "./visual-dashboard";

beforeAll(() => {
  const mq = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
  vi.stubGlobal("matchMedia", mq);
  window.matchMedia = mq as never;
  class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  vi.stubGlobal("ResizeObserver", Observer);
});
afterEach(cleanup);

const state = (label: string) => screen.getByLabelText(label).closest("[data-state]")?.getAttribute("data-state");

it("renders the empty shell: a left and a right sidebar around an empty centre", () => {
  render(<VisualDashboard />);
  expect(screen.getByLabelText("Data and events")).toBeTruthy();
  expect(screen.getByLabelText("Event details")).toBeTruthy();
  expect(screen.getByRole("main", { name: "Conjunction player" }).textContent).toBe("");
});

it("collapses and reopens each sidebar on its own", async () => {
  const user = userEvent.setup();
  render(<VisualDashboard />);
  const [leftRail, rightRail] = screen.getAllByRole("button", { name: "Toggle Sidebar" });
  expect(state("Data and events")).toBe("expanded");
  await user.click(leftRail);
  expect(state("Data and events")).toBe("collapsed");
  expect(state("Event details")).toBe("expanded");
  await user.click(rightRail);
  expect(state("Event details")).toBe("collapsed");
  await user.click(leftRail);
  expect(state("Data and events")).toBe("expanded");
});

it("shows which uploaded files were accepted and why others were not", async () => {
  const user = userEvent.setup();
  render(<VisualDashboard stepDelayMs={0} />);
  const good = new File(
    [readFileSync(join(__dirname, "../../../public/fixtures/synthetic/synthetic_high_risk_3.json"), "utf8")],
    "mine.json",
    { type: "application/json" },
  );
  const bad = new File(
    [readFileSync(join(__dirname, "../../../../data/fixtures/invalid/missing_tca.json"), "utf8")],
    "missing_tca.json",
    { type: "application/json" },
  );
  await user.upload(screen.getByLabelText("Choose CDM files (JSON or KVN)"), [good, bad]);
  await waitFor(() => expect(screen.getByText(/1 rejected/)).toBeTruthy());
  await user.click(screen.getByRole("button", { name: "View import report" }));
  expect(screen.getByText("mine.json")).toBeTruthy();
  expect(screen.getByText("missing_tca.json")).toBeTruthy();
  expect(screen.getByText("Accepted")).toBeTruthy();
  expect(screen.getByText("Rejected")).toBeTruthy();
  expect(screen.getByText("TCA is missing.")).toBeTruthy();
});

it("shows the stored CDM fields unchanged in the specialist view", async () => {
  const user = userEvent.setup();
  render(<VisualDashboard stepDelayMs={0} />);
  const good = new File(
    [readFileSync(join(__dirname, "../../../public/fixtures/synthetic/synthetic_high_risk_3.json"), "utf8")],
    "mine.json",
    { type: "application/json" },
  );
  await user.upload(screen.getByLabelText("Choose CDM files (JSON or KVN)"), good);
  await waitFor(() => expect(screen.getByRole("button", { name: /Event 1/ })).toBeTruthy());
  await user.click(screen.getByRole("button", { name: /Event 1/ }));
  await user.click(screen.getByRole("button", { name: "specialist" }));
  await user.click(screen.getByRole("button", { name: "View original CDM" }));
  const raw = screen.getByLabelText("Original CDM fields").textContent ?? "";
  expect(raw).toContain("COLLISION_PROBABILITY");
  expect(raw).toContain("3.888786E-04");
});
