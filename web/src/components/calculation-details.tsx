"use client";

import { Latex } from "@/components/latex";
import { formatOdds } from "@/lib/cads/analyze";
import { calculationDetails, missVsUncertainty, type Confidence } from "@/lib/cads/details";
import type { NormalizedCdm } from "@/lib/cads/parser";
import { latestRevision, type CdmEvent } from "@/lib/cads/store";

const fmtM = (m: number) => (m >= 10000 ? `${(m / 1000).toFixed(1)} km` : `${m.toFixed(m < 100 ? 1 : 0)} m`);
const fmtSpeed = (speedMs: number | null) => (speedMs ? `${(speedMs / 1000).toFixed(2)} km/s` : "not provided");
const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High confidence", moderate: "Moderate confidence", low: "Low confidence" };

function latexMatrix(m: number[][]) {
  const rows = m.map((row) => row.map((v) => v.toExponential(2)).join(" & ")).join(" \\\\ ");
  return `\\begin{bmatrix} ${rows} \\end{bmatrix}`;
}

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
    <div className="math-matrix-block">
      <p className="math-matrix-caption">{label}: RTN covariance matrix (m²)</p>
      <div className="math-latex-matrix">
        <Latex math={`\\mathbf{C}_{\\text{${label.replace(/[^a-zA-Z0-9]/g, "")}}} = ${latexMatrix(m)}`} block />
      </div>
      <table className="dashboard-table cov-table" aria-label={`Position covariance of ${label}`}>
        <caption>{label}: position covariance table (m²)</caption>
        <tbody>
          {m.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => <td key={j}>{v.toExponential(2)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A5: how the numbers for the selected event were calculated, in four plain steps with LaTeX math. */
export function CalculationDetails({
  event,
  cautiousLanguage = false,
  standalone = false,
}: {
  event: CdmEvent;
  cautiousLanguage?: boolean;
  standalone?: boolean;
}) {
  const cdm = latestRevision(event).cdm;
  const d = calculationDetails(cdm);
  const r = d.recalculation;

  const content = (
    <>
      <h3 className="calc-step">Step 1. What the CDM says (Encounter Geometry)</h3>
      <p>
        The two objects pass {fmtM(d.source.missM)} apart{d.source.speedMs ? ` at ${(d.source.speedMs / 1000).toFixed(1)} km/s` : ""}. The CDM reports a collision chance of{" "}
        <code>{d.source.pcRaw ?? "not provided"}</code>
        {d.source.pcMethod ? ` (method: ${d.source.pcMethod})` : ""}. This is the value CADS uses for the severity rating.
      </p>

      <div className="math-latex-block">
        <Latex math={`d_{\\text{miss}} = \\|\\vec{r}_{2} - \\vec{r}_{1}\\| = ${fmtM(d.source.missM)}`} block />
        <Latex math={`v_{\\text{rel}} = \\|\\vec{v}_{2} - \\vec{v}_{1}\\| = ${fmtSpeed(d.source.speedMs)}`} block />
        <Latex math={`P_{c, \\text{source}} = \\text{${d.source.pcRaw ?? "N/A"}}`} block />
      </div>

      <h3 className="calc-step">Step 2. How sure we are where each object is (Positional Uncertainty & Covariance)</h3>
      <p>Tracking is not exact, so each position has a “cloud” of uncertainty. The 1σ values below are the size of that cloud in each direction.</p>

      <div className="math-latex-block">
        <Latex math="\\sigma_{\\text{RSS}} = \\sqrt{\\sigma_{\\text{radial}}^2 + \\sigma_{\\text{in-track}}^2 + \\sigma_{\\text{cross-track}}^2}" block />
      </div>

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

      {d.objects.map((o) => (
        <div key={`math-${o.label}`} className="math-latex-subblock">
          <Latex
            math={`\\sigma_{\\text{RSS}}(\\text{${o.label.replace(/[^a-zA-Z0-9]/g, " ")}}) = \\sqrt{${o.radialM.toFixed(1)}^2 + ${o.inTrackM.toFixed(1)}^2 + ${o.crossTrackM.toFixed(1)}^2} = ${o.rssM.toFixed(1)}\\text{ m}`}
            block
          />
        </div>
      ))}

      <h3 className="calc-step">Step 3. Miss distance against uncertainty (Encounter Plane Ratio)</h3>
      <div className="math-latex-block">
        <Latex math="\\text{Ratio} = \\frac{d_{\\text{encounter}}}{\\sigma_{\\text{along\\_miss}}}" block />
      </div>

      {d.missVsUncertainty.available ? (
        <>
          <p>
            Putting both clouds together and looking along the direction of the miss: miss {fmtM(d.missVsUncertainty.missPlaneM)}, combined uncertainty {fmtM(d.missVsUncertainty.sigmaAlongMissM)}, which is{" "}
            <strong>{d.missVsUncertainty.ratio.toFixed(2)}×</strong>. {cautiousLanguage ? "This ratio describes separation relative to the positional uncertainty; it is not a collision probability or a guarantee of safety." : d.missVsUncertainty.sentence}
          </p>
          <div className="math-latex-block">
            <Latex
              math={`\\text{Ratio} = \\frac{${d.missVsUncertainty.missPlaneM.toFixed(1)}\\text{ m}}{${d.missVsUncertainty.sigmaAlongMissM.toFixed(1)}\\text{ m}} = ${d.missVsUncertainty.ratio.toFixed(2)}\\times`}
              block
            />
          </div>
          <p className="panel-note">Reading aid: 3× or more is high confidence, 1× to 3× moderate, below 1× low. These cut-offs are ours, not CSA limits.</p>
        </>
      ) : (
        <p className="ops-row-label">Not available: {d.missVsUncertainty.reason}</p>
      )}

      <h3 className="calc-step">Step 4. Our own check of the collision chance (2D Foster Integral)</h3>
      <div className="math-latex-block">
        <Latex
          math="P_c = \\frac{1}{2\\pi \\sqrt{\\det(\\mathbf{C}_{2\\text{D}})}} \\iint_{\\|\\vec{r}\\| \\le R_{\\text{HBR}}} \\exp\\left( -\\frac{1}{2} \\vec{r}^T \\mathbf{C}_{2\\text{D}}^{-1} \\vec{r} \\right) dA"
          block
        />
      </div>

      {r.available ? (
        <>
          <p>
            {cautiousLanguage ? "CADS performs an experimental internal check from the same positions and uncertainties: " : "CADS recomputes the collision chance from the same positions and uncertainties: "}{formatOdds(r.recalculatedPc)} (<code>{r.recalculatedPc.toExponential(3)}</code>), against the CDM&apos;s {cautiousLanguage ? "reported " : ""}<code>{d.source.pcRaw ?? "n/a"}</code>.
            {r.ratioToSource !== null && ` Our value is ${r.ratioToSource.toFixed(2)}× the source value.`}
          </p>
          <div className="math-latex-block">
            <Latex
              math={`R_{\\text{HBR}} = ${r.hbrM.toFixed(1)}\\text{ m}, \\quad P_{c, \\text{recalc}} = ${r.recalculatedPc.toExponential(3)}`}
              block
            />
          </div>
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
        <details className="calc-raw" open={standalone}>
          <summary>Show the raw covariance matrices (LaTeX & Table)</summary>
          {d.objects.map((o) => (o.covariance ? <CovarianceTable key={o.label} label={o.label} m={o.covariance} /> : null))}
        </details>
      )}
    </>
  );

  if (standalone) {
    return (
      <div className="detail-panel ops-panel calc-panel math-standalone-panel" role="region" aria-label="Calculations">
        <h2 className="ops-title">Mathematical Calculations & Formulations</h2>
        <p className="panel-note">Full evaluation in LaTeX using the latest CDM state vectors and covariance matrices.</p>
        {content}
      </div>
    );
  }

  return (
    <details className="detail-panel ops-panel calc-panel">
      <summary>How this was calculated</summary>
      <p className="panel-note">Four steps, using the latest CDM for this event. Source values are never changed.</p>
      {content}
    </details>
  );
}
