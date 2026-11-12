import { severityBands } from "@/lib/cads/severity";
import { SeverityBadge } from "./severity-badge";

/** G7: how a severity is decided, in plain words, with where each limit comes from. */
export function SeverityLegend() {
  return (
    <details className="legend-panel">
      <summary>How severity is decided</summary>
      <p className="panel-note">
        Severity comes only from the Pc written in the latest CDM. CADS does not recalculate it for this rating.
      </p>
      <table className="dashboard-table legend-table" aria-label="Severity bands">
        <thead>
          <tr>
            <th scope="col">Severity</th><th scope="col">Pc range</th><th scope="col">What to do</th><th scope="col">Where the limit comes from</th>
          </tr>
        </thead>
        <tbody>
          {severityBands().map((b) => (
            <tr key={b.severity}>
              <th scope="row"><SeverityBadge severity={b.severity} /></th>
              <td>{b.range}</td>
              <td>{b.action}</td>
              <td className="table-subline">{b.basis}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
