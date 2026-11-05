"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";

import { GradientBackground } from "@/components/animate-ui/backgrounds/gradient";
import { LiquidButton } from "@/components/animate-ui/buttons/liquid";
import {
  ThemeTogglerButton,
  ThemeTogglerButtonIcon,
  type Resolved,
  type ThemeSelection,
} from "@/components/animate-ui/buttons/theme-toggler";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { analyzeEvent, type EventAnalysis } from "@/lib/cads/analyze";
import { loadDemoDocuments } from "@/lib/cads/demo";
import { tradeStudy, type TradeStudy } from "@/lib/cads/maneuver";
import { recalculate } from "@/lib/cads/pc";
import { assessQuality } from "@/lib/cads/quality";
import { CONFIG, Store, latestRevision, type CdmEvent, type Severity, type Snapshot } from "@/lib/cads/store";
import { hoursBetween, isoZ } from "@/lib/cads/time";

const EMPTY: Snapshot = { events: [], rules: [], alerts: [] };
const SEVERITY_STYLE: Record<Severity, { variant: "destructive" | "secondary" | "outline"; className?: string }> = {
  ACTION: { variant: "destructive" },
  WATCH: { variant: "secondary", className: "bg-amber-500/20 text-amber-700 dark:text-amber-300" },
  LOW: { variant: "outline" },
  ZERO: { variant: "outline" },
  UNKNOWN: { variant: "outline" },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <Badge variant={s.variant} className={s.className}>
      {severity}
    </Badge>
  );
}

function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <ThemeTogglerButton
      variant="outline"
      theme={(theme as ThemeSelection) ?? "system"}
      resolvedTheme={(resolvedTheme as Resolved) ?? "light"}
      setTheme={setTheme}
      aria-label="Switch colour theme (light, dark, system)"
      title="Switch colour theme"
    >
      <ThemeTogglerButtonIcon light={<Sun />} dark={<Moon />} system={<Monitor />} />
    </ThemeTogglerButton>
  );
}

const fmtHours = (h: number) => (h >= 0 ? `${h.toFixed(1)} h` : `${(-h).toFixed(1)} h ago`);

export function CadsApp() {
  const [store] = useState(() => new Store());
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
  const [analysis, setAnalysis] = useState<Record<number, EventAnalysis> | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("The table is empty. Press “1. Load data”, or upload CDM files.");
  const [busy, setBusy] = useState(false);
  // "Now" lives in state (refreshed by every action) because reading the clock during render is not allowed here.
  const [now, setNow] = useState(0);

  const run = async (fn: () => Promise<string> | string) => {
    setBusy(true);
    setNow(Date.now());
    try {
      setStatus(await fn());
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const ensureDefaultRule = () => {
    if (!store.getSnapshot().rules.length) store.addRule({ name: "Pc >= 1e-4 (CSA action level)", pcMin: CONFIG.pcAction, missDistanceMaxM: null, hoursToTcaMax: null, objectIds: [] });
  };

  const loadData = () =>
    run(async () => {
      const { docs, shiftHours } = await loadDemoDocuments();
      ensureDefaultRule();
      const r = store.importDocuments(docs);
      setAnalysis(null);
      return `Loaded ${r.counts.imported} CDMs (${r.counts.duplicate} repeats ignored); sample dates shifted by ${shiftHours} h so the encounters are upcoming. Now run the risk analysis.`;
    });

  const runAnalysis = () =>
    run(() => {
      const now = Date.now();
      const next: Record<number, EventAnalysis> = {};
      store.getSnapshot().events.forEach((e) => (next[e.id] = analyzeEvent(e, now)));
      setAnalysis(next);
      return store.getSnapshot().events.length ? "Risk analysis done: severity and reasons are shown for every event." : "Nothing to analyse yet. Load data first.";
    });

  const reset = () =>
    run(() => {
      store.reset();
      setAnalysis(null);
      setSelected(null);
      return "Reset. The table is empty.";
    });

  const upload = (files: FileList | null) =>
    run(async () => {
      if (!files?.length) return status;
      const docs = await Promise.all([...files].map(async (f) => ({ name: f.name, content: await f.text(), label: "upload" })));
      ensureDefaultRule();
      const r = store.importDocuments(docs);
      setAnalysis(null);
      const problems = r.records.filter((x) => x.errors.length).map((x) => `${x.file}: ${x.errors.join("; ")}`);
      return `Imported ${r.counts.imported}, repeats ${r.counts.duplicate}, rejected ${r.counts.rejected}.${problems.length ? " " + problems.join(" | ") : ""}`;
    });

  const downloadAlerts = () => {
    const text = snap.alerts.map((a) => JSON.stringify(a.message)).join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "alerts.jsonl";
    a.click();
    URL.revokeObjectURL(url);
  };

  const events = [...snap.events].sort((a, b) => latestRevision(a).cdm.tca - latestRevision(b).cdm.tca);
  const selectedEvent = snap.events.find((e) => e.id === selected) ?? null;

  return (
    <>
      <GradientBackground className="fixed inset-0 -z-10 from-sky-100 via-indigo-50 to-slate-100 opacity-70 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-900 dark:opacity-100" />
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="mr-auto text-lg font-semibold">CADS · Conjunction decision support</h1>
          <LiquidButton onClick={loadData} disabled={busy}>1. Load data</LiquidButton>
          <LiquidButton onClick={runAnalysis} disabled={busy || !snap.events.length}>2. Run risk analysis</LiquidButton>
          <LiquidButton onClick={reset} disabled={busy}>Reset</LiquidButton>
          <label className="text-sm text-muted-foreground">
            Upload CDMs{" "}
            <input type="file" multiple accept=".json,.kvn,.txt" className="max-w-56 text-xs" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-4">
        <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Severity is rated from the source Pc exactly as reported in each CDM. Recalculated values are experimental and not validated. CADS is decision support only and does not command spacecraft. Everything runs in this browser tab; nothing is stored or sent anywhere.
        </p>
        <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{status}</p>

        <Card>
          <CardHeader><CardTitle>Events</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Objects</TableHead><TableHead>TCA (UTC)</TableHead><TableHead>To TCA</TableHead><TableHead>Latest source Pc</TableHead>
                  <TableHead>Miss (m)</TableHead><TableHead>CDMs</TableHead><TableHead>Data</TableHead><TableHead>Severity</TableHead><TableHead>Why</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-muted-foreground">Empty. Press “1. Load data” or upload CDM files.</TableCell></TableRow>
                )}
                {events.map((e) => {
                  const c = latestRevision(e).cdm;
                  const a = analysis?.[e.id];
                  return (
                    <TableRow key={e.id} data-state={e.id === selected ? "selected" : undefined} className="cursor-pointer align-top" onClick={() => setSelected(e.id)}>
                      <TableCell>
                        <button className="text-left underline-offset-2 hover:underline focus-visible:underline" onClick={() => setSelected(e.id)}>
                          {c.sat1.name ?? c.sat1.designator} / {c.sat2.name ?? c.sat2.designator}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{isoZ(c.tca)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtHours(hoursBetween(now, c.tca))}</TableCell>
                      <TableCell>{c.pcRaw ?? "not provided"}</TableCell>
                      <TableCell>{c.missDistanceM.toFixed(0)}</TableCell>
                      <TableCell>{e.revisions.length}</TableCell>
                      <TableCell className="space-x-1">{[...new Set(e.revisions.map((r) => r.sourceLabel))].map((l) => <Badge key={l} variant="outline">{l}</Badge>)}</TableCell>
                      <TableCell>{a ? <SeverityBadge severity={a.severity} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="min-w-72 whitespace-normal">
                        {a ? <ul className="list-disc space-y-0.5 pl-4 text-xs">{a.why.map((w, i) => <li key={i}>{w}</li>)}</ul> : <span className="text-muted-foreground">run risk analysis</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {selectedEvent && <EventDetail event={selectedEvent} />}

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Alerts</CardTitle>
            <LiquidButton onClick={downloadAlerts} disabled={!snap.alerts.length}>Download alerts.jsonl</LiquidButton>
          </CardHeader>
          <CardContent>
            {snap.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts. Rules: {snap.rules.length ? snap.rules.map((r) => r.name).join(", ") : "none yet (a Pc ≥ 1e-4 rule is added when data is loaded)"}.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Rule</TableHead><TableHead>Event</TableHead><TableHead>Severity</TableHead><TableHead>Matched</TableHead></TableRow></TableHeader>
                <TableBody>
                  {snap.alerts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">{isoZ(a.createdAt)}</TableCell><TableCell>{a.ruleName}</TableCell>
                      <TableCell>{String(a.message.event)}</TableCell><TableCell><SeverityBadge severity={a.severity} /></TableCell>
                      <TableCell className="whitespace-normal text-xs">{a.matched.join("; ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function EventDetail({ event }: { event: CdmEvent }) {
  const latest = latestRevision(event).cdm;
  const rec = recalculate(latest, CONFIG.defaultHbrM);
  const quality = assessQuality(latest, CONFIG.qualityLimitsM);
  return (
    <Card>
      <CardHeader><CardTitle>Event {event.key}: CDM revisions</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Created (UTC)</TableHead><TableHead>TCA (UTC)</TableHead><TableHead>Source Pc</TableHead><TableHead>Change</TableHead><TableHead>Miss (m)</TableHead><TableHead>Rel. speed (m/s)</TableHead><TableHead>Source file</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {event.revisions.map((r, i) => {
                const prev = event.revisions[i - 1]?.cdm;
                const c = r.cdm;
                const dir = !prev ? "first CDM" : prev.pc === null || c.pc === null ? "unknown" : c.pc > prev.pc ? "Pc increased" : c.pc < prev.pc ? "Pc decreased" : "Pc unchanged";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{isoZ(c.creationDate)}</TableCell>
                    <TableCell className="whitespace-nowrap">{isoZ(c.tca)}</TableCell>
                    <TableCell>{c.pcRaw ?? "not provided"}{c.pc === 0 && <span className="text-xs text-muted-foreground"> (reported exactly zero)</span>}</TableCell>
                    <TableCell className="whitespace-nowrap">{dir}{prev && `, TCA ${((c.tca - prev.tca) / 1000).toFixed(2)} s`}</TableCell>
                    <TableCell>{c.missDistanceM.toFixed(0)}</TableCell><TableCell>{c.relativeSpeedMs?.toFixed(0) ?? "n/a"}</TableCell>
                    <TableCell>{r.sourceFile}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-sm">
          <strong>Experimental recalculation of the latest CDM:</strong>{" "}
          {rec.available ? `Pc ${rec.recalculatedPc.toExponential(3)} (HBR ${rec.hbrM.toFixed(2)} m, ${rec.hbrSource}) · ${rec.status}` : `unavailable: ${rec.reason}`}
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer">Data quality of the latest CDM (provisional limits)</summary>
          <p className="my-1 text-xs text-muted-foreground">{quality.limitsNote}</p>
          <ul className="grid gap-x-6 gap-y-0.5 text-xs md:grid-cols-2">
            {[quality.sat1, quality.sat2].map((o) => (
              <li key={o.label}><strong>{o.label}</strong>
                <ul className="list-disc pl-4">
                  {o.checks.map((c) => <li key={c.name}>{c.name}: {typeof c.value === "number" ? c.value.toPrecision(4) : (c.value ?? "n/a")} {c.unit} <em>({c.status}{c.limit ? `, limit ${c.limit}` : ""})</em></li>)}
                </ul>
              </li>
            ))}
          </ul>
        </details>
        <ManeuverPanel event={event} />
      </CardContent>
    </Card>
  );
}

function ManeuverPanel({ event }: { event: CdmEvent }) {
  const [f, setF] = useState({ radial: "0", intrack: "0.05", cross: "0", lead: "12", mass: "500", isp: "220", fuel: "5" });
  const [result, setResult] = useState<TradeStudy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const field = (k: keyof typeof f, label: string) => (
    <label className="flex flex-col gap-0.5 text-xs">{label}
      <input inputMode="decimal" value={f[k]} onChange={set(k)} className="w-28 rounded-md border bg-background px-2 py-1 text-sm" />
    </label>
  );
  const run = () => {
    try {
      const n = (s: string) => {
        const v = Number(s);
        if (!Number.isFinite(v)) throw new Error(`“${s}” is not a number`);
        return v;
      };
      const sc = { massKg: n(f.mass), ispS: n(f.isp), propellantAvailableKg: n(f.fuel) };
      if (sc.massKg <= 0 || sc.ispS <= 0 || n(f.lead) <= 0) throw new Error("mass, Isp and lead time must be positive");
      setResult(tradeStudy(latestRevision(event).cdm, [{ label: "candidate", dvRtnMs: [n(f.radial), n(f.intrack), n(f.cross)], leadTimeH: n(f.lead) }], sc, CONFIG.pcAction, CONFIG.defaultHbrM, null, n(f.lead)));
      setError(null);
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  };
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">Maneuver trade study (prototype, impulsive burn)</summary>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        {field("radial", "ΔV radial (m/s)")}{field("intrack", "ΔV in-track (m/s)")}{field("cross", "ΔV cross-track (m/s)")}
        {field("lead", "Burn lead time (h before TCA)")}{field("mass", "Mass (kg)")}{field("isp", "Isp (s)")}{field("fuel", "Propellant available (kg)")}
        <LiquidButton onClick={run}>Evaluate</LiquidButton>
      </div>
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2 text-xs">
          {result.warnings.filter((w) => !w.startsWith("SAT")).map((w) => <p key={w} className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1">{w}</p>)}
          <p>Baseline: miss {result.baseline.missDistanceM.toFixed(0)} m, Pc {result.baseline.pc.toExponential(2)} (source {result.baseline.sourcePcRaw}).</p>
          {result.candidates.map((c) => (
            <p key={c.label}>
              After burn at {c.burnEpoch}: miss <strong>{c.missDistanceM.toFixed(0)} m</strong>, Pc <strong>{c.pc.toExponential(2)}</strong> ({c.meetsThreshold ? "below" : "not below"} {result.pcThreshold.toExponential(0)}), ΔV {c.dvTotalMs.toFixed(3)} m/s, propellant {c.propellantKg.toFixed(3)} kg ({c.enoughPropellant ? "enough" : "NOT enough"}).
            </p>
          ))}
          {result.suggestions.length > 0 ? (
            <p>Smallest single-axis burns reaching the threshold at this lead time: {result.suggestions.slice(0, 3).map((s) => `${s.direction} ${s.dvMs.toFixed(3)} m/s`).join(", ")}.</p>
          ) : (
            <p>{result.baseline.meetsThreshold ? "Baseline is already below the threshold." : "No single-axis burn up to 1 m/s reaches the threshold at this lead time."}</p>
          )}
          <details><summary className="cursor-pointer">Assumptions and limitations</summary>
            <ul className="list-disc pl-4">{[...result.assumptions, ...result.limitations].map((a) => <li key={a}>{a}</li>)}</ul>
          </details>
          <p className="text-muted-foreground">Decision support only. No spacecraft commands are produced.</p>
        </div>
      )}
    </details>
  );
}
