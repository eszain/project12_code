
"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Database,
  RotateCcw,
  Send,
  SlidersHorizontal,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
} from "@/components/animate-ui/components/radix/sidebar";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";

import { RuleEditor } from "./rule-editor";
import { OutboxPanel } from "./outbox-panel";
import { useCadsSession } from "@/components/use-cads-session";

import {
  latestRevision,
  type AlertOccurrence,
  type CdmEvent,
} from "@/lib/cads/store";

import {
  EMPTY_MUTE_STATE,
  getActiveMute,
  isEventMuted,
  muteEvent,
  resumeEvent,
  snoozeEvent,
  type EventMute,
  type MuteState,
} from "@/lib/cads/mute";

import {
  EMPTY_OUTBOX,
  deliverDemo,
  enqueueAlerts,
  retryDelivery,
  type OutboxState,
} from "@/lib/cads/outbox";

export function VisualDashboard({
  stepDelayMs = 900,
}: {
  stepDelayMs?: number;
} = {}) {
  const {
    snap,
    status,
    busy,
    loadData,
    reset,
    createRule,
    updateRule,
    deleteRule,
  } = useCadsSession({ stepDelayMs });

  const [selectedEventId, setSelectedEventId] =
    useState<number | null>(null);

  const [notificationsOpen, setNotificationsOpen] =
    useState(false);

  const [rulesOpen, setRulesOpen] = useState(false);
  const [outboxOpen, setOutboxOpen] = useState(false);

  const [muteState, setMuteState] =
    useState<MuteState>(EMPTY_MUTE_STATE);

  const [outboxState, setOutboxState] =
    useState<OutboxState>(EMPTY_OUTBOX);

  // Keep the initial server render deterministic.
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const alertsByEvent = useMemo(() => {
    const grouped = new Map<
      number,
      AlertOccurrence[]
    >();

    for (const alert of snap.alerts) {
      const list =
        grouped.get(alert.eventId) ?? [];

      list.push(alert);
      grouped.set(alert.eventId, list);
    }

    return grouped;
  }, [snap.alerts]);

  const recentAlerts = useMemo(
    () =>
      [...snap.alerts]
        .filter(
          (alert) =>
            !isEventMuted(
              muteState,
              alert.eventId,
              now,
            ),
        )
        .sort(
          (a, b) =>
            b.createdAt - a.createdAt ||
            b.id - a.id,
        ),
    [snap.alerts, muteState, now],
  );

  const selectedEvent =
    snap.events.find(
      (event) => event.id === selectedEventId,
    ) ?? null;

  const selectedAlerts = selectedEvent
    ? alertsByEvent.get(selectedEvent.id) ?? []
    : [];

  const selectedMute = selectedEvent
    ? getActiveMute(
        muteState,
        selectedEvent.id,
        now,
      )
    : null;

  const syncOutbox = () => {
    setOutboxState((previous) =>
      enqueueAlerts(previous, snap.alerts),
    );
  };

  const handleOpenOutbox = () => {
    syncOutbox();
    setOutboxOpen(true);
  };

  const handleLoad = () => {
    void loadData(() => {
      setSelectedEventId(null);
    });
  };

  const handleReset = () => {
    void reset(() => {
      setSelectedEventId(null);
      setNotificationsOpen(false);
      setRulesOpen(false);
      setOutboxOpen(false);
      setMuteState(EMPTY_MUTE_STATE);
      setOutboxState(EMPTY_OUTBOX);
      setNow(Date.now());
    });
  };

  const handleMute = (
    eventId: number,
    reason: string,
  ) => {
    setMuteState((previous) =>
      muteEvent(previous, eventId, reason),
    );
    setNow(Date.now());
  };

  const handleSnooze = (
    eventId: number,
    until: number,
    reason: string,
  ) => {
    setMuteState((previous) =>
      snoozeEvent(
        previous,
        eventId,
        until,
        reason,
      ),
    );
    setNow(Date.now());
  };

  const handleResume = (
    eventId: number,
    reason: string,
  ) => {
    setMuteState((previous) =>
      resumeEvent(previous, eventId, reason),
    );
    setNow(Date.now());
  };

  const deliverItem = (
    id: number,
    simulateFailure: boolean,
  ) => {
    const item = outboxState.items.find(
      (entry) => entry.id === id,
    );

    if (!item || item.status === "sent") {
      return;
    }

    if (
      isEventMuted(
        muteState,
        item.eventId,
        Date.now(),
      )
    ) {
      return;
    }

    setOutboxState((previous) =>
      deliverDemo(
        previous,
        id,
        simulateFailure,
      ),
    );
  };

  const retryItem = (
    id: number,
    simulateFailure: boolean,
  ) => {
    const item = outboxState.items.find(
      (entry) => entry.id === id,
    );

    if (
      !item ||
      item.status !== "failed" ||
      isEventMuted(
        muteState,
        item.eventId,
        Date.now(),
      )
    ) {
      return;
    }

    setOutboxState((previous) =>
      retryDelivery(
        previous,
        id,
        simulateFailure,
      ),
    );
  };

  const deliverAll = (
    simulateFailure: boolean,
  ) => {
    setOutboxState((previous) => {
      let current = previous;

      for (const item of previous.items) {
        if (item.status !== "pending") {
          continue;
        }

        if (
          isEventMuted(
            muteState,
            item.eventId,
            Date.now(),
          )
        ) {
          continue;
        }

        current = deliverDemo(
          current,
          item.id,
          simulateFailure,
        );
      }

      return current;
    });
  };

  const pendingCount = outboxState.items.filter(
    (item) => item.status === "pending",
  ).length;

  return (
    <SidebarProvider className="cads-app">
      <Sidebar
        side="left"
        collapsible="icon"
        aria-label="Data and events"
      >
        <SidebarHeader className="border-b p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold">
              CADS Events
            </span>

            <button
              type="button"
              aria-label="Open rule editor"
              onClick={() => setRulesOpen(true)}
              className="rounded-md p-2 hover:bg-muted"
            >
              <SlidersHorizontal className="size-5" />
            </button>

            <button
              type="button"
              aria-label="Open outbox"
              onClick={handleOpenOutbox}
              className="relative rounded-md p-2 hover:bg-muted"
            >
              <Send className="size-5" />

              {pendingCount > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-amber-600 px-1.5 text-[10px] text-white">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              aria-label="Open notifications"
              onClick={() =>
                setNotificationsOpen(true)
              }
              className="relative rounded-md p-2 hover:bg-muted"
            >
              <Bell className="size-5" />

              {recentAlerts.length > 0 && (
                <span
                  className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white"
                  aria-label={`${recentAlerts.length} notifications`}
                >
                  {recentAlerts.length}
                </span>
              )}
            </button>
          </div>
        </SidebarHeader>

        <SidebarContent className="p-3">
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleLoad}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              <Database className="size-4" />
              Load sample data
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              <RotateCcw className="size-4" />
              Reset
            </button>

            <p
              role="status"
              className="text-xs text-muted-foreground"
            >
              {status}
            </p>
          </div>

          <div className="mt-5 space-y-2">
            <h2 className="text-sm font-semibold">
              Events ({snap.events.length})
            </h2>

            {snap.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No events loaded.
              </p>
            ) : (
              snap.events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  alerts={
                    alertsByEvent.get(event.id) ?? []
                  }
                  mute={getActiveMute(
                    muteState,
                    event.id,
                    now,
                  )}
                  selected={
                    selectedEventId === event.id
                  }
                  onSelect={() =>
                    setSelectedEventId(event.id)
                  }
                />
              ))
            )}
          </div>
        </SidebarContent>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="cads-inset">
        <SidebarProvider
          className="cads-inner"
          style={
            {
              "--sidebar-width": "26rem",
            } as CSSProperties
          }
        >
          <main
            className="cads-centre"
            aria-label="Conjunction player"
          />

          <Sidebar
            side="right"
            collapsible="offcanvas"
            aria-label="Event details"
          >
            <SidebarContent className="p-4">
              {selectedEvent ? (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">
                    Event {selectedEvent.id}
                  </h2>

                  <p className="break-words text-sm text-muted-foreground">
                    {selectedEvent.key}
                  </p>

                  <p className="text-sm">
                    {selectedAlerts.length
                      ? `${selectedAlerts.length} alert(s) triggered. Review this event.`
                      : "No alert rules have fired for this event."}
                  </p>

                  <MuteControls
                    key={selectedEvent.id}
                    eventId={selectedEvent.id}
                    activeMute={selectedMute}
                    history={muteState.history.filter(
                      (entry) =>
                        entry.eventId ===
                        selectedEvent.id,
                    )}
                    onMute={handleMute}
                    onSnooze={handleSnooze}
                    onResume={handleResume}
                  />

                  <p className="text-xs text-muted-foreground">
                    Decision support only. CADS does
                    not command spacecraft.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select an event to view its details.
                </p>
              )}
            </SidebarContent>

            <SidebarRail />
          </Sidebar>
        </SidebarProvider>
      </SidebarInset>

      <RuleEditor
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        rules={snap.rules}
        changes={snap.ruleChanges ?? []}
        onCreate={createRule}
        onUpdate={updateRule}
        onDelete={deleteRule}
      />

      <OutboxPanel
        open={outboxOpen}
        onOpenChange={setOutboxOpen}
        state={outboxState}
        onDeliver={deliverItem}
        onRetry={retryItem}
        onDeliverAll={deliverAll}
      />

      <Sheet
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
      >
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>
              Notifications ({recentAlerts.length})
            </SheetTitle>

            <SheetDescription>
              Alerts for muted or snoozed events are
              hidden until notifications resume. No
              email is sent.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
            {recentAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No notifications yet.
              </p>
            ) : (
              recentAlerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => {
                    setSelectedEventId(alert.eventId);
                    setNotificationsOpen(false);
                  }}
                  className="w-full rounded-lg border p-3 text-left hover:bg-muted"
                  aria-label={`View alert for Event ${alert.eventId}`}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className={
                        alert.severity === "ACTION"
                          ? "size-4 text-red-600"
                          : "size-4 text-amber-500"
                      }
                    />

                    <span className="text-sm font-semibold">
                      Event {alert.eventId}
                    </span>

                    <span className="ml-auto text-xs text-muted-foreground">
                      {alert.severity}
                    </span>
                  </div>

                  <p className="mt-2 text-sm">
                    {alert.ruleName}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {alert.matched.join("; ")}
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(
                      alert.createdAt,
                    ).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}

function EventRow({
  event,
  alerts,
  mute,
  selected,
  onSelect,
}: {
  event: CdmEvent;
  alerts: AlertOccurrence[];
  mute: EventMute | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const cdm = latestRevision(event).cdm;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Event ${event.id}${
        alerts.length
          ? `, ${alerts.length} alerts`
          : ""
      }${mute ? ", notifications paused" : ""}`}
      aria-pressed={selected}
      className={`w-full rounded-lg border p-3 text-left hover:bg-muted/50 ${
        selected
          ? "border-primary bg-muted"
          : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          Event {event.id}
        </span>

        <div className="flex items-center gap-2">
          {mute && (
            <BellOff
              className="size-4 text-muted-foreground"
              aria-label="Notifications paused"
            />
          )}

          {alerts.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
              <AlertTriangle
                className="size-3"
                aria-hidden="true"
              />
              {alerts.length}
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 truncate text-xs text-muted-foreground">
        {cdm.sat1.name || cdm.sat1.designator}
      </p>

      <p className="truncate text-xs text-muted-foreground">
        vs. {cdm.sat2.name || cdm.sat2.designator}
      </p>

      {alerts.length > 0 && (
        <p className="mt-2 text-xs font-medium text-red-600">
          Alert triggered — review event
        </p>
      )}

      {mute && (
        <p className="mt-1 text-xs text-muted-foreground">
          {mute.mode === "mute"
            ? "Muted until manually resumed"
            : `Snoozed until ${new Date(
                mute.until!,
              ).toLocaleString()}`}
        </p>
      )}
    </button>
  );
}

type MuteHistoryView = {
  id: number;
  action: "muted" | "snoozed" | "resumed";
  reason: string;
  at: number;
  until: number | null;
};

function MuteControls({
  eventId,
  activeMute,
  history,
  onMute,
  onSnooze,
  onResume,
}: {
  eventId: number;
  activeMute: EventMute | null;
  history: MuteHistoryView[];
  onMute: (
    eventId: number,
    reason: string,
  ) => void;
  onSnooze: (
    eventId: number,
    until: number,
    reason: string,
  ) => void;
  onResume: (
    eventId: number,
    reason: string,
  ) => void;
}) {
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("1");
  const [error, setError] = useState("");

  const perform = (
    action: "mute" | "snooze" | "resume",
  ) => {
    try {
      const trimmed = reason.trim();

      if (!trimmed) {
        throw new Error("Enter a reason.");
      }

      if (action === "mute") {
        onMute(eventId, trimmed);
      }

      if (action === "snooze") {
        const duration = Number(hours);

        if (
          !Number.isFinite(duration) ||
          duration <= 0
        ) {
          throw new Error(
            "Snooze duration must be positive.",
          );
        }

        const until =
          Date.now() + duration * 60 * 60 * 1000;

        if (!Number.isFinite(until)) {
          throw new Error(
            "Invalid snooze duration.",
          );
        }

        onSnooze(eventId, until, trimmed);
      }

      if (action === "resume") {
        onResume(eventId, trimmed);
      }

      setReason("");
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section
      aria-label="Mute and snooze controls"
      className="space-y-3 rounded-lg border p-3"
    >
      <div className="flex items-center gap-2">
        {activeMute ? (
          <BellOff className="size-4" />
        ) : (
          <Bell className="size-4" />
        )}

        <h3 className="text-sm font-semibold">
          Mute & Snooze
        </h3>
      </div>

      <p className="text-xs text-muted-foreground">
        {activeMute
          ? activeMute.mode === "mute"
            ? "Notifications are muted."
            : `Notifications are snoozed until ${new Date(
                activeMute.until!,
              ).toLocaleString()}.`
          : "Notifications are active."}
      </p>

      {activeMute && (
        <p className="text-xs text-muted-foreground">
          Reason: {activeMute.reason}
        </p>
      )}

      <label className="block space-y-1 text-xs">
        <span>Reason</span>

        <textarea
          value={reason}
          onChange={(event) =>
            setReason(event.target.value)
          }
          placeholder="Explain why notifications are being changed"
          rows={2}
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
      </label>

      <label className="block space-y-1 text-xs">
        <span>Snooze duration (hours)</span>

        <input
          type="number"
          min="0.01"
          step="0.25"
          value={hours}
          onChange={(event) =>
            setHours(event.target.value)
          }
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
      </label>

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => perform("mute")}
          className="rounded-md border px-3 py-2 text-xs hover:bg-muted"
        >
          <BellOff className="mr-1 inline size-3" />
          Mute
        </button>

        <button
          type="button"
          onClick={() => perform("snooze")}
          className="rounded-md border px-3 py-2 text-xs hover:bg-muted"
        >
          Snooze
        </button>

        {activeMute && (
          <button
            type="button"
            onClick={() => perform("resume")}
            className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground"
          >
            Resume
          </button>
        )}
      </div>

      <div className="space-y-2 border-t pt-3">
        <h4 className="text-xs font-semibold">
          Change history
        </h4>

        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No changes recorded.
          </p>
        ) : (
          history.map((entry) => (
            <div
              key={entry.id}
              className="rounded-md border p-2 text-xs"
            >
              <p className="font-medium">
                {entry.action.toUpperCase()}
              </p>

              <p>{entry.reason}</p>

              <p className="text-muted-foreground">
                {new Date(
                  entry.at,
                ).toLocaleString()}
              </p>

              {entry.until !== null && (
                <p className="text-muted-foreground">
                  Resume at:{" "}
                  {new Date(
                    entry.until,
                  ).toLocaleString()}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
