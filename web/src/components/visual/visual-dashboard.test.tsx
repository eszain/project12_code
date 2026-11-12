// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
