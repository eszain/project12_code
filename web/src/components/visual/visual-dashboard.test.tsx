
// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
} from "@testing-library/react";

import {
  afterEach,
  beforeAll,
  expect,
  it,
  vi,
} from "vitest";

import { VisualDashboard } from "./visual-dashboard";

beforeAll(() => {
  const mq = (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  });

  vi.stubGlobal("matchMedia", mq);
  window.matchMedia = mq as never;

  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal("ResizeObserver", Observer);
});

afterEach(cleanup);

it("renders the dashboard with a notifications trigger and rule editor", () => {
  render(<VisualDashboard />);

  expect(
    screen.getByLabelText("Data and events")
  ).toBeTruthy();

  expect(
    screen.getByLabelText("Event details")
  ).toBeTruthy();

  expect(
    screen.getByRole("main", {
      name: "Conjunction player",
    })
  ).toBeTruthy();

  expect(
    screen.getByRole("button", {
      name: /Notifications/,
    })
  ).toBeTruthy();

  expect(
    screen.getByRole("button", {
      name: /Alert rules/,
    })
  ).toBeTruthy();
});
