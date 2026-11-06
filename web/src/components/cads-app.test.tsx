// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { CadsApp } from "./cads-app";

beforeAll(() => {
  const mq = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
  vi.stubGlobal("matchMedia", mq);
  window.matchMedia = mq as never;
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  vi.stubGlobal("IntersectionObserver", IO);
  vi.stubGlobal("fetch", async (url: string) => ({ json: async () => JSON.parse(readFileSync(join(__dirname, "../../public", url), "utf8")) }));
});
afterEach(cleanup);

it("starts empty, loads data, analyses with reasons, and resets", async () => {
  const user = userEvent.setup();
  render(<CadsApp />);
  expect(screen.getByText(/Empty\. Press/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Run risk analysis/ })).toHaveProperty("disabled", true);

  await user.click(screen.getByRole("button", { name: /Load data/ }));
  await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(3)); // header + 3 events (+ alerts rows)
  expect(screen.getAllByText("run risk analysis")).toHaveLength(3); // severity not shown yet
  const events = () => within(screen.getAllByRole("table")[0]); // Alerts table is separate: its badges are not the analysis
  expect(events().queryByText("ACTION")).toBeNull();

  await user.click(screen.getByRole("button", { name: /Run risk analysis/ }));
  await waitFor(() => expect(events().getAllByText("ACTION")).toHaveLength(1));
  expect(events().getAllByText("ZERO")).toHaveLength(2);

  // Pressing an event row displays the Explanation section with LaTeX math work and ELI5 explanation
  await user.click(screen.getAllByRole("button", { name: /CADS TEST SAT/ })[0]);
  expect(await screen.findByText(/Explanation:/)).toBeTruthy();
  expect(screen.getByText(/The Math/)).toBeTruthy();
  expect(screen.getByText(/Quick Summary/)).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Reset" }));
  await waitFor(() => expect(screen.getByText(/Empty\. Press/)).toBeTruthy());
  expect(within(document.body).queryByText("ACTION")).toBeNull(); // alerts cleared too
});
