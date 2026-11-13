// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { CadsApp } from "./cads-app";
import { IndexedDbEventPersistence } from "@/lib/cads/event-persistence";

const testPersistence = new IndexedDbEventPersistence();

beforeEach(async () => {
  await testPersistence.clear();
});

beforeAll(() => {
  const mq = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
  vi.stubGlobal("matchMedia", mq);
  window.matchMedia = mq as never;
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  vi.stubGlobal("IntersectionObserver", IO);
  vi.stubGlobal("fetch", async (url: string) => ({ json: async () => JSON.parse(readFileSync(join(__dirname, "../../public", url), "utf8")) }));
});
// A dashboard's queued saves can still land after it unmounts, so let them finish before the next test clears storage.
// shortcut: fixed 200 ms wait; expose the save queue from useCadsSession if this ever proves too short.
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 200));
  await testPersistence.clear();
});

it("loads the CDMs one at a time, oldest first, counting them in the status line", async () => {
  const user = userEvent.setup();

render(<CadsApp stepDelayMs={40} />);

// Wait until IndexedDB initialization is complete
// and the dashboard is ready for interaction.
await waitFor(() => {
  expect(
    screen.getByRole("button", { name: /Load data/ })
  ).toHaveProperty("disabled", false);
});

await user.click(
  screen.getByRole("button", { name: /Load data/ })
);

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

  // Load is disabled until the saved session has been restored from IndexedDB.
  await waitFor(() => expect(screen.getByRole("button", { name: /Load data/ })).toHaveProperty("disabled", false));
  await user.click(screen.getByRole("button", { name: /Load data/ }));
  const list = () => within(screen.getByRole("list", { name: "Event list" }));
  await waitFor(() => expect(screen.getByText(/Loaded 9 CDMs one at a time/)).toBeTruthy(), { timeout: 5000 }); // loading finished (analysis is disabled until then)
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
  // G7, G8: operator cards say what to do, and the legend explains the bands
  expect(list().getByText("Action required: plan a maneuver")).toBeTruthy();
  expect(list().getAllByText("No action")).toHaveLength(2);
  expect(screen.getByRole("table", { name: "Severity bands" })).toBeTruthy();

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
  expect(screen.getByRole("img", { name: /^Encounter plane for / })).toBeTruthy(); // G4
  expect(screen.getByRole("img", { name: /^Miss distance trend across CDMs/ })).toBeTruthy();
  expect(screen.getByText(/The Math/)).toBeTruthy();
  // A4, A5: miss against uncertainty on the card, and the four-step calculation details
  expect(within(list().getAllByRole("listitem")[0]).getByText(/Miss distance compared with uncertainty/)).toBeTruthy();
  expect(screen.getByText("How this was calculated")).toBeTruthy();
  expect(screen.getByText(/Step 4\. Our own check of the collision chance/)).toBeTruthy();
  expect(screen.getByRole("table", { name: "Position uncertainty by object" })).toBeTruthy();
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
  expect(screen.queryByRole("list", { name: "Event list" })).toBeNull(); // events (and their ACTION badges) cleared
});

it("archives and restores events, and filters by search and severity after the analysis", async () => {
  const user = userEvent.setup();
  render(<CadsApp stepDelayMs={0} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /Load data/ })).toHaveProperty("disabled", false));
  await user.click(screen.getByRole("button", { name: /Load data/ }));
  await waitFor(() => expect(screen.getByText(/Loaded 9 CDMs one at a time/)).toBeTruthy(), { timeout: 5000 });
  const list = () => within(screen.getByRole("list", { name: "Event list" }));
  expect(list().getAllByRole("listitem")).toHaveLength(3);

  // D1: archive one event by hand; it moves to the Archived tab and back
  await user.click(within(list().getAllByRole("listitem")[0]).getByRole("button", { name: "Archive" }));
  expect(list().getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Active (2)" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Archived (1)" }));
  expect(list().getAllByRole("listitem")).toHaveLength(1);
  await user.click(within(list().getAllByRole("listitem")[0]).getByRole("button", { name: "Restore to active" }));
  await user.click(screen.getByRole("button", { name: "Active (3)" }));
  expect(list().getAllByRole("listitem")).toHaveLength(3);

  // G6: severity filters wait for the analysis, then work
  const severity = screen.getByLabelText("Severity") as HTMLSelectElement;
  expect(severity.disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: /Run risk analysis/ }));
  await waitFor(() => expect(severity.disabled).toBe(false));
  await user.selectOptions(severity, "ACTION");
  expect(list().getAllByRole("listitem")).toHaveLength(1);
  await user.selectOptions(severity, "all");
  await user.click(screen.getByLabelText("Needs attention only"));
  expect(list().getAllByRole("listitem")).toHaveLength(1);
  await user.click(screen.getByLabelText("Needs attention only"));
  await user.type(screen.getByPlaceholderText(/Search object name or number/), "debris");
  expect(list().getAllByRole("listitem").length).toBeGreaterThan(0);
  await user.clear(screen.getByPlaceholderText(/Search object name or number/));
  await user.type(screen.getByPlaceholderText(/Search object name or number/), "zzz");
  expect(screen.getByText(/No active events match these filters/)).toBeTruthy();
});

it("adds generated test events, pages through them, and reset clears them", async () => {
  const user = userEvent.setup();
  render(<CadsApp stepDelayMs={0} />);
  await user.click(screen.getByRole("button", { name: /Add 60 test events/ }));
  await waitFor(() => expect(screen.getByText(/Added 60 generated test events/)).toBeTruthy(), { timeout: 8000 });
  const list = () => within(screen.getByRole("list", { name: "Event list" }));
  expect(list().getAllByRole("listitem")).toHaveLength(6); // one page
  expect(screen.getByText(/Showing 1–6 of \d+/)).toBeTruthy();
  const first = list().getAllByRole("listitem")[0].textContent;
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText(/Page 2 of \d+/)).toBeTruthy();
  expect(list().getAllByRole("listitem")[0].textContent).not.toBe(first);
  await user.click(screen.getByRole("button", { name: "Reset" }));
  await waitFor(() => expect(screen.getByText(/Empty\. Press/)).toBeTruthy());
}, 20000);

it("loads CDM files the user chooses, one at a time, and reports a bad file", async () => {
  const user = userEvent.setup();
  render(<CadsApp stepDelayMs={0} />);
  const good = new File([readFileSync(join(__dirname, "../../public/fixtures/synthetic/synthetic_high_risk_3.json"), "utf8")], "mine.json", { type: "application/json" });
  const bad = new File(["this is not a CDM"], "broken.txt", { type: "text/plain" });
  await user.upload(screen.getByLabelText("Choose CDM files (JSON or KVN)"), [good, bad]);
  await waitFor(() => expect(screen.getByText(/Loaded 1 CDMs one at a time/)).toBeTruthy());
  expect(screen.getByText(/1 rejected/)).toBeTruthy();
  // The file's closest approach (Feb 2026) has passed, so the event archives itself and the empty Active list says why.
  expect(screen.getByText(/1 archived event \(closest approach already passed\)/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Archived (1)" }));
  expect(within(screen.getByRole("list", { name: "Event list" })).getAllByRole("listitem")).toHaveLength(1);
});
