// UTC helpers. All instants are milliseconds since the Unix epoch (UTC).
// JS Date resolves to milliseconds, so sub-millisecond digits in CDM timestamps are dropped
// (the original text stays in the raw payload).

const DOY = /^(\d{4})-(\d{3})(?:[T ](.*))?$/;

export function parseUtc(value: unknown): number {
  if (typeof value !== "string") throw new Error(`timestamp must be text, got ${typeof value}`);
  let text = value.trim();
  if (!text) throw new Error("timestamp is empty");
  const doy = DOY.exec(text);
  if (doy) {
    const day = new Date(Date.UTC(Number(doy[1]), 0, 1) + (Number(doy[2]) - 1) * 86400000);
    text = `${day.toISOString().slice(0, 10)}T${doy[3] ?? "00:00:00"}`;
  }
  text = text.replace(" ", "T");
  text = text.replace(/(\.\d{3})\d+/, "$1"); // keep milliseconds only
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += "Z"; // CDM epochs are UTC
  const ms = Date.parse(text);
  if (!Number.isFinite(ms) || !/^\d{4}-\d{2}-\d{2}T/.test(text)) throw new Error("not a valid time");
  return ms;
}

export const isoZ = (ms: number) => new Date(ms).toISOString();
export const hoursBetween = (startMs: number, endMs: number) => (endMs - startMs) / 3600000;
