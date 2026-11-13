"use client";

import { useEffect, useRef, useState } from "react";
import { Database, FileText, FileUp, Play, RotateCcw, Upload } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger } from "@/components/animate-ui/components/radix/sidebar";
import { EventSummaryCard } from "@/components/event-summary-card";
import { CdmHistory } from "@/components/cdm-history";
import { ExplanationCard } from "@/components/explanation-card";
import { CalculationDetails } from "@/components/calculation-details";
import { ConjunctionPlayer } from "@/components/visual/conjunction-player";
import { ImportReportSheet } from "@/components/import-report-sheet";
import { OriginalCdm } from "@/components/original-cdm";
import { useCadsSession } from "@/components/use-cads-session";
import { hoursBetween } from "@/lib/cads/time";
import { latestRevision, severityOf, type CdmEvent, type Severity } from "@/lib/cads/store";

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

export function VisualDashboard({ stepDelayMs = 900 }: { stepDelayMs?: number } = {}) {
  const session = useCadsSession({ stepDelayMs });
  const { snap, status, importReport, busy, now, analysis } = session;
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<"operator" | "specialist">("operator");
  const [reportOpen, setReportOpen] = useState(false);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const detailsScroll = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const event = snap.events.find((item) => item.id === selected);
  const current = event ? latestRevision(event).cdm : null;

  useEffect(() => { if (event) detailsHeading.current?.focus(); }, [event]);
  useEffect(() => { if (view === "specialist") detailsScroll.current?.scrollTo?.({ top: 0 }); }, [view, event]);
  const selectEvent = (id: number) => { setSelected(id); setView("operator"); };
  const openSpecialist = () => setView("specialist");
  const reset = () => { void session.reset(() => { setSelected(null); setReportOpen(false); setView("operator"); }); };

  return <SidebarProvider className="cads-app">
    <Sidebar side="left" collapsible="icon" aria-label="Data and events">
      <SidebarContent className="p-3">
        <SidebarGroup>
          <SidebarGroupLabel>Data actions</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton type="button" onClick={() => session.loadData(() => setSelected(null))} disabled={busy} tooltip="Load sample data"><Database /><span>Load sample data</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton type="button" onClick={session.runAnalysis} disabled={busy} tooltip="Run risk analysis"><Play /><span>Run risk analysis</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton type="button" onClick={() => fileInput.current?.click()} disabled={busy} tooltip="Load my CDM files"><Upload /><span>Load my CDM files</span></SidebarMenuButton><input ref={fileInput} className="sr-only" type="file" multiple accept=".json,.kvn,.txt" aria-label="Choose CDM files (JSON or KVN)" onChange={(e) => { void session.loadFiles(e.target.files); e.target.value = ""; }} /></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton type="button" onClick={session.addTestEvents} disabled={busy} tooltip="Add 60 test events"><FileUp /><span>Add test events</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton type="button" onClick={reset} disabled={busy} tooltip="Reset session"><RotateCcw /><span>Reset</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton type="button" onClick={() => setReportOpen(true)} disabled={!importReport} tooltip="View import report"><FileText /><span>View import report</span></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu></SidebarGroupContent>
          <p className="cads-sidebar-status" role={status.startsWith("Error:") ? "alert" : "status"}>{status}</p>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Conjunction events <span className="ml-auto">{snap.events.length}</span></SidebarGroupLabel>
          <SidebarGroupContent>{busy && snap.events.length === 0 ? <p className="cads-sidebar-state" role="status">Loading events…</p> : snap.events.length === 0 ? <p className="cads-sidebar-state">No events loaded.</p> : <SidebarMenu>{snap.events.map((item) => <EventRow key={item.id} event={item} selected={item.id === selected} analysis={analysis?.[item.id]} now={now} onSelect={() => selectEvent(item.id)} />)}</SidebarMenu>}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent><SidebarRail />
    </Sidebar>
    <SidebarInset className="cads-inset">
      <SidebarProvider className="cads-inner" open={Boolean(event)} onOpenChange={(open) => { if (!open) setSelected(null); }} style={{ "--sidebar-width": "30rem" } as React.CSSProperties}>
        <main className="cads-centre p-6" aria-label="Conjunction player"><div className="flex items-center justify-between gap-3 mb-4"><h1 className="text-xl font-semibold">Conjunction player</h1><SidebarTrigger aria-label="Toggle event details" /></div>{!event || !current ? <div className="cads-player-empty"><p>Choose an event in the left list to play its pass.</p></div> : <div data-testid="selected-player"><ConjunctionPlayer key={`${event.id}-${current.messageKey}`} event={event} /></div>}</main>
        <Sidebar side="right" collapsible="offcanvas" aria-label="Event details"><SidebarContent className="cads-details-content"><div className="cads-details-header"><div><p className="text-xs uppercase tracking-widest text-slate-400">Selected event</p><h2 ref={detailsHeading} tabIndex={-1} className="text-lg font-semibold outline-none">{event ? eventTitle(event) : "Event details"}</h2></div><SidebarTrigger aria-label="Close event details" /></div>{!event || !current ? <p className="cads-sidebar-state">Choose an event to view its details.</p> : <div ref={detailsScroll} className="cads-details-scroll" data-testid="details-scroll"><div className="view-switch" role="group" aria-label="Event detail view"><button type="button" className="view-option" aria-pressed={view === "operator"} onClick={() => setView("operator")} onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); setView("operator"); } }}>Operator</button><button type="button" className="view-option" aria-pressed={view === "specialist"} onClick={() => setView("specialist")} onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); setView("specialist"); } }}>Specialist</button></div><EventSummaryCard event={event} analysis={analysis?.[event.id]} now={now} selected onSelect={() => selectEvent(event.id)} onOpenDetails={openSpecialist} view={view} cautiousLanguage />{view === "specialist" && <><CdmHistory event={event} /><ExplanationCard event={event} analysis={analysis?.[event.id]} now={now} cautiousLanguage /><CalculationDetails event={event} cautiousLanguage /><OriginalCdm raw={current.raw} /></>}</div>}</SidebarContent><SidebarRail /></Sidebar>
      </SidebarProvider>
    </SidebarInset>
    <ImportReportSheet report={importReport} open={reportOpen} onOpenChange={setReportOpen} />
  </SidebarProvider>;
}
