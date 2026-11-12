// Demo scenario: fetch the bundled sample CDM files at runtime and re-date them relative to now,
// so the encounters are upcoming. The files live in public/fixtures (reconstructed + synthetic,
// see PROVENANCE.md there); nothing is embedded in the code.

import { parseDocument } from "./parser";

const FIXTURE_NOW = Date.UTC(2026, 1, 26, 15, 0, 0); // "now" inside the sample data (just after the last sample CDM)
const SHIFT = new Set(["CREATION_DATE", "TCA", "INSERT_EPOCH", "TIME_LASTOB_START", "TIME_LASTOB_END"]);

function shiftTimes(rec: Record<string, unknown>, deltaMs: number) {
  for (const [k, v] of Object.entries(rec)) {
    const base = SHIFT.has(k) ? k : k.slice(k.indexOf("_") + 1);
    if (typeof v !== "string" || !SHIFT.has(base)) continue;
    const t = Date.parse(v.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1") + "Z") + deltaMs;
    const iso = new Date(t).toISOString().slice(0, -1);
    rec[k] = k.endsWith("EPOCH") ? iso.replace("T", " ") : iso;
  }
}

export async function loadDemoDocuments(nowMs = Date.now()): Promise<{ docs: { name: string; content: string; label: string }[]; shiftHours: number }> {
  const manifest: Record<string, string[]> = await (await fetch("/fixtures/manifest.json")).json();
  const delta = nowMs - FIXTURE_NOW;
  const docs: { name: string; content: string; label: string }[] = [];
  for (const [folder, files] of Object.entries(manifest)) {
    for (const file of files) {
      const rec = await (await fetch(`/fixtures/${folder}/${file}`)).json();
      shiftTimes(rec, delta);
      rec._FIXTURE_NOTE = `DEMO: re-dated copy of a ${folder} fixture`;
      docs.push({ name: file, content: JSON.stringify(rec), label: `demo-${folder}` });
    }
  }
  return { docs, shiftHours: Math.round(delta / 360000) / 10 };
}

/**
 * Orders documents by the creation date of the CDM they contain (oldest first), the way CDMs reach an
 * operator in real use. Documents that cannot be parsed go last, in their original order.
 */
export function sortByCreation<T extends { name: string; content: string }>(docs: T[]): T[] {
  const key = (d: T) => parseDocument(d.content, d.name).find((r) => r.cdm)?.cdm?.creationDate ?? Infinity;
  return docs.map((d, i) => ({ d, k: key(d), i })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.d);
}

/** Small deterministic random generator (mulberry32), so generated events are the same every time for the same seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SCALE_NOTE = "GENERATED test event: invented values for layout testing, not real data";

/**
 * Builds `count` extra events (three CDMs each) from the three synthetic fixture records, with new object IDs,
 * closest-approach times spread from 36 h in the past to 5 days ahead (so some are archived), and a spread of
 * Pc values across all severity bands. The first event index is `firstIndex`, so batches never repeat an ID.
 */
export function generateScaleDocs(templates: Record<string, string>[], count: number, nowMs: number, firstIndex = 0) {
  if (templates.length < 3) throw new Error("need three template CDMs");
  const docs: { name: string; content: string; label: string }[] = [];
  for (let n = 0; n < count; n++) {
    const index = firstIndex + n;
    const rand = rng(0x9e3779b1 ^ (index * 2654435761));
    const tcaMs = nowMs + (rand() * 156 - 36) * 3600000;
    const band = rand();
    // Final Pc by band: ~8% above the action level, ~12% watch, ~20% exactly zero, the rest low.
    const finalPc = band < 0.08 ? 1e-4 * (1 + rand() * 9) : band < 0.2 ? 10 ** (-7 + rand() * 2.9) : band < 0.4 ? 0 : 10 ** (-12 + rand() * 4.9);
    const finalMiss = Math.round(40 + rand() * 600);
    templates.slice(0, 3).forEach((base, r) => {
      const rec: Record<string, unknown> = JSON.parse(JSON.stringify(base));
      const origTca = Date.parse(String(base.TCA) + "Z");
      shiftTimes(rec, tcaMs - origTca);
      const earlier = 2 - r; // revision 0 is oldest
      const pc = finalPc === 0 ? (r === 2 ? 0 : 10 ** (-9 + rand() * 2)) : finalPc * 10 ** (earlier * (rand() * 1.2 - 0.4));
      const miss = Math.round(finalMiss * (1 + earlier * (0.2 + rand() * 0.4)));
      const origMiss = Number(base.MISS_DISTANCE);
      const f = miss / origMiss;
      rec.CDM_ID = `GEN-${index}-${r + 1}`;
      rec.MESSAGE_ID = `GEN_${index}_${r + 1}`;
      rec.SAT1_OBJECT_DESIGNATOR = String(70000 + index * 2);
      rec.SAT2_OBJECT_DESIGNATOR = String(70001 + index * 2);
      rec.MESSAGE_FOR = `SAMPLE SAT ${index + 1}`;
      rec.SAT1_OBJECT_NAME = `SAMPLE SAT ${index + 1}`;
      rec.SAT2_OBJECT_NAME = `SAMPLE DEBRIS ${index + 1}`;
      rec.MISS_DISTANCE = String(miss);
      rec.COLLISION_PROBABILITY = pc === 0 ? "0" : pc.toExponential(6).toUpperCase().replace(/E([+-])(\d)$/, "E$10$2");
      for (const axis of ["R", "T", "N"]) rec[`RELATIVE_POSITION_${axis}`] = (Number(base[`RELATIVE_POSITION_${axis}`]) * f).toFixed(1);
      rec._FIXTURE_NOTE = SCALE_NOTE;
      docs.push({ name: `generated_${index + 1}_cdm${r + 1}.json`, content: JSON.stringify(rec), label: "generated-test" });
    });
  }
  return docs;
}

/** Fetches the three synthetic fixtures and generates `count` test events from them. */
export async function loadScaleDocuments(count: number, firstIndex: number, nowMs = Date.now()) {
  const templates: Record<string, string>[] = [];
  for (const n of [1, 2, 3]) templates.push(await (await fetch(`/fixtures/synthetic/synthetic_high_risk_${n}.json`)).json());
  return generateScaleDocs(templates, count, nowMs, firstIndex);
}
