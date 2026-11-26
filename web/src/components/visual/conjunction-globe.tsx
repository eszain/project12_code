"use client";

// The 3D view of the chosen event (issue #26): Earth, both objects, and a replay from 10 s before the closest approach
// to 10 s after, drawn with CesiumJS. CesiumJS loads only when this section scrolls into view, and it uses the offline
// Earth imagery bundled with it, so no Cesium ion token is needed (ion's free tier does not cover government projects).

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Crosshair, Globe, Pause, Play, RotateCcw } from "lucide-react";
import type { Entity, JulianDate as JulianDateT, Viewer } from "cesium";

import { Button } from "@/components/animate-ui/components/buttons/button";
import { REPLAY_HALF_SPAN_S, closeUpOffset, playbackRate, replayTrack, subPoint, type ReplayTrack } from "@/lib/cads/replay";
import { latestRevision, type CdmEvent } from "@/lib/cads/store";
import type { V3 } from "@/lib/cads/linalg";
import { loadCesium } from "@/lib/cesium-loader";

type CesiumModule = typeof import("cesium");
type CameraView = "close" | "earth";
interface Readout {
  t: number;
  gapM: number;
  rate: number;
}

const SPEEDS = [
  { label: "Slower", value: 0.5 },
  { label: "Normal", value: 1 },
  { label: "Faster", value: 2 },
] as const;
const PRIMARY_COLOR = "#6ee0ff";
const SECONDARY_COLOR = "#ffb347";
const CLOSE_RANGE_M = 500_000; // closer than this the two objects are drawn apart; further away one marker stands for both
const EARTH_VIEW_HEIGHT_M = 9_000_000;

const metres = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);
const seconds = (t: number) => `${t < 0 ? "−" : "+"}${Math.abs(t).toFixed(Math.abs(t) < 1 ? 3 : 1)} s`;
const rateText = (r: number) => (r >= 1 ? `${r.toFixed(r % 1 ? 1 : 0)}× real speed` : `1/${Math.round(1 / r)} of real speed`);
const degrees = (lat: number, lon: number) => `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? "E" : "W"}`;

/** Adds both objects, their trails and the closest-approach marker, and sets the clock to TCA ± 10 s. */
function buildScene(C: CesiumModule, viewer: Viewer, track: ReplayTrack, names: { primary: string; secondary: string }) {
  const tca = C.JulianDate.fromDate(new Date(track.tcaMs));
  const time = (t: number) => C.JulianDate.addSeconds(tca, t, new C.JulianDate());
  const cart = (v: V3) => new C.Cartesian3(v[0], v[1], v[2]);
  const near = new C.DistanceDisplayCondition(0, CLOSE_RANGE_M);
  const far = new C.DistanceDisplayCondition(CLOSE_RANGE_M, Number.MAX_VALUE);
  const labelStyle = {
    font: "13px sans-serif",
    fillColor: C.Color.WHITE,
    showBackground: true,
    backgroundColor: C.Color.fromCssColorString("#04101c").withAlpha(0.75),
  };

  const viewFrom = closeUpOffset(track);
  const addObject = (key: "primary" | "secondary", color: string) => {
    const position = new C.SampledPositionProperty();
    for (const s of track.samples) position.addSample(time(s.t), cart(s[key]));
    return viewer.entities.add({
      id: key,
      name: names[key],
      position,
      // Close-up camera: side-on to the pass, offset given in east-north-up metres (see closeUpOffset).
      trackingReferenceFrame: C.TrackingReferenceFrame.ENU,
      viewFrom: new C.Cartesian3(viewFrom[0], viewFrom[1], viewFrom[2]),
      point: { pixelSize: 11, color: C.Color.fromCssColorString(color), outlineColor: C.Color.WHITE, outlineWidth: 1.5, distanceDisplayCondition: near },
      label: { ...labelStyle, text: names[key], pixelOffset: new C.Cartesian2(0, -22), distanceDisplayCondition: near },
      path: { width: 2, leadTime: 0, trailTime: 2 * REPLAY_HALF_SPAN_S, resolution: 0.25, material: C.Color.fromCssColorString(color).withAlpha(0.8) },
    });
  };
  const primary = addObject("primary", PRIMARY_COLOR);
  addObject("secondary", SECONDARY_COLOR);

  // Closest approach: a dashed line between the objects at that moment, labelled with the gap.
  const c = track.closest;
  const mid = C.Cartesian3.midpoint(cart(c.primary), cart(c.secondary), new C.Cartesian3());
  viewer.entities.add({ id: "miss-line", polyline: { positions: [cart(c.primary), cart(c.secondary)], width: 2, material: new C.PolylineDashMaterialProperty({ color: C.Color.WHITE }) } });
  viewer.entities.add({ id: "closest-label", position: mid, label: { ...labelStyle, text: `closest: ${metres(c.separationM)}`, horizontalOrigin: C.HorizontalOrigin.LEFT, pixelOffset: new C.Cartesian2(14, 0), distanceDisplayCondition: near } });
  // From far away the objects are on top of each other, so one marker stands for both.
  viewer.entities.add({
    id: "conjunction",
    position: mid,
    point: { pixelSize: 12, color: C.Color.fromCssColorString(SECONDARY_COLOR), outlineColor: C.Color.WHITE, outlineWidth: 2, distanceDisplayCondition: far },
    label: { ...labelStyle, text: `${names.primary} and ${names.secondary}`, pixelOffset: new C.Cartesian2(0, -24), distanceDisplayCondition: far },
  });

  const clock = viewer.clock;
  clock.startTime = time(-REPLAY_HALF_SPAN_S);
  clock.stopTime = time(REPLAY_HALF_SPAN_S);
  clock.currentTime = clock.startTime.clone();
  clock.clockRange = C.ClockRange.CLAMPED;
  clock.clockStep = C.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
  clock.multiplier = playbackRate(-REPLAY_HALF_SPAN_S);
  clock.shouldAnimate = false;
  return { primary, tca, earthView: C.Cartesian3.multiplyByScalar(C.Cartesian3.normalize(mid, new C.Cartesian3()), C.Cartesian3.magnitude(mid) + EARTH_VIEW_HEIGHT_M, new C.Cartesian3()) };
}

export function ConjunctionGlobe({ event }: { event: CdmEvent }) {
  const cdm = latestRevision(event).cdm;
  const primaryName = cdm.sat1.name ?? cdm.sat1.designator;
  const secondaryName = cdm.sat2.name ?? cdm.sat2.designator;
  const track = useMemo(() => replayTrack(cdm), [cdm]);
  const headingId = useId();

  const stage = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{ C: CesiumModule; viewer: Viewer; primary: Entity; tca: JulianDateT; earthView: import("cesium").Cartesian3 } | null>(null);
  const speedRef = useRef(1);
  const lastReadout = useRef(0);
  const [requested, setRequested] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<CameraView>("close");
  const [readout, setReadout] = useState<Readout>({ t: -REPLAY_HALF_SPAN_S, gapM: track.available ? track.samples[0].separationM : 0, rate: playbackRate(-REPLAY_HALF_SPAN_S) });

  // Load CesiumJS only when the 3D section comes into view.
  useEffect(() => {
    const el = stage.current;
    if (!el || requested || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setRequested(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [requested]);

  useEffect(() => {
    if (!requested || !track.available) return;
    let cancelled = false;
    let removeTick: (() => void) | undefined;
    loadCesium()
      .then((C) => {
        if (cancelled || !container.current) return;
        const viewer = new C.Viewer(container.current, {
          // Offline Earth imagery shipped with CesiumJS: no Cesium ion token or account.
          baseLayer: C.ImageryLayer.fromProviderAsync(C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl("Assets/Textures/NaturalEarthII"))),
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
        });
        const scene = buildScene(C, viewer, track, { primary: primaryName, secondary: secondaryName });
        viewerRef.current = { C, viewer, ...scene };
        viewer.trackedEntity = scene.primary;
        removeTick = viewer.clock.onTick.addEventListener((clock) => {
          const t = C.JulianDate.secondsDifference(clock.currentTime, scene.tca);
          const rate = playbackRate(t);
          clock.multiplier = speedRef.current * rate;
          if (clock.shouldAnimate && C.JulianDate.greaterThanOrEquals(clock.currentTime, clock.stopTime)) {
            clock.shouldAnimate = false;
            setPlaying(false);
          }
          const now = performance.now();
          if (now - lastReadout.current < 80) return;
          lastReadout.current = now;
          const p = viewer.entities.getById("primary")?.position?.getValue(clock.currentTime);
          const s = viewer.entities.getById("secondary")?.position?.getValue(clock.currentTime);
          setReadout({ t, gapM: p && s ? C.Cartesian3.distance(p, s) : NaN, rate: speedRef.current * rate });
        });
        setReady(true);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      removeTick?.();
      viewerRef.current?.viewer.destroy();
      viewerRef.current = null;
    };
  }, [requested, track, primaryName, secondaryName]);

  if (!track.available) {
    return (
      <section className="globe" aria-labelledby={headingId}>
        <h3 id={headingId} className="globe-title">3D view</h3>
        <p className="globe-unavailable">3D view not available for this event. {track.reason}</p>
      </section>
    );
  }

  const togglePlay = () => {
    const v = viewerRef.current;
    if (!v) return;
    const clock = v.viewer.clock;
    if (playing) {
      clock.shouldAnimate = false;
      setPlaying(false);
      return;
    }
    if (v.C.JulianDate.greaterThanOrEquals(clock.currentTime, clock.stopTime)) clock.currentTime = clock.startTime.clone();
    clock.shouldAnimate = true;
    setPlaying(true);
  };

  const reset = () => {
    const v = viewerRef.current;
    if (!v) return;
    v.viewer.clock.shouldAnimate = false;
    v.viewer.clock.currentTime = v.viewer.clock.startTime.clone();
    setPlaying(false);
  };

  const changeSpeed = (value: number) => {
    speedRef.current = value;
    setSpeed(value);
  };

  const changeView = (next: CameraView) => {
    const v = viewerRef.current;
    if (!v) return;
    setView(next);
    if (next === "close") v.viewer.trackedEntity = v.primary;
    else {
      v.viewer.trackedEntity = undefined;
      void v.viewer.camera.flyTo({ destination: v.earthView, duration: 1.5 });
    }
  };

  const where = subPoint(track.closest.primary);
  const description = `3D view of ${primaryName} and ${secondaryName} passing ${metres(track.closest.separationM)} apart above ${degrees(where.lat, where.lon)}. The replay runs from 10 seconds before the closest approach to 10 seconds after, slowing down as they pass.`;

  return (
    <section className="globe" aria-labelledby={headingId}>
      <div className="globe-head">
        <h3 id={headingId} className="globe-title">3D view</h3>
        <span className="globe-note">Positions from the CDM · objects drawn as dots, not to scale</span>
      </div>
      <div ref={stage} className="globe-stage">
        <div ref={container} className="globe-canvas" aria-hidden="true" />
        {!ready && (
          <div className="globe-overlay">
            {error ? (
              <p role="alert">The 3D view could not start. {error}</p>
            ) : requested ? (
              <p role="status">Loading the 3D view…</p>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setRequested(true)}>
                <Globe />
                Show the 3D view
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="sr-only">{description}</p>

      <div className="player-controls">
        <Button type="button" size="sm" onClick={togglePlay} disabled={!ready} aria-label={playing ? "Pause 3D replay" : "Play 3D replay"}>
          {playing ? <Pause /> : <Play />}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={reset} disabled={!ready} aria-label="Reset 3D replay">
          <RotateCcw />
          Reset
        </Button>
        <div className="player-speeds" role="group" aria-label="3D replay speed">
          {SPEEDS.map((s) => (
            <Button key={s.value} type="button" size="sm" variant={speed === s.value ? "secondary" : "ghost"} aria-pressed={speed === s.value} onClick={() => changeSpeed(s.value)}>
              {s.label}
            </Button>
          ))}
        </div>
        <div className="player-speeds" role="group" aria-label="Camera">
          <Button type="button" size="sm" variant={view === "close" ? "secondary" : "ghost"} aria-pressed={view === "close"} disabled={!ready} onClick={() => changeView("close")}>
            <Crosshair />
            Close-up
          </Button>
          <Button type="button" size="sm" variant={view === "earth" ? "secondary" : "ghost"} aria-pressed={view === "earth"} disabled={!ready} onClick={() => changeView("earth")}>
            <Globe />
            Whole Earth
          </Button>
        </div>
      </div>
      <p className="globe-readout" aria-live="off">
        {seconds(readout.t)} from the closest approach · {Number.isFinite(readout.gapM) ? metres(readout.gapM) : "?"} apart · {rateText(readout.rate)}
      </p>
      <p className="player-note">
        The replay speeds up while the objects are far apart and slows to 1/100 of real speed as they pass: at {metres(track.closest.separationM)} the real pass takes a few thousandths of a second. Positions use straight-line motion from the CDM for now.
      </p>
    </section>
  );
}
