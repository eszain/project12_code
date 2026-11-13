// The event register: which events are active or archived (D1), and how a long list is searched,
// filtered, sorted and paged (G5, G6). Pure functions, so the rules are easy to test.

import { latestRevision, severityOf, type CdmEvent, type Severity } from "./store";
import { needsAttention } from "./severity";

export const PAGE_SIZE = 6;

export type StatusTab = "active" | "archived";
export type SortKey = "tca" | "risk";

export interface RegisterFilters {
  query: string;
  status: StatusTab;
  /** "all" or one severity. Only applied once the risk analysis has been run. */
  severity: "all" | Severity;
  /** Only events that need a person's attention (ACTION, WATCH or UNKNOWN). Only applied after the risk analysis. */
  attentionOnly: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: RegisterFilters = { query: "", status: "active", severity: "all", attentionOnly: false, sort: "tca" };

/**
 * An event is archived when its closest approach has passed, unless the user chose otherwise:
 * `overrides[id] = true` archives it by hand, `false` keeps a passed event in the active list.
 */
export function isArchived(event: CdmEvent, nowMs: number, overrides: Record<number, boolean> = {}): boolean {
  const manual = overrides[event.id];
  if (manual !== undefined) return manual;
  return latestRevision(event).cdm.tca < nowMs;
}

const names = (e: CdmEvent) => {
  const c = latestRevision(e).cdm;
  return [c.sat1.name, c.sat1.designator, c.sat2.name, c.sat2.designator].filter(Boolean).join(" ").toLowerCase();
};

export function filterAndSort(events: CdmEvent[], f: RegisterFilters, analysed: boolean, nowMs: number, overrides: Record<number, boolean> = {}): CdmEvent[] {
  const q = f.query.trim().toLowerCase();
  const out = events.filter((e) => {
    if ((f.status === "archived") !== isArchived(e, nowMs, overrides)) return false;
    if (q && !names(e).includes(q)) return false;
    if (analysed) {
      const sev = severityOf(latestRevision(e).cdm.pc);
      if (f.severity !== "all" && sev !== f.severity) return false;
      if (f.attentionOnly && !needsAttention(sev)) return false;
    }
    return true;
  });
  const tca = (e: CdmEvent) => latestRevision(e).cdm.tca;
  const pc = (e: CdmEvent) => latestRevision(e).cdm.pc;
  return out.sort((a, b) => {
    if (f.sort === "risk" && analysed) {
      // Highest Pc first; a missing Pc sorts last, then by time.
      const pa = pc(a) ?? -1;
      const pb = pc(b) ?? -1;
      if (pa !== pb) return pb - pa;
    }
    return tca(a) - tca(b);
  });
}

export function paginate<T>(items: T[], page: number, perPage = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(page, 1), pages);
  return { items: items.slice((current - 1) * perPage, current * perPage), page: current, pages, total: items.length };
}

/** Counts for the Active / Archived tabs, ignoring the other filters. */
export function statusCounts(events: CdmEvent[], nowMs: number, overrides: Record<number, boolean> = {}) {
  const archived = events.filter((e) => isArchived(e, nowMs, overrides)).length;
  return { active: events.length - archived, archived };
}


/**
 * Provides the event-list data needed by the visual dashboard.
 * Reuses existing filtering, sorting and archive logic.
 */
export function getEventListData(
  events: CdmEvent[],
  filters: RegisterFilters,
  analysed: boolean,
  nowMs: number,
  archiveOverrides: Record<number, boolean> = {},
  page = 1
) {
  const counts = statusCounts(
    events,
    nowMs,
    archiveOverrides
  );

  const filteredEvents = filterAndSort(
    events,
    filters,
    analysed,
    nowMs,
    archiveOverrides
  );

  const paginated = paginate(filteredEvents, page);

  return {
    events: paginated.items,
    total: paginated.total,
    page: paginated.page,
    pages: paginated.pages,
    counts,
  };
}
