"use client";

// The visual dashboard (/dashboard): an empty shell for the team to build on.
//   left sidebar  - data loading and the event list (one row per event)
//   centre        - the conjunction player
//   right sidebar - details of the chosen event (operator or specialist view)
// Both sidebars are the Animate UI sidebar (shadcn sidebar + Motion). Each has its own provider so they open
// and collapse independently; drag or click the rail on a sidebar's inner edge, or press Ctrl+B for the left one.
// The previous dashboard, with all current features, is at /old-dashboard.

import { useRef, useState } from "react";
import { Database, RotateCcw } from "lucide-react";

import { Sidebar, SidebarContent, SidebarHeader, SidebarInset, SidebarProvider, SidebarRail } from "@/components/animate-ui/components/radix/sidebar";
import { ImportReportSheet } from "@/components/import-report-sheet";
import { OriginalCdm } from "@/components/original-cdm";
import { useCadsSession } from "@/components/use-cads-session";
import { latestRevision, type CdmEvent } from "@/lib/cads/store";

export function VisualDashboard({ stepDelayMs = 900 }: { stepDelayMs?: number } = {}) {
  const { snap, status, importReport, busy, loadData, loadFiles, addTestEvents, reset } = useCadsSession({ stepDelayMs });
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [detailView, setDetailView] = useState<"operator" | "specialist">("operator");
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedEvent = snap.events.find((event) => event.id === selectedEventId) ?? null;

  const handleLoad = () => {
    void loadData(() => setSelectedEventId(null));
  };

  const handleReset = () => {
    void reset(() => {
      setSelectedEventId(null);
      setReportOpen(false);
      setDetailView("operator");
    });
  };

  return (
    <SidebarProvider className="cads-app">
      <Sidebar side="left" collapsible="icon" aria-label="Data and events">
        <SidebarHeader className="border-b p-3">
          <span className="truncate text-sm font-semibold">CADS Events</span>
        </SidebarHeader>
        <SidebarContent className="p-3">
          <div className="space-y-2">
            <button type="button" onClick={handleLoad} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
              <Database className="size-4" />
              Load sample data
            </button>
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
              Upload CDM files
            </button>
            <button type="button" onClick={() => void addTestEvents()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
              Add test events
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".json,.kvn,.txt"
              className="sr-only"
              aria-label="Choose CDM files (JSON or KVN)"
              onChange={(e) => {
                void loadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button type="button" onClick={handleReset} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
              <RotateCcw className="size-4" />
              Reset
            </button>
            <p role="status" className="text-xs text-muted-foreground">{status}</p>
            <button type="button" onClick={() => setReportOpen(true)} disabled={!importReport} className="text-left text-xs underline disabled:no-underline disabled:opacity-50">
              View import report
            </button>
          </div>
          <div className="mt-5 space-y-2">
            <h2 className="text-sm font-semibold">Events ({snap.events.length})</h2>
            {snap.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events loaded.</p>
            ) : (
              snap.events.map((event) => (
                <EventRow key={event.id} event={event} selected={selectedEventId === event.id} onSelect={() => setSelectedEventId(event.id)} />
              ))
            )}
          </div>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="cads-inset">
        <SidebarProvider className="cads-inner" style={{ "--sidebar-width": "26rem" } as React.CSSProperties}>
          <main className="cads-centre" aria-label="Conjunction player" />
          <Sidebar side="right" collapsible="offcanvas" aria-label="Event details">
            <SidebarContent className="p-4">
              {selectedEvent ? (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Event {selectedEvent.id}</h2>
                  <p className="break-words text-sm text-muted-foreground">{selectedEvent.key}</p>
                  <div className="flex gap-2" role="group" aria-label="Detail view">
                    {(["operator", "specialist"] as const).map((view) => (
                      <button key={view} type="button" aria-pressed={detailView === view} onClick={() => setDetailView(view)} className="rounded-md border px-2 py-1 text-xs capitalize">
                        {view}
                      </button>
                    ))}
                  </div>
                  {detailView === "operator" ? (
                    <p className="text-sm text-muted-foreground">Operator view: closest approach, miss distance and reported collision chance.</p>
                  ) : (
                    <OriginalCdm raw={latestRevision(selectedEvent).cdm.raw} />
                  )}
                  <p className="text-xs text-muted-foreground">Decision support only. CADS does not command spacecraft.</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select an event to view its details.</p>
              )}
            </SidebarContent>
            <SidebarRail />
          </Sidebar>
        </SidebarProvider>
      </SidebarInset>
      <ImportReportSheet report={importReport} open={reportOpen} onOpenChange={setReportOpen} />
    </SidebarProvider>
  );
}

function EventRow({ event, selected, onSelect }: { event: CdmEvent; selected: boolean; onSelect: () => void }) {
  const cdm = latestRevision(event).cdm;
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`Event ${event.id}`} className={`w-full rounded-lg border p-3 text-left hover:bg-muted/50 ${selected ? "border-primary bg-muted" : ""}`}>
      <span className="text-sm font-semibold">Event {event.id}</span>
      <p className="mt-2 truncate text-xs text-muted-foreground">{cdm.sat1.name || cdm.sat1.designator}</p>
      <p className="truncate text-xs text-muted-foreground">vs. {cdm.sat2.name || cdm.sat2.designator}</p>
    </button>
  );
}