// Geometry and wording for the near-miss player in the centre of /dashboard (issue #4).
//
// The pass is drawn side-on: the primary sits still in the middle, and the secondary moves left to right
// along the relative velocity (x), offset across its path (y) by the best-estimate miss distance.
// shortcut: straight-line relative motion from RELATIVE_POSITION / RELATIVE_VELOCITY; use the relative
// trajectory from issue #9 when it lands.

import { dot, norm, scale, sub, unit } from "./linalg";
import type { NormalizedCdm } from "./parser";
import { buildContext, hardBodyRadius } from "./pc";
import { actionLabel } from "./severity";
import { CONFIG, type Severity } from "./store";

export interface NearMissTrack {
  /** Best-estimate distance between the objects at the closest approach, in metres. */
  missM: number;
  /** Relative speed, in metres per second. */
  speedMs: number;
  /** Combined size of the two objects (hard-body radius), in metres. */
  hbrM: number;
  /** One-sigma uncertainty across the path, in metres; null when the CDM has no usable covariance. */
  sigmaAcrossM: number | null;
  /** Half the height of the picture, in metres. The picture is twice as wide as it is high. */
  viewHalfHeightM: number;
  /** The secondary is drawn from x = -halfSpanM to x = +halfSpanM. */
  halfSpanM: number;
  /** How long the shown pass takes in real life, in seconds. */
  realDurationS: number;
}

export type TrackResult = { available: true; track: NearMissTrack } | { available: false; reason: string };

export function nearMissTrack(cdm: NormalizedCdm): TrackResult {
  if (!cdm.relPosRtnM || !cdm.relVelRtnMs) return { available: false, reason: "The CDM has no relative position and velocity, so the pass cannot be drawn." };
  const speedMs = norm(cdm.relVelRtnMs);
  if (!(speedMs > 0)) return { available: false, reason: "The relative speed is zero, so the pass cannot be drawn." };
  const u = unit(cdm.relVelRtnMs);
  const along = dot(cdm.relPosRtnM, u);
  const missM = norm(sub(cdm.relPosRtnM, scale(u, along)));

  let hbrM = hardBodyRadius(cdm, CONFIG.defaultHbrM).valueM;
  let sigmaAcrossM: number | null = null;
  try {
    // The encounter plane's first axis points from the primary to the miss point, which is "across the path" here.
    const ctx = buildContext(cdm, CONFIG.defaultHbrM);
    hbrM = ctx.hbr.valueM;
    sigmaAcrossM = Math.sqrt(ctx.plane.cov2d[0][0]);
  } catch {
    // No covariance: draw the pass without the uncertainty cloud.
  }

  const viewHalfHeightM = Math.max(missM + 3 * (sigmaAcrossM ?? 0), missM * 1.3, hbrM * 4) * 1.15;
  const halfSpanM = viewHalfHeightM * 2;
  return { available: true, track: { missM, speedMs, hbrM, sigmaAcrossM, viewHalfHeightM, halfSpanM, realDurationS: (2 * halfSpanM) / speedMs } };
}

export type PlayerMode = "real" | "whatIf";

/** In the what-if, the secondary reaches the primary halfway through and the burst plays there. */
export const WHAT_IF_IMPACT = 0.5;

/** Where the secondary is at playback progress p (0 = start, 1 = end), in metres from the primary. */
export function secondaryAt(track: NearMissTrack, p: number, mode: PlayerMode): { x: number; y: number } {
  const clamped = Math.min(Math.max(p, 0), mode === "whatIf" ? WHAT_IF_IMPACT : 1);
  return { x: -track.halfSpanM + 2 * track.halfSpanM * clamped, y: mode === "whatIf" ? 0 : track.missM };
}

/** Distance between the objects at progress p, in metres. */
export function gapAt(track: NearMissTrack, p: number, mode: PlayerMode): number {
  const { x, y } = secondaryAt(track, p, mode);
  return Math.hypot(x, y);
}

/** Progress at which the burst plays. Only the what-if collides; real playback always ends in a near-miss. */
export const impactAt = (mode: PlayerMode): number | null => (mode === "whatIf" ? WHAT_IF_IMPACT : null);

/** How many times slower than real life the pass is shown, for a playback of `playSeconds`. */
export const slowdown = (track: NearMissTrack, playSeconds: number) => playSeconds / track.realDurationS;

/** End points of the burst particles, as unit offsets from the impact point. Fixed so every burst looks the same. */
export function burstParticles(count = 18): { dx: number; dy: number; r: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count + (i % 2) * 0.17;
    const reach = i % 3 === 0 ? 1 : i % 3 === 1 ? 0.72 : 0.5;
    return { dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach, r: 2 + (i % 4) };
  });
}

/** Plain-language verdict for the banner above the stage. Severity always comes from the CDM's own Pc. */
export function passVerdict(severity: Severity): { headline: string; action: string; tone: "danger" | "caution" | "safe" | "unknown" } {
  const action = actionLabel(severity);
  switch (severity) {
    case "ACTION":
      return { headline: "Too close: a maneuver may be needed", action, tone: "danger" };
    case "WATCH":
      return { headline: "Close pass: keep watching", action, tone: "caution" };
    case "LOW":
    case "ZERO":
      return { headline: "Safe pass", action, tone: "safe" };
    default:
      return { headline: "Not enough data to judge this pass", action, tone: "unknown" };
  }
}
