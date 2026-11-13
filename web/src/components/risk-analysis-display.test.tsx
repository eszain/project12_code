// @vitest-environment jsdom
// The four risk checks appear in the event summary card only after "Run risk analysis" (issue #9).
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeEvent } from "@/lib/cads/analyze";
import { Store, latestRevision } from "@/lib/cads/store";
import { EventSummaryCard } from "./event-summary-card";

const DATA = join(__dirname, "../../../data/fixtures");
const HOUR = 3600000;

function testEvent() {
  const store = new Store();
  store.importDocuments([1, 2, 3].map((n) => ({ name: `synthetic_high_risk_${n}.json`, content: readFileSync(join(DATA, "synthetic", `synthetic_high_risk_${n}.json`), "utf8"), label: "test" })));
  return store.getSnapshot().events[0];
}

afterEach(cleanup);

describe("risk analysis in the event summary card", () => {
  const event = testEvent();
  const now = latestRevision(event).cdm.tca - 15.7 * HOUR;

  it("is hidden until the risk analysis has been run", () => {
    render(<EventSummaryCard event={event} now={now} selected onSelect={() => {}} view="operator" />);
    expect(screen.queryByLabelText("Risk analysis")).toBeNull();
  });

  it("shows the four checks after the risk analysis, in both views", () => {
    for (const view of ["operator", "specialist"] as const) {
      render(<EventSummaryCard event={event} analysis={analyzeEvent(event, now)} now={now} selected onSelect={() => {}} view={view} />);
      const block = within(screen.getByLabelText("Risk analysis"));
      expect(block.getByText(/1 in 2,571: at or above the action level/)).toBeTruthy();
      expect(block.getByText("Rising: 1 in 5,528 to 1 in 2,571")).toBeTruthy();
      expect(block.getByText(/62 m miss \/ 117 m uncertainty = 0.5x, so low confidence/)).toBeTruthy();
      expect(block.getByText("15.7 h until closest approach")).toBeTruthy();
      cleanup();
    }
  });
});
