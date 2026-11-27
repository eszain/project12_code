"use client";

import { Latex } from "@/components/latex";
import { PC_PERCENT_FLOOR, ZERO_PC_PERCENT, formatDistance, formatPercent, formatSpeed, type EventAnalysis } from "@/lib/cads/analyze";
import { CONFIG, latestRevision, type CdmEvent } from "@/lib/cads/store";
import { SeverityBadge } from "./severity-badge";
import { hoursBetween } from "@/lib/cads/time";

export function ExplanationCard({
  event,
  analysis,
  now,
  cautiousLanguage = false,
}: {
  event: CdmEvent;
  analysis?: EventAnalysis;
  now: number;
  cautiousLanguage?: boolean;
}) {
  const latest = latestRevision(event).cdm;
  const sat1Label = latest.sat1.name ?? latest.sat1.designator;
  const sat2Label = latest.sat2.name ?? latest.sat2.designator;
  const pc = latest.pc;
  const missM = latest.missDistanceM;
  const speed = latest.relativeSpeedMs ?? 0;
  const hours = hoursBetween(now, latest.tca);
  const timingText = hours >= 0 ? `in ${hours.toFixed(1)} hours` : `passed ${(-hours).toFixed(1)} hours ago`;

  // Every probability is a percentage. In formulas, the percent sign is escaped for LaTeX.
  const tex = (p: number) => formatPercent(p).replace("%", "\\%");
  const pcTex = pc !== null && pc >= PC_PERCENT_FLOOR ? `= ${tex(pc)}` : `< ${tex(PC_PERCENT_FLOOR)}`;
  const actionPct = formatPercent(CONFIG.pcAction);
  const watchPct = formatPercent(CONFIG.pcWatch);

  return (
    <section className="detail-panel ops-panel ops-explain" aria-labelledby="explanation-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">PLAIN-LANGUAGE EXPLANATION</p>
          <h2 id="explanation-heading">
            Explanation: {sat1Label} / {sat2Label}
          </h2>
          <p className="panel-note ops-explain-meta">
            Encounter {event.key} | Closest pass {timingText} | {event.revisions.length} radar update{event.revisions.length > 1 ? "s" : ""}
          </p>
        </div>
        {analysis && <SeverityBadge severity={analysis.severity} />}
      </div>

      <div className="space-y-4">
        {!analysis ? (
          <p className="text-xs text-muted-foreground italic">
            Press &ldquo;2. Run risk analysis&rdquo; above to calculate collision probability and show the explanation.
          </p>
        ) : (
          <>
            {/* 1. Quick Summary (ELI5) */}
            <div className="rounded-lg border bg-muted/20 p-3.5 space-y-2 text-xs">
              <div className="font-semibold text-sm text-foreground">
                Quick Summary (ELI5)
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {analysis.severity === "ACTION" && (
                  <>
                    {cautiousLanguage ? (
                      <><strong>Action-band Pc.</strong> The reported collision probability is <strong>{formatPercent(pc)}</strong>. It meets the <strong>{actionPct}</strong> action level and requires specialist review; CADS does not command a maneuver.</>
                    ) : (
                      <><strong>High Danger.</strong> The chance of these two objects crashing is <strong>{formatPercent(pc)}</strong>. In space flight, any chance worse than <strong>{actionPct}</strong> is unacceptable risk. Operators must plan a steering burn to dodge it.</>
                    )}
                  </>
                )}
                {analysis.severity === "WATCH" && (
                  <>
                    {cautiousLanguage ? (
                      <><strong>Elevated Watch.</strong> The reported collision probability is <strong>{formatPercent(pc)}</strong> (between {watchPct} and {actionPct}). Continue monitoring; this value alone is not a safety guarantee or maneuver decision.</>
                    ) : (
                      <><strong>Elevated Watch.</strong> The collision chance is <strong>{formatPercent(pc)}</strong> (between {watchPct} and {actionPct}). It is safe for now, but operators must keep watching future radar updates.</>
                    )}
                  </>
                )}
                {analysis.severity === "ZERO" && (
                  <>
                    {cautiousLanguage ? (
                      <><strong>Very small reported Pc.</strong> This CDM reports a collision probability too small to measure, which CADS shows as <strong>{ZERO_PC_PERCENT}</strong>. That source value is not a guarantee; review positional uncertainty and later updates.</>
                    ) : (
                      <><strong>Practically no risk.</strong> The probability of collision is <strong>{ZERO_PC_PERCENT}</strong>. Both satellites are safely apart.</>
                    )}
                  </>
                )}
                {analysis.severity === "LOW" && (
                  <>
                    {cautiousLanguage ? (
                      <><strong>Low reported Pc.</strong> The reported collision probability is <strong>{formatPercent(pc)}</strong> (less than {watchPct}). Treat it as a low reported value, not a guarantee of a safe pass.</>
                    ) : (
                      <><strong>Safe Pass.</strong> The collision chance is <strong>{formatPercent(pc)}</strong> (less than {watchPct}). The risk is negligible.</>
                    )}
                  </>
                )}
                {analysis.severity === "UNKNOWN" && (
                  <>
                    <strong>Data Incomplete.</strong> The radar report omitted collision probability numbers.
                  </>
                )}
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded bg-background p-2 border">
                  <span className="text-muted-foreground">Passing Distance: </span>
                  <strong className="text-foreground">{formatDistance(missM)}</strong>
                </div>
                <div className="rounded bg-background p-2 border">
                  <span className="text-muted-foreground">Relative Speed: </span>
                  <strong className="text-foreground">{formatSpeed(speed)}</strong>
                </div>
              </div>
            </div>

            {/* 2. The Math (Simplified in LaTeX) */}
            <div className="rounded-lg border bg-card p-3.5 space-y-3 text-xs">
              <div className="font-semibold text-sm text-foreground">
                The Math (Simplified in LaTeX)
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Because radar tracks satellites from hundreds of miles away, each satellite has a &ldquo;safety bubble&rdquo; of uncertainty. The math checks how closely they pass and whether their bubbles overlap:
              </p>

              {/* 3 Step Cards */}
              <div className="grid gap-2 sm:grid-cols-3 text-center">
                <div className="rounded border bg-muted/40 p-2.5 space-y-1">
                  <div className="text-[11px] text-muted-foreground font-medium">1. Miss Distance</div>
                  <div className="text-sm font-semibold text-foreground py-0.5">
                    <Latex math={`d = ${missM.toFixed(0)}\\text{ m}`} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Closest gap between centers</p>
                </div>

                <div className="rounded border bg-muted/40 p-2.5 space-y-1">
                  <div className="text-[11px] text-muted-foreground font-medium">2. Collision Chance (Pc)</div>
                  <div className="text-sm font-semibold text-foreground py-0.5">
                    <Latex math={`P_c ${pcTex}`} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Chance of the two objects touching</p>
                </div>

                <div className="rounded border bg-muted/40 p-2.5 space-y-1">
                  <div className="text-[11px] text-muted-foreground font-medium">3. Safety Limit</div>
                  <div className="text-sm font-semibold text-foreground py-0.5">
                    <Latex math={`P_{\\text{limit}} = ${tex(CONFIG.pcAction)}`} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Action threshold</p>
                </div>
              </div>

              {/* Decision comparison */}
              <div className="rounded bg-muted/50 p-3 text-center">
                {analysis.severity === "ACTION" && (
                  <div className="space-y-1.5">
                    <Latex
                      block
                      math={`\\text{${cautiousLanguage ? "Reported Pc" : "Our Risk"}: } ${tex(pc ?? 0)} \\quad > \\quad \\text{${cautiousLanguage ? "Action Level" : "Safety Limit"}: } ${tex(CONFIG.pcAction)} \\implies \\textbf{${cautiousLanguage ? "SPECIALIST REVIEW" : "ACTION REQUIRED"}}`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {cautiousLanguage ? "The reported Pc is above the action level; a specialist must review the CDM and operational context before any decision." : `Because ${formatPercent(pc)} is a higher risk than the ${actionPct} safety threshold, operators must maneuver.`}
                    </p>
                  </div>
                )}
                {analysis.severity === "ZERO" && (
                  <div className="space-y-1.5">
                    <Latex
                      block
                      math={`d = ${missM.toFixed(0)}\\text{ m} \\gg 10\\text{ m} \\implies P_c < ${tex(PC_PERCENT_FLOOR)} \\implies \\textbf{${cautiousLanguage ? "VERY SMALL REPORTED Pc" : "PRACTICALLY NO RISK"}}`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {cautiousLanguage ? `The distance (${missM.toFixed(0)} meters) is compared with object size in this reading aid. The source Pc is too small to measure for this update, which CADS shows as ${ZERO_PC_PERCENT}; that does not replace uncertainty review.` : `The distance (${missM.toFixed(0)} meters) is hundreds of times larger than the satellites. The chance is ${ZERO_PC_PERCENT}, so no move is needed.`}
                    </p>
                  </div>
                )}
                {analysis.severity === "WATCH" && (
                  <div className="space-y-1.5">
                    <Latex
                      block
                      math={`${tex(CONFIG.pcWatch)} \\le P_c = ${tex(pc ?? 0)} < ${tex(CONFIG.pcAction)} \\implies \\textbf{WATCH}`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {cautiousLanguage ? "The reported Pc is elevated but below the action level; keep monitoring upcoming radar passes." : "Risk is elevated but not critical. Keep monitoring upcoming radar passes."}
                    </p>
                  </div>
                )}
                {analysis.severity === "LOW" && (
                  <div className="space-y-1.5">
                    <Latex
                      block
                      math={`P_c < ${tex(CONFIG.pcWatch)} \\implies \\textbf{${cautiousLanguage ? "BELOW WATCH LEVEL" : "LOW RISK"}}`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {cautiousLanguage ? `The reported Pc is less than ${watchPct}; continue to interpret it with positional uncertainty and future updates.` : `Collision chance is less than ${watchPct}. Safe pass.`}
                    </p>
                  </div>
                )}
                {analysis.severity === "UNKNOWN" && (
                  <p className="text-xs text-muted-foreground">
                    Collision probability was omitted from this radar update.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
