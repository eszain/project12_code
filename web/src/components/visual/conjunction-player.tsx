"use client";

// The near-miss player in the centre of /dashboard (issue #4). A side view of the chosen event:
// the primary stays in the middle and the secondary passes it, slowed down so the pass can be seen.
// The banner says in plain words whether the pass is safe; severity comes from the CDM's own Pc.
// "What if they hit?" is a clearly labelled imaginary collision. Normal playback never collides.
// GSAP drives one timeline (play, pause, reset, scrub, speed); the scene is SVG.
// Playback only starts when the viewer presses a button, so it runs even with reduced motion turned on
// (Windows "Animation effects" off). Reduced motion only replaces the flying burst with its still end state.

import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Pause, Play, RotateCcw, Undo2, Zap } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/animate-ui/components/buttons/button";
import { formatSpeed } from "@/lib/cads/analyze";
import { WHAT_IF_IMPACT, burstParticles, gapAt, nearMissTrack, passVerdict, secondaryAt, slowdown, type PlayerMode } from "@/lib/cads/player";
import { latestRevision, severityOf, type CdmEvent } from "@/lib/cads/store";

gsap.registerPlugin(useGSAP);

const W = 800;
const H = 400;
const CX = W / 2;
const CY = H / 2;
const PLAY_SECONDS = 6; // one full pass at normal speed
const SPEEDS = [
  { label: "Slower", value: 0.5 },
  { label: "Normal", value: 1 },
  { label: "Faster", value: 2 },
] as const;
const PARTICLES = burstParticles();
const BURST_REACH_PX = 130;
const LABEL_EDGE = 70; // keep moving labels inside the picture
const STARS = Array.from({ length: 40 }, (_, i) => ({ x: (i * 197) % W, y: (i * 83 + 31) % H, r: i % 5 === 0 ? 1.4 : 0.8 }));

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const mq = window.matchMedia?.(REDUCED);
  mq?.addEventListener?.("change", onChange);
  return () => mq?.removeEventListener?.("change", onChange);
};
const usePrefersReducedMotion = () => useSyncExternalStore(subscribeReduced, () => window.matchMedia?.(REDUCED).matches ?? false, () => false);

const metres = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export function ConjunctionPlayer({ event }: { event: CdmEvent }) {
  const cdm = latestRevision(event).cdm;
  const primary = cdm.sat1.name ?? cdm.sat1.designator;
  const secondary = cdm.sat2.name ?? cdm.sat2.designator;
  const result = useMemo(() => nearMissTrack(cdm), [cdm]);
  const track = result.available ? result.track : null;
  const verdict = passVerdict(severityOf(cdm.pc));
  const reduced = usePrefersReducedMotion();
  const descId = useId();

  const [mode, setMode] = useState<PlayerMode>("real");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [burst, setBurst] = useState(false);
  const [speed, setSpeed] = useState(1);
  const root = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const autoplay = useRef(false);
  const end = mode === "whatIf" ? WHAT_IF_IMPACT : 1;

  // One timeline per event and mode: a proxy value p runs from 0 to the end of the pass; the what-if adds the burst.
  useGSAP(
    () => {
      if (!track) return;
      const state = { p: 0 };
      const t = gsap.timeline({ paused: true, onComplete: () => setPlaying(false) });
      t.to(state, { p: end, duration: PLAY_SECONDS * end, ease: "none", onUpdate: () => setProgress(state.p) });
      if (mode === "whatIf") {
        t.call(() => setBurst(true));
        const debris = { attr: { cx: (i: number) => CX + PARTICLES[i].dx * BURST_REACH_PX, cy: (i: number) => CY + PARTICLES[i].dy * BURST_REACH_PX }, opacity: 0.35 };
        if (reduced) {
          t.set(".player-particle", debris);
        } else {
          t.fromTo(".player-flash", { attr: { r: 4 }, opacity: 0.95 }, { attr: { r: 110 }, opacity: 0, duration: 0.7, ease: "power2.out", immediateRender: false });
          // A faint debris cloud stays after the burst.
          t.fromTo(".player-particle", { attr: { cx: CX, cy: CY }, opacity: 1 }, { ...debris, duration: 1.6, ease: "power3.out", immediateRender: false }, "<");
        }
      }
      t.timeScale(speed);
      timeline.current = t;
      if (autoplay.current) {
        autoplay.current = false;
        t.play();
      }
    },
    { scope: root, dependencies: [track, mode, reduced], revertOnUpdate: true },
  );

  if (!track) {
    return (
      <div className={`player tone-${verdict.tone}`} ref={root}>
        <h2 className="player-title">{primary} and {secondary}</h2>
        <Banner verdict={verdict} line={`They pass about ${metres(cdm.missDistanceM)} apart.`} />
        <p className="player-note">The pass cannot be animated. {"reason" in result && result.reason}</p>
      </div>
    );
  }

  const togglePlay = () => {
    const t = timeline.current;
    if (!t) return;
    if (playing) {
      t.pause();
      setPlaying(false);
      return;
    }
    if (t.progress() >= 1) {
      setBurst(false);
      t.restart();
    } else t.play();
    setPlaying(true);
  };

  const reset = () => {
    timeline.current?.pause(0);
    setProgress(0);
    setPlaying(false);
    setBurst(false);
  };

  const scrub = (p: number) => {
    const t = timeline.current;
    if (!t) return;
    setPlaying(false);
    setProgress(p);
    if (mode === "whatIf" && p >= WHAT_IF_IMPACT) {
      t.progress(1).pause();
      setBurst(true);
    } else {
      t.pause(p * PLAY_SECONDS);
      setBurst(false);
    }
  };

  const changeSpeed = (value: number) => {
    setSpeed(value);
    timeline.current?.timeScale(value);
  };

  const switchMode = (next: PlayerMode) => {
    autoplay.current = next === "whatIf";
    setProgress(0);
    setBurst(false);
    setPlaying(next === "whatIf");
    setMode(next);
  };

  const k = CY / track.viewHalfHeightM; // pixels per metre
  const pos = secondaryAt(track, progress, mode);
  const sx = CX + pos.x * k;
  const sy = CY - pos.y * k;
  const pathY = mode === "whatIf" ? CY : CY - track.missM * k;
  const gap = gapAt(track, progress, mode);
  const shownSlower = Math.round(slowdown(track, PLAY_SECONDS / speed));
  const atClosest = mode === "real" && Math.abs(progress - 0.5) < 0.02;

  const speedKmS = `${(track.speedMs / 1000).toFixed(1)} km/s`;
  const speedKmH = `${Math.round(track.speedMs * 3.6).toLocaleString("en-US")} km/h`;
  const timeDeltaS = (progress - 0.5) * track.realDurationS;
  const timeDeltaLabel =
    timeDeltaS < -0.05
      ? `${timeDeltaS.toFixed(1)} s to TCA`
      : timeDeltaS > 0.05
        ? `+${timeDeltaS.toFixed(1)} s past TCA`
        : "TCA";

  const phase = burst ? "impact" : progress >= end ? "end" : playing ? "playing" : progress === 0 ? "start" : "paused";
  const announcement = {
    start: "Ready. Press play to watch the pass.",
    playing: mode === "whatIf" ? "Playing the what-if: an imaginary collision." : "Playing the pass.",
    paused: `Paused. The objects are ${metres(gap)} apart.`,
    end: `The pass is over. At their closest the objects were ${metres(track.missM)} apart, and they did not collide.`,
    impact: "What-if only: the burst shows what a collision would look like. This is not a prediction.",
  }[phase];
  const description = `Side view of the pass. ${primary} stays in the middle. ${secondary} moves from left to right and passes ${metres(track.missM)} away at its closest${track.sigmaAcrossM ? `; the shaded cloud around it shows where it might really be, about ${metres(track.sigmaAcrossM)} either way` : ""}.`;

  return (
    <div className={`player tone-${verdict.tone}`} ref={root}>
      <h2 className="player-title">{primary} and {secondary}</h2>
      <Banner verdict={verdict} line={`They pass about ${metres(track.missM)} apart, at ${formatSpeed(track.speedMs)}.`} />

      {mode === "whatIf" && (
        <p className="player-whatif" role="note">
          <strong>What-if only.</strong> This imagines the two objects hitting each other. It is not a prediction: on current data they miss by {metres(track.missM)}.
        </p>
      )}

      <div className="player-stage">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={descId} className="player-svg">
          <desc id={descId}>{description}</desc>
          <defs>
            <radialGradient id="player-cloud">
              <stop offset="0%" className="player-cloud-stop" stopOpacity={0.55} />
              <stop offset="100%" className="player-cloud-stop" stopOpacity={0} />
            </radialGradient>
          </defs>
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} className="player-star" />
          ))}

          <line x1={0} y1={pathY} x2={W} y2={pathY} className="player-path" />
          {mode === "real" && (
            <g className={atClosest ? "player-closest is-active" : "player-closest"}>
              <line x1={CX} y1={CY - 6} x2={CX} y2={pathY} />
              <text x={CX + 8} y={(CY + pathY) / 2} className="player-label">
                closest: {metres(track.missM)}
              </text>
            </g>
          )}

          {!burst && mode === "real" && (
            <g className="player-range-vector">
              <line x1={CX} y1={CY} x2={sx} y2={sy} className="player-range-line" />
              <text x={(CX + sx) / 2} y={(CY + sy) / 2 - 8} textAnchor="middle" className="player-range-text">
                range: {metres(gap)}
              </text>
            </g>
          )}

          {!burst && (
            <g transform={`translate(${CX} ${CY})`} className="player-primary">
              <rect x={-16} y={-3} width={10} height={6} />
              <rect x={6} y={-3} width={10} height={6} />
              <rect x={-5} y={-5} width={10} height={10} className="player-body" />
            </g>
          )}
          <text x={CX} y={CY + 24} textAnchor="middle" className="player-label">
            {primary}
          </text>

          {!burst && (
            <g transform={`translate(${sx} ${sy})`}>
              {track.sigmaAcrossM !== null && <circle r={3 * track.sigmaAcrossM * k} fill="url(#player-cloud)" className="player-cloud" />}
              <rect x={-4} y={-4} width={8} height={8} transform="rotate(45)" className="player-secondary" />
              <text x={Math.min(Math.max(sx, LABEL_EDGE), W - LABEL_EDGE) - sx} y={-14} textAnchor="middle" className="player-label">
                {secondary}
              </text>
              <text x={Math.min(Math.max(sx, LABEL_EDGE), W - LABEL_EDGE) - sx} y={20} textAnchor="middle" className="player-speed-label">
                {speedKmS} · {metres(gap)}
              </text>
            </g>
          )}

          <g className="player-hud" transform="translate(18, 18)" aria-hidden="true">
            <rect x={0} y={0} width={180} height={68} rx={6} className="player-hud-bg" />
            <text x={10} y={16} className="player-hud-title">LIVE TELEMETRY</text>
            <text x={10} y={32} className="player-hud-row">
              Speed: <tspan className="player-hud-val">{speedKmS}</tspan> ({speedKmH})
            </text>
            <text x={10} y={48} className="player-hud-row">
              Separation: <tspan className="player-hud-val">{metres(gap)}</tspan>
            </text>
            <text x={10} y={62} className="player-hud-row">
              TCA Offset: <tspan className="player-hud-val">{timeDeltaLabel}</tspan>
            </text>
          </g>

          <g className="player-burst" visibility={burst ? "visible" : "hidden"} aria-hidden="true">
            <circle cx={CX} cy={CY} r={4} className="player-flash" />
            {PARTICLES.map((p, i) => (
              <circle key={i} cx={CX} cy={CY} r={p.r} className="player-particle" />
            ))}
            <text x={CX} y={H - 16} textAnchor="middle" className="player-whatif-label">
              WHAT IF · imaginary collision, not a prediction
            </text>
          </g>
        </svg>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>

      <div className="player-controls">
        <Button type="button" size="sm" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause /> : <Play />}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={reset}>
          <RotateCcw />
          Reset
        </Button>
        <input
          type="range"
          className="player-scrub"
          min={0}
          max={end * 1000}
          step={1}
          value={Math.round(progress * 1000)}
          onChange={(e) => scrub(Number(e.target.value) / 1000)}
          aria-label="Position in the pass"
          aria-valuetext={burst ? "Imaginary collision" : atClosest ? `Closest approach, ${metres(gap)} apart` : `${metres(gap)} apart`}
        />
        <span className="player-gap" aria-hidden="true">
          {burst ? "hit (what-if)" : `${metres(gap)} apart`}
        </span>
      </div>
      <div className="player-controls">
        <div className="player-speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <Button key={s.value} type="button" size="sm" variant={speed === s.value ? "secondary" : "ghost"} aria-pressed={speed === s.value} onClick={() => changeSpeed(s.value)}>
              {s.label}
            </Button>
          ))}
        </div>
        {mode === "real" ? (
          <Button type="button" size="sm" variant="outline" className="player-whatif-button" onClick={() => switchMode("whatIf")}>
            <Zap />
            What if they hit? (imaginary)
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => switchMode("real")}>
            <Undo2 />
            Back to the real pass
          </Button>
        )}
      </div>
      <p className="player-note">
        Shown about {shownSlower.toLocaleString("en-US")}× slower than real life: the real pass takes {track.realDurationS.toFixed(2)} s. Object sizes are enlarged so they can be seen; distances are to scale.
      </p>
    </div>
  );
}

function Banner({ verdict, line }: { verdict: ReturnType<typeof passVerdict>; line: string }) {
  return (
    <motion.div
      key={`${verdict.tone}-${verdict.headline}`}
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="player-banner"
    >
      <strong>{verdict.headline}</strong>
      <span>{verdict.action}</span>
      <p>{line}</p>
    </motion.div>
  );
}
