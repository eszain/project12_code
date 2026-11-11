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
