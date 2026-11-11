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
  const list = () => within(screen.getByRole("list", { name: "Event list" }));
  await waitFor(() => expect(list().getAllByRole("listitem")).toHaveLength(3)); // 3 events
  expect(screen.getAllByText("run risk analysis")).toHaveLength(3); // severity not shown yet
  expect(list().queryByText("ACTION")).toBeNull();

  // A1 + A2: every card shows only the front-line numbers
  const first = within(list().getAllByRole("listitem")[0]);
  for (const label of [/Closest approach \(TCA\)/, /^Miss distance$/, /Collision chance \(Pc\)/, /Position uncertainty, 1σ/, /Miss distance by direction/]) expect(first.getByText(label)).toBeTruthy();

  await user.click(screen.getByRole("button", { name: /Run risk analysis/ }));
  await waitFor(() => expect(list().getAllByText("ACTION")).toHaveLength(1));
  expect(list().getAllByText("ZERO")).toHaveLength(2);

  // Pressing an event row displays the Explanation section with LaTeX math work and ELI5 explanation
  await user.click(screen.getAllByRole("button", { name: /CADS TEST SAT/ })[0]);
  expect(await screen.findByText(/Explanation:/)).toBeTruthy();
  expect(screen.getByText(/The Math/)).toBeTruthy();
  expect(screen.getByText(/Quick Summary/)).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Reset" }));
  await waitFor(() => expect(screen.getByText(/Empty\. Press/)).toBeTruthy());
  expect(within(document.body).queryByText("ACTION")).toBeNull(); // alerts cleared too
});
