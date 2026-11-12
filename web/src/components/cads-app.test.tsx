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

it("loads the CDMs one at a time, oldest first, counting them in the status line", async () => {
  const user = userEvent.setup();
  render(<CadsApp stepDelayMs={40} />);
  await user.click(screen.getByRole("button", { name: /Load data/ }));
  await waitFor(() => expect(screen.getByText(/Loading CDM 2 of 9/)).toBeTruthy()); // still in progress: not all at once
  expect(screen.getByRole("button", { name: /Load data/ })).toHaveProperty("disabled", true); // no second load while one is running
  expect(within(screen.getByRole("list", { name: "Event list" })).getAllByRole("listitem").length).toBeLessThan(3);
  await waitFor(() => expect(screen.getByText(/Loaded 9 CDMs one at a time, oldest first/)).toBeTruthy(), { timeout: 3000 });
  expect(within(screen.getByRole("list", { name: "Event list" })).getAllByRole("listitem")).toHaveLength(3);
});

it("starts empty, loads data, analyses with reasons, and resets", async () => {
  const user = userEvent.setup();
  render(<CadsApp stepDelayMs={0} />);
  expect(screen.getByText(/Empty\. Press/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Run risk analysis/ })).toHaveProperty("disabled", true);

  await user.click(screen.getByRole("button", { name: /Load data/ }));
  const list = () => within(screen.getByRole("list", { name: "Event list" }));
  await waitFor(() => expect(screen.getByText(/Loaded 9 CDMs one at a time/)).toBeTruthy()); // loading finished (analysis is disabled until then)
  expect(list().getAllByRole("listitem")).toHaveLength(3); // 3 events
  expect(screen.getAllByText("run risk analysis")).toHaveLength(3); // severity not shown yet
  expect(list().queryByText("ACTION")).toBeNull();

  // C1: the default Operator view shows only Pc, miss distance, TCA and a one-line call summary
  expect(screen.getByRole("button", { name: "Operator view" })).toHaveProperty("ariaPressed", "true");
  const first = within(list().getAllByRole("listitem")[0]);
  for (const label of [/Closest approach \(TCA\)/, /^Miss distance$/, /Collision chance \(Pc\)/]) expect(first.getByText(label)).toBeTruthy();
  expect(first.getByLabelText("Phone summary").textContent).toMatch(/ and .*: closest approach in .* hours, collision chance /);
  for (const label of [/Position uncertainty/, /Miss distance by direction/, /Last observation of each object/]) expect(first.queryByText(label)).toBeNull();
  expect(screen.queryByText(/CDM history/)).toBeNull();

  await user.click(screen.getByRole("button", { name: /Run risk analysis/ }));
  await waitFor(() => expect(list().getAllByText("ACTION")).toHaveLength(1));
  expect(list().getAllByText("ZERO")).toHaveLength(2);

  // C2: the Specialist view adds A1 to A3 detail; opening a card shows the explanation
  await user.click(screen.getByRole("button", { name: "Specialist view" }));
  const spec = within(list().getAllByRole("listitem")[0]);
  for (const label of [/Closest approach \(TCA\)/, /^Miss distance$/, /Collision chance \(Pc\)/, /Position uncertainty, 1σ/, /Miss distance by direction/, /Last observation of each object/]) expect(spec.getByText(label)).toBeTruthy();
  expect(spec.queryByLabelText("Phone summary")).toBeNull();
  await user.click(screen.getAllByRole("button", { name: /CADS TEST SAT/ })[0]);
  expect(await screen.findByText(/Explanation:/)).toBeTruthy();
  // B1 + B2: history table and both trend charts for the selected event
  expect(screen.getByText(/CDM history \(\d+ updates?, oldest first\)/)).toBeTruthy();
  expect(within(screen.getByRole("table", { name: "CDM history" })).getAllByRole("row").length).toBeGreaterThan(2); // header + at least 2 CDMs
  expect(screen.getByRole("img", { name: /^Pc trend across CDMs/ })).toBeTruthy();
  expect(screen.getByRole("img", { name: /^Miss distance trend across CDMs/ })).toBeTruthy();
  expect(screen.getByText(/The Math/)).toBeTruthy();
  expect(screen.getByText(/Quick Summary/)).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/textlimit|frac1/); // LaTeX rendered, not shown as raw commands

  // Operator cards can open the specialist details for that event
  await user.click(screen.getByRole("button", { name: "Operator view" }));
  expect(screen.queryByText(/Explanation:/)).toBeNull();
  await user.click(within(list().getAllByRole("listitem")[0]).getByRole("button", { name: /Open full details/ }));
  expect(await screen.findByText(/Explanation:/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Specialist view" })).toHaveProperty("ariaPressed", "true");

  await user.click(screen.getByRole("button", { name: "Reset" }));
  await waitFor(() => expect(screen.getByText(/Empty\. Press/)).toBeTruthy());
  expect(within(document.body).queryByText("ACTION")).toBeNull(); // alerts cleared too
});
