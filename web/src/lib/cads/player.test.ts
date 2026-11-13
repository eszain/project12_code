import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocument, type NormalizedCdm } from "./parser";
import { WHAT_IF_IMPACT, burstParticles, gapAt, impactAt, nearMissTrack, passVerdict, secondaryAt, slowdown, type NearMissTrack } from "./player";

const FIXTURES = join(__dirname, "../../../public/fixtures");
const manifest: Record<string, string[]> = JSON.parse(readFileSync(join(FIXTURES, "manifest.json"), "utf8"));
const samples: [string, NormalizedCdm][] = Object.entries(manifest).flatMap(([folder, files]) =>
  files.map((f) => [f, parseDocument(readFileSync(join(FIXTURES, folder, f), "utf8"), f)[0].cdm!] as [string, NormalizedCdm]),
);
const trackOf = (cdm: NormalizedCdm): NearMissTrack => {
  const r = nearMissTrack(cdm);
  if (!r.available) throw new Error(r.reason);
  return r.track;
};

describe("near-miss player geometry", () => {
  it.each(samples)("%s: real playback passes at the CDM miss distance and never collides", (_, cdm) => {
    const track = trackOf(cdm);
    expect(track.missM).toBeCloseTo(cdm.missDistanceM, -1);
    expect(impactAt("real")).toBeNull();
    // The closest gap is at the middle of the playback and equals the miss distance.
    expect(gapAt(track, 0.5, "real")).toBeCloseTo(track.missM, 6);
    for (let p = 0; p <= 1; p += 0.05) expect(gapAt(track, p, "real")).toBeGreaterThanOrEqual(track.missM - 1e-6);
    // The secondary enters and leaves the picture.
    expect(secondaryAt(track, 0, "real").x).toBe(-track.halfSpanM);
    expect(secondaryAt(track, 1, "real").x).toBe(track.halfSpanM);
    // The whole cloud and the miss fit inside the picture.
    expect(track.viewHalfHeightM).toBeGreaterThan(track.missM + 3 * (track.sigmaAcrossM ?? 0));
  });

  it("moves at the relative speed", () => {
    const track = trackOf(samples[0][1]);
    const dx = secondaryAt(track, 0.6, "real").x - secondaryAt(track, 0.4, "real").x;
    expect(dx / (0.2 * track.realDurationS)).toBeCloseTo(track.speedMs, 6);
    expect(slowdown(track, track.realDurationS * 1000)).toBeCloseTo(1000, 6);
  });

  it("collides only in the what-if, at the primary, and stops there", () => {
    const track = trackOf(samples[0][1]);
    expect(impactAt("whatIf")).toBe(WHAT_IF_IMPACT);
    expect(gapAt(track, WHAT_IF_IMPACT, "whatIf")).toBe(0);
    expect(secondaryAt(track, 1, "whatIf")).toEqual(secondaryAt(track, WHAT_IF_IMPACT, "whatIf"));
  });

  it("explains why a pass cannot be drawn", () => {
    expect(nearMissTrack({ ...samples[0][1], relPosRtnM: null })).toMatchObject({ available: false });
    expect(nearMissTrack({ ...samples[0][1], relVelRtnMs: [0, 0, 0] })).toMatchObject({ available: false });
  });

  it("draws without a cloud when the covariance is missing", () => {
    const cdm = samples[0][1];
    const track = trackOf({ ...cdm, sat1: { ...cdm.sat1, covarianceRtn: null } });
    expect(track.sigmaAcrossM).toBeNull();
    expect(track.viewHalfHeightM).toBeGreaterThan(track.missM);
  });

  it("uses plain words for each severity", () => {
    expect(passVerdict("ACTION")).toMatchObject({ headline: "Too close: a maneuver may be needed", tone: "danger" });
    expect(passVerdict("WATCH").tone).toBe("caution");
    expect(passVerdict("LOW").headline).toBe("Safe pass");
    expect(passVerdict("ZERO").headline).toBe("Safe pass");
    expect(passVerdict("UNKNOWN").tone).toBe("unknown");
    for (const v of ["ACTION", "WATCH", "LOW", "ZERO", "UNKNOWN"] as const) expect(passVerdict(v).headline).not.toMatch(/\d|Pc/);
  });

  it("gives the burst a fixed, symmetric spread", () => {
    const ps = burstParticles(12);
    expect(ps).toHaveLength(12);
    expect(burstParticles(12)).toEqual(ps);
    for (const p of ps) expect(Math.hypot(p.dx, p.dy)).toBeLessThanOrEqual(1 + 1e-9);
  });
});
