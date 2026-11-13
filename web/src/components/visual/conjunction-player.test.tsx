// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { parseDocument } from "@/lib/cads/parser";
import type { CdmEvent } from "@/lib/cads/store";
import { ConjunctionPlayer } from "./conjunction-player";

let reducedMotion = false;
beforeAll(() => {
  const mq = (q: string) => ({ matches: q.includes("reduce") && reducedMotion, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
  vi.stubGlobal("matchMedia", mq);
  window.matchMedia = mq as never;
});
afterEach(() => {
  cleanup();
  reducedMotion = false;
});

const eventFrom = (file: string): CdmEvent => {
  const cdm = parseDocument(readFileSync(join(__dirname, "../../../public/fixtures", file), "utf8"), file)[0].cdm!;
  return { id: 1, key: "test", pairKey: "test", revisions: [{ id: 1, cdm, sourceFile: file, sourceLabel: "test", correlationNote: "" }] };
};
const highRisk = () => eventFrom("synthetic/synthetic_high_risk_3.json");

it("leads with a plain-language verdict and no Pc on the stage", () => {
  render(<ConjunctionPlayer event={highRisk()} />);
  expect(screen.getByText("Too close: a maneuver may be needed")).toBeTruthy();
  expect(screen.getByRole("img").textContent).not.toMatch(/Pc|probability|E-0/i);
  expect(screen.getByRole("img").textContent).toMatch(/passes \d+ m away at its closest/);
});

it("says a low-risk pass is safe", () => {
  render(<ConjunctionPlayer event={eventFrom("reconstructed/cdm_set_6.json")} />);
  expect(screen.getByText("Safe pass")).toBeTruthy();
});

it("plays, pauses, scrubs and resets", async () => {
  const user = userEvent.setup();
  render(<ConjunctionPlayer event={highRisk()} />);
  const scrub = screen.getByRole("slider", { name: "Position in the pass" }) as HTMLInputElement;

  await user.click(screen.getByRole("button", { name: "Play" }));
  expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Pause" }));
  expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();

  fireEvent.change(scrub, { target: { value: "500" } });
  expect(scrub.getAttribute("aria-valuetext")).toMatch(/^Closest approach, \d+ m apart$/);

  await user.click(screen.getByRole("button", { name: /Reset/ }));
  expect(scrub.value).toBe("0");
});

it("changes the playback speed", async () => {
  const user = userEvent.setup();
  render(<ConjunctionPlayer event={highRisk()} />);
  const before = screen.getByText(/slower than real life/).textContent;
  await user.click(screen.getByRole("button", { name: "Slower" }));
  expect(screen.getByRole("button", { name: "Slower" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText(/slower than real life/).textContent).not.toBe(before);
});

it("labels the what-if as imaginary and only collides there", async () => {
  const user = userEvent.setup();
  render(<ConjunctionPlayer event={highRisk()} />);
  const scrub = screen.getByRole("slider", { name: "Position in the pass" }) as HTMLInputElement;
  // Real playback, scrubbed to the end: no collision.
  fireEvent.change(scrub, { target: { value: "1000" } });
  expect(scrub.getAttribute("aria-valuetext")).not.toMatch(/collision/i);

  await user.click(screen.getByRole("button", { name: /What if they hit\? \(imaginary\)/ }));
  expect(screen.getByRole("note").textContent).toMatch(/What-if only.*not a prediction/);
  fireEvent.change(scrub, { target: { value: scrub.max } });
  expect(scrub.getAttribute("aria-valuetext")).toBe("Imaginary collision");
  expect(screen.getByText(/burst shows what a collision would look like/)).toBeTruthy();

  await user.click(screen.getByRole("button", { name: /Back to the real pass/ }));
  expect(screen.queryByRole("note")).toBeNull();
});

it("still plays when reduced motion is on, and shows the burst without flying particles", async () => {
  reducedMotion = true;
  const user = userEvent.setup();
  const { container } = render(<ConjunctionPlayer event={highRisk()} />);
  await user.click(screen.getByRole("button", { name: "Play" }));
  expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  expect((screen.getByRole("slider") as HTMLInputElement).value).not.toBe("1000");

  await user.click(screen.getByRole("button", { name: /What if they hit/ }));
  const scrub = screen.getByRole("slider") as HTMLInputElement;
  fireEvent.change(scrub, { target: { value: scrub.max } });
  const particle = container.querySelector(".player-particle")!;
  expect(Number(particle.getAttribute("cx"))).not.toBe(400); // already spread out, not flying from the centre
});
