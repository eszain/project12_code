"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Latex } from "@/components/latex";
import { formatDistance, formatOdds, formatSpeed, type EventAnalysis } from "@/lib/cads/analyze";
import { CONFIG, latestRevision, type CdmEvent, type Severity } from "@/lib/cads/store";
import { hoursBetween } from "@/lib/cads/time";

const SEVERITY_STYLE: Record<Severity, { variant: "destructive" | "secondary" | "outline"; className?: string }> = {
  ACTION: { variant: "destructive" },
  WATCH: { variant: "secondary", className: "bg-amber-500/20 text-amber-700 dark:text-amber-300" },
  LOW: { variant: "outline" },
  ZERO: { variant: "outline" },
  UNKNOWN: { variant: "outline" },
};

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
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="border-b bg-muted/30 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base sm:text-lg">
              Explanation: {sat1Label} / {sat2Label}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Encounter {event.key} | Closest pass {timingText} | {event.revisions.length} radar update{event.revisions.length > 1 ? "s" : ""}
            </p>
          </div>
          {analysis && (
            <Badge
              variant={SEVERITY_STYLE[analysis.severity].variant}
              className={`px-3 py-1 text-sm font-semibold ${SEVERITY_STYLE[analysis.severity].className ?? ""}`}
            >
              {analysis.severity}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
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
                    <Latex math="P_{\\text{limit}} = \\frac{1}{10{,}000}" />
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
      </CardContent>
    </Card>
  );
}
