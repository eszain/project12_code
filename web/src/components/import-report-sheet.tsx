"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";
import type { ImportReport, RecordOutcome } from "@/lib/cads/store";

const LABEL: Record<RecordOutcome["status"], string> = {
  imported: "Accepted",
  duplicate: "Repeat",
  rejected: "Rejected",
};

function reason(row: RecordOutcome): string {
  if (row.status === "rejected") return row.errors[0] ?? "Rejected.";
  if (row.status === "duplicate") return row.warnings[0] ?? "This message was already loaded.";
  return "Loaded.";
}

export function ImportReportSheet({
  report,
  open,
  onOpenChange,
}: {
  report: ImportReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const counts = report?.counts;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[28rem] max-w-[90vw]">
        <SheetHeader>
          <SheetTitle>Import report</SheetTitle>
          <SheetDescription>
            {counts
              ? `${counts.imported} accepted, ${counts.duplicate} repeats, ${counts.rejected} rejected.`
              : "No files have been loaded yet."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
          {(report?.records ?? []).map((row, i) => (
            <article key={`${row.file}-${row.index}-${i}`} className="rounded-lg border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">{row.file}</p>
                <p className="shrink-0 text-xs text-muted-foreground">{LABEL[row.status]}</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{reason(row)}</p>
            </article>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
