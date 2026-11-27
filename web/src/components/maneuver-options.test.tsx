// @vitest-environment jsdom
// The maneuver options chart shows for events at the action level, and only a reason otherwise (issue #27).
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseDocument, type NormalizedCdm } from "@/lib/cads/parser";
import { ManeuverOptions } from "./maneuver-options";

const FIXTURES = join(__dirname, "../../public/fixtures");
const load = (path: string): NormalizedCdm => parseDocument(readFileSync(join(FIXTURES, path), "utf8"), path)[0].cdm!;

afterEach(cleanup);

describe("maneuver options chart", () => {
  it("draws the lines, the half-orbit marker, a legend and a table for a close event", async () => {
    const { container } = render(<ManeuverOptions cdm={load("synthetic/synthetic_high_risk_3.json")} />);
    expect(screen.getByText("Working out the burn options…")).toBeTruthy(); // shown first, the work follows
    const section = within(await screen.findByLabelText("Maneuver options", {}, { timeout: 20_000 }));
    await screen.findByText("½ orbit before TCA", {}, { timeout: 20_000 });
    expect(section.getByText("Maneuver options (study only, never a command)")).toBeTruthy();
    expect(section.getByText("½ orbit before TCA")).toBeTruthy();
    expect(section.getByText("Δv (cm/s)")).toBeTruthy();
    expect(section.getByText("Hours before TCA (log scale)")).toBeTruthy();
    expect(container.querySelectorAll("polyline")).toHaveLength(3);
    expect(section.getByText("to reach 1 in 10k")).toBeTruthy();
    expect(section.getByLabelText("Burns to reach 1 in 10k").querySelectorAll("tbody tr")).toHaveLength(8);
    expect(section.getByText(/The lines are not straight/)).toBeTruthy();
  }, 30_000);

  it("shows only the reason for an event below the action level", async () => {
    const { container } = render(<ManeuverOptions cdm={load("reconstructed/cdm_set_6.json")} />);
    expect(await screen.findByText(/Pc below the 1 in 10k maneuver-study threshold/)).toBeTruthy();
    expect(container.querySelector("polyline")).toBeNull();
  });
});
