// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import Page from "./page";
import { ACCEPTANCE, BACKLOG, CRITERIA, DIAGRAMS, SPRINTS, STORIES, TEST_RUNS, totalWeight } from "@/lib/site-visit";

beforeAll(() => {
  class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  vi.stubGlobal("IntersectionObserver", Observer);
  vi.stubGlobal("ResizeObserver", Observer);
  const mq = (query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
  vi.stubGlobal("matchMedia", mq);
  window.matchMedia = mq as never;
});
afterEach(cleanup);

it("has one section per rubric criterion, each quoting the Excellent descriptor and listing its evidence", () => {
  render(<Page />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Site visit evidence");
  expect(CRITERIA).toHaveLength(8);
  expect(totalWeight()).toBe(100);
  for (const c of CRITERIA) {
    const section = within(screen.getByRole("region", { name: c.title }));
    expect(section.getByText(c.excellent)).toBeTruthy();
    expect(within(section.getByRole("list", { name: `Evidence for criterion ${c.n}` })).getAllByRole("listitem")).toHaveLength(c.claims.length);
  }
});

it("the sidebar links to every criterion and to the evidence the visit asks for", () => {
  render(<Page />);
  const criteria = within(screen.getByRole("navigation", { name: "Rubric criteria" }));
  for (const c of CRITERIA) expect(criteria.getByRole("link", { name: `${c.n}. ${c.short}` }).getAttribute("href")).toBe(`#${c.id}`);
  const evidence = within(screen.getByRole("navigation", { name: "Jump to evidence" }));
  for (const label of ["System architecture", "UML diagrams", "User stories", "Sprint boards", "Testing plan", "Test evidence", "Functional increments"]) {
    const target = evidence.getByRole("link", { name: label }).getAttribute("href")!;
    expect(document.querySelector(target), `${label} target ${target}`).not.toBeNull();
  }
  expect(screen.getByRole("button", { name: "Toggle section sidebar" })).toBeTruthy();
});

it("shows the stories, acceptance criteria, backlog, sprint boards and test results", () => {
  render(<Page />);
  expect(within(screen.getByRole("table", { name: "User stories" })).getAllByRole("row")).toHaveLength(STORIES.length + 1);
  expect(within(screen.getByRole("table", { name: "Product backlog" })).getAllByRole("row")).toHaveLength(BACKLOG.length + 1);
  expect(within(screen.getByRole("table", { name: "Requirements coverage" })).getAllByRole("row")).toHaveLength(ACCEPTANCE.length + 1);
  for (const s of SPRINTS) expect(screen.getByRole("tab", { name: s.name })).toBeTruthy();
  for (const run of TEST_RUNS) {
    expect(run.passed + run.failed).toBe(run.total);
    expect(run.files.reduce((n, f) => n + f.tests, 0)).toBe(run.total);
    expect(screen.getByText(run.suite)).toBeTruthy();
  }
});

it("every diagram file exists and has a text description", () => {
  for (const d of Object.values(DIAGRAMS)) {
    expect(existsSync(path.join(process.cwd(), "public", d.src)), d.src).toBe(true);
    expect(d.alt.length).toBeGreaterThan(40);
  }
});

it("has a header button that switches the page between light and dark", () => {
  render(<Page />);
  expect(screen.getByRole("button", { name: /Switch to (light|dark) theme/ })).toBeTruthy();
});
