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
  met: "border-foreground/40 bg-muted text-foreground",
  partial: "border-foreground/40 bg-muted text-foreground",
  gap: "border-foreground/40 bg-muted text-foreground",
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
    return <Badge variant="outline" className="h-auto whitespace-nowrap border-neutral-400/40 bg-muted py-0.5 text-foreground">{value}</Badge>;
  }
  return <StatusBadge status={tone} label={value} />;
}

export function Tag({ children }: { children: ReactNode }) {
  return <Badge variant="outline" className="h-auto whitespace-nowrap border-foreground/30 bg-muted py-0.5 font-mono text-[0.7rem] text-foreground">{children}</Badge>;
}

export function Panel({ title, description, children, className, id }: { title?: string; description?: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <Card id={id} className={cn("scroll-mt-20 bg-card ring-foreground/10", className)}>
      {title ? (
        <CardHeader>
          <CardTitle role="heading" aria-level={3}>{title}</CardTitle>
          {description ? <CardDescription className="text-muted-foreground">{description}</CardDescription> : null}
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
        <TableRow className="border-border hover:bg-transparent">
          {head.map((h, i) => (
            <TableHead key={h} scope="col" className={cn("h-9 text-xs uppercase tracking-wide text-muted-foreground", widths?.[i])}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, r) => (
          <TableRow key={r} className="border-border hover:bg-muted/50">
            {row.map((cell, c) => (
              <TableCell key={c} className="whitespace-normal align-top leading-relaxed text-foreground">{cell}</TableCell>
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
      <div className="relative overflow-hidden rounded-lg bg-white p-3 ring-1 ring-foreground/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={diagram.src} alt={diagram.alt} loading="lazy" className="mx-auto max-h-[34rem] w-full object-contain grayscale" />
        <Dialog>
          <DialogTrigger className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white/95 px-2 py-1 text-xs font-medium text-neutral-800 shadow-sm hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-neutral-500">
            <Maximize2 aria-hidden="true" className="size-3" /> Enlarge<span className="sr-only">: {diagram.title}</span>
          </DialogTrigger>
          <DialogContent className="max-h-[92vh] overflow-auto border-neutral-300 bg-white text-neutral-900 sm:max-w-[94vw]">
            <DialogHeader>
              <DialogTitle>{diagram.title}</DialogTitle>
              <DialogDescription className="text-neutral-600">{diagram.caption}</DialogDescription>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={diagram.src} alt={diagram.alt} className="mx-auto h-auto max-w-none grayscale" style={{ width: "min(1400px, 180vw)" }} />
          </DialogContent>
        </Dialog>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <ProgressBadgeKind kind={diagram.kind} />
        <span className="font-medium text-foreground">{diagram.title}.</span>
        <span>{diagram.caption}</span>
        <span className="text-xs text-muted-foreground">Source: {diagram.source}</span>
      </figcaption>
    </figure>
  );
}

function ProgressBadgeKind({ kind }: { kind: Diagram["kind"] }) {
  return kind === "as-built" ? <StatusBadge status="met" label="As built" /> : <Badge variant="outline" className="h-auto border-neutral-400/40 bg-muted py-0.5 text-foreground">From the report</Badge>;
}

/** The header of one rubric criterion: what Excellent asks for, and what we show for each phrase. */
export function CriterionSection({ criterion, children }: { criterion: Criterion; children: ReactNode }) {
  const headingId = `${criterion.id}-heading`;
  return (
    <section id={criterion.id} data-section aria-labelledby={headingId} className="scroll-mt-16 border-t border-border py-10 first:border-t-0">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">Criterion {criterion.n}</p>
          <h2 id={headingId} className="mt-1 text-balance text-2xl font-semibold text-foreground">{criterion.title}</h2>
        </div>
        <Badge variant="outline" className="h-auto border-foreground/30 bg-muted px-2.5 py-1 text-sm text-foreground">Weight {criterion.weight}</Badge>
      </header>

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="rounded-xl border border-foreground/30 bg-muted/40 p-4">
          <blockquote className="text-pretty text-base leading-relaxed text-foreground">{criterion.excellent}</blockquote>
          {criterion.open.length ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Still open</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-relaxed text-muted-foreground">
                {criterion.open.map((o) => <li key={o}>{o}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
        <Panel title="How we meet it" description="Each phrase of the descriptor, and the evidence on this page.">
          <ul aria-label={`Evidence for criterion ${criterion.n}`} className="divide-y divide-neutral-200/10">
            {criterion.claims.map((c) => (
              <li key={c.asks} className="grid gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
                <span className="font-medium text-foreground">{c.asks}</span>
                <span className="leading-relaxed text-muted-foreground">{c.evidence}</span>
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
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function BulletList({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ul className={cn("list-disc space-y-1.5 pl-5 leading-relaxed text-muted-foreground", className)}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-medium text-foreground underline decoration-foreground/40 underline-offset-4 hover:text-foreground">
      {children}<span aria-hidden="true"> ↗</span>
    </a>
  );
}
