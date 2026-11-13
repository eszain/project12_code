
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  EMPTY_MUTE_STATE,
  activeMuteCount,
  getActiveMute,
  isEventMuted,
  muteEvent,
  resumeEvent,
  snoozeEvent,
} from "./mute";

describe("Mute & Snooze", () => {
  const now = Date.UTC(
    2026,
    10,
    12,
    12,
    0,
    0,
  );

  it("mutes one event without muting others", () => {
    const state = muteEvent(
      EMPTY_MUTE_STATE,
      1,
      "Operator reviewing the event",
      now,
    );

    expect(isEventMuted(state, 1, now)).toBe(true);
    expect(isEventMuted(state, 2, now)).toBe(false);
    expect(activeMuteCount(state, now)).toBe(1);

    expect(getActiveMute(state, 1, now)).toMatchObject({
      eventId: 1,
      mode: "mute",
      reason: "Operator reviewing the event",
      until: null,
    });
  });

  it("snoozes until the specified time", () => {
    const until = now + 60 * 60 * 1000;

    const state = snoozeEvent(
      EMPTY_MUTE_STATE,
      3,
      until,
      "Waiting for the next CDM",
      now,
    );

    expect(isEventMuted(state, 3, now)).toBe(true);

    expect(
      isEventMuted(state, 3, until - 1),
    ).toBe(true);

    expect(
      isEventMuted(state, 3, until),
    ).toBe(false);

    expect(
      getActiveMute(state, 3, until),
    ).toBeNull();
  });

  it("resumes a muted event and records the reason", () => {
    const muted = muteEvent(
      EMPTY_MUTE_STATE,
      5,
      "Investigation in progress",
      now,
    );

    const resumed = resumeEvent(
      muted,
      5,
      "Investigation completed",
      now + 1000,
    );

    expect(
      isEventMuted(resumed, 5, now + 1000),
    ).toBe(false);

    expect(resumed.entries).toHaveLength(0);
    expect(resumed.history).toHaveLength(2);

    expect(resumed.history[0]).toMatchObject({
      eventId: 5,
      action: "resumed",
      reason: "Investigation completed",
    });

    expect(resumed.history[1]).toMatchObject({
      eventId: 5,
      action: "muted",
      reason: "Investigation in progress",
    });
  });

  it("replaces a mute with a snooze", () => {
    const muted = muteEvent(
      EMPTY_MUTE_STATE,
      7,
      "Initial pause",
      now,
    );

    const until = now + 2 * 60 * 60 * 1000;

    const snoozed = snoozeEvent(
      muted,
      7,
      until,
      "Resume after two hours",
      now + 1000,
    );

    expect(snoozed.entries).toHaveLength(1);

    expect(
      getActiveMute(snoozed, 7, now + 1000),
    ).toMatchObject({
      mode: "snooze",
      until,
    });

    expect(snoozed.history).toHaveLength(2);
  });

  it("requires a reason for mute and snooze", () => {
    expect(() =>
      muteEvent(
        EMPTY_MUTE_STATE,
        1,
        " ",
        now,
      ),
    ).toThrow("A reason is required.");

    expect(() =>
      snoozeEvent(
        EMPTY_MUTE_STATE,
        1,
        now + 1000,
        "",
        now,
      ),
    ).toThrow("A reason is required.");
  });

  it("rejects a snooze deadline in the past", () => {
    expect(() =>
      snoozeEvent(
        EMPTY_MUTE_STATE,
        1,
        now - 1000,
        "Invalid deadline",
        now,
      ),
    ).toThrow(
      "The resume time must be in the future.",
    );
  });

  it("keeps history for separate events", () => {
    const first = muteEvent(
      EMPTY_MUTE_STATE,
      1,
      "First event",
      now,
    );

    const second = snoozeEvent(
      first,
      2,
      now + 60_000,
      "Second event",
      now,
    );

    expect(second.entries).toHaveLength(2);
    expect(second.history).toHaveLength(2);
    expect(activeMuteCount(second, now)).toBe(2);
  });

  it("returns unchanged state when resuming an inactive event", () => {
    const result = resumeEvent(
      EMPTY_MUTE_STATE,
      99,
      "Nothing to resume",
      now,
    );

    expect(result).toBe(EMPTY_MUTE_STATE);
  });
});
