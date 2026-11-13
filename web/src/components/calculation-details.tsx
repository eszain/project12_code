"use client";

import { formatOdds } from "@/lib/cads/analyze";
import { calculationDetails, missVsUncertainty, type Confidence } from "@/lib/cads/details";
import type { NormalizedCdm } from "@/lib/cads/parser";
import { latestRevision, type CdmEvent } from "@/lib/cads/store";

const fmtM = (m: number) => (m >= 10000 ? `${(m / 1000).toFixed(1)} km` : `${m.toFixed(m < 100 ? 1 : 0)} m`);
const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High confidence", moderate: "Moderate confidence", low: "Low confidence" };

/** A4: one short block comparing the miss distance with the uncertainty, shown on specialist cards. */
export function MissVsUncertaintyBlock({ cdm, cautiousLanguage = false }: { cdm: NormalizedCdm; cautiousLanguage?: boolean }) {
  const m = missVsUncertainty(cdm);
  return (
    <div className="ops-block">
      <div className="ops-block-title">Miss distance compared with uncertainty</div>
      {m.available ? (
        <>
          <div className="ops-row">
            <span className={`confidence confidence-${m.confidence}`}>{CONFIDENCE_LABEL[m.confidence]}</span> · miss is {m.ratio >= 10 ? m.ratio.toFixed(0) : m.ratio.toFixed(1)}× the uncertainty
          </div>
          <div className="ops-row ops-row-label">{cautiousLanguage ? `This is a geometric comparison with 1σ positional uncertainty, not a collision probability or safety guarantee. ${m.confidence === "high" ? "Continue to verify against the reported Pc and later CDMs." : "The uncertainty remains material, so review the reported Pc and later CDMs."}` : m.sentence}</div>
        </>
      ) : (
        <div className="ops-row ops-row-label">Not available: {m.reason}</div>
      )}
    </div>
  );
}

function CovarianceTable({ label, m }: { label: string; m: number[][] }) {
  return (
    <table className="dashboard-table cov-table" aria-label={`Position covariance of ${label}`}>
      <caption>{label}: position covariance (m²) in its own radial / in-track / cross-track frame</caption>
      <tbody>
        {m.map((row, i) => (
          <tr key={i}>
            {row.map((v, j) => <td key={j}>{v.toExponential(2)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A5: how the numbers for the selected event were calculated, in four plain steps. Kept off the main page. */
export function CalculationDetails({ event, cautiousLanguage = false }: { event: CdmEvent; cautiousLanguage?: boolean }) {
  const cdm = latestRevision(event).cdm;
  const d = calculationDetails(cdm);
  const r = d.recalculation;
  return (
    <details className="detail-panel ops-panel calc-panel">
      <summary>How this was calculated</summary>
      <p className="panel-note">Four steps, using the latest CDM for this event. Source values are never changed.</p>

      <h3 className="calc-step">Step 1. What the CDM says</h3>
      <p>
        The two objects pass {fmtM(d.source.missM)} apart{d.source.speedMs ? ` at ${(d.source.speedMs / 1000).toFixed(1)} km/s` : ""}. The CDM reports a collision chance of{" "}
        <code>{d.source.pcRaw ?? "not provided"}</code>
        {d.source.pcMethod ? ` (method: ${d.source.pcMethod})` : ""}. This is the value CADS uses for the severity rating.
      </p>

      <h3 className="calc-step">Step 2. How sure we are where each object is</h3>
      <p>Tracking is not exact, so each position has a “cloud” of uncertainty. The 1σ values below are the size of that cloud in each direction.</p>
      {d.objects.length ? (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table" aria-label="Position uncertainty by object">
            <thead>
              <tr><th scope="col">Object</th><th scope="col">Radial</th><th scope="col">In-track</th><th scope="col">Cross-track</th><th scope="col">Overall (RSS)</th></tr>
            </thead>
            <tbody>
              {d.objects.map((o) => (
                <tr key={o.label}>
                  <th scope="row">{o.label}</th>
                  <td>{fmtM(o.radialM)}</td><td>{fmtM(o.inTrackM)}</td><td>{fmtM(o.crossTrackM)}</td><td>{fmtM(o.rssM)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ops-row-label">The CDM has no covariance, so uncertainty is not available.</p>
      )}

      <h3 className="calc-step">Step 3. Miss distance against uncertainty</h3>
      {d.missVsUncertainty.available ? (
        <>
          <p>
            Putting both clouds together and looking along the direction of the miss: miss {fmtM(d.missVsUncertainty.missPlaneM)}, combined uncertainty {fmtM(d.missVsUncertainty.sigmaAlongMissM)}, which is{" "}
            <strong>{d.missVsUncertainty.ratio.toFixed(2)}×</strong>. {cautiousLanguage ? "This ratio describes separation relative to the positional uncertainty; it is not a collision probability or a guarantee of safety." : d.missVsUncertainty.sentence}
          </p>
          <p className="panel-note">Reading aid: 3× or more is high confidence, 1× to 3× moderate, below 1× low. These cut-offs are ours, not CSA limits.</p>
        </>
      ) : (
        <p className="ops-row-label">Not available: {d.missVsUncertainty.reason}</p>
      )}

      <h3 className="calc-step">Step 4. Our own check of the collision chance</h3>
      {r.available ? (
        <>
          <p>
            {cautiousLanguage ? "CADS performs an experimental internal check from the same positions and uncertainties: " : "CADS recomputes the collision chance from the same positions and uncertainties: "}{formatOdds(r.recalculatedPc)} (<code>{r.recalculatedPc.toExponential(3)}</code>), against the CDM&apos;s {cautiousLanguage ? "reported " : ""}<code>{d.source.pcRaw ?? "n/a"}</code>.
            {r.ratioToSource !== null && ` Our value is ${r.ratioToSource.toFixed(2)}× the source value.`}
          </p>
          <ul className="calc-list">
            <li>Method: {r.method}.</li>
            <li>Combined object size (hard-body radius): {r.hbrM.toFixed(1)} m ({r.hbrSource}).</li>
            <li>Status: <strong>{r.status}</strong>. It does not change any severity or alert.</li>
          </ul>
        </>
      ) : (
        <p className="ops-row-label">Not available: {r.reason}</p>
      )}

      {d.objects.some((o) => o.covariance) && (
        <details className="calc-raw">
          <summary>Show the raw covariance matrices</summary>
          {d.objects.map((o) => (o.covariance ? <CovarianceTable key={o.label} label={o.label} m={o.covariance} /> : null))}
        </details>
      )}
    </details>
  );
}
