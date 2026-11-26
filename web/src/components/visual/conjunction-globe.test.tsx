// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseDocument, type NormalizedCdm } from "@/lib/cads/parser";
import type { CdmEvent } from "@/lib/cads/store";
import { ConjunctionGlobe } from "./conjunction-globe";

// jsdom has no WebGL, so CesiumJS itself is never loaded here; the loader is mocked. The spy only counts calls:
// a spy that returns a rejected promise keeps its own unhandled copy of it, which fails the test.
const loadCesium = vi.fn();
let loadResult: () => Promise<unknown> = () => new Promise(() => {});
vi.mock("@/lib/cesium-loader", () => ({
  loadCesium: () => {
    loadCesium();
    return loadResult();
  },
}));

beforeEach(() => {
  loadCesium.mockReset();
  loadResult = () => new Promise(() => {});
});
afterEach(cleanup);

const cdmOf = (file: string) => parseDocument(readFileSync(join(__dirname, "../../../public/fixtures", file), "utf8"), file)[0].cdm!;
const eventOf = (cdm: NormalizedCdm): CdmEvent => ({ id: 1, key: "test", pairKey: "test", revisions: [{ id: 1, cdm, sourceFile: "f", sourceLabel: "test", correlationNote: "" }] });

it("waits to load CesiumJS until it is asked, then reports a load failure in plain words", async () => {
  loadResult = () => Promise.reject(new Error("CesiumJS could not be loaded."));
  const user = userEvent.setup();
  render(<ConjunctionGlobe event={eventOf(cdmOf("synthetic/synthetic_high_risk_3.json"))} />);
  expect(screen.getByRole("heading", { name: "3D view" })).toBeTruthy();
  expect(loadCesium).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: /Play 3D replay/ }) as HTMLButtonElement).disabled).toBe(true);

  await user.click(screen.getByRole("button", { name: /Show the 3D view/ }));
  expect(loadCesium).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The 3D view could not start. CesiumJS could not be loaded.");
});

it("describes the pass for screen readers and starts the readout 10 s before the closest approach", () => {
  render(<ConjunctionGlobe event={eventOf(cdmOf("synthetic/synthetic_high_risk_3.json"))} />);
  expect(screen.getByText(/3D view of CADS TEST SAT and CADS TEST DEBRIS passing 62 m apart above/)).toBeTruthy();
  expect(screen.getByText(/−10\.0 s from the closest approach/)).toBeTruthy();
});

it("explains when an event cannot be shown in 3D", () => {
  const cdm = cdmOf("reconstructed/cdm_set_1.json");
  render(<ConjunctionGlobe event={eventOf({ ...cdm, sat2: { ...cdm.sat2, positionKm: null } })} />);
  expect(screen.getByText(/3D view not available for this event\. The CDM has no position and velocity for the secondary object/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Show the 3D view/ })).toBeNull();
});
