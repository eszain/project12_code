import type { AlertOccurrence } from "./store";

export function isAcknowledged(
  alert: AlertOccurrence
): boolean {
  return alert.acknowledgement !== undefined;
}

export function getUnacknowledgedAlerts(
  alerts: readonly AlertOccurrence[]
): AlertOccurrence[] {
  return alerts.filter(
    (alert) =>
      !alert.superseded &&
      !isAcknowledged(alert)
  );
}

export function countUnacknowledgedAlerts(
  alerts: readonly AlertOccurrence[]
): number {
  return getUnacknowledgedAlerts(alerts).length;
}