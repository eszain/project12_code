// CDM ingestion validator: raw message -> NormalizedCDM (US01, FR01, FR17). Port of cads/cdm/parser.py.
//
// Rules: keep the original payload; keep the source Pc as its exact text (pcRaw) AND as a number
// (pc), so a source zero (pc === 0) stays distinct from "not provided" (pc === null). Unusable
// messages are errors (rejected); suspicious-but-usable ones are warnings that travel with them.
// Limitation: JSON numbers that are not already strings lose their original text in JSON.parse
// (Space-Track serialises CDM values as strings, which is what the samples use).

import { looksLikeKvn, parseKvn } from "./kvn";
import { M3, V3, norm } from "./linalg";
import { parseUtc } from "./time";

export interface ObjectInfo {
  designator: string;
  name: string | null;
  objectType: string | null;
  maneuverable: string | null;
  refFrame: string | null;
  covarianceMethod: string | null;
  lastObEnd: number | null;
  recommendedOdSpanD: number | null;
  actualOdSpanD: number | null;
  obsAvailable: number | null;
  obsUsed: number | null;
  residualsAcceptedPct: number | null;
  weightedRms: number | null;
  areaPcM2: number | null;
  apogeeKm: number | null;
  perigeeKm: number | null;
  positionKm: V3 | null;
  velocityKms: V3 | null;
  /** 3x3 position covariance in the object's own RTN frame (m^2). */
  covarianceRtn: M3 | null;
}

export interface NormalizedCdm {
  messageKey: string;
  cdmId: string | null;
  messageId: string | null;
  creationDate: number;
  tca: number;
  missDistanceM: number;
  relativeSpeedMs: number | null;
  relPosRtnM: V3 | null;
  relVelRtnMs: V3 | null;
  pc: number | null;
  pcRaw: string | null;
  pcMethod: string | null;
  effectiveHbrM: number | null;
  sat1: ObjectInfo;
  sat2: ObjectInfo;
  sourceFormat: "spacetrack-json" | "ccsds-kvn";
  raw: Record<string, string>;
  warnings: string[];
}

export interface ParseResult {
  recordIndex: number;
  cdm: NormalizedCdm | null;
  errors: string[];
  warnings: string[];
}

type Units = [string, Record<string, number>];
const LENGTH_M: Units = ["m", { m: 1, km: 1000 }];
const SPEED_MS: Units = ["m/s", { "m/s": 1, "km/s": 1000 }];
const LENGTH_KM: Units = ["km", { km: 1, m: 0.001 }];
const SPEED_KMS: Units = ["km/s", { "km/s": 1, "m/s": 0.001 }];
const AREA_M2: Units = ["m**2", { "m**2": 1, "m^2": 1, m2: 1, "km**2": 1e6 }];
const DAYS: Units = ["d", { d: 1, day: 1, days: 1, h: 1 / 24 }];
const PERCENT: Units = ["%", { "%": 1 }];

const MISSING = new Set(["", "null", "none", "n/a", "na"]);
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/;
const COV3 = [["CR_R"], ["CT_R", "CT_T"], ["CN_R", "CN_T", "CN_N"]];

class Reader {
  errors: string[] = [];
  warnings: string[] = [];
  constructor(private rec: Record<string, string>) {}

  text(key: string): string | null {
    const v = this.rec[key];
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return MISSING.has(s.toLowerCase()) ? null : s;
  }
  private problem(required: boolean, msg: string) {
    (required ? this.errors : this.warnings).push(msg);
  }
  time(key: string, required = false): number | null {
    const v = this.text(key);
    if (v === null) {
      if (required) this.errors.push(`missing required field ${key}`);
      return null;
    }
    try {
      return parseUtc(v);
    } catch (e) {
      this.problem(required, `${key}: ${(e as Error).message}`);
      return null;
    }
  }
  number(key: string, units?: Units, required = false): number | null {
    const v = this.text(key);
    if (v === null) {
      if (required) this.errors.push(`missing required field ${key}`);
      return null;
    }
    let n = Number(v);
    if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(v) || !Number.isFinite(n)) {
      this.problem(required, `${key} is not a finite number: ${JSON.stringify(v)}`);
      return null;
    }
    if (units) {
      const [canonical, accepted] = units;
      const unit = this.text(key + "_UNIT")?.replace(/[[\]\s]/g, "").toLowerCase() ?? null;
      if (unit && unit !== canonical.toLowerCase()) {
        const factor = accepted[unit];
        if (factor === undefined) {
          this.problem(required, `${key}_UNIT ${JSON.stringify(unit)} is not supported (expected ${canonical})`);
          return null;
        }
        n *= factor;
        this.warnings.push(`${key} converted from ${unit} to ${canonical}`);
      }
    }
    return n;
  }
  commentNumber(key: string): number | null {
    const v = this.text(key);
    if (v === null) return null;
    const m = NUMBER.exec(v.includes("=") ? v.split("=")[1] : v);
    return m ? Number(m[0]) : null;
  }
  vector(keys: string[], units: Units): V3 | null {
    const vals = keys.map((k) => this.number(k, units));
    return vals.some((x) => x === null) ? null : (vals as V3);
  }
}

function covariance(r: Reader, p: string): M3 | null {
  const m: number[][] = [[], [], []];
  let found = 0;
  COV3.forEach((row, i) =>
    row.forEach((name, j) => {
      const v = r.number(p + name, AREA_M2);
      if (v !== null) {
        m[i][j] = m[j][i] = v;
        found++;
      }
    }),
  );
  if (found < 6) {
    if (found) r.warnings.push(`${p}covariance incomplete; recalculated Pc unavailable for this object`);
    return null;
  }
  if (m[0][0] < 0 || m[1][1] < 0 || m[2][2] < 0) {
    r.warnings.push(`${p}covariance has a negative variance on the diagonal`);
    return null;
  }
  return m as M3;
}

function objectInfo(r: Reader, p: string): ObjectInfo {
  return {
    designator: r.text(p + "OBJECT_DESIGNATOR") ?? "",
    name: r.text(p + "OBJECT_NAME"),
    objectType: r.text(p + "OBJECT_TYPE"),
    maneuverable: r.text(p + "MANEUVERABLE"),
    refFrame: r.text(p + "REF_FRAME"),
    covarianceMethod: r.text(p + "COVARIANCE_METHOD"),
    lastObEnd: r.time(p + "TIME_LASTOB_END"),
    recommendedOdSpanD: r.number(p + "RECOMMENDED_OD_SPAN", DAYS),
    actualOdSpanD: r.number(p + "ACTUAL_OD_SPAN", DAYS),
    obsAvailable: r.number(p + "OBS_AVAILABLE"),
    obsUsed: r.number(p + "OBS_USED"),
    residualsAcceptedPct: r.number(p + "RESIDUALS_ACCEPTED", PERCENT),
    weightedRms: r.number(p + "WEIGHTED_RMS"),
    areaPcM2: r.number(p + "AREA_PC", AREA_M2),
    apogeeKm: r.commentNumber(p + "COMMENT_APOGEE"),
    perigeeKm: r.commentNumber(p + "COMMENT_PERIGEE"),
    positionKm: r.vector([p + "X", p + "Y", p + "Z"], LENGTH_KM),
    velocityKms: r.vector([p + "X_DOT", p + "Y_DOT", p + "Z_DOT"], SPEED_KMS),
    covarianceRtn: covariance(r, p),
  };
}

// Non-cryptographic 53-bit hash: only used to recognise a repeat import when a message has no ID.
function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function messageKeyFor(rec: Record<string, string>): string {
  for (const k of ["CDM_ID", "MESSAGE_ID"]) if (rec[k]) return `${k}:${String(rec[k]).trim()}`;
  const sorted = Object.keys(rec).sort().map((k) => [k, rec[k]]);
  return "HASH:" + hash53(JSON.stringify(sorted));
}

export function normalizeRecord(rec: Record<string, string>, sourceFormat: NormalizedCdm["sourceFormat"], recordIndex = 0): ParseResult {
  const r = new Reader(rec);
  const creation = r.time("CREATION_DATE", true);
  const tca = r.time("TCA", true);
  const miss = r.number("MISS_DISTANCE", LENGTH_M, true);
  for (const k of ["SAT1_OBJECT_DESIGNATOR", "SAT2_OBJECT_DESIGNATOR"]) if (r.text(k) === null) r.errors.push(`missing required field ${k}`);
  if (miss !== null && miss < 0) r.errors.push(`MISS_DISTANCE is negative (${miss})`);

  const pcRaw = r.text("COLLISION_PROBABILITY");
  let pc: number | null = null;
  if (pcRaw !== null) {
    const n = Number(pcRaw);
    if (!Number.isFinite(n)) r.errors.push(`COLLISION_PROBABILITY is not numeric: ${JSON.stringify(pcRaw)}`);
    else if (n < 0 || n > 1) r.errors.push(`COLLISION_PROBABILITY must be between 0 and 1, got ${JSON.stringify(pcRaw)}`);
    else pc = n;
  } else r.warnings.push("COLLISION_PROBABILITY not provided by the source (shown as 'not provided', not zero)");

  const relativeSpeed = r.number("RELATIVE_SPEED", SPEED_MS);
  const relPos = r.vector(["RELATIVE_POSITION_R", "RELATIVE_POSITION_T", "RELATIVE_POSITION_N"], LENGTH_M);
  const relVel = r.vector(["RELATIVE_VELOCITY_R", "RELATIVE_VELOCITY_T", "RELATIVE_VELOCITY_N"], SPEED_MS);
  const sat1 = objectInfo(r, "SAT1_");
  const sat2 = objectInfo(r, "SAT2_");
  if (sat1.designator && sat1.designator === sat2.designator) r.errors.push("SAT1 and SAT2 have the same OBJECT_DESIGNATOR");

  if (relPos && miss !== null) {
    const n = norm(relPos);
    if (Math.abs(n - miss) > Math.max(1, 0.01 * miss)) r.warnings.push(`|RELATIVE_POSITION| = ${n.toFixed(1)} m differs from MISS_DISTANCE = ${miss.toFixed(1)} m`);
  }
  if (relVel && relativeSpeed !== null) {
    const n = norm(relVel);
    if (Math.abs(n - relativeSpeed) > Math.max(1, 0.01 * relativeSpeed)) r.warnings.push(`|RELATIVE_VELOCITY| = ${n.toFixed(1)} m/s differs from RELATIVE_SPEED = ${relativeSpeed.toFixed(1)} m/s`);
  }
  if (creation !== null && tca !== null && tca < creation) r.warnings.push("TCA is earlier than CREATION_DATE (message issued after the predicted closest approach)");
  for (const [o, label] of [[sat1, "SAT1"], [sat2, "SAT2"]] as const)
    if (o.covarianceMethod?.toUpperCase() === "DEFAULT") r.warnings.push(`${label} covariance method is DEFAULT; risk estimates are less reliable`);

  if (r.errors.length || creation === null || tca === null || miss === null) {
    return { recordIndex, cdm: null, errors: r.errors.length ? r.errors : ["message could not be normalised"], warnings: r.warnings };
  }
  return {
    recordIndex,
    errors: [],
    warnings: r.warnings,
    cdm: {
      messageKey: messageKeyFor(rec),
      cdmId: r.text("CDM_ID"),
      messageId: r.text("MESSAGE_ID"),
      creationDate: creation,
      tca,
      missDistanceM: miss,
      relativeSpeedMs: relativeSpeed,
      relPosRtnM: relPos,
      relVelRtnMs: relVel,
      pc,
      pcRaw,
      pcMethod: r.text("COLLISION_PROBABILITY_METHOD"),
      effectiveHbrM: r.commentNumber("COMMENT_EFFECTIVE_HBR"),
      sat1,
      sat2,
      sourceFormat,
      raw: rec,
      warnings: [...r.warnings],
    },
  };
}

/** Parse one file: a JSON object, a JSON array of CDMs, or a CCSDS KVN message. */
export function parseDocument(content: string, filename = ""): ParseResult[] {
  const text = content.replace(/^﻿/, "");
  const fail = (msg: string): ParseResult[] => [{ recordIndex: 0, cdm: null, errors: [msg], warnings: [] }];
  const s = text.trimStart();
  if (!s) return fail("file is empty");
  if (s[0] === "{" || s[0] === "[") {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return fail(`invalid JSON: ${(e as Error).message}`);
    }
    const records = Array.isArray(data) ? data : [data];
    if (!records.length) return fail("JSON array contains no CDM records");
    return records.map((rec, i) => {
      if (rec === null || typeof rec !== "object" || Array.isArray(rec)) return { recordIndex: i, cdm: null, errors: ["record is not a JSON object"], warnings: [] };
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(rec as Record<string, unknown>)) if (v !== null && typeof v !== "object") flat[k] = String(v);
      return normalizeRecord(flat, "spacetrack-json", i);
    });
  }
  if (looksLikeKvn(text)) {
    try {
      return [normalizeRecord(parseKvn(text), "ccsds-kvn", 0)];
    } catch (e) {
      return fail(`invalid CCSDS KVN: ${(e as Error).message}`);
    }
  }
  return fail(`unrecognised format${filename ? ` (${filename})` : ""}: expected Space-Track CDM JSON or CCSDS CDM KVN`);
}
