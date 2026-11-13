
export type MuteMode = "mute" | "snooze";

export interface EventMute {
  eventId: number;
  mode: MuteMode;
  reason: string;
  createdAt: number;
  until: number | null;
}

export interface MuteHistoryEntry {
  id: number;
  eventId: number;
  action: "muted" | "snoozed" | "resumed";
  reason: string;
  at: number;
  until: number | null;
}

export interface MuteState {
  entries: EventMute[];
  history: MuteHistoryEntry[];
  nextId: number;
}

export const EMPTY_MUTE_STATE: MuteState = {
  entries: [],
  history: [],
  nextId: 1,
};

export function isEventMuted(
  state: MuteState,
  eventId: number,
  now: number = Date.now(),
): boolean {
  const entry = state.entries.find(
    (item) => item.eventId === eventId,
  );

  if (!entry) return false;

  if (entry.mode === "mute") return true;

  return entry.until !== null && now < entry.until;
}

export function getActiveMute(
  state: MuteState,
  eventId: number,
  now: number = Date.now(),
): EventMute | null {
  if (!isEventMuted(state, eventId, now)) {
    return null;
  }

  return (
    state.entries.find(
      (entry) => entry.eventId === eventId,
    ) ?? null
  );
}

export function muteEvent(
  state: MuteState,
  eventId: number,
  reason: string,
  now: number = Date.now(),
): MuteState {
  const trimmed = reason.trim();

  if (!trimmed) {
    throw new Error("A reason is required.");
  }

  const entry: EventMute = {
    eventId,
    mode: "mute",
    reason: trimmed,
    createdAt: now,
    until: null,
  };

  return {
    entries: [
      ...state.entries.filter(
        (item) => item.eventId !== eventId,
      ),
      entry,
    ],
    history: [
      {
        id: state.nextId,
        eventId,
        action: "muted",
        reason: trimmed,
        at: now,
        until: null,
      },
      ...state.history,
    ],
    nextId: state.nextId + 1,
  };
}

export function snoozeEvent(
  state: MuteState,
  eventId: number,
  until: number,
  reason: string,
  now: number = Date.now(),
): MuteState {
  const trimmed = reason.trim();

  if (!trimmed) {
    throw new Error("A reason is required.");
  }

  if (!Number.isFinite(until) || until <= now) {
    throw new Error(
      "The resume time must be in the future.",
    );
  }

  const entry: EventMute = {
    eventId,
    mode: "snooze",
    reason: trimmed,
    createdAt: now,
    until,
  };

  return {
    entries: [
      ...state.entries.filter(
        (item) => item.eventId !== eventId,
      ),
      entry,
    ],
    history: [
      {
        id: state.nextId,
        eventId,
        action: "snoozed",
        reason: trimmed,
        at: now,
        until,
      },
      ...state.history,
    ],
    nextId: state.nextId + 1,
  };
}

export function resumeEvent(
  state: MuteState,
  eventId: number,
  reason: string,
  now: number = Date.now(),
): MuteState {
  const entry = getActiveMute(
    state,
    eventId,
    now,
  );

  if (!entry) return state;

  const trimmed = reason.trim();

  if (!trimmed) {
    throw new Error("A reason is required.");
  }

  return {
    entries: state.entries.filter(
      (item) => item.eventId !== eventId,
    ),
    history: [
      {
        id: state.nextId,
        eventId,
        action: "resumed",
        reason: trimmed,
        at: now,
        until: null,
      },
      ...state.history,
    ],
    nextId: state.nextId + 1,
  };
}

export function activeMuteCount(
  state: MuteState,
  now: number = Date.now(),
): number {
  return state.entries.filter((entry) =>
    isEventMuted(state, entry.eventId, now),
  ).length;
}
