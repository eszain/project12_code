// ESA Kelvins collision-avoidance rows -> CDM field records.
// The training CSV stays on disk and is never imported by tests. Callers pass invented rows
// or JSON already written by scripts/esa_to_cdm.py.

export const ESA_TCA = "2026-12-01T00:00:00.000Z";
/** Dataset floor: a risk at or below this is a clipped log, so Pc is exactly 0. */
export const ESA_RISK_FLOOR = -30;
export const ESA_BATCH_SIZE = 5;
export const ESA_PAUSE_MS = 400;
export const ESA_STATUS_LABEL = "Loading ESA CDM";
export const ESA_SAMPLE_MISSING =
  "ESA sample is not on this computer. Download the training CSV and run python scripts/esa_to_cdm.py.";

export const ESA_LOAD_PACE = {
  batchSize: ESA_BATCH_SIZE,
  intervalMs: ESA_PAUSE_MS,
  label: ESA_STATUS_LABEL,
};

export type EsaRow = Record<string, string>;

export type EsaDocument = { name: string; content: string; label: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function cell(row: EsaRow, key: string): string | null {
  const raw = row[key];
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || text.toLowerCase() === "null") return null;
  return text;
}

function num(row: EsaRow, key: string): number | null {
  const text = cell(row, key);
  if (text === null) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function sci(value: number): string {
  if (value === 0) return "0";
  return value.toExponential(6).replace("e", "E");
}

/** Pc text for one risk cell. Blank stays omitted so the parser can say "not provided". */
export function collisionProbabilityText(riskText: string | null | undefined, floor = ESA_RISK_FLOOR): string | null {
  if (riskText == null) return null;
  const text = riskText.trim();
  if (!text || text.toLowerCase() === "null") return null;
  const risk = Number(text);
  if (!Number.isFinite(risk)) return null;
  if (risk <= floor) return "0";
  // Integer powers of ten are written as decimals, so risk -4 is the text "0.0001"
  // and the parser's number stays on the action threshold.
  if (Number.isInteger(risk) && risk < 0 && risk >= -15) {
    return `0.${"0".repeat(-risk - 1)}1`;
  }
  const pc = 10 ** risk;
  if (!(pc > 0)) return "0";
  return sci(pc);
}

function addCovariance(out: Record<string, string>, prefix: "SAT1" | "SAT2", src: "t" | "c", row: EsaRow) {
  const sigmaR = num(row, `${src}_sigma_r`);
  const sigmaT = num(row, `${src}_sigma_t`);
  const sigmaN = num(row, `${src}_sigma_n`);
  if (sigmaR === null || sigmaT === null || sigmaN === null) return;
  const ctR = num(row, `${src}_ct_r`) ?? 0;
  const cnR = num(row, `${src}_cn_r`) ?? 0;
  const cnT = num(row, `${src}_cn_t`) ?? 0;
  const terms: Record<string, number> = {
    CR_R: sigmaR * sigmaR,
    CT_T: sigmaT * sigmaT,
    CN_N: sigmaN * sigmaN,
    CT_R: ctR * sigmaT * sigmaR,
    CN_R: cnR * sigmaN * sigmaR,
    CN_T: cnT * sigmaN * sigmaT,
  };
  for (const [name, value] of Object.entries(terms)) {
    out[`${prefix}_${name}`] = sci(value);
    out[`${prefix}_${name}_UNIT`] = "m**2";
  }
  out[`${prefix}_COVARIANCE_METHOD`] = "CALCULATED";
}

function copyMeasure(out: Record<string, string>, row: EsaRow, from: string, to: string, unit: string) {
  const text = cell(row, from);
  if (text === null || num(row, from) === null) return;
  out[to] = text;
  out[`${to}_UNIT`] = unit;
}

/** One CSV row as CDM JSON fields. No absolute position or velocity. */
export function rowToCdm(row: EsaRow, options?: { tca?: string; riskFloor?: number }): Record<string, string> {
  const eventId = cell(row, "event_id");
  const missionId = cell(row, "mission_id");
  const lead = num(row, "time_to_tca");
  const miss = cell(row, "miss_distance");
  if (!eventId || !missionId || lead === null || !miss) {
    throw new Error("ESA row needs event_id, mission_id, time_to_tca, and miss_distance");
  }
  const tca = options?.tca ?? ESA_TCA;
  const tcaMs = Date.parse(tca);
  if (!Number.isFinite(tcaMs)) throw new Error("ESA anchor TCA is not a valid time");
  const creation = new Date(tcaMs - lead * DAY_MS).toISOString();
  const objectType = cell(row, "c_object_type") ?? "object";
  const messageId = `ESA-${eventId}-${cell(row, "time_to_tca")}`;
  const out: Record<string, string> = {
    CCSDS_CDM_VERS: "1.0",
    CREATION_DATE: creation,
    ORIGINATOR: "ESA",
    MESSAGE_FOR: `ESA mission ${missionId}`,
    MESSAGE_ID: messageId,
    CDM_ID: messageId,
    TCA: new Date(tcaMs).toISOString(),
    MISS_DISTANCE: miss,
    MISS_DISTANCE_UNIT: "m",
    SAT1_OBJECT: "OBJECT1",
    SAT1_OBJECT_DESIGNATOR: `ESA-${missionId}-${eventId}`,
    SAT1_OBJECT_NAME: `ESA mission ${missionId}`,
    SAT1_OBJECT_TYPE: "PAYLOAD",
    SAT2_OBJECT: "OBJECT2",
    SAT2_OBJECT_DESIGNATOR: `ESA-C-${eventId}`,
    SAT2_OBJECT_NAME: `${objectType} object`,
    SAT2_OBJECT_TYPE: objectType,
    COMMENT: "ESA Kelvins encounter. Times are measured from one fixed closest approach.",
  };
  const pc = collisionProbabilityText(row.risk, options?.riskFloor ?? ESA_RISK_FLOOR);
  if (pc !== null) out.COLLISION_PROBABILITY = pc;
  copyMeasure(out, row, "relative_speed", "RELATIVE_SPEED", "m/s");
  copyMeasure(out, row, "relative_position_r", "RELATIVE_POSITION_R", "m");
  copyMeasure(out, row, "relative_position_t", "RELATIVE_POSITION_T", "m");
  copyMeasure(out, row, "relative_position_n", "RELATIVE_POSITION_N", "m");
  copyMeasure(out, row, "relative_velocity_r", "RELATIVE_VELOCITY_R", "m/s");
  copyMeasure(out, row, "relative_velocity_t", "RELATIVE_VELOCITY_T", "m/s");
  copyMeasure(out, row, "relative_velocity_n", "RELATIVE_VELOCITY_N", "m/s");
  addCovariance(out, "SAT1", "t", row);
  addCovariance(out, "SAT2", "c", row);
  return out;
}

function byOldestFirst(a: EsaRow, b: EsaRow): number {
  const lead = (num(b, "time_to_tca") ?? -Infinity) - (num(a, "time_to_tca") ?? -Infinity);
  if (lead !== 0) return lead;
  return String(a.event_id ?? "").localeCompare(String(b.event_id ?? ""));
}

/** Each event's messages, oldest (largest time_to_tca) first. Map order is first-seen event_id. */
export function groupEsaRows(rows: EsaRow[]): Map<string, EsaRow[]> {
  const groups = new Map<string, EsaRow[]>();
  for (const row of rows) {
    const id = cell(row, "event_id") ?? "";
    const list = groups.get(id);
    if (list) list.push(row);
    else groups.set(id, [row]);
  }
  for (const list of groups.values()) list.sort(byOldestFirst);
  return groups;
}

/** Every message, oldest first, across events. */
export function orderEsaRows(rows: EsaRow[]): EsaRow[] {
  return [...rows].sort(byOldestFirst);
}

export function rowsToDocuments(rows: EsaRow[]): EsaDocument[] {
  return orderEsaRows(rows).map((row) => {
    const cdm = rowToCdm(row);
    return {
      name: `esa-${cdm.CDM_ID}.json`,
      content: JSON.stringify(cdm),
      label: "esa-sample",
    };
  });
}

/** True after a full batch when more messages remain. Index is zero-based. */
export function shouldPauseAfter(index: number, total: number, batchSize = ESA_BATCH_SIZE): boolean {
  const done = index + 1;
  return done < total && batchSize > 0 && done % batchSize === 0;
}

export function dripBatches<T>(items: readonly T[], size = ESA_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  const step = Math.max(1, size);
  for (let i = 0; i < items.length; i += step) batches.push(items.slice(i, i + step));
  return batches;
}

type Fetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** Load /esa-sample/manifest.json and its CDM files. Null when the script has not been run. */
export async function fetchEsaSample(fetchImpl: Fetcher = fetch): Promise<EsaDocument[] | null> {
  const manifestRes = await fetchImpl("/esa-sample/manifest.json");
  if (!manifestRes.ok) return null;
  const manifest = (await manifestRes.json()) as { files?: unknown };
  if (!Array.isArray(manifest.files)) throw new Error("ESA sample manifest has no file list");
  const docs: EsaDocument[] = [];
  for (const file of manifest.files) {
    if (typeof file !== "string" || !file) throw new Error("ESA sample manifest lists a file that is not a name");
    const body = await fetchImpl(`/esa-sample/${file}`);
    if (!body.ok) throw new Error(`ESA sample file missing: ${file}`);
    docs.push({
      name: file,
      content: JSON.stringify(await body.json()),
      label: "esa-sample",
    });
  }
  return docs;
}
