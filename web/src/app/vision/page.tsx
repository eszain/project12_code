import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { MODULES, RELEASES, STAGE_LABEL, featuresOf, type Stage } from "@/lib/vision";

export const metadata = { title: "CADS | The big picture" };

const STAGES: Stage[] = ["built", "next", "later"];

export default function VisionPage() {
  const counts = { built: featuresOf("built").length, next: featuresOf("next").length, later: featuresOf("later").length };
  return (
    <main className="console-shell">
      <Navigation />
      <div className="console-content vision">
        <header className="console-header">
          <div>
            <p className="eyebrow"><span className="eyebrow-dot" /> THE BIG PICTURE</p>
            <h1>Where CADS is going</h1>
            <p className="console-intro">
              The finished product on one page. Solid cards exist today, dashed cards are planned. Buttons on planned cards are placeholders.
            </p>
          </div>
          <div className="console-header-meta">
            <span className="status-badge"><span className="status-badge-dot" aria-hidden="true" />Draft for discussion</span>
            <span>“Next 7 days” items are proposals for the team to confirm</span>
          </div>
        </header>

        <section className="vision-summary" aria-label="Feature counts">
          {STAGES.map((s) => (
            <article key={s} className={`summary-card vision-count vision-${s}`}>
              <div>
                <p>{STAGE_LABEL[s]}</p>
                <strong>{String(counts[s]).padStart(2, "0")}</strong>
                <small>features across {MODULES.length} modules</small>
              </div>
            </article>
          ))}
        </section>

        <section className="vision-grid" aria-label="Product modules">
          {MODULES.map((m) => (
            <article key={m.id} className={`vision-card vision-card-${m.stage}`} aria-labelledby={`vm-${m.id}`}>
              <header>
                <h2 id={`vm-${m.id}`}>{m.title}</h2>
                <span className={`vision-tag vision-tag-${m.stage}`}>{STAGE_LABEL[m.stage]}</span>
              </header>
              <p className="vision-purpose">{m.purpose}</p>
              {(["built", "next", "later"] as const).map((s) =>
                m[s].length ? (
                  <div key={s} className="vision-list">
                    <h3>{STAGE_LABEL[s]}</h3>
                    <ul>{m[s].map((f) => <li key={f}>{f}</li>)}</ul>
                  </div>
                ) : null,
              )}
              <footer>
                <span className="vision-release">Release {m.release}</span>
                {m.stage === "built" ? (
                  <Link className="ops-link" href="/dashboard">Open in the dashboard ↗</Link>
                ) : (
                  <button className="ops-link ops-link-quiet" disabled aria-disabled="true" title="Not built yet">Coming soon</button>
                )}
              </footer>
            </article>
          ))}
        </section>

        <section className="detail-panel ops-panel" aria-labelledby="roadmap-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">TIMELINE</p>
              <h2 id="roadmap-heading">Releases through Capstone Day</h2>
            </div>
            <Link className="ops-link" href="/dashboard">Open the dashboard ↗</Link>
          </div>
          <ol className="release-line">
            {RELEASES.map((r) => (
              <li key={r.id}><strong>{r.id}</strong><span>{r.name}</span><small>{r.when}</small></li>
            ))}
          </ol>
          <p className="panel-note ops-foot">Releases follow Progress Report 1, section 6.2. Dates for R2 to R4 are indicative.</p>
        </section>
      </div>
    </main>
  );
}
