// What each severity means and what an operator should do about it (G7, G8, F1).
// The bands are read from CONFIG so the legend, the badges and the alerts always agree.

import { CONFIG, type Severity } from "./store";

export interface SeverityBand {
  severity: Severity;
  /** Range of the source Pc, written for people who do not know the notation. */
  range: string;
  /** Short action label shown on the operator card. */
  action: string;
  /** One sentence for the legend. */
  meaning: string;
  /** Where the limit comes from, so nobody mistakes an assumption for an agreed value. */
  basis: string;
}

const oneIn = (pc: number) => `1 in ${Math.round(1 / pc).toLocaleString("en-US")}`;

export function severityBands(): SeverityBand[] {
  return [
    {
      severity: "ACTION",
      range: `Pc of ${oneIn(CONFIG.pcAction)} or higher`,
      action: "Action required: plan a maneuver",
      meaning: "The collision chance is above the level at which CSA acts. A specialist should review it and decide on a maneuver.",
      basis: "Action level mentioned by CSA on Nov 6 (1 × 10⁻⁴). To be confirmed with Patrick.",
    },
    {
      severity: "WATCH",
      range: `Pc from ${oneIn(CONFIG.pcWatch)} up to ${oneIn(CONFIG.pcAction)}`,
      action: "Monitor: check the next CDM",
      meaning: "Not high enough to act, but high enough to keep watching as new CDMs arrive.",
      basis: "Our assumption (common NASA CARA practice, 1 × 10⁻⁷). Needs CSA to confirm or change it.",
    },
    {
      severity: "LOW",
      range: `Pc below ${oneIn(CONFIG.pcWatch)}, but not zero`,
      action: "No action",
      meaning: "A very small chance. The pass is safe on current data.",
      basis: "Below our watch level.",
    },
    {
      severity: "ZERO",
      range: "Pc exactly 0 in the CDM",
      action: "No action",
      meaning: "The CDM rounds the chance down to 0. The true chance is never exactly zero, but it is less than 0.0000001% (below 1 in a billion), so the pass is safe.",
      basis: "Source value is exactly zero.",
    },
    {
      severity: "UNKNOWN",
      range: "Pc not provided",
      action: "Check the data",
      meaning: "The CDM has no collision probability, so the event cannot be rated.",
      basis: "Missing source value.",
    },
  ];
}

/** Short action label for a severity (operator card). */
export function actionLabel(severity: Severity): string {
  return severityBands().find((b) => b.severity === severity)!.action;
}

/** True when the event needs a person's attention now (used by the "needs attention" filter). */
export const needsAttention = (severity: Severity) => severity === "ACTION" || severity === "WATCH" || severity === "UNKNOWN";
