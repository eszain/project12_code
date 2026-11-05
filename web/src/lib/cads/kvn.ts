// CCSDS 508.0-B-1 CDM in Keyword = Value Notation -> the flattened Space-Track field names.
// Second source adapter: shows a new format needs no change to the event logic (NFR08).

const LINE = /^([A-Z0-9_]+)\s*=\s*(.*?)\s*$/;
const UNIT = /^(.*?)\s*\[([^\]]*)\]\s*$/;
const COMMENT_FIELDS: [RegExp, string][] = [
  [/^Apogee/i, "COMMENT_APOGEE"],
  [/^Perigee/i, "COMMENT_PERIGEE"],
  [/^Inclination/i, "COMMENT_INCLINATION"],
  [/^Screening Option/i, "COMMENT_SCREENING_OPTION"],
  [/^Effective HBR|^Hard Body Radius|^HBR/i, "COMMENT_EFFECTIVE_HBR"],
];

export const looksLikeKvn = (text: string) => /^\s*CCSDS_CDM_VERS\s*=/m.test(text);

export function parseKvn(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let prefix = "";
  text.split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s) return;
    if (s.toUpperCase().startsWith("COMMENT")) {
      const comment = s.slice(7).trim();
      const hit = COMMENT_FIELDS.find(([re]) => re.test(comment));
      if (hit) {
        const key = hit[1] === "COMMENT_SCREENING_OPTION" ? hit[1] : prefix + hit[1];
        fields[key] ??= comment;
      }
      return;
    }
    const m = LINE.exec(s);
    if (!m) throw new Error(`line ${i + 1} is not in 'KEYWORD = value' form: ${JSON.stringify(s.slice(0, 60))}`);
    const [, key, raw] = m;
    let value = raw;
    let unit: string | undefined;
    const u = UNIT.exec(raw);
    if (u) [, value, unit] = u;
    if (key === "OBJECT") {
      const v = value.toUpperCase();
      if (v === "OBJECT1") prefix = "SAT1_";
      else if (v === "OBJECT2") prefix = "SAT2_";
      else throw new Error(`line ${i + 1}: OBJECT must be OBJECT1 or OBJECT2, got ${JSON.stringify(value)}`);
    }
    const name = prefix + key;
    if (name in fields) throw new Error(`line ${i + 1}: keyword ${name} appears twice`);
    fields[name] = value;
    if (unit) fields[name + "_UNIT"] = unit;
  });
  if (!fields.SAT1_OBJECT || !fields.SAT2_OBJECT) throw new Error("KVN message must contain OBJECT = OBJECT1 and OBJECT = OBJECT2 sections");
  return fields;
}
