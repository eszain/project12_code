// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import Home from "./page";

// The 3D Earth needs WebGL, which jsdom does not have; the scene itself is checked in a real browser.
vi.mock("@/components/scene/earth-visual", () => ({ EarthVisual: () => <div data-testid="earth" /> }));

beforeAll(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  vi.stubGlobal("IntersectionObserver", IO);
});
afterEach(cleanup);

it("landing page shows the headline, the 3D scene slot, and links to the dashboard and placeholder pages", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Collision Risk");
  expect(screen.getByTestId("earth")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Open Dashboard/ }).getAttribute("href")).toBe("/dashboard");
  const nav = within(screen.getByRole("navigation", { name: "Primary navigation" }));
  for (const [label, href] of [["Vision", "/vision"], ["Events", "/events"], ["Analysis", "/analysis"], ["Alerts", "/alerts"]]) {
    expect(nav.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
  }
  expect(nav.getByRole("link", { name: /Operator Console/ }).getAttribute("href")).toBe("/dashboard");
});
