"use client";

import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleDashed, Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/animate-ui/components/radix/dialog";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, type Criterion, type Diagram, type Status } from "@/lib/site-visit";

const STATUS_STYLE: Record<Status, string> = {
  met: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  partial: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  gap: "border-rose-400/40 bg-rose-400/10 text-rose-200",
};
const STATUS_ICON = { met: CircleCheck, partial: CircleDashed, gap: CircleAlert };

/** Status is always an icon plus words, never colour alone. */
export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge variant="outline" className={cn("h-auto gap-1 whitespace-nowrap py-0.5", STATUS_STYLE[status])}>
      <Icon aria-hidden="true" className="size-3" />
      {label ?? STATUS_LABEL[status]}
    </Badge>
  );
}

const TONE: Record<string, Status> = {
  Verified: "met", Built: "met", Done: "met", Fixed: "met",
  Prototype: "partial", "In progress": "partial",
  Planned: "gap", "To do": "gap", Open: "gap",
};
/** Progress words (Verified, Built, Planned and so on) with a matching tone. */
export function ProgressBadge({ value }: { value: string }) {
  const tone = TONE[value] ?? (value.startsWith("Done") ? "met" : "partial");
  if (tone === "gap") {
    return <Badge variant="outline" className="h-auto whitespace-nowrap border-slate-400/40 bg-slate-400/10 py-0.5 text-slate-200">{value}</Badge>;
  }
  return <StatusBadge status={tone} label={value} />;
}

export function Tag({ children }: { children: ReactNode }) {
  return <Badge variant="outline" className="h-auto whitespace-nowrap border-sky-300/30 bg-sky-300/10 py-0.5 font-mono text-[0.7rem] text-sky-100">{children}</Badge>;
}

export function Panel({ title, description, children, className, id }: { title?: string; description?: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <Card id={id} className={cn("scroll-mt-20 bg-[#0a1626]/80 ring-sky-200/15", className)}>
      {title ? (
        <CardHeader>
          <CardTitle role="heading" aria-level={3}>{title}</CardTitle>
          {description ? <CardDescription className="text-slate-400">{description}</CardDescription> : null}
        </CardHeader>
      ) : null}
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** A plain data table. Cells wrap, and the table scrolls sideways on narrow screens. */
export function DataTable({ caption, head, rows, widths }: { caption: string; head: string[]; rows: ReactNode[][]; widths?: string[] }) {
  return (
    <Table aria-label={caption} className="min-w-[36rem]">
      <TableHeader>
        <TableRow className="border-sky-200/15 hover:bg-transparent">
          {head.map((h, i) => (
            <TableHead key={h} scope="col" className={cn("h-9 text-xs uppercase tracking-wide text-slate-400", widths?.[i])}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, r) => (
          <TableRow key={r} className="border-sky-200/10 hover:bg-sky-200/5">
            {row.map((cell, c) => (
              <TableCell key={c} className="whitespace-normal align-top leading-relaxed text-slate-200">{cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** A figure on a light "paper" panel, with a button that opens it full size. */
export function DiagramFigure({ diagram, id }: { diagram: Diagram; id?: string }) {
  return (
    <figure id={id} className="scroll-mt-20">
      <div className="relative overflow-hidden rounded-lg bg-white p-3 ring-1 ring-sky-200/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={diagram.src} alt={diagram.alt} loading="lazy" className="mx-auto max-h-[34rem] w-full object-contain" />
        <Dialog>
          <DialogTrigger className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white/95 px-2 py-1 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-500">
            <Maximize2 aria-hidden="true" className="size-3" /> Enlarge<span className="sr-only">: {diagram.title}</span>
          </DialogTrigger>
          <DialogContent className="max-h-[92vh] overflow-auto border-slate-300 bg-white text-slate-900 sm:max-w-[94vw]">
            <DialogHeader>
              <DialogTitle>{diagram.title}</DialogTitle>
              <DialogDescription className="text-slate-600">{diagram.caption}</DialogDescription>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={diagram.src} alt={diagram.alt} className="mx-auto h-auto max-w-none" style={{ width: "min(1400px, 180vw)" }} />
          </DialogContent>
        </Dialog>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-300">
        <ProgressBadgeKind kind={diagram.kind} />
        <span className="font-medium text-slate-100">{diagram.title}.</span>
        <span>{diagram.caption}</span>
        <span className="text-xs text-slate-500">Source: {diagram.source}</span>
      </figcaption>
    </figure>
  );
}

function ProgressBadgeKind({ kind }: { kind: Diagram["kind"] }) {
  return kind === "as-built" ? <StatusBadge status="met" label="As built" /> : <Badge variant="outline" className="h-auto border-slate-400/40 bg-slate-400/10 py-0.5 text-slate-200">From the report</Badge>;
}

/** The header of one rubric criterion: what Excellent asks for, and what we show for each phrase. */
export function CriterionSection({ criterion, children }: { criterion: Criterion; children: ReactNode }) {
  const headingId = `${criterion.id}-heading`;
  return (
    <section id={criterion.id} data-section aria-labelledby={headingId} className="scroll-mt-16 border-t border-sky-200/10 py-10 first:border-t-0">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Criterion {criterion.n}</p>
          <h2 id={headingId} className="mt-1 text-balance text-2xl font-semibold text-white">{criterion.title}</h2>
        </div>
        <Badge variant="outline" className="h-auto border-sky-300/40 bg-sky-300/10 px-2.5 py-1 text-sm text-sky-100">Weight {criterion.weight}</Badge>
      </header>

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="rounded-xl border border-sky-300/25 bg-sky-300/[0.06] p-4">
          <blockquote className="text-pretty text-base leading-relaxed text-white">{criterion.excellent}</blockquote>
          {criterion.open.length ? (
            <div className="mt-4 border-t border-sky-200/15 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">Still open</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-relaxed text-slate-300">
                {criterion.open.map((o) => <li key={o}>{o}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
        <Panel title="How we meet it" description="Each phrase of the descriptor, and the evidence on this page.">
          <ul aria-label={`Evidence for criterion ${criterion.n}`} className="divide-y divide-sky-200/10">
            {criterion.claims.map((c) => (
              <li key={c.asks} className="grid gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
                <span className="font-medium text-white">{c.asks}</span>
                <span className="leading-relaxed text-slate-300">{c.evidence}</span>
                <span><StatusBadge status={c.status} /></span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="space-y-6">{children}</div>
    </section>
  );
}

export function Sub({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20 space-y-3">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {children}
    </div>
  );
}

export function BulletList({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ul className={cn("list-disc space-y-1.5 pl-5 leading-relaxed text-slate-300", className)}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-sky-300 underline decoration-sky-300/40 underline-offset-4 hover:text-sky-200">
      {children}<span aria-hidden="true"> ↗</span>
    </a>
  );
}
