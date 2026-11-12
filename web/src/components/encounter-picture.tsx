"use client";

import { encounterPicture } from "@/lib/cads/details";
import { latestRevision, type CdmEvent } from "@/lib/cads/store";

const SIZE = 320;
const HALF = SIZE / 2;
const MIN_HBR_PX = 5; // the objects are tiny next to the cloud, so the circle is drawn at least this big

/** G4: the conjunction as a picture. Circle = both objects together; ellipses = where the secondary might really be. */
export function EncounterPictureCard({ event }: { event: CdmEvent }) {
  const cdm = latestRevision(event).cdm;
  const p = encounterPicture(cdm);
  const names = `${cdm.sat1.name ?? cdm.sat1.designator} and ${cdm.sat2.name ?? cdm.sat2.designator}`;
  return (
    <section className="detail-panel ops-panel" aria-labelledby="encounter-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">CONJUNCTION PICTURE</p>
          <h2 id="encounter-heading">The closest approach, seen head-on</h2>
        </div>
        <span className="panel-count">Latest CDM · object size not to scale</span>
      </div>
      {p.available ? (
        (() => {
          const k = HALF / p.extentM; // pixels per metre
          const cx = HALF + p.missX * k;
          const cy = HALF - p.missZ * k;
          const hbrPx = Math.max(p.hbrM * k, MIN_HBR_PX);
          const miss = Math.round(Math.hypot(p.missX, p.missZ));
          const label = `Encounter plane for ${names}. The objects pass ${miss} metres apart; the uncertainty cloud around the secondary is about ${Math.round(p.ellipses[0].majorM)} metres at one sigma.`;
          return (
            <div className="encounter-layout">
              <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label} className="encounter-svg">
                <line x1={0} y1={HALF} x2={SIZE} y2={HALF} className="chart-grid" strokeDasharray="3 3" />
                <line x1={HALF} y1={0} x2={HALF} y2={SIZE} className="chart-grid" strokeDasharray="3 3" />
                {[...p.ellipses].reverse().map((e) => (
                  <ellipse key={e.k} cx={cx} cy={cy} rx={e.majorM * k} ry={e.minorM * k} transform={`rotate(${-e.angleDeg} ${cx} ${cy})`} className={`cloud cloud-${e.k}`}>
                    <title>{`${e.k}σ uncertainty: ${Math.round(e.majorM)} m by ${Math.round(e.minorM)} m`}</title>
                  </ellipse>
                ))}
                <line x1={HALF} y1={HALF} x2={cx} y2={cy} className="miss-line" />
                <circle cx={cx} cy={cy} r={3} className="chart-dot" />
                <circle cx={HALF} cy={HALF} r={hbrPx} className="hbr-circle">
                  <title>{`Combined size of the two objects: ${p.hbrM.toFixed(1)} m radius`}</title>
                </circle>
                <text x={HALF} y={HALF + hbrPx + 14} textAnchor="middle" className="chart-label">both objects</text>
                <text x={Math.min(Math.max(cx, 70), SIZE - 70)} y={Math.max(cy - 12, 12)} textAnchor="middle" className="chart-label">secondary (best estimate)</text>
                <text x={SIZE - 8} y={SIZE - 8} textAnchor="end" className="chart-label">{`edge ≈ ${Math.round(p.extentM)} m`}</text>
              </svg>
              <div className="encounter-text">
                <p>
                  <strong>{cdm.sat1.name ?? cdm.sat1.designator}</strong> sits in the centre. The circle is the two objects added together. The blue cloud shows where{" "}
                  <strong>{cdm.sat2.name ?? cdm.sat2.designator}</strong> might really be: the inner ring is where it most likely is, and the outer rings are less likely.
                </p>
                <p>The more of the cloud covers the circle, the higher the collision chance. The dashed line is the best-estimate miss of {miss} m.</p>
                <p className="panel-note ops-foot">Drawn from the CDM&apos;s positions and uncertainties. See “How this was calculated” below for the numbers.</p>
              </div>
            </div>
          );
        })()
      ) : (
        <p className="ops-row-label">Not available: {p.reason}</p>
      )}
    </section>
  );
}
