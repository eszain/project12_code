export function formatUtc(value: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short", ...options }).format(new Date(value)) + " UTC";
}

export function formatDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${metres.toLocaleString("en-CA")} m`;
}

export function formatSpeed(mps: number) {
  return `${mps.toLocaleString("en-CA")} m/s`;
}
