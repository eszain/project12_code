
// In-memory event repository + alert evaluation (browser only; nothing is persisted or sent anywhere).
// Port of cads/ingest.py and cads/alerts/rules.py. A page refresh or Reset clears everything.

import { correlate, pairKey } from "./correlation";
import { NormalizedCdm, parseDocument } from "./parser";
import { hoursBetween, isoZ } from "./time";

export const CONFIG = {
  correlationWindowS: 60, // team proposal, to confirm with CSA
  pcAction: 1e-4, // action level mentioned by CSA
  pcWatch: 1e-7, // assumption (common NASA CARA practice), to confirm with CSA
  defaultHbrM: 10,
  qualityLimitsM: [200, 1000, 1000] as [number, number, number],
  obsGapWarnH: 12, // warn when the two objects were last observed more than this far apart (CSA example: 12 h), to confirm with CSA
};

export type Severity = "ACTION" | "WATCH" | "LOW" | "ZERO" | "UNKNOWN";
export function severityOf(pc: number | null): Severity {
  if (pc === null) return "UNKNOWN";
  if (pc >= CONFIG.pcAction) return "ACTION";
  if (pc >= CONFIG.pcWatch) return "WATCH";
  return pc === 0 ? "ZERO" : "LOW";
}

export interface Revision {
  id: number;
  cdm: NormalizedCdm;
  sourceFile: string;
  sourceLabel: string;
  correlationNote: string;
}
export interface CdmEvent {
  id: number;
  key: string;
  pairKey: string;
  revisions: Revision[]; // kept sorted by CDM creation date
}
export interface AlertRule {
  id: number;
  name: string;
  pcMin: number | null;
  missDistanceMaxM: number | null;
  hoursToTcaMax: number | null;
  objectIds: string[];
}
export interface AlertOccurrence {
  id: number;
  createdAt: number;
  ruleId: number;
  ruleName: string;
  eventId: number;
  revisionId: number;
  severity: Severity;
  matched: string[];
  message: Record<string, unknown>;
  ruleVersion?: number;
  superseded?: boolean;
}

export interface RuleChange {
  id: number;
  createdAt: number;
  action: "created" | "updated" | "deleted";
  ruleId: number;
  ruleName: string;
  before: AlertRule | null;
  after: AlertRule | null;
}
export interface NotificationPause {
  eventId: number;
  mode: "mute" | "snooze";
  reason: string;
  startedAt: number;
  resumeAt: number | null;
}

export interface NotificationPauseChange {
  id: number;
  eventId: number;
  action: "mute" | "snooze" | "resume" | "expire";
  reason: string;
  createdAt: number;
  resumeAt: number | null;
}

/** A pause is effective only until its deadline. This is intentionally pure. */
export function isNotificationPaused(pause: NotificationPause | undefined | null, now: number): boolean {
  return Boolean(pause && (pause.resumeAt === null || pause.resumeAt > now));
}

export interface RecordOutcome {
  file: string;
  index: number;
  status: "imported" | "duplicate" | "rejected";
  errors: string[];
  warnings: string[];
  eventId?: number;
  alertsCreated: number;
}
export interface ImportReport {
  records: RecordOutcome[];
  counts: Record<RecordOutcome["status"], number>;
}
export interface Snapshot {
  events: CdmEvent[];
  rules: AlertRule[];
  alerts: AlertOccurrence[];
  ruleChanges?: RuleChange[];
  ruleVersions?: Record<number, number>;
  notificationPauses?: Record<number, NotificationPause>;
  notificationPauseHistory?: NotificationPauseChange[];
}

export interface PersistedStoreState {
  version: 1;
  snapshot: Snapshot;
  nextIds: {
    event: number;
    revision: number;
    rule: number;
    alert: number;
  };
}

export const latestRevision = (e: CdmEvent) =>
  e.revisions[e.revisions.length - 1];

const CAVEAT =
  "Decision support only. Pc and miss distance are the values reported in the source CDM; verify with flight dynamics before any action. CADS does not command spacecraft.";

export function evaluateRule(rule: AlertRule, cdm: NormalizedCdm): { matches: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (rule.pcMin !== null) {
    if (cdm.pc === null) return { matches: false, reasons: ["source Pc not provided"] };
    if (cdm.pc < rule.pcMin) return { matches: false, reasons: [`Pc ${cdm.pcRaw} < ${rule.pcMin.toExponential(0)}`] };
    reasons.push(`Pc ${cdm.pcRaw} >= ${rule.pcMin.toExponential(0)}`);
  }
  if (rule.missDistanceMaxM !== null) {
    if (cdm.missDistanceM > rule.missDistanceMaxM) return { matches: false, reasons: [`miss distance ${cdm.missDistanceM.toFixed(1)} m > ${rule.missDistanceMaxM} m`] };
    reasons.push(`miss distance ${cdm.missDistanceM.toFixed(1)} m <= ${rule.missDistanceMaxM} m`);
  }
  if (rule.hoursToTcaMax !== null) {
    const lead = hoursBetween(cdm.creationDate, cdm.tca);
    if (lead < 0 || lead > rule.hoursToTcaMax) return { matches: false, reasons: [`TCA ${lead.toFixed(1)} h after CDM creation (limit ${rule.hoursToTcaMax} h)`] };
    reasons.push(`TCA ${lead.toFixed(1)} h after CDM creation <= ${rule.hoursToTcaMax} h`);
  }
  if (rule.objectIds.length) {
    if (!rule.objectIds.includes(cdm.sat1.designator) && !rule.objectIds.includes(cdm.sat2.designator)) return { matches: false, reasons: ["neither object is on the rule's watch list"] };
    reasons.push("object on watch list");
  }
  return { matches: true, reasons: reasons.length ? reasons : ["rule has no conditions (matches every CDM)"] };
}

const tcaStamp = (ms: number) => isoZ(ms).replace(/[-:]/g, "").slice(0, 15);

export class Store {
  private events: CdmEvent[] = [];
  private rules: AlertRule[] = [];
  private alerts: AlertOccurrence[] = [];
  private ruleChanges: RuleChange[] = [];
  private ruleVersions: Record<number, number> = {};
  private nextChangeId = 1;
  private notificationPauses: Record<number, NotificationPause> = {};
  private notificationPauseHistory: NotificationPauseChange[] = [];
  private nextPauseChangeId = 1;
  private ids = { event: 1, revision: 1, rule: 1, alert: 1 };
  private listeners = new Set<() => void>();
  private snap: Snapshot = { events: [], rules: [], alerts: [], ruleChanges: [], ruleVersions: {}, notificationPauses: {}, notificationPauseHistory: [] };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private commit() {
    this.snap = { events: [...this.events], rules: [...this.rules], alerts: [...this.alerts], ruleChanges: [...this.ruleChanges], ruleVersions: { ...this.ruleVersions }, notificationPauses: { ...this.notificationPauses }, notificationPauseHistory: [...this.notificationPauseHistory] };
    this.listeners.forEach((l) => l());
  }

  /**
   * Export the full state for persistent storage.
   */
  exportState(): PersistedStoreState {
    return {
      version: 1,
      snapshot: structuredClone(this.getSnapshot()),
      nextIds: { ...this.ids },
    };
  }

  /**
   * Restore previously saved data.
   * Publishes a new snapshot so subscribed UI updates.
   */
  restoreState(state: PersistedStoreState): void {
    if (state.version !== 1) {
      throw new Error("Unsupported stored data version");
    }

    const restored = structuredClone(state.snapshot);

    this.events = restored.events;
    this.rules = restored.rules;
    this.alerts = restored.alerts;
    this.ruleChanges = restored.ruleChanges ?? [];
    this.ruleVersions = restored.ruleVersions ?? {};
    this.notificationPauses = restored.notificationPauses ?? {};
    this.notificationPauseHistory = restored.notificationPauseHistory ?? [];
    this.nextPauseChangeId = Math.max(1, ...this.notificationPauseHistory.map((entry) => entry.id + 1));
    this.nextChangeId = Math.max(1, ...this.ruleChanges.map((change) => change.id + 1));

    // Avoid reusing IDs already present in saved records.
    this.ids = {
      event: Math.max(
        state.nextIds.event,
        1,
        ...this.events.map((e) => e.id + 1)
      ),
      revision: Math.max(
        state.nextIds.revision,
        1,
        ...this.events.flatMap((e) =>
          e.revisions.map((r) => r.id + 1)
        )
      ),
      rule: Math.max(
        state.nextIds.rule,
        1,
        ...this.rules.map((r) => r.id + 1)
      ),
      alert: Math.max(
        state.nextIds.alert,
        1,
        ...this.alerts.map((a) => a.id + 1)
      ),
    };

    this.commit();
  }

  reset() {
    this.events = [];
    this.rules = [];
    this.alerts = [];
    this.ruleChanges = [];
    this.ruleVersions = {};
    this.nextChangeId = 1;
    this.notificationPauses = {};
    this.notificationPauseHistory = [];
    this.nextPauseChangeId = 1;
    this.ids = { event: 1, revision: 1, rule: 1, alert: 1 };
    this.commit();
  }

  /** Pause notification presentation; risk evaluation and alert history are unaffected. */
  pauseNotifications(eventId: number, mode: "mute" | "snooze", reason: string, resumeAt: number | null, at = Date.now()): void {
    if (!this.events.some((event) => event.id === eventId)) throw new Error("Event not found.");
    if (!reason.trim()) throw new Error("A reason is required.");
    if (mode === "snooze" && (resumeAt === null || !Number.isFinite(resumeAt) || resumeAt <= at)) {
      throw new Error("Choose a future resume time.");
    }
    if (mode === "mute" && resumeAt !== null) throw new Error("Mute cannot have a resume time.");
    this.notificationPauses = {
      ...this.notificationPauses,
      [eventId]: { eventId, mode, reason: reason.trim(), startedAt: at, resumeAt },
    };
    this.notificationPauseHistory = [{
      id: this.nextPauseChangeId++, eventId, action: mode,
      reason: reason.trim(), createdAt: at, resumeAt,
    }, ...this.notificationPauseHistory];
    this.commit();
  }

  resumeNotifications(eventId: number, at = Date.now()): void {
    const current = this.notificationPauses[eventId];
    if (!current) return;
    const next = { ...this.notificationPauses };
    delete next[eventId];
    this.notificationPauses = next;
    this.notificationPauseHistory = [{
      id: this.nextPauseChangeId++, eventId, action: "resume",
      reason: current.reason, createdAt: at, resumeAt: null,
    }, ...this.notificationPauseHistory];
    this.commit();
  }

  /** Expire snoozes on a clock tick without creating alerts or resending messages. */
  expireSnoozes(at = Date.now()): void {
    const expired = Object.values(this.notificationPauses).filter(
      (pause) => pause.resumeAt !== null && pause.resumeAt <= at
    );
    if (expired.length === 0) return;
    const next = { ...this.notificationPauses };
    for (const pause of expired) {
      delete next[pause.eventId];
      this.notificationPauseHistory.unshift({
        id: this.nextPauseChangeId++, eventId: pause.eventId, action: "expire",
        reason: pause.reason, createdAt: at, resumeAt: pause.resumeAt,
      });
    }
    this.notificationPauses = next;
    this.commit();
  }

  private validateRule(input: Omit<AlertRule, "id">) {
    if (!input.name.trim()) throw new Error("Rule name is required.");
    for (const value of [input.pcMin, input.missDistanceMaxM, input.hoursToTcaMax]) {
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        throw new Error("Limits must be non-negative finite numbers.");
      }
    }
    if (input.pcMin !== null && input.pcMin > 1) throw new Error("Pc cannot exceed 1.");
    if (input.pcMin === null && input.missDistanceMaxM === null &&
        input.hoursToTcaMax === null && !input.objectIds.some((id) => id.trim())) {
      throw new Error("At least one condition is required.");
    }
  }

  private recordChange(action: RuleChange["action"], before: AlertRule | null, after: AlertRule | null) {
    const rule = after ?? before!;
    this.ruleChanges.unshift({
      id: this.nextChangeId++, createdAt: Date.now(), action,
      ruleId: rule.id, ruleName: rule.name,
      before: before ? structuredClone(before) : null,
      after: after ? structuredClone(after) : null,
    });
  }

  private reevaluateLatest() {
    for (const event of this.events) this.evaluateAlerts(event, latestRevision(event));
  }

  addRule(input: Omit<AlertRule, "id">): AlertRule {
    this.validateRule(input);
    const rule = { ...structuredClone(input), name: input.name.trim(), id: this.ids.rule++ };
    this.rules.push(rule);
    this.ruleVersions[rule.id] = 1;
    this.recordChange("created", null, rule);
    this.reevaluateLatest();
    this.commit();
    return rule;
  }

  updateRule(id: number, input: Omit<AlertRule, "id">): AlertRule {
    this.validateRule(input);
    const index = this.rules.findIndex((rule) => rule.id === id);
    if (index === -1) throw new Error("Rule not found.");
    const before = structuredClone(this.rules[index]);
    const updated = { ...structuredClone(input), name: input.name.trim(), id };
    this.rules[index] = updated;
    this.ruleVersions[id] = (this.ruleVersions[id] ?? 1) + 1;
    this.alerts = this.alerts.map((alert) =>
      alert.ruleId === id ? { ...alert, superseded: true } : alert
    );
    this.recordChange("updated", before, updated);
    this.reevaluateLatest();
    this.commit();
    return updated;
  }

  deleteRule(id: number): void {
    const before = this.rules.find((rule) => rule.id === id);
    if (!before) throw new Error("Rule not found.");
    this.rules = this.rules.filter((rule) => rule.id !== id);
    this.alerts = this.alerts.map((alert) =>
      alert.ruleId === id ? { ...alert, superseded: true } : alert
    );
    this.recordChange("deleted", before, null);
    this.commit();
  }

  /** Parse, validate, de-duplicate, correlate and store; evaluate alert rules on the newest CDM of an event. */
  importDocuments(docs: { name: string; content: string; label: string }[]): ImportReport {
    const records: RecordOutcome[] = [];
    for (const doc of docs) {
      for (const res of parseDocument(doc.content, doc.name)) {
        if (!res.cdm) {
          records.push({ file: doc.name, index: res.recordIndex, status: "rejected", errors: res.errors, warnings: res.warnings, alertsCreated: 0 });
          continue;
        }
        records.push({ ...this.ingest(res.cdm, doc.name, doc.label), file: doc.name, index: res.recordIndex });
      }
    }
    this.commit();
    const counts = { imported: 0, duplicate: 0, rejected: 0 };
    records.forEach((r) => counts[r.status]++);
    return { records, counts };
  }

  private ingest(cdm: NormalizedCdm, file: string, label: string): Omit<RecordOutcome, "file" | "index"> {
    const warnings = [...cdm.warnings];
    const existing = this.events.flatMap((e) => e.revisions.map((r) => ({ e, r }))).find((x) => x.r.cdm.messageKey === cdm.messageKey);
    if (existing) return { status: "duplicate", errors: [], warnings: [...warnings, `already imported (${cdm.messageKey}); not stored again`], eventId: existing.e.id, alertsCreated: 0 };

    const pk = pairKey(
      cdm.sat1.designator,
      cdm.sat2.designator
    );

    const sameCandidates = this.events.filter(
      (e) => e.pairKey === pk
    );

    const decision = correlate(
      cdm.tca,
      sameCandidates.map((e) => ({
        eventId: e.id,
        tcas: e.revisions.map((r) => r.cdm.tca),
      })),
      CONFIG.correlationWindowS
    );

    // A new CDM can connect multiple existing events.
    const matchingEvents = sameCandidates.filter((e) =>
      e.revisions.some(
        (r) =>
          Math.abs(r.cdm.tca - cdm.tca) <=
          CONFIG.correlationWindowS * 1000
      )
    );

    let event: CdmEvent;

    if (matchingEvents.length === 0) {
      event = {
        id: this.ids.event++,
        key: `${cdm.sat1.designator}-${cdm.sat2.designator}-${tcaStamp(cdm.tca)}`,
        pairKey: pk,
        revisions: [],
      };

      this.events.push(event);
    } else {
      // Preserve the earliest event ID.
      matchingEvents.sort((a, b) => a.id - b.id);
      event = matchingEvents[0];

      // Merge other connected events.
      for (const other of matchingEvents.slice(1)) {
        event.revisions.push(...other.revisions);

        // Redirect alerts to the surviving event.
        for (const alert of this.alerts) {
          if (alert.eventId === other.id) {
            alert.eventId = event.id;
            alert.message = {
              ...alert.message,
              event: event.key,
            };
          }
        }

        const mergedPause = this.notificationPauses[other.id];
        if (mergedPause) {
          // Retain the more restrictive pause when two events merge.
          const currentPause = this.notificationPauses[event.id];
          if (!currentPause || currentPause.mode !== "mute" &&
              (mergedPause.mode === "mute" || (mergedPause.resumeAt ?? 0) > (currentPause.resumeAt ?? 0))) {
            this.notificationPauses[event.id] = { ...mergedPause, eventId: event.id };
          }
          delete this.notificationPauses[other.id];
        }
        this.events = this.events.filter(
          (e) => e.id !== other.id
        );
      }

      if (matchingEvents.length > 1) {
        warnings.push(
          `Merged ${matchingEvents.length} connected events into event ${event.id}`
        );
      } else if (decision.ambiguous) {
        warnings.push(decision.note);
      }
    }

    const revision: Revision = {
      id: this.ids.revision++,
      cdm,
      sourceFile: file,
      sourceLabel: label,
      correlationNote:
        matchingEvents.length > 1
          ? `Bridging revision merged ${matchingEvents.length} events`
          : decision.note,
    };

    event.revisions.push(revision);

    // Keep every revision in creation-date order.
    event.revisions.sort(
      (a, b) =>
        a.cdm.creationDate - b.cdm.creationDate ||
        a.id - b.id
    );

    let alertsCreated = 0;
    if (latestRevision(event).id === revision.id) alertsCreated = this.evaluateAlerts(event, revision);
    else warnings.push("superseded on arrival: a newer CDM for this event is already stored, so alert rules were not evaluated");
    return { status: "imported", errors: [], warnings, eventId: event.id, alertsCreated };
  }

  private evaluateAlerts(event: CdmEvent, rev: Revision): number {
    let created = 0;
    for (const rule of this.rules) {
      const { matches, reasons } = evaluateRule(rule, rev.cdm);
      if (!matches || this.alerts.some((a) => a.ruleId === rule.id && a.revisionId === rev.id && !a.superseded)) continue; // one alert per rule per CDM
      const c = rev.cdm;
      const severity = severityOf(c.pc);
      this.alerts.unshift({
        id: this.ids.alert++,
        createdAt: Date.now(),
        ruleId: rule.id,
        ruleVersion: this.ruleVersions[rule.id] ?? 1,
        ruleName: rule.name,
        eventId: event.id,
        revisionId: rev.id,
        severity,
        matched: reasons,
        message: {
          type: "cads.conjunction.alert",
          severity,
          rule: rule.name,
          matched_conditions: reasons,
          event: event.key,
          primary: c.sat1.name ?? c.sat1.designator,
          secondary: c.sat2.name ?? c.sat2.designator,
          tca: isoZ(c.tca),
          lead_time_h: Number(hoursBetween(c.creationDate, c.tca).toFixed(3)),
          miss_distance_m: c.missDistanceM,
          pc_source: c.pcRaw,
          cdm_id: c.cdmId,
          source_file: rev.sourceFile,
          source_label: rev.sourceLabel,
          caveat: CAVEAT,
        },
      });
      created++;
    }
    return created;
  }
}
