"use client";

import { Latex } from "@/components/latex";
import { formatOdds } from "@/lib/cads/analyze";
import { calculationDetails, type Confidence } from "@/lib/cads/details";
import { latestRevision, type CdmEvent } from "@/lib/cads/store";

const fmtM = (m: number) => (m >= 10000 ? `${(m / 1000).toFixed(1)} km` : `${m.toFixed(m < 100 ? 1 : 0)} m`);
const fmtSpeed = (speedMs: number | null) => (speedMs ? `${(speedMs / 1000).toFixed(2)} km/s` : "not provided");
const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
};

function latexCovariance(m: number[][]) {
  const rows = m.map((row) => row.map((v) => v.toExponential(2)).join(" & ")).join(" \\\\ ");
  return `\\begin{bmatrix} ${rows} \\end{bmatrix}`;
}

export function CalculationsMathView({ event }: { event: CdmEvent }) {
  const cdm = latestRevision(event).cdm;
  const d = calculationDetails(cdm);
  const r = d.recalculation;
  const mu = d.missVsUncertainty;

  return (
    <div className="ops-panel calc-panel math-standalone-panel" data-testid="calculations-math-view">
      <h3 className="ops-title">Mathematical Calculations & Formulations</h3>
      <p className="panel-note">
        All relative geometry, positional uncertainties, and collision probability models evaluated in LaTeX from the latest CDM.
      </p>

      {/* Section 1: Encounter Geometry */}
      <section className="math-section">
        <h4 className="calc-step">1. Encounter Geometry & Relative Motion</h4>
        <p>
          The separation vector and relative closing velocity at Time of Closest Approach (TCA):
        </p>

        <div className="math-latex-block">
          <Latex math={`d_{\\text{miss}} = \\|\\vec{r}_2 - \\vec{r}_1\\| = ${fmtM(d.source.missM)}`} block />
          <Latex math={`v_{\\text{rel}} = \\|\\vec{v}_2 - \\vec{v}_1\\| = ${fmtSpeed(d.source.speedMs)}`} block />
          <Latex math={`P_{c, \\text{source}} = \\text{${d.source.pcRaw ?? "not provided"}}`} block />
        </div>
      </section>

      {/* Section 2: Positional Uncertainty */}
      <section className="math-section">
        <h4 className="calc-step">2. Positional Uncertainty & Covariance</h4>
        <p>
          Each object carries tracking covariance in the Radial / In-track / Cross-track (RTN) frame.
          The 1σ Root-Sum-Square (RSS) uncertainty is computed as:
        </p>

        <div className="math-latex-block">
          <Latex math="\sigma_{\text{RSS}} = \sqrt{\sigma_R^2 + \sigma_T^2 + \sigma_N^2}" block />
        </div>

        {d.objects.length > 0 ? (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table" aria-label="Position uncertainty by object">
              <thead>
                <tr>
                  <th scope="col">Object</th>
                  <th scope="col">Radial (R)</th>
                  <th scope="col">In-track (T)</th>
                  <th scope="col">Cross-track (N)</th>
                  <th scope="col">RSS (1σ)</th>
                </tr>
              </thead>
              <tbody>
                {d.objects.map((o) => (
                  <tr key={o.label}>
                    <th scope="row">{o.label}</th>
                    <td>{fmtM(o.radialM)}</td>
                    <td>{fmtM(o.inTrackM)}</td>
                    <td>{fmtM(o.crossTrackM)}</td>
                    <td>{fmtM(o.rssM)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ops-row-label">Covariance not available in this CDM.</p>
        )}

        {d.objects.map((o) => (
          <div key={`rss-${o.label}`} className="math-latex-subblock">
            <Latex
              math={`\\sigma_{\\text{RSS}}(\\text{${o.label.replace(/[^a-zA-Z0-9]/g, " ")}}) = \\sqrt{${o.radialM.toFixed(1)}^2 + ${o.inTrackM.toFixed(1)}^2 + ${o.crossTrackM.toFixed(1)}^2} = ${o.rssM.toFixed(1)}\\text{ m}`}
              block
            />
            {o.covariance && (
              <div className="math-matrix-wrap">
                <p className="math-matrix-caption">{o.label} RTN Covariance Matrix (m²):</p>
                <div className="math-latex-matrix">
                  <Latex math={`\\mathbf{C}_{\\text{${o.label.replace(/[^a-zA-Z0-9]/g, "")}}} = ${latexCovariance(o.covariance)}`} block />
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Section 3: Miss Distance vs Uncertainty Ratio */}
      <section className="math-section">
        <h4 className="calc-step">3. Miss Distance vs. Uncertainty (Encounter Plane Ratio)</h4>
        <p>
          Combined positional uncertainty along the line of miss projected onto the encounter collision plane:
        </p>

        <div className="math-latex-block">
          <Latex math="\text{Ratio} = \frac{d_{\text{encounter}}}{\sigma_{\text{along\_miss}}}" block />
        </div>

        {mu.available ? (
          <>
            <p>
              Miss distance in encounter plane: {fmtM(mu.missPlaneM)}. Combined uncertainty along miss: {fmtM(mu.sigmaAlongMissM)}.
            </p>
            <div className="math-latex-block">
              <Latex
                math={`\\text{Ratio} = \\frac{${mu.missPlaneM.toFixed(1)}\\text{ m}}{${mu.sigmaAlongMissM.toFixed(1)}\\text{ m}} = ${mu.ratio.toFixed(2)}\\times`}
                block
              />
            </div>
            <p className="panel-note">
              Confidence level: <strong>{CONFIDENCE_LABEL[mu.confidence]}</strong> ({mu.ratio >= 3 ? "≥ 3×" : mu.ratio >= 1 ? "1× – 3×" : "< 1×"}).
            </p>
          </>
        ) : (
          <p className="ops-row-label">Not available: {mu.reason}</p>
        )}
      </section>

      {/* Section 4: 2D Collision Probability */}
      <section className="math-section">
        <h4 className="calc-step">4. 2D Probability of Collision (Foster Integration)</h4>
        <p>
          The encounter plane is perpendicular to the relative velocity vector:
        </p>

        <div className="math-latex-block">
          <Latex math="\hat{y} = \frac{\vec{v}_{\text{rel}}}{\|\vec{v}_{\text{rel}}\|}, \quad \vec{r}_{\perp} = \vec{r}_{\text{rel}} - (\vec{r}_{\text{rel}} \cdot \hat{y})\hat{y}" block />
        </div>

        <p>
          The 2D Gaussian probability density is integrated over a circular disk representing the combined Hard-Body Radius (HBR):
        </p>

        <div className="math-latex-block">
          <Latex
            math="P_c = \frac{1}{2\pi \sqrt{\det(\mathbf{C}_{2\text{D}})}} \iint_{\|\vec{r}\| \le R_{\text{HBR}}} \exp\left( -\frac{1}{2} \vec{r}^T \mathbf{C}_{2\text{D}}^{-1} \vec{r} \right) dA"
            block
          />
        </div>

        {r.available ? (
          <>
            <div className="math-latex-block">
              <Latex
                math={`R_{\\text{HBR}} = ${r.hbrM.toFixed(1)}\\text{ m}, \\quad P_{c, \\text{recalc}} = ${r.recalculatedPc.toExponential(3)} \\quad (${formatOdds(r.recalculatedPc)})`}
                block
              />
            </div>
            <ul className="calc-list">
              <li>Method: {r.method}.</li>
              <li>Combined object size: {r.hbrM.toFixed(1)} m ({r.hbrSource}).</li>
              <li>Status: <strong>{r.status}</strong>.</li>
            </ul>
          </>
        ) : (
          <p className="ops-row-label">Not available: {r.reason}</p>
        )}
      </section>
    </div>
  );
}
