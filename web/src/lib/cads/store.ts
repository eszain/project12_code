
import { correlate, pairKey } from "./correlation";
import { NormalizedCdm, parseDocument } from "./parser";
import { hoursBetween, isoZ } from "./time";

export const CONFIG = {
  correlationWindowS: 60,
  pcAction: 1e-4,
  pcWatch: 1e-7,
  defaultHbrM: 10,
  qualityLimitsM: [200, 1000, 1000] as [number, number, number],
  obsGapWarnH: 12,
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
  revisions: Revision[];
}

export interface AlertRule {
  id: number;
  name: string;
  pcMin: number | null;
  missDistanceMaxM: number | null;
  hoursToTcaMax: number | null;
  objectIds: string[];
  enabled?: boolean;
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
}

export interface Delivery {
  id: number;
  alertId: number;
  status: "queued" | "sent" | "failed" | "retried";
  attempts: number;
  lastError?: string;
  nextAttemptAt?: number;
}

export interface AlertAudit {
  at: number;
  action: string;
  details: string;
}

export interface Suppression {
  eventId: number;
  kind: "mute" | "snooze";
  reason: string;
  until?: number;
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
  deliveries?: Delivery[];
  audit?: AlertAudit[];
  suppressions?: Suppression[];
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

export function evaluateRule(
  rule: AlertRule,
  cdm: NormalizedCdm
): { matches: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (rule.pcMin !== null) {
    if (cdm.pc === null) {
      return {
        matches: false,
        reasons: ["source Pc not provided"],
      };
    }

    if (cdm.pc < rule.pcMin) {
      return {
        matches: false,
        reasons: [`Pc ${cdm.pcRaw} < ${rule.pcMin.toExponential(0)}`],
      };
    }

    reasons.push(`Pc ${cdm.pcRaw} >= ${rule.pcMin.toExponential(0)}`);
  }

  if (rule.missDistanceMaxM !== null) {
    if (cdm.missDistanceM > rule.missDistanceMaxM) {
      return {
        matches: false,
        reasons: [
          `miss distance ${cdm.missDistanceM.toFixed(1)} m > ${rule.missDistanceMaxM} m`,
        ],
      };
    }

    reasons.push(
      `miss distance ${cdm.missDistanceM.toFixed(1)} m <= ${rule.missDistanceMaxM} m`
    );
  }

  if (rule.hoursToTcaMax !== null) {
    const lead = hoursBetween(cdm.creationDate, cdm.tca);

    if (lead < 0 || lead > rule.hoursToTcaMax) {
      return {
        matches: false,
        reasons: [
          `TCA ${lead.toFixed(1)} h after CDM creation (limit ${rule.hoursToTcaMax} h)`,
        ],
      };
    }

    reasons.push(
      `TCA ${lead.toFixed(1)} h after CDM creation <= ${rule.hoursToTcaMax} h`
    );
  }

  if (rule.objectIds.length) {
    if (
      !rule.objectIds.includes(cdm.sat1.designator) &&
      !rule.objectIds.includes(cdm.sat2.designator)
    ) {
      return {
        matches: false,
        reasons: ["neither object is on the rule's watch list"],
      };
    }

    reasons.push("object on watch list");
  }

  return {
    matches: true,
    reasons: reasons.length
      ? reasons
      : ["rule has no conditions (matches every CDM)"],
  };
}

const tcaStamp = (ms: number) =>
  isoZ(ms).replace(/[-:]/g, "").slice(0, 15);

export class Store {
  private events: CdmEvent[] = [];
  private rules: AlertRule[] = [];
  private alerts: AlertOccurrence[] = [];
  private deliveries: Delivery[] = [];
  private audit: AlertAudit[] = [];
  private suppressions: Suppression[] = [];

  private ids = {
    event: 1,
    revision: 1,
    rule: 1,
    alert: 1,
  };

  private listeners = new Set<() => void>();

  private snap: Snapshot = {
    events: [],
    rules: [],
    alerts: [],
    deliveries: [],
    audit: [],
    suppressions: [],
  };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  private commit() {
    this.snap = {
      events: [...this.events],
      rules: [...this.rules],
      alerts: [...this.alerts],
      deliveries: [...this.deliveries],
      audit: [...this.audit],
      suppressions: [...this.suppressions],
    };

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
    this.deliveries = restored.deliveries ?? [];
    this.audit = restored.audit ?? [];
    this.suppressions = restored.suppressions ?? [];

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
    this.deliveries = [];
    this.audit = [];
    this.suppressions = [];

    this.ids = {
      event: 1,
      revision: 1,
      rule: 1,
      alert: 1,
    };

    this.commit();
  }

  addRule(rule: Omit<AlertRule, "id">): AlertRule {
    if (
      !rule.name.trim() ||
      (
        rule.pcMin === null &&
        rule.missDistanceMaxM === null &&
        rule.hoursToTcaMax === null &&
        !rule.objectIds.length
      )
    ) {
      throw new Error("Specify a rule name and at least one condition");
    }

    const r = {
      ...rule,
      objectIds: [...rule.objectIds],
      id: this.ids.rule++,
    };

    this.rules.push(r);

    this.audit.push({
      at: Date.now(),
      action: "rule.created",
      details: r.name,
    });

    this.commit();
    return r;
  }

  updateRule(
    id: number,
    patch: Partial<Omit<AlertRule, "id">>
  ) {
    const rule = this.rules.find((r) => r.id === id);

    if (!rule) throw new Error("Rule not found");

    const before = {
      ...rule,
      objectIds: [...rule.objectIds],
    };

    Object.assign(rule, patch);

    this.audit.push({
      at: Date.now(),
      action: "rule.updated",
      details: JSON.stringify({
        id,
        before,
        after: rule,
      }),
    });

    this.reevaluate();
    this.commit();
  }

  deleteRule(id: number) {
    this.rules = this.rules.filter((r) => r.id !== id);

    this.audit.push({
      at: Date.now(),
      action: "rule.deleted",
      details: String(id),
    });

    this.commit();
  }

  suppress(
    eventId: number,
    kind: "mute" | "snooze",
    reason: string,
    until?: number
  ) {
    if (!reason.trim()) {
      throw new Error("A reason is required");
    }

    if (
      kind === "snooze" &&
      (!until || until <= Date.now())
    ) {
      throw new Error("Choose a future snooze time");
    }

    this.suppressions = this.suppressions.filter(
      (s) => s.eventId !== eventId
    );

    this.suppressions.push({
      eventId,
      kind,
      reason: reason.trim(),
      until,
    });

    this.audit.push({
      at: Date.now(),
      action: `event.${kind}`,
      details: `${eventId}: ${reason}`,
    });

    this.commit();
  }

  unsuppress(eventId: number) {
    if (
      !this.suppressions.some(
        (s) => s.eventId === eventId
      )
    ) {
      return;
    }

    this.suppressions = this.suppressions.filter(
      (s) => s.eventId !== eventId
    );

    this.audit.push({
      at: Date.now(),
      action: "event.unmute",
      details: String(eventId),
    });

    this.commit();
  }

  /**
   * Demo-only delivery.
   * No real email or webhook requests.
   */
  deliver(
    alertId: number,
    fail = false,
    now = Date.now()
  ) {
    const d = this.deliveries.find(
      (item) => item.alertId === alertId
    );

    if (
      !d ||
      d.status === "sent" ||
      d.status === "retried"
    ) {
      return;
    }

    if (
      d.nextAttemptAt !== undefined &&
      now < d.nextAttemptAt
    ) {
      return;
    }

    d.attempts++;

    if (fail) {
      d.status = "failed";
      d.lastError = "Simulated test-channel failure";
      d.nextAttemptAt =
        now +
        Math.min(
          60_000 * 2 ** (d.attempts - 1),
          3_600_000
        );
    } else {
      d.status = d.attempts > 1 ? "retried" : "sent";
      d.lastError = undefined;
      d.nextAttemptAt = undefined;
    }

    this.audit.push({
      at: now,
      action: "delivery.attempt",
      details: JSON.stringify({
        alertId,
        attempt: d.attempts,
        status: d.status,
      }),
    });

    this.commit();
  }

  retryNow(
    alertId: number,
    now = Date.now()
  ) {
    const d = this.deliveries.find(
      (item) => item.alertId === alertId
    );

    if (!d || d.status !== "failed") return;

    d.nextAttemptAt = undefined;
    this.deliver(alertId, false, now);
  }

  /**
   * Current active alerts, separate from history.
   */
  activeAlerts(now: number): AlertOccurrence[] {
    return this.alerts.filter((a) => {
      const event = this.events.find(
        (e) => e.id === a.eventId
      );

      const rule = this.rules.find(
        (r) => r.id === a.ruleId
      );

      if (!event || !rule || rule.enabled === false) {
        return false;
      }

      const suppression = this.suppressions.find(
        (x) => x.eventId === event.id
      );

      if (
        suppression &&
        (
          suppression.kind === "mute" ||
          (suppression.until ?? 0) > now
        )
      ) {
        return false;
      }

      const latest = latestRevision(event);

      return Boolean(
        latest &&
        evaluateRule(rule, latest.cdm).matches &&
        a.revisionId ===
          this.alerts.find(
            (x) =>
              x.eventId === event.id &&
              x.ruleId === rule.id
          )?.revisionId
      );
    });
  }

  activeEventCount(now: number): number {
    return new Set(
      this.activeAlerts(now).map((a) => a.eventId)
    ).size;
  }

  private reevaluate() {
    for (const event of this.events) {
      const rev = latestRevision(event);

      if (rev) this.evaluateAlerts(event, rev);
    }
  }

  importDocuments(
    docs: {
      name: string;
      content: string;
      label: string;
    }[]
  ): ImportReport {
    const records: RecordOutcome[] = [];

    for (const doc of docs) {
      for (const res of parseDocument(
        doc.content,
        doc.name
      )) {
        if (!res.cdm) {
          records.push({
            file: doc.name,
            index: res.recordIndex,
            status: "rejected",
            errors: res.errors,
            warnings: res.warnings,
            alertsCreated: 0,
          });

          continue;
        }

        records.push({
          ...this.ingest(res.cdm, doc.name, doc.label),
          file: doc.name,
          index: res.recordIndex,
        });
      }
    }

    this.commit();

    const counts = {
      imported: 0,
      duplicate: 0,
      rejected: 0,
    };

    records.forEach((r) => counts[r.status]++);

    return { records, counts };
  }

  private ingest(
    cdm: NormalizedCdm,
    file: string,
    label: string
  ): Omit<RecordOutcome, "file" | "index"> {
    const warnings = [...cdm.warnings];

    // Preserve duplicate detection from visual-dashboard.
    const existing = this.events
      .flatMap((e) =>
        e.revisions.map((r) => ({ e, r }))
      )
      .find(
        (x) => x.r.cdm.messageKey === cdm.messageKey
      );

    if (existing) {
      return {
        status: "duplicate",
        errors: [],
        warnings: [
          ...warnings,
          `already imported (${cdm.messageKey}); not stored again`,
        ],
        eventId: existing.e.id,
        alertsCreated: 0,
      };
    }

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

        // Redirect suppression records.
        for (const suppression of this.suppressions) {
          if (suppression.eventId === other.id) {
            suppression.eventId = event.id;
          }
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

    if (latestRevision(event).id === revision.id) {
      alertsCreated = this.evaluateAlerts(
        event,
        revision
      );
    } else {
      warnings.push(
        "superseded on arrival: a newer CDM for this event is already stored, so alert rules were not evaluated"
      );
    }

    return {
      status: "imported",
      errors: [],
      warnings,
      eventId: event.id,
      alertsCreated,
    };
  }

  private evaluateAlerts(
    event: CdmEvent,
    rev: Revision
  ): number {
    let created = 0;

    for (const rule of this.rules) {
      if (rule.enabled === false) continue;

      const { matches, reasons } = evaluateRule(
        rule,
        rev.cdm
      );

      if (
        !matches ||
        this.alerts.some(
          (a) =>
            a.ruleId === rule.id &&
            a.revisionId === rev.id
        )
      ) {
        continue;
      }

      const c = rev.cdm;
      const severity = severityOf(c.pc);
      const alertId = this.ids.alert++;

      this.alerts.unshift({
        id: alertId,
        createdAt: Date.now(),
        ruleId: rule.id,
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
          lead_time_h: Number(
            hoursBetween(c.creationDate, c.tca).toFixed(3)
          ),
          miss_distance_m: c.missDistanceM,
          pc_source: c.pcRaw,
          cdm_id: c.cdmId,
          source_file: rev.sourceFile,
          source_label: rev.sourceLabel,
          caveat: CAVEAT,
        },
      });

      this.deliveries.unshift({
        id: alertId,
        alertId,
        status: "queued",
        attempts: 0,
      });

      created++;
    }

    return created;
  }
}
