import type { Severity } from "@/lib/cads/store";

// Console status-badge tones (site.css) per severity; the severity text is always shown, not only the colour.
const TONE: Record<Severity, string> = {
  ACTION: "status-action",
  WATCH: "status-review",
  LOW: "status-neutral",
  ZERO: "status-complete",
  UNKNOWN: "status-neutral",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`status-badge ${TONE[severity]}`}>
      <span className="status-badge-dot" aria-hidden="true" />
      {severity}
    </span>
  );
}
