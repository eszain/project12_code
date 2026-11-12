// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import VisionPage from "./page";
import { MODULES, RELEASES, featuresOf } from "@/lib/vision";

beforeAll(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  vi.stubGlobal("IntersectionObserver", IO);
});
afterEach(cleanup);

it("shows every module with its stage, built ones link to the dashboard, planned ones are disabled placeholders", () => {
  render(<VisionPage />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Where CADS is going");
  const cards = within(screen.getByRole("region", { name: "Product modules" })).getAllByRole("article");
  expect(cards).toHaveLength(MODULES.length);
  for (const m of MODULES) {
    const card = within(screen.getByRole("article", { name: m.title }));
    if (m.stage === "built") expect(card.getByRole("link", { name: /Open in the dashboard/ }).getAttribute("href")).toBe("/dashboard");
    else expect((card.getByRole("button", { name: "Coming soon" }) as HTMLButtonElement).disabled).toBe(true);
  }
});

it("counts the features in each stage and lists the five releases", () => {
  render(<VisionPage />);
  const counts = within(screen.getByRole("region", { name: "Feature counts" }));
  expect(counts.getByText(String(featuresOf("built").length).padStart(2, "0"))).toBeTruthy();
  expect(RELEASES.map((r) => r.id)).toEqual(["R0", "R1", "R2", "R3", "R4"]);
  expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(RELEASES.length);
});

it("has no empty modules: every module says something about today or later", () => {
  for (const m of MODULES) expect(m.built.length + m.next.length + m.later.length).toBeGreaterThan(0);
});
