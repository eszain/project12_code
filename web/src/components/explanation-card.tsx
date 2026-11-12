"use client";

import { Latex } from "@/components/latex";
import { formatDistance, formatOdds, formatSpeed, type EventAnalysis } from "@/lib/cads/analyze";
import { latestRevision, type CdmEvent } from "@/lib/cads/store";
import { SeverityBadge } from "./severity-badge";
import { hoursBetween } from "@/lib/cads/time";

export function ExplanationCard({
  event,
  analysis,
  now,
}: {
  event: CdmEvent;
  analysis?: EventAnalysis;
  now: number;
}) {
  const latest = latestRevision(event).cdm;
  const sat1Label = latest.sat1.name ?? latest.sat1.designator;
  const sat2Label = latest.sat2.name ?? latest.sat2.designator;
  const pc = latest.pc;
  const missM = latest.missDistanceM;
  const speed = latest.relativeSpeedMs ?? 0;
  const hours = hoursBetween(now, latest.tca);
  const timingText = hours >= 0 ? `in ${hours.toFixed(1)} hours` : `passed ${(-hours).toFixed(1)} hours ago`;

  const oneInN = pc && pc > 0 ? Math.round(1 / pc) : null;
  const pctStr = pc && pc > 0 ? (pc * 100 < 0.01 ? (pc * 100).toFixed(3) : (pc * 100).toFixed(2)) + "%" : "0%";

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
                    <strong>High Danger.</strong> The chance of these two objects crashing is <strong>{formatOdds(pc)}</strong>. In space flight, any chance worse than <strong>1 in 10,000</strong> is unacceptable risk. Operators must plan a steering burn to dodge it.
                  </>
                )}
                {analysis.severity === "WATCH" && (
                  <>
                    <strong>Elevated Watch.</strong> The collision chance is <strong>{formatOdds(pc)}</strong> (between 1 in 10,000 and 1 in 10 million). It is safe for now, but operators must keep watching future radar updates.
                  </>
                )}
                {analysis.severity === "ZERO" && (
                  <>
                    <strong>Zero Risk.</strong> The probability of collision is <strong>0%</strong>. Both satellites are safely apart, with no danger of touching.
                  </>
                )}
                {analysis.severity === "LOW" && (
                  <>
                    <strong>Safe Pass.</strong> The collision chance is <strong>{formatOdds(pc)}</strong> (less than 1 in 10 million). The risk is negligible.
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
                  <div className="text-[11px] text-muted-foreground font-medium">2. Collision Odds (Pc)</div>
                  <div className="text-sm font-semibold text-foreground py-0.5">
                    {pc === 0 ? (
                      <Latex math="P_c = 0\%" />
                    ) : (
                      <Latex math={`P_c = \\frac{1}{${oneInN?.toLocaleString()}}`} />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Chance of touching ({pctStr})</p>
                </div>

                <div className="rounded border bg-muted/40 p-2.5 space-y-1">
                  <div className="text-[11px] text-muted-foreground font-medium">3. Safety Limit</div>
                  <div className="text-sm font-semibold text-foreground py-0.5">
                    <Latex math="P_{\text{limit}} = \frac{1}{10{,}000}" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Action threshold (0.01%)</p>
                </div>
              </div>

              {/* Decision comparison */}
              <div className="rounded bg-muted/50 p-3 text-center">
                {analysis.severity === "ACTION" && (
                  <div className="space-y-1.5">
                    <Latex
                      block
                      math={`\\text{Our Risk: } \\frac{1}{${oneInN?.toLocaleString()}} \\quad > \\quad \\text{Safety Limit: } \\frac{1}{10{,}000} \\implies \\textbf{ACTION REQUIRED}`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Because 1 in {oneInN?.toLocaleString()} is a higher risk than the 1 in 10,000 safety threshold, operators must maneuver.
                    </p>
                  </div>
                )}
                {analysis.severity === "ZERO" && (
                  <div className="space-y-1.5">
                    <Latex
                      block
                      math={`d = ${missM.toFixed(0)}\\text{ m} \\gg 10\\text{ m} \\implies P_c = 0\\% \\implies \\textbf{ZERO RISK}`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      The distance ({missM.toFixed(0)} meters) is hundreds of times larger than the satellites. Probability is 0%, so no move is needed.
                    </p>
                  </div>
                )}
                {analysis.severity === "WATCH" && (
                  <div className="space-y-1.5">
                    <Latex
                      block
                      math={`\\frac{1}{10{,}000{,}000} \\le P_c = \\frac{1}{${oneInN?.toLocaleString()}} < \\frac{1}{10{,}000} \\implies \\textbf{WATCH}`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Risk is elevated but not critical. Keep monitoring upcoming radar passes.
                    </p>
                  </div>
                )}
                {analysis.severity === "LOW" && (
                  <div className="space-y-1.5">
                    <Latex
                      block
                      math={`P_c < \\frac{1}{10{,}000{,}000} \\implies \\textbf{LOW RISK}`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Collision chance is less than 1 in 10 million. Safe pass.
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
