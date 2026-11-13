"use client";

// The visual dashboard (/dashboard): an empty shell for the team to build on.
//   left sidebar  - data loading and the event list (one row per event)
//   centre        - the conjunction player
//   right sidebar - details of the chosen event (operator or specialist view)
// Both sidebars are the Animate UI sidebar (shadcn sidebar + Motion). Each has its own provider so they open
// and collapse independently; drag or click the rail on a sidebar's inner edge, or press Ctrl+B for the left one.
// The previous dashboard, with all current features, is at /old-dashboard.

import { Sidebar, SidebarContent, SidebarInset, SidebarProvider, SidebarRail } from "@/components/animate-ui/components/radix/sidebar";

export function VisualDashboard() {
  return (
    <SidebarProvider className="cads-app">
      <Sidebar side="left" collapsible="icon" aria-label="Data and events">
        <SidebarContent />
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="cads-inset">
        <SidebarProvider className="cads-inner" style={{ "--sidebar-width": "26rem" } as React.CSSProperties}>
          <main className="cads-centre" aria-label="Conjunction player" />
          <Sidebar side="right" collapsible="offcanvas" aria-label="Event details">
            <SidebarContent />
            <SidebarRail />
          </Sidebar>
        </SidebarProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
