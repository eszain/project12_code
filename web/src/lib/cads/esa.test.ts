import { describe, expect, it } from "vitest";
import { nearMissTrack } from "./player";
import { parseDocument } from "./parser";
import { recalculate } from "./pc";
import { Store, severityOf } from "./store";
import {
  ESA_PAUSE_MS,
  ESA_TCA,
  collisionProbabilityText,
  dripBatches,
  fetchEsaSample,
  groupEsaRows,
  rowToCdm,
  rowsToDocuments,
  shouldPauseAfter,
  type EsaRow,
} from "./esa";

const DAY_MS = 24 * 60 * 60 * 1000;

function row(over: Partial<EsaRow> = {}): EsaRow {
  return {
    event_id: "101",
    mission_id: "7",
    time_to_tca: "2",
    risk: "-4",
    miss_distance: "500",
    relative_speed: "1000",
    relative_position_r: "0",
    relative_position_t: "300",
    relative_position_n: "400",
    relative_velocity_r: "0",
    relative_velocity_t: "0",
    relative_velocity_n: "1000",
    c_object_type: "DEBRIS",
    t_sigma_r: "10",
    t_sigma_t: "20",
    t_sigma_n: "30",
    t_ct_r: "0.25",
    t_cn_r: "0",
    t_cn_t: "-0.5",
    c_sigma_r: "4",
    c_sigma_t: "5",
    c_sigma_n: "6",
    c_ct_r: "0",
    c_cn_r: "0",
    c_cn_t: "0",
    ...over,
  };
}

function parsed(over: Partial<EsaRow> = {}) {
  const record = rowToCdm(row(over));
  const result = parseDocument(JSON.stringify(record), "esa.json")[0];
  expect(result.errors).toEqual([]);
  return result.cdm!;
}

describe("ESA row mapping", () => {
  it("turns risk -4 into Pc 0.0001, risk -30 into exactly 0, and a blank risk into not provided", () => {
    expect(collisionProbabilityText("-4")).toBe("0.0001");
    const high = parsed({ risk: "-4" });
    expect(high.pc).toBe(0.0001);
    expect(high.pcRaw).toBe("0.0001");
    expect(severityOf(high.pc)).toBe("ACTION");

    const floored = parsed({ risk: "-30" });
    expect(floored.pc).toBe(0);
    expect(floored.pcRaw).toBe("0");
    expect(severityOf(floored.pc)).toBe("ZERO");

    const blank = parsed({ risk: "" });
    expect(blank.pc).toBeNull();
    expect(blank.pcRaw).toBeNull();
    expect(blank.warnings.some((warning) => /not provided/i.test(warning))).toBe(true);
    expect(severityOf(blank.pc)).toBe("UNKNOWN");
    expect(rowToCdm(row({ risk: "  " })).COLLISION_PROBABILITY).toBeUndefined();
  });

  it("sets creation to the anchor TCA minus time_to_tca days, oldest lead first", () => {
    const tca = Date.parse(ESA_TCA);
    const cdm = parsed({ time_to_tca: "2.5" });
    expect(cdm.tca).toBe(tca);
    expect(cdm.creationDate).toBe(tca - 2.5 * DAY_MS);

    const docs = rowsToDocuments([
      row({ event_id: "1", time_to_tca: "1" }),
      row({ event_id: "2", time_to_tca: "5" }),
      row({ event_id: "3", time_to_tca: "3" }),
    ]);
    const leads = docs.map((doc) => parseDocument(doc.content, doc.name)[0].cdm!.creationDate);
    expect(leads).toEqual([tca - 5 * DAY_MS, tca - 3 * DAY_MS, tca - 1 * DAY_MS]);
  });

  it("keeps two events when the same mission shares the anchor TCA", () => {
    const source = [
      row({ event_id: "1", mission_id: "7", time_to_tca: "3", risk: "-4" }),
      row({ event_id: "1", mission_id: "7", time_to_tca: "1", risk: "-5" }),
      row({ event_id: "2", mission_id: "7", time_to_tca: "2", risk: "-6" }),
    ];
    expect([...groupEsaRows(source).keys()]).toEqual(["1", "2"]);
    expect(groupEsaRows(source).get("1")?.map((item) => item.time_to_tca)).toEqual(["3", "1"]);
    const docs = rowsToDocuments(source);
    const store = new Store();
    const report = store.importDocuments(docs);
    expect(report.counts.rejected).toBe(0);
    expect(report.counts.imported).toBe(3);
    const events = store.getSnapshot().events;
    expect(events).toHaveLength(2);
    const first = events.find((event) => event.revisions.some((revision) => revision.cdm.sat1.designator === "ESA-7-1"));
    const second = events.find((event) => event.revisions.some((revision) => revision.cdm.sat1.designator === "ESA-7-2"));
    expect(first?.revisions).toHaveLength(2);
    expect(second?.revisions).toHaveLength(1);
    expect(first?.revisions[0].cdm.creationDate).toBeLessThan(first!.revisions[1].cdm.creationDate);
  });

  it("parses a converted CDM, leaves recalculation off without a state vector, and keeps source severity", () => {
    const record = rowToCdm(row());
    expect(record.SAT1_X).toBeUndefined();
    expect(record.SAT1_X_DOT).toBeUndefined();
    expect(record.SAT2_Y).toBeUndefined();
    expect(record.SAT2_Z_DOT).toBeUndefined();
    expect(record.SAT1_OBJECT_NAME).toBe("ESA mission 7");
    expect(record.SAT2_OBJECT_NAME).toBe("DEBRIS object");
    expect(record.SAT1_OBJECT_DESIGNATOR).toBe("ESA-7-101");
    expect(record.SAT2_OBJECT_DESIGNATOR).toBe("ESA-C-101");

    const cdm = parsed();
    expect(cdm.sat1.positionKm).toBeNull();
    expect(cdm.sat1.velocityKms).toBeNull();
    expect(cdm.sat2.positionKm).toBeNull();
    expect(cdm.sat2.velocityKms).toBeNull();
    expect(cdm.sat1.covarianceRtn?.[0][0]).toBeCloseTo(100);
    expect(cdm.sat1.covarianceRtn?.[1][0]).toBeCloseTo(50);
    expect(cdm.sat1.covarianceRtn?.[2][1]).toBeCloseTo(-300);
    expect(cdm.missDistanceM).toBe(500);

    const again = recalculate(cdm, 10);
    expect(again.available).toBe(false);
    if (!again.available) expect(again.reason).toMatch(/state vector/i);
    expect(nearMissTrack(cdm).available).toBe(true);
    expect(severityOf(cdm.pc)).toBe("ACTION");
  });

  it("pauses briefly after every 5 CDMs, and reports a missing sample", async () => {
    expect(ESA_PAUSE_MS).toBe(400);
    expect(dripBatches([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12],
    ]);
    expect(shouldPauseAfter(4, 12, 5)).toBe(true);
    expect(shouldPauseAfter(5, 12, 5)).toBe(false);
    expect(shouldPauseAfter(4, 5, 5)).toBe(false);
    const docs = await fetchEsaSample(async () => ({ ok: false, json: async () => ({}) }));
    expect(docs).toBeNull();
  });
});
