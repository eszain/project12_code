
// In-memory event repository and alert evaluation.
// Nothing is persisted or sent anywhere.

import { correlate, pairKey } from "./correlation";
import { NormalizedCdm, parseDocument } from "./parser";
import { hoursBetween, isoZ } from "./time";

export const CONFIG = {
  correlationWindowS: 60,
  pcAction: 1e-4,
  pcWatch: 1e-7,
  defaultHbrM: 10,
  qualityLimitsM: [200, 1000, 1000] as [
    number,
    number,
    number,
  ],
  obsGapWarnH: 12,
};

export type Severity =
  | "ACTION"
  | "WATCH"
  | "LOW"
  | "ZERO"
  | "UNKNOWN";

export function severityOf(
  pc: number | null,
): Severity {
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

export interface RuleChange {
  id: number;
  at: number;
  action: "created" | "updated" | "deleted";
  ruleId: number;
  before: AlertRule | null;
  after: AlertRule | null;
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
}

export const latestRevision = (e: CdmEvent) =>
  e.revisions[e.revisions.length - 1];

const CAVEAT =
  "Decision support only. Pc and miss distance are the values reported in the source CDM; verify with flight dynamics before any action. CADS does not command spacecraft.";

export function evaluateRule(
  rule: AlertRule,
  cdm: NormalizedCdm,
): {
  matches: boolean;
  reasons: string[];
} {
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
        reasons: [
          `Pc ${cdm.pcRaw} < ${rule.pcMin.toExponential(0)}`,
        ],
      };
    }

    reasons.push(
      `Pc ${cdm.pcRaw} >= ${rule.pcMin.toExponential(0)}`,
    );
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
      `miss distance ${cdm.missDistanceM.toFixed(1)} m <= ${rule.missDistanceMaxM} m`,
    );
  }

  if (rule.hoursToTcaMax !== null) {
    const lead = hoursBetween(
      cdm.creationDate,
      cdm.tca,
    );

    if (lead < 0 || lead > rule.hoursToTcaMax) {
      return {
        matches: false,
        reasons: [
          `TCA ${lead.toFixed(1)} h after CDM creation (limit ${rule.hoursToTcaMax} h)`,
        ],
      };
    }

    reasons.push(
      `TCA ${lead.toFixed(1)} h after CDM creation <= ${rule.hoursToTcaMax} h`,
    );
  }

  if (rule.objectIds.length) {
    if (
      !rule.objectIds.includes(cdm.sat1.designator) &&
      !rule.objectIds.includes(cdm.sat2.designator)
    ) {
      return {
        matches: false,
        reasons: [
          "neither object is on the rule's watch list",
        ],
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
  isoZ(ms)
    .replace(/[-:]/g, "")
    .slice(0, 15);

export class Store {
  private events: CdmEvent[] = [];
  private rules: AlertRule[] = [];
  private alerts: AlertOccurrence[] = [];
  private ruleChanges: RuleChange[] = [];

  private changeId = 1;

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
    ruleChanges: [],
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
      ruleChanges: [...this.ruleChanges],
    };

    this.listeners.forEach((l) => l());
  }

  reset() {
    this.events = [];
    this.rules = [];
    this.alerts = [];
    this.ruleChanges = [];
    this.changeId = 1;

    this.ids = {
      event: 1,
      revision: 1,
      rule: 1,
      alert: 1,
    };

    this.commit();
  }

  addRule(
    rule: Omit<AlertRule, "id">,
  ): AlertRule {
    const r: AlertRule = {
      ...rule,
      objectIds: [...rule.objectIds],
      id: this.ids.rule++,
    };

    this.rules.push(r);

    this.ruleChanges.unshift({
      id: this.changeId++,
      at: Date.now(),
      action: "created",
      ruleId: r.id,
      before: null,
      after: {
        ...r,
        objectIds: [...r.objectIds],
      },
    });

    this.recalculateRuleAlerts(r.id);
    this.commit();

    return r;
  }

  updateRule(
    id: number,
    input: Omit<AlertRule, "id">,
  ): AlertRule {
    const index = this.rules.findIndex(
      (r) => r.id === id,
    );

    if (index < 0) {
      throw new Error(`Rule ${id} not found`);
    }

    const before = this.rules[index];

    const after: AlertRule = {
      ...input,
      objectIds: [...input.objectIds],
      id,
    };

    this.rules[index] = after;

    this.ruleChanges.unshift({
      id: this.changeId++,
      at: Date.now(),
      action: "updated",
      ruleId: id,
      before: {
        ...before,
        objectIds: [...before.objectIds],
      },
      after: {
        ...after,
        objectIds: [...after.objectIds],
      },
    });

    this.recalculateRuleAlerts(id);
    this.commit();

    return after;
  }

  deleteRule(id: number): void {
    const rule = this.rules.find(
      (r) => r.id === id,
    );

    if (!rule) {
      throw new Error(`Rule ${id} not found`);
    }

    this.rules = this.rules.filter(
      (r) => r.id !== id,
    );

    this.alerts = this.alerts.filter(
      (a) => a.ruleId !== id,
    );

    this.ruleChanges.unshift({
      id: this.changeId++,
      at: Date.now(),
      action: "deleted",
      ruleId: id,
      before: {
        ...rule,
        objectIds: [...rule.objectIds],
      },
      after: null,
    });

    this.commit();
  }

  private recalculateRuleAlerts(
    id: number,
  ): void {
    this.alerts = this.alerts.filter(
      (a) => a.ruleId !== id,
    );

    for (const event of this.events) {
      const latest = latestRevision(event);

      if (latest) {
        this.evaluateAlerts(
          event,
          latest,
          id,
        );
      }
    }
  }

  importDocuments(
    docs: {
      name: string;
      content: string;
      label: string;
    }[],
  ): ImportReport {
    const records: RecordOutcome[] = [];

    for (const doc of docs) {
      for (const res of parseDocument(
        doc.content,
        doc.name,
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
          ...this.ingest(
            res.cdm,
            doc.name,
            doc.label,
          ),
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

    records.forEach((r) => {
      counts[r.status]++;
    });

    return {
      records,
      counts,
    };
  }

  private ingest(
    cdm: NormalizedCdm,
    file: string,
    label: string,
  ): Omit<RecordOutcome, "file" | "index"> {
    const warnings = [...cdm.warnings];

    const existing = this.events
      .flatMap((e) =>
        e.revisions.map((r) => ({
          e,
          r,
        })),
      )
      .find(
        (x) =>
          x.r.cdm.messageKey === cdm.messageKey,
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
      cdm.sat2.designator,
    );

    const sameCandidates = this.events.filter(
      (e) => e.pairKey === pk,
    );

    const decision = correlate(
      cdm.tca,
      sameCandidates.map((e) => ({
        eventId: e.id,
        tcas: e.revisions.map(
          (r) => r.cdm.tca,
        ),
      })),
      CONFIG.correlationWindowS,
    );

    let event: CdmEvent;

    if (decision.eventId === null) {
      event = {
        id: this.ids.event++,
        key: `${cdm.sat1.designator}-${cdm.sat2.designator}-${tcaStamp(cdm.tca)}`,
        pairKey: pk,
        revisions: [],
      };

      this.events.push(event);
    } else {
      event = sameCandidates.find(
        (e) => e.id === decision.eventId,
      )!;

      if (decision.ambiguous) {
        warnings.push(decision.note);
      }
    }

    const revision: Revision = {
      id: this.ids.revision++,
      cdm,
      sourceFile: file,
      sourceLabel: label,
      correlationNote: decision.note,
    };

    event.revisions.push(revision);

    event.revisions.sort(
      (a, b) =>
        a.cdm.creationDate -
          b.cdm.creationDate ||
        a.id - b.id,
    );

    let alertsCreated = 0;

    if (
      latestRevision(event).id ===
      revision.id
    ) {
      alertsCreated = this.evaluateAlerts(
        event,
        revision,
      );
    } else {
      warnings.push(
        "superseded on arrival: a newer CDM for this event is already stored, so alert rules were not evaluated",
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
    rev: Revision,
    onlyRuleId?: number,
  ): number {
    let created = 0;

    for (const rule of this.rules) {
      if (
        onlyRuleId !== undefined &&
        rule.id !== onlyRuleId
      ) {
        continue;
      }

      const {
        matches,
        reasons,
      } = evaluateRule(
        rule,
        rev.cdm,
      );

      if (
        !matches ||
        this.alerts.some(
          (a) =>
            a.ruleId === rule.id &&
            a.revisionId === rev.id,
        )
      ) {
        continue;
      }

      const c = rev.cdm;
      const severity = severityOf(c.pc);

      this.alerts.unshift({
        id: this.ids.alert++,
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
          primary:
            c.sat1.name ??
            c.sat1.designator,
          secondary:
            c.sat2.name ??
            c.sat2.designator,
          tca: isoZ(c.tca),
          lead_time_h: Number(
            hoursBetween(
              c.creationDate,
              c.tca,
            ).toFixed(3),
          ),
          miss_distance_m:
            c.missDistanceM,
          pc_source: c.pcRaw,
          cdm_id: c.cdmId,
          source_file:
            rev.sourceFile,
          source_label:
            rev.sourceLabel,
          caveat: CAVEAT,
        },
      });

      created++;
    }

    return created;
  }
}
