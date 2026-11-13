"use client";

// /site-visit: evidence for the Fall Agile Site Visit rubric, one section per criterion.
// A collapsible sidebar on the left jumps to each section and follows the reader as they scroll.

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import {
  Accessibility, Boxes, ClipboardCheck, FlaskConical, GitPullRequest, KanbanSquare, LayoutDashboard, ListChecks, Map as MapIcon,
  Network, Rocket, Shapes, Target, Users, type LucideIcon,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar,
} from "@/components/animate-ui/components/radix/sidebar";
import "./site-visit.css";
import { CRITERIA, LINKS, SNAPSHOT_DATE, STATUS_LABEL, totalWeight, type Status } from "@/lib/site-visit";
import { ExternalLink, StatusBadge } from "./parts";
import { ThemeToggle } from "./theme-toggle";
import {
  AgileSection, ArchitectureSection, ImpactSection, ObjectivesSection, QualitySection, RequirementsSection, RoadmapSection, StakeholdersSection,
} from "./sections";

const CRITERION_ICONS: Record<string, LucideIcon> = {
  objectives: Target, stakeholders: Users, requirements: ListChecks, architecture: Network,
  roadmap: MapIcon, quality: FlaskConical, agile: KanbanSquare, impact: Accessibility,
};

/** Shortcuts to the evidence the visit asks to see. */
const EVIDENCE_LINKS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "system-architecture", label: "System architecture", icon: Network },
  { id: "uml", label: "UML diagrams", icon: Shapes },
  { id: "user-stories", label: "User stories", icon: ListChecks },
  { id: "sprint-boards", label: "Sprint boards", icon: KanbanSquare },
  { id: "test-plan", label: "Testing plan", icon: ClipboardCheck },
  { id: "test-evidence", label: "Test evidence", icon: FlaskConical },
  { id: "increments", label: "Functional increments", icon: Rocket },
  { id: "configuration", label: "Configuration management", icon: GitPullRequest },
  { id: "backlog", label: "Product backlog", icon: Boxes },
];

/** The criterion currently in view, so the sidebar can mark it. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = ids.find((id) => visible.get(id));
        if (first) setActive(first);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

const CRITERION_IDS = CRITERIA.map((c) => c.id);

function NavLink({ id, label, icon: Icon, active, badge }: { id: string; label: string; icon: LucideIcon; active?: boolean; badge?: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <a href={`#${id}`} aria-current={active ? "location" : undefined} onClick={() => { if (isMobile) setOpenMobile(false); }}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </a>
      </SidebarMenuButton>
      {badge ? <SidebarMenuBadge aria-hidden="true" className="top-1.5 text-muted-foreground">{badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}

function Overview() {
  const counts = (s: Status) => CRITERIA.flatMap((c) => c.claims).filter((c) => c.status === s).length;
  const worst = (statuses: Status[]): Status => (statuses.includes("gap") ? "gap" : statuses.includes("partial") ? "partial" : "met");
  return (
    <section id="overview" aria-labelledby="overview-heading" className="scroll-mt-16 pb-10 pt-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">Fall Agile Site Visit · Project 12</p>
      <h1 id="overview-heading" className="mt-2 text-balance text-3xl font-semibold text-foreground sm:text-4xl">Site visit evidence</h1>
      <p className="mt-3 max-w-3xl text-pretty text-lg leading-relaxed text-muted-foreground">
        Modernization of the Collision Avoidance Detection System, with the Canadian Space Agency. One section for each rubric criterion: what the Excellent level asks for, the evidence we have, and what is still open.
      </p>
      <p className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span>Snapshot: {SNAPSHOT_DATE}</span>
        <ExternalLink href={LINKS.live}>Live app</ExternalLink>
        <ExternalLink href={LINKS.repo}>Repository</ExternalLink>
        <ExternalLink href={LINKS.board}>Project board</ExternalLink>
      </p>

      <dl className="mt-6 flex flex-wrap gap-3" aria-label="Evidence summary">
        {(["met", "partial", "gap"] as const).map((s) => (
          <div key={s} className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <dd className="text-2xl font-semibold tabular-nums text-foreground">{counts(s)}</dd>
            <dt><StatusBadge status={s} /></dt>
          </div>
        ))}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <dd className="text-2xl font-semibold tabular-nums text-foreground">{totalWeight()}</dd>
          <dt className="text-sm text-muted-foreground">total rubric weight</dt>
        </div>
      </dl>

      <ol aria-label="Rubric criteria" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CRITERIA.map((c) => {
          const Icon = CRITERION_ICONS[c.id];
          const status = worst(c.claims.map((x) => x.status));
          return (
            <li key={c.id}>
              <a href={`#${c.id}`} className="group flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-muted focus-visible:outline-2 focus-visible:outline-neutral-300">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground"><Icon aria-hidden="true" className="size-4" /> Criterion {c.n}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">Weight {c.weight}</span>
                </span>
                <span className="mt-2 flex-1 font-medium leading-snug text-foreground">{c.title}</span>
                <span className="mt-3"><StatusBadge status={status} label={status === "met" ? STATUS_LABEL.met : `${c.open.length} open item${c.open.length === 1 ? "" : "s"}`} /></span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function SiteVisitPage() {
  const active = useActiveSection(CRITERION_IDS);
  return (
    <SidebarProvider className="site-visit scroll-smooth" style={{ "--sidebar-width": "18rem" } as CSSProperties}>
      <Sidebar side="left" collapsible="icon" aria-label="Site visit sections">
        <SidebarHeader>
          <SidebarMenu>
            <NavLink id="overview" label="Site visit evidence" icon={LayoutDashboard} />
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Rubric criteria">
            <SidebarGroup>
              <SidebarGroupLabel>Rubric criteria</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {CRITERIA.map((c) => (
                    <NavLink key={c.id} id={c.id} label={`${c.n}. ${c.short}`} icon={CRITERION_ICONS[c.id]} active={active === c.id} badge={String(c.weight)} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
          <nav aria-label="Jump to evidence">
            <SidebarGroup>
              <SidebarGroupLabel>Jump to evidence</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {EVIDENCE_LINKS.map((l) => <NavLink key={l.id} {...l} />)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <p className="px-2 pb-1 text-xs leading-relaxed text-muted-foreground group-data-[collapsible=icon]:hidden">Numbers beside each criterion are rubric weights. Ctrl+B hides this sidebar.</p>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="cads-inset">
        <header className="sticky top-0 z-[5] flex h-12 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger aria-label="Toggle section sidebar" />
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-foreground"><span aria-hidden="true" className="text-foreground">◈</span> CADS</Link>
          <span className="hidden text-sm text-muted-foreground sm:inline">Site visit evidence</span>
          <nav aria-label="Site" className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/vision" className="hover:text-foreground">Vision</Link>
            <ThemeToggle />
            <Link href="/dashboard" className="rounded-md border border-foreground/30 px-2.5 py-1 text-foreground hover:bg-muted">Open dashboard <span aria-hidden="true">↗</span></Link>
          </nav>
        </header>
        <div className="mx-auto w-full max-w-[100rem] px-4 pb-24 sm:px-8">
          <Overview />
          <ObjectivesSection />
          <StakeholdersSection />
          <RequirementsSection />
          <ArchitectureSection />
          <RoadmapSection />
          <QualitySection />
          <AgileSection />
          <ImpactSection />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
