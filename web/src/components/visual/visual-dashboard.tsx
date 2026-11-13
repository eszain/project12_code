"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Database, FileUp, Play, RotateCcw, Settings2, Upload } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger } from "@/components/animate-ui/components/radix/sidebar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/animate-ui/components/radix/sheet";
import { EventSummaryCard } from "@/components/event-summary-card";
import { CdmHistory } from "@/components/cdm-history";
import { ExplanationCard } from "@/components/explanation-card";
import { CalculationDetails } from "@/components/calculation-details";
import { useCadsSession } from "@/components/use-cads-session";
import { hoursBetween } from "@/lib/cads/time";
import { latestRevision, severityOf, type AlertRule, type CdmEvent, type Severity } from "@/lib/cads/store";

const buttonClass = "rounded border border-slate-500 px-3 py-2 text-sm hover:bg-slate-700 disabled:opacity-40";
const inputClass = "w-full rounded border border-slate-600 bg-slate-900 p-2 text-white";
type Draft = Omit<AlertRule, "id">;
const blank = (): Draft => ({ name: "New alert rule", pcMin: null, missDistanceMaxM: null, hoursToTcaMax: null, objectIds: [] });
const severityLabel: Record<Severity, string> = { ACTION: "Action", WATCH: "Watch", LOW: "Low", ZERO: "Clear", UNKNOWN: "Unknown" };

function eventTitle(event: CdmEvent) {
  const cdm = latestRevision(event).cdm;
  return `${cdm.sat1.name ?? cdm.sat1.designator} / ${cdm.sat2.name ?? cdm.sat2.designator}`;
}

function formatTca(hours: number) {
  if (!Number.isFinite(hours)) return "TCA unavailable";
  return hours >= 0 ? `in ${hours.toFixed(1)} h` : `${(-hours).toFixed(1)} h ago`;
}

function EventRow({ event, selected, analysis, now, onSelect }: { event: CdmEvent; selected: boolean; analysis?: { severity: Severity }; now: number; onSelect: () => void }) {
  const cdm = latestRevision(event).cdm;
  const severity = analysis?.severity ?? severityOf(cdm.pc);
  const title = eventTitle(event);
  const tca = formatTca(hoursBetween(now, cdm.tca));
  return <SidebarMenuItem>
    <SidebarMenuButton type="button" isActive={selected} onClick={onSelect} onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); onSelect(); } }} tooltip={title} aria-label={`Select ${title}. Severity ${severityLabel[severity]}. Closest approach ${tca}.`} className="cads-event-row">
      <span className={`cads-severity-dot cads-severity-${severity.toLowerCase()}`} aria-hidden="true" />
      <span className="cads-event-name" title={title}>{title}</span>
      <span className="sr-only">{severityLabel[severity]}</span>
    </SidebarMenuButton>
    <SidebarMenuBadge aria-label={`Closest approach ${tca}`}>{tca}</SidebarMenuBadge>
  </SidebarMenuItem>;
}

export function VisualDashboard() {
  const session = useCadsSession({ stepDelayMs: 0 });
  const { snap, status, busy, now, analysis } = session;
  const store = session.store;
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<"operator" | "specialist">("operator");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [ruleError, setRuleError] = useState("");
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const detailsScroll = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const event = snap.events.find((item) => item.id === selected);
  const current = event ? latestRevision(event).cdm : null;
  const visibleAlerts = store.activeAlerts(now);
  const activeEventCount = new Set(visibleAlerts.map((alert) => alert.eventId)).size;

  useEffect(() => { if (event) detailsHeading.current?.focus(); }, [event]);
  useEffect(() => { if (view === "specialist") detailsScroll.current?.scrollTo?.({ top: 0 }); }, [view, event]);
  const selectEvent = (id: number) => { setSelected(id); setView("operator"); };
  const openSpecialist = () => setView("specialist");
  const reset = () => { setSelected(null); session.reset(); };
  const saveRule = () => {
    if (!draft.name.trim() || [draft.pcMin, draft.missDistanceMaxM, draft.hoursToTcaMax].some((n) => n !== null && (!Number.isFinite(n) || n < 0))) { setRuleError("Enter a name and valid nonnegative limits."); return; }
    try { if (editing === null) store.addRule(draft); else store.updateRule(editing, draft); setEditing(null); setDraft(blank()); setRuleError(""); } catch (error) { setRuleError((error as Error).message); }
  };
  const field = (label: string, key: "pcMin" | "missDistanceMaxM" | "hoursToTcaMax") => <label className="block text-sm" key={key}>{label}<input aria-label={label} className={inputClass} type="number" min="0" step="any" value={draft[key] ?? ""} onChange={(e) => setDraft({ ...draft, [key]: e.target.value === "" ? null : Number(e.target.value) })} /></label>;

  return <SidebarProvider className="cads-app">
    <Sidebar side="left" collapsible="icon" aria-label="Data and events">
      <SidebarContent className="p-3">
        <SidebarGroup>
          <SidebarGroupLabel>Data actions</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton type="button" onClick={() => session.loadData(() => setSelected(null))} disabled={busy} tooltip="Load sample data"><Database /><span>Load sample data</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton type="button" onClick={session.runAnalysis} disabled={busy} tooltip="Run risk analysis"><Play /><span>Run risk analysis</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton type="button" onClick={() => fileInput.current?.click()} disabled={busy} tooltip="Load my CDM files"><Upload /><span>Load my CDM files</span></SidebarMenuButton><input ref={fileInput} className="sr-only" type="file" multiple accept=".cdm,.txt,.xml,.json" onChange={(e) => session.loadFiles(e.target.files)} /></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton type="button" onClick={session.addTestEvents} disabled={busy} tooltip="Add 60 test events"><FileUp /><span>Add test events</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton type="button" onClick={reset} disabled={busy} tooltip="Reset session"><RotateCcw /><span>Reset</span></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu></SidebarGroupContent>
          <p className="cads-sidebar-status" role={status.startsWith("Error:") ? "alert" : "status"}>{status}</p>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Conjunction events <span className="ml-auto">{snap.events.length}</span></SidebarGroupLabel>
          <SidebarGroupContent>{busy && snap.events.length === 0 ? <p className="cads-sidebar-state" role="status">Loading events…</p> : snap.events.length === 0 ? <p className="cads-sidebar-state">No events loaded.</p> : <SidebarMenu>{snap.events.map((item) => <EventRow key={item.id} event={item} selected={item.id === selected} analysis={analysis?.[item.id]} now={now} onSelect={() => selectEvent(item.id)} />)}</SidebarMenu>}</SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup><SidebarGroupContent><SidebarMenu>
          <SidebarMenuItem><Sheet><SheetTrigger asChild><SidebarMenuButton type="button" tooltip="Notifications"><Bell /><span>Notifications</span><SidebarMenuBadge>{activeEventCount}</SidebarMenuBadge></SidebarMenuButton></SheetTrigger><SheetContent><SheetHeader><SheetTitle>Recent notifications</SheetTitle></SheetHeader><div className="p-4 space-y-3 overflow-y-auto max-h-[80vh]"><p className="text-xs">{activeEventCount} active events · {snap.alerts.length} historical notifications</p>{snap.alerts.length === 0 && <p>No alerts yet.</p>}{snap.alerts.map((alert) => { const delivery = snap.deliveries?.find((item) => item.alertId === alert.id); const active = visibleAlerts.some((item) => item.id === alert.id); return <div key={alert.id} className="rounded border p-3 text-sm space-y-2"><strong>{alert.severity} — {alert.ruleName}</strong><p>Event {alert.eventId} · CDM revision {alert.revisionId}</p><p>{active ? "Active under current rule" : "Historical alert"}</p><p>Delivery: {delivery?.status ?? "queued"} ({delivery?.attempts ?? 0} attempts)</p>{delivery?.lastError && <p role="alert">{delivery.lastError}</p>}<button className={buttonClass} disabled={delivery?.status === "sent" || delivery?.status === "retried"} onClick={() => delivery?.status === "failed" ? store.retryNow(alert.id) : store.deliver(alert.id)}>Send to test list / Retry</button><button className={buttonClass} disabled={delivery?.status === "sent" || delivery?.status === "retried"} onClick={() => store.deliver(alert.id, true)}>Simulate failure</button></div>; })}</div></SheetContent></Sheet></SidebarMenuItem>
          <SidebarMenuItem><Sheet><SheetTrigger asChild><SidebarMenuButton type="button" tooltip="Alert rules"><Settings2 /><span>Alert rules</span></SidebarMenuButton></SheetTrigger><SheetContent><SheetHeader><SheetTitle>Alert rule editor</SheetTitle></SheetHeader><div className="p-4 space-y-3 overflow-y-auto max-h-[85vh]">{snap.rules.map((rule) => <div className="flex gap-2 items-center" key={rule.id}><span className="flex-1 text-sm">{rule.name}</span><button className={buttonClass} onClick={() => { setEditing(rule.id); setDraft({ ...rule, objectIds: [...rule.objectIds] }); }}>Edit</button><button className={buttonClass} onClick={() => store.deleteRule(rule.id)}>Delete</button></div>)}<label className="block text-sm">Rule name<input className={inputClass} aria-label="Rule name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>{field("Minimum source Pc", "pcMin")}{field("Maximum miss distance (m)", "missDistanceMaxM")}{field("Maximum hours to TCA", "hoursToTcaMax")}<label className="block text-sm">Object watchlist (comma separated)<input className={inputClass} value={draft.objectIds.join(", ")} onChange={(e) => setDraft({ ...draft, objectIds: e.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label>{ruleError && <p role="alert" className="text-red-400">{ruleError}</p>}<button className={buttonClass} onClick={saveRule}>Save rule</button><button className={buttonClass} onClick={() => { setEditing(null); setDraft(blank()); setRuleError(""); }}>New rule</button><h3>Change history</h3>{(snap.audit ?? []).map((audit, index) => <p key={index} className="text-xs">{audit.action}: {audit.details}</p>)}</div></SheetContent></Sheet></SidebarMenuItem>
        </SidebarMenu></SidebarGroupContent></SidebarGroup>
      </SidebarContent><SidebarRail />
    </Sidebar>
    <SidebarInset className="cads-inset">
      <SidebarProvider className="cads-inner" open={Boolean(event)} onOpenChange={(open) => { if (!open) setSelected(null); }} style={{ "--sidebar-width": "30rem" } as React.CSSProperties}>
        <main className="cads-centre p-6" aria-label="Conjunction player"><div className="flex items-center justify-between gap-3 mb-4"><h1 className="text-xl font-semibold">Conjunction player</h1><SidebarTrigger aria-label="Toggle event details" /></div>{!event || !current ? <div className="cads-player-empty"><p>Select an event to open its details.</p></div> : <div className="space-y-3" data-testid="selected-player"><h2>{eventTitle(event)}</h2><p className="text-sm">Event {event.id} · {event.revisions.length} CDM update{event.revisions.length === 1 ? "" : "s"}</p><p>{current.pc !== null && current.pc >= 1e-4 ? "Too close: a maneuver may be needed (decision support only)." : "Review the latest encounter data before making a decision."}</p><p>Closest approach: {new Date(current.tca).toISOString()}</p></div>}</main>
        <Sidebar side="right" collapsible="offcanvas" aria-label="Event details"><SidebarContent className="cads-details-content"><div className="cads-details-header"><div><p className="text-xs uppercase tracking-widest text-slate-400">Selected event</p><h2 ref={detailsHeading} tabIndex={-1} className="text-lg font-semibold outline-none">{event ? eventTitle(event) : "Event details"}</h2></div><SidebarTrigger aria-label="Close event details" /></div>{!event || !current ? <p className="cads-sidebar-state">Choose an event to view its details.</p> : <div ref={detailsScroll} className="cads-details-scroll" data-testid="details-scroll"><div className="view-switch" role="group" aria-label="Event detail view"><button type="button" className="view-option" aria-pressed={view === "operator"} onClick={() => setView("operator")} onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); setView("operator"); } }}>Operator</button><button type="button" className="view-option" aria-pressed={view === "specialist"} onClick={() => setView("specialist")} onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); setView("specialist"); } }}>Specialist</button></div><EventSummaryCard event={event} analysis={analysis?.[event.id]} now={now} selected onSelect={() => selectEvent(event.id)} onOpenDetails={openSpecialist} view={view} cautiousLanguage />{view === "specialist" && <><CdmHistory event={event} /><ExplanationCard event={event} analysis={analysis?.[event.id]} now={now} cautiousLanguage /><CalculationDetails event={event} cautiousLanguage /></>}</div>}</SidebarContent><SidebarRail /></Sidebar>
      </SidebarProvider>
    </SidebarInset>
  </SidebarProvider>;
}
