
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  Database,
  FileText,
  FileUp,
  Play,
  RotateCcw,
  Upload,
  SlidersHorizontal,
  Send,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/animate-ui/components/radix/sidebar";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";

import { OutboxSheet } from "@/components/visual/outbox-sheet";
import { useOutbox } from "@/components/visual/use-outbox";
import { RuleEditor } from "@/components/visual/rule-editor";
import { MuteSnoozeSheet } from "@/components/visual/mute-snooze-sheet";
import { EventSummaryCard } from "@/components/event-summary-card";
import { CdmHistory } from "@/components/cdm-history";
import { ExplanationCard } from "@/components/explanation-card";
import { CalculationDetails } from "@/components/calculation-details";
import { ConjunctionPlayer } from "@/components/visual/conjunction-player";
import { ImportReportSheet } from "@/components/import-report-sheet";
import { OriginalCdm } from "@/components/original-cdm";
import { useCadsSession } from "@/components/use-cads-session";
import { hoursBetween } from "@/lib/cads/time";

import {
  latestRevision,
  severityOf,
  isNotificationPaused,
  type AlertOccurrence,
  type CdmEvent,
  type Severity,
} from "@/lib/cads/store";

const severityLabel: Record<Severity, string> = {
  ACTION: "Action",
  WATCH: "Watch",
  LOW: "Low",
  ZERO: "Clear",
  UNKNOWN: "Unknown",
};

function eventTitle(event: CdmEvent) {
  const cdm = latestRevision(event).cdm;

  return `${cdm.sat1.name ?? cdm.sat1.designator} / ${cdm.sat2.name ?? cdm.sat2.designator}`;
}

function formatTca(hours: number) {
  if (!Number.isFinite(hours)) {
    return "TCA unavailable";
  }

  return hours >= 0
    ? `in ${hours.toFixed(1)} h`
    : `${(-hours).toFixed(1)} h ago`;
}

function EventRow({
  event,
  selected,
  analysis,
  now,
  alertCount,
  paused,
  onSelect,
}: {
  event: CdmEvent;
  selected: boolean;
  analysis?: { severity: Severity };
  now: number;
  alertCount: number;
  paused: boolean;
  onSelect: () => void;
}) {
  const cdm = latestRevision(event).cdm;
  const severity = analysis?.severity ?? severityOf(cdm.pc);
  const title = eventTitle(event);
  const tca = formatTca(hoursBetween(now, cdm.tca));

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={selected}
        onClick={onSelect}
        tooltip={title}
        aria-label={`Select ${title}. Severity ${severityLabel[severity]}. Closest approach ${tca}.`}
        className="!h-9 !w-full !rounded-lg !px-2 data-[active=true]:!bg-[#193247]"
      >
        <div className="grid w-full min-w-0 grid-cols-[8px_minmax(0,1fr)_16px_48px] items-center gap-x-2">
          <span
            className={`cads-severity-dot cads-severity-${severity.toLowerCase()}`}
            aria-hidden="true"
          />

          <span
            className="min-w-0 truncate text-left text-xs text-white"
            title={title}
          >
            {title}
          </span>

          <span className="flex items-center justify-center">
            {paused ? (
              <BellOff
                className="size-3.5 text-slate-400"
                aria-label="Notifications paused"
              />
            ) : alertCount > 0 ? (
              <Bell
                className="size-3.5 text-amber-500"
                aria-label={`${alertCount} alerts fired`}
                data-testid={`event-alert-${event.id}`}
              />
            ) : null}
          </span>

          <span className="whitespace-nowrap text-right text-[10px] tabular-nums text-sky-100">
            {tca}
          </span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NotificationsSheet({
  alerts,
  events,
  open,
  onOpenChange,
  onSelect,
}: {
  alerts: AlertOccurrence[];
  events: CdmEvent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: number) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[28rem] max-w-[90vw]"
      >
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>

          <SheetDescription>
            {alerts.length} recorded alert
            {alerts.length === 1 ? "" : "s"}.
            Local notifications only; no external messages are sent.
          </SheetDescription>
        </SheetHeader>

        <div
          className="flex-1 space-y-2 overflow-y-auto px-4 pb-4"
          aria-label="Recent alerts"
        >
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No alerts yet. Load sample data to evaluate
              the default rule.
            </p>
          ) : (
            alerts.map((alert) => {
              const event = events.find(
                (item) => item.id === alert.eventId
              );

              return (
                <article
                  key={alert.id}
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {alert.ruleName}
                    </p>

                    <span className="text-xs font-medium text-amber-700">
                      {alert.severity}
                    </span>
                  </div>

                  <p className="mt-1 text-sm">
                    {event
                      ? eventTitle(event)
                      : `Event ${alert.eventId}`}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {alert.matched.join("; ")}
                  </p>

                  <button
                    type="button"
                    className="mt-2 text-sm underline underline-offset-2"
                    onClick={() => {
                      onSelect(alert.eventId);
                      onOpenChange(false);
                    }}
                  >
                    View event
                  </button>
                </article>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function VisualDashboard({
  stepDelayMs = 900,
}: {
  stepDelayMs?: number;
} = {}) {
  const session = useCadsSession({ stepDelayMs });

  const {
    snap,
    status,
    importReport,
    busy,
    now,
    analysis,
  } = session;

  const [selected, setSelected] = useState<number | null>(null);

  const [view, setView] = useState<"operator" | "specialist">(
    "operator"
  );

  const [reportOpen, setReportOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const detailsScroll = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const event = snap.events.find(
    (item) => item.id === selected
  );

  const isPaused = (eventId: number) =>
    isNotificationPaused(
      snap.notificationPauses?.[eventId],
      now
    );

  const pausedEventIds = useMemo(
    () =>
      new Set(
        Object.values(snap.notificationPauses ?? {})
          .filter((pause) =>
            isNotificationPaused(pause, now)
          )
          .map((pause) => pause.eventId)
      ),
    [snap.notificationPauses, now]
  );

  const outbox = useOutbox(
    snap.alerts,
    pausedEventIds,
    session.hydrated
  );

  const activeAlerts = snap.alerts.filter(
    (alert) =>
      !alert.superseded &&
      !isPaused(alert.eventId)
  );

  const current = event
    ? latestRevision(event).cdm
    : null;

  useEffect(() => {
    if (event) {
      detailsHeading.current?.focus();
    }
  }, [event]);

  useEffect(() => {
    if (view === "specialist") {
      detailsScroll.current?.scrollTo?.({
        top: 0,
      });
    }
  }, [view, event]);

  const selectEvent = (id: number) => {
    setSelected(id);
    setView("operator");
  };

  const openSpecialist = () => {
    setView("specialist");
  };

  const reset = () => {
    void session.reset(() => {
      outbox.clear();

      setSelected(null);
      setReportOpen(false);
      setRulesOpen(false);
      setOutboxOpen(false);
      setPauseOpen(false);
      setNotificationsOpen(false);
      setView("operator");
    });
  };

  return (
    <SidebarProvider
      className="cads-app"
      style={
        {
          "--sidebar-width": "20rem",
        } as React.CSSProperties
      }
    >
      <Sidebar
        side="left"
        collapsible="icon"
        aria-label="Data and events"
      >
        <SidebarContent className="p-3">
          <SidebarGroup>
            <div className="flex items-center justify-between gap-2">
              <SidebarGroupLabel>
                Data actions
              </SidebarGroupLabel>

              <button
                type="button"
                className="relative rounded-md p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={`Open notifications (${activeAlerts.length})`}
                onClick={() => setNotificationsOpen(true)}
              >
                <Bell className="size-4" />

                {activeAlerts.length > 0 && (
                  <span
                    className="absolute -right-1 -top-1 rounded-full bg-amber-600 px-1 text-[10px] text-white"
                    aria-hidden="true"
                  >
                    {activeAlerts.length}
                  </span>
                )}
              </button>
            </div>

            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    onClick={() =>
                      session.loadData(() => setSelected(null))
                    }
                    disabled={busy}
                    tooltip="Load sample data"
                  >
                    <Database />
                    <span>Load sample data</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    onClick={session.runAnalysis}
                    disabled={busy}
                    tooltip="Run risk analysis"
                  >
                    <Play />
                    <span>Run risk analysis</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={busy}
                    tooltip="Load my CDM files"
                  >
                    <Upload />
                    <span>Load my CDM files</span>
                  </SidebarMenuButton>

                  <input
                    ref={fileInput}
                    className="sr-only"
                    type="file"
                    multiple
                    accept=".json,.kvn,.txt"
                    aria-label="Choose CDM files (JSON or KVN)"
                    onChange={(e) => {
                      void session.loadFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    onClick={session.addTestEvents}
                    disabled={busy}
                    tooltip="Add 60 test events"
                  >
                    <FileUp />
                    <span>Add test events</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    onClick={() => setRulesOpen(true)}
                    tooltip="Manage alert rules"
                  >
                    <SlidersHorizontal />
                    <span>Manage alert rules</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    onClick={() => setOutboxOpen(true)}
                    tooltip="Outbox & Delivery"
                  >
                    <Send />
                    <span>
                      Outbox &amp; Delivery ({outbox.entries.length})
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    onClick={reset}
                    disabled={busy}
                    tooltip="Reset session"
                  >
                    <RotateCcw />
                    <span>Reset</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    onClick={() => setReportOpen(true)}
                    disabled={!importReport}
                    tooltip="View import report"
                  >
                    <FileText />
                    <span>View import report</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>

            <p
              className="cads-sidebar-status"
              role={
                status.startsWith("Error:")
                  ? "alert"
                  : "status"
              }
            >
              {status}
            </p>
          </SidebarGroup>

          <SidebarGroup className="mt-3 rounded-xl bg-[#0B1B30] !p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">
                Conjunction events
              </span>

              <span className="text-xs text-white">
                {snap.events.length}
              </span>
            </div>

            <SidebarGroupContent>
              {busy && snap.events.length === 0 ? (
                <p
                  className="cads-sidebar-state"
                  role="status"
                >
                  Loading events…
                </p>
              ) : snap.events.length === 0 ? (
                <p className="cads-sidebar-state">
                  No events loaded.
                </p>
              ) : (
                <SidebarMenu className="gap-2">
                  {snap.events.map((item) => (
                    <EventRow
                      key={item.id}
                      event={item}
                      selected={item.id === selected}
                      analysis={analysis?.[item.id]}
                      now={now}
                      alertCount={
                        snap.alerts.filter(
                          (alert) =>
                            alert.eventId === item.id &&
                            !alert.superseded &&
                            !isPaused(item.id)
                        ).length
                      }
                      paused={isPaused(item.id)}
                      onSelect={() => selectEvent(item.id)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="cads-inset">
        <SidebarProvider
          className="cads-inner"
          open={Boolean(event)}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          style={
            {
              "--sidebar-width": "30rem",
            } as React.CSSProperties
          }
        >
          <main
            className="cads-centre p-6"
            aria-label="Conjunction player"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h1 className="text-xl font-semibold">
                Conjunction player
              </h1>

              <SidebarTrigger
                aria-label="Toggle event details"
              />
            </div>

            {!event || !current ? (
              <div className="cads-player-empty">
                <p>Choose an event in the left list to play its pass.</p>
              </div>
            ) : (
              <div data-testid="selected-player">
                <ConjunctionPlayer key={`${event.id}-${current.messageKey}`} event={event} />
              </div>
            )}
          </main>

          <Sidebar
            side="right"
            collapsible="offcanvas"
            aria-label="Event details"
          >
            <SidebarContent className="cads-details-content">
              <div className="cads-details-header">
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-400">
                    Selected event
                  </p>

                  <h2
                    ref={detailsHeading}
                    tabIndex={-1}
                    className="text-lg font-semibold outline-none"
                  >
                    {event
                      ? eventTitle(event)
                      : "Event details"}
                  </h2>
                </div>

                <SidebarTrigger
                  aria-label="Close event details"
                />
              </div>

              {event && (
                <button
                  type="button"
                  onClick={() => setPauseOpen(true)}
                  className="mx-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  aria-label="Manage event notifications"
                >
                  <BellOff className="size-4" />
                  {isPaused(event.id)
                    ? "Notifications paused — manage"
                    : "Mute / Snooze notifications"}
                </button>
              )}

              {!event || !current ? (
                <p className="cads-sidebar-state">
                  Choose an event to view its details.
                </p>
              ) : (
                <div
                  ref={detailsScroll}
                  className="cads-details-scroll"
                  data-testid="details-scroll"
                >
                  <div
                    className="view-switch"
                    role="group"
                    aria-label="Event detail view"
                  >
                    <button
                      type="button"
                      className="view-option"
                      aria-pressed={view === "operator"}
                      onClick={() => setView("operator")}
                      onKeyDown={(keyboardEvent) => {
                        if (
                          keyboardEvent.key === "Enter" ||
                          keyboardEvent.key === " "
                        ) {
                          keyboardEvent.preventDefault();
                          setView("operator");
                        }
                      }}
                    >
                      Operator
                    </button>

                    <button
                      type="button"
                      className="view-option"
                      aria-pressed={view === "specialist"}
                      onClick={() => setView("specialist")}
                      onKeyDown={(keyboardEvent) => {
                        if (
                          keyboardEvent.key === "Enter" ||
                          keyboardEvent.key === " "
                        ) {
                          keyboardEvent.preventDefault();
                          setView("specialist");
                        }
                      }}
                    >
                      Specialist
                    </button>
                  </div>

                  <EventSummaryCard
                    event={event}
                    analysis={analysis?.[event.id]}
                    now={now}
                    selected
                    onSelect={() => selectEvent(event.id)}
                    onOpenDetails={openSpecialist}
                    view={view}
                    cautiousLanguage
                  />

                  {view === "specialist" && (
                    <>
                      <CdmHistory event={event} />

                      <ExplanationCard
                        event={event}
                        analysis={analysis?.[event.id]}
                        now={now}
                        cautiousLanguage
                      />

                      <CalculationDetails
                        event={event}
                        cautiousLanguage
                      />

                      <OriginalCdm raw={current.raw} />
                    </>
                  )}
                </div>
              )}
            </SidebarContent>

            <SidebarRail />
          </Sidebar>
        </SidebarProvider>
      </SidebarInset>

      <NotificationsSheet
        alerts={activeAlerts}
        events={snap.events}
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        onSelect={selectEvent}
      />

      {event && (
        <MuteSnoozeSheet
          open={pauseOpen}
          onOpenChange={setPauseOpen}
          eventId={event.id}
          eventName={eventTitle(event)}
          currentPause={
            isPaused(event.id)
              ? snap.notificationPauses?.[event.id] ?? null
              : null
          }
          history={(snap.notificationPauseHistory ?? []).filter(
            (entry) => entry.eventId === event.id
          )}
          onPause={session.pauseNotifications}
          onResume={session.resumeNotifications}
        />
      )}

      <OutboxSheet
        open={outboxOpen}
        onOpenChange={setOutboxOpen}
        entries={outbox.entries}
        deliver={outbox.deliver}
        retry={outbox.retry}
        simulateFailure={outbox.simulateFailure}
        setSimulateFailure={outbox.setSimulateFailure}
      />

      <RuleEditor
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        rules={snap.rules}
        history={snap.ruleChanges ?? []}
        onCreate={session.createRule}
        onUpdate={session.updateRule}
        onDelete={session.deleteRule}
      />

      <ImportReportSheet
        report={importReport}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    </SidebarProvider>
  );
}
