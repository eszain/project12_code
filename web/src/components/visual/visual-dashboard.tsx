
"use client";

import { useState } from "react";
import { Bell, Settings2, AlertTriangle } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
} from "@/components/animate-ui/components/radix/sidebar";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/animate-ui/components/radix/sheet";

import { useCadsSession } from "@/components/use-cads-session";
import { latestRevision, type AlertRule } from "@/lib/cads/store";

const inputClass =
  "w-full rounded border border-slate-600 bg-slate-900 p-2 text-white";

const buttonClass =
  "rounded border border-slate-500 px-3 py-2 text-sm hover:bg-slate-700 disabled:opacity-40";

type Draft = Omit<AlertRule, "id">;

const blank = (): Draft => ({
  name: "New alert rule",
  pcMin: null,
  missDistanceMaxM: null,
  hoursToTcaMax: null,
  objectIds: [],
});

export function VisualDashboard() {
  const session = useCadsSession({ stepDelayMs: 0 });

  const { snap, status, busy, now } = session;
  const store = session.store;

  const [selected, setSelected] =
    useState<number | null>(null);

  const [editing, setEditing] =
    useState<number | null>(null);

  const [draft, setDraft] = useState<Draft>(blank);
  const [reason, setReason] = useState("");
  const [ruleError, setRuleError] = useState("");

  const [view, setView] = useState<
    "operator" | "specialist"
  >("operator");

  const event = snap.events.find(
    (e) => e.id === selected
  );

  const current = event
    ? latestRevision(event).cdm
    : null;

  const visibleAlerts = store.activeAlerts(now);

  const activeEventCount = new Set(
    visibleAlerts.map((a) => a.eventId)
  ).size;

  const saveRule = () => {
    if (
      !draft.name.trim() ||
      [
        draft.pcMin,
        draft.missDistanceMaxM,
        draft.hoursToTcaMax,
      ].some(
        (n) =>
          n !== null &&
          (!Number.isFinite(n) || n < 0)
      )
    ) {
      setRuleError(
        "Enter a name and valid nonnegative limits."
      );
      return;
    }

    try {
      if (editing === null) {
        store.addRule(draft);
      } else {
        store.updateRule(editing, draft);
      }

      setRuleError("");
    } catch (error) {
      setRuleError((error as Error).message);
      return;
    }

    setEditing(null);
    setDraft(blank());
  };

  const field = (
    label: string,
    key: "pcMin" | "missDistanceMaxM" | "hoursToTcaMax"
  ) => (
    <label className="block text-sm">
      {label}
      <input
        aria-label={label}
        className={inputClass}
        type="number"
        min="0"
        step="any"
        value={draft[key] ?? ""}
        onChange={(e) =>
          setDraft({
            ...draft,
            [key]:
              e.target.value === ""
                ? null
                : Number(e.target.value),
          })
        }
      />
    </label>
  );

  return (
    <SidebarProvider className="cads-app">
      <Sidebar
        side="left"
        collapsible="icon"
        aria-label="Data and events"
      >
        <SidebarContent className="p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <strong>Events</strong>

            <Sheet>
              <SheetTrigger
                className={buttonClass}
                aria-label="Notifications"
              >
                <Bell size={18} />
                {" "}
                {activeEventCount}
              </SheetTrigger>

              <SheetContent>
                <SheetHeader>
                  <SheetTitle>
                    Recent notifications
                  </SheetTitle>
                </SheetHeader>

                <div className="p-4 space-y-3 overflow-y-auto max-h-[80vh]">
                  <p className="text-xs">
                    {activeEventCount} active events
                    {" · "}
                    {snap.alerts.length} historical notifications
                  </p>

                  {snap.alerts.length === 0 && (
                    <p>No alerts yet.</p>
                  )}

                  {snap.alerts.map((a) => {
                    const d = snap.deliveries?.find(
                      (x) => x.alertId === a.id
                    );

                    const active = visibleAlerts.some(
                      (x) => x.id === a.id
                    );

                    return (
                      <div
                        key={a.id}
                        className="rounded border p-3 text-sm space-y-2"
                      >
                        <strong>
                          {a.severity} — {a.ruleName}
                        </strong>

                        <p>
                          Event {a.eventId}
                          {" · "}
                          CDM revision {a.revisionId}
                        </p>

                        <p>
                          {active
                            ? "Active under current rule"
                            : "Historical alert"}
                        </p>

                        <p>
                          Delivery: {d?.status ?? "queued"}
                          {" ("}
                          {d?.attempts ?? 0}
                          {" attempts)"}
                        </p>

                        {d?.lastError && (
                          <p role="alert">
                            {d.lastError}
                          </p>
                        )}

                        <button
                          className={buttonClass}
                          disabled={
                            d?.status === "sent" ||
                            d?.status === "retried"
                          }
                          onClick={() =>
                            d?.status === "failed"
                              ? store.retryNow(a.id)
                              : store.deliver(a.id)
                          }
                        >
                          Send to test list / Retry
                        </button>

                        <button
                          className={buttonClass}
                          disabled={
                            d?.status === "sent" ||
                            d?.status === "retried"
                          }
                          onClick={() =>
                            store.deliver(a.id, true)
                          }
                        >
                          Simulate failure
                        </button>
                      </div>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <button
            className={buttonClass}
            disabled={busy}
            onClick={() => session.loadData()}
          >
            1. Load data
          </button>

          <button
            className={buttonClass}
            disabled={busy}
            onClick={session.runAnalysis}
          >
            2. Run risk analysis
          </button>

          <button
            className={buttonClass}
            disabled={busy}
            onClick={() => {
              setSelected(null);
              session.reset();
            }}
          >
            Reset
          </button>

          <p className="text-xs" role="status">
            {status}
          </p>

          {snap.events.map((e) => {
            const active = visibleAlerts.filter(
              (a) => a.eventId === e.id
            );

            return (
              <button
                key={e.id}
                className="w-full text-left rounded border p-2 text-sm"
                onClick={() => setSelected(e.id)}
              >
                {active.length > 0 && (
                  <AlertTriangle
                    aria-label="Alert fired"
                    className="inline mr-2 text-amber-400"
                    size={16}
                  />
                )}

                Event {e.id}
                {" · "}
                {e.revisions.length} CDMs
              </button>
            );
          })}

          <Sheet>
            <SheetTrigger className={buttonClass}>
              <Settings2
                className="inline"
                size={16}
              />
              {" Alert rules"}
            </SheetTrigger>

            <SheetContent>
              <SheetHeader>
                <SheetTitle>
                  Alert rule editor
                </SheetTitle>
              </SheetHeader>

              <div className="p-4 space-y-3 overflow-y-auto max-h-[85vh]">
                {snap.rules.map((r) => (
                  <div
                    className="flex gap-2 items-center"
                    key={r.id}
                  >
                    <span className="flex-1 text-sm">
                      {r.name}
                    </span>

                    <button
                      className={buttonClass}
                      onClick={() => {
                        setEditing(r.id);
                        setDraft({
                          ...r,
                          objectIds: [...r.objectIds],
                        });
                      }}
                    >
                      Edit
                    </button>

                    <button
                      className={buttonClass}
                      onClick={() =>
                        store.deleteRule(r.id)
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}

                <label className="block text-sm">
                  Rule name
                  <input
                    className={inputClass}
                    aria-label="Rule name"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        name: e.target.value,
                      })
                    }
                  />
                </label>

                {field(
                  "Minimum source Pc",
                  "pcMin"
                )}

                {field(
                  "Maximum miss distance (m)",
                  "missDistanceMaxM"
                )}

                {field(
                  "Maximum hours to TCA",
                  "hoursToTcaMax"
                )}

                <label className="block text-sm">
                  Object watchlist (comma separated)
                  <input
                    className={inputClass}
                    value={draft.objectIds.join(", ")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        objectIds: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>

                {ruleError && (
                  <p
                    role="alert"
                    className="text-red-400"
                  >
                    {ruleError}
                  </p>
                )}

                <button
                  className={buttonClass}
                  onClick={saveRule}
                >
                  Save rule
                </button>

                <button
                  className={buttonClass}
                  onClick={() => {
                    setEditing(null);
                    setDraft(blank());
                    setRuleError("");
                  }}
                >
                  New rule
                </button>

                <h3>Change history</h3>

                {(snap.audit ?? []).map((a, i) => (
                  <p key={i} className="text-xs">
                    {a.action}: {a.details}
                  </p>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </SidebarContent>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="cads-inset">
        <SidebarProvider
          className="cads-inner"
          style={
            {
              "--sidebar-width": "26rem",
            } as React.CSSProperties
          }
        >
          <main
            className="cads-centre p-6"
            aria-label="Conjunction player"
          >
            {event && current && (
              <div className="space-y-3">
                <h2>Event {event.id}</h2>

                <p>
                  {current.sat1.name ??
                    current.sat1.designator}
                  {" vs "}
                  {current.sat2.name ??
                    current.sat2.designator}
                </p>

                <p>
                  {current.pc !== null &&
                  current.pc >= 1e-4
                    ? "Too close: a maneuver may be needed (decision support only)."
                    : "Review the latest encounter data before making a decision."}
                </p>

                <p>
                  Closest approach:{" "}
                  {new Date(current.tca).toISOString()}
                </p>
              </div>
            )}
          </main>

          <Sidebar
            side="right"
            collapsible="offcanvas"
            aria-label="Event details"
          >
            <SidebarContent className="p-4 space-y-3">
              <h2>Event details</h2>

              <div>
                <button
                  className={buttonClass}
                  onClick={() => setView("operator")}
                >
                  Operator
                </button>

                <button
                  className={buttonClass}
                  onClick={() => setView("specialist")}
                >
                  Specialist
                </button>
              </div>

              {current && (
                <>
                  <p>
                    Miss distance:{" "}
                    {current.missDistanceM.toFixed(1)} m
                  </p>

                  <p>
                    Source Pc: {current.pcRaw}
                  </p>

                  {view === "specialist" && (
                    <p>
                      CDM revisions:{" "}
                      {event?.revisions.length}
                    </p>
                  )}

                  <label className="block text-sm">
                    Reason for mute or snooze
                    <input
                      className={inputClass}
                      value={reason}
                      onChange={(e) =>
                        setReason(e.target.value)
                      }
                    />
                  </label>

                  <button
                    className={buttonClass}
                    onClick={() => {
                      if (
                        selected !== null &&
                        reason.trim()
                      ) {
                        store.suppress(
                          selected,
                          "mute",
                          reason
                        );
                        setReason("");
                      }
                    }}
                  >
                    Mute
                  </button>

                  <button
                    className={buttonClass}
                    onClick={() => {
                      if (
                        selected !== null &&
                        reason.trim()
                      ) {
                        store.suppress(
                          selected,
                          "snooze",
                          reason,
                          Date.now() + 3_600_000
                        );
                        setReason("");
                      }
                    }}
                  >
                    Snooze 1 hour
                  </button>

                  <button
                    className={buttonClass}
                    onClick={() =>
                      selected !== null &&
                      store.unsuppress(selected)
                    }
                  >
                    Unmute
                  </button>
                </>
              )}
            </SidebarContent>

            <SidebarRail />
          </Sidebar>
        </SidebarProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
