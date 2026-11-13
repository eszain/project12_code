
"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";

import type {
  DeliveryStatus,
  OutboxEntry,
} from "@/lib/cads/outbox";

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
  suppressed: "Suppressed",
};

export function OutboxSheet({
  open,
  onOpenChange,
  entries,
  deliver,
  retry,
  simulateFailure,
  setSimulateFailure,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: OutboxEntry[];
  deliver: (id: string) => void;
  retry: (id: string) => void;
  simulateFailure: boolean;
  setSimulateFailure: (enabled: boolean) => void;
}) {
  const counts = {
    pending: entries.filter((entry) => entry.status === "pending").length,
    sent: entries.filter((entry) => entry.status === "sent").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    suppressed: entries.filter((entry) => entry.status === "suppressed").length,
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[32rem] max-w-[95vw] flex-col"
      >
        <SheetHeader>
          <SheetTitle>Outbox &amp; Delivery</SheetTitle>

          <SheetDescription>
            Local delivery simulation. No emails, webhooks,
            or external notifications are sent.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          <section
            className="grid grid-cols-4 gap-2"
            aria-label="Delivery status summary"
          >
            {(
              ["pending", "sent", "failed", "suppressed"] as const
            ).map((status) => (
              <div
                key={status}
                className="rounded-lg border p-2 text-center"
              >
                <p className="text-xl font-semibold tabular-nums">
                  {counts[status]}
                </p>

                <p className="text-xs text-muted-foreground">
                  {STATUS_LABELS[status]}
                </p>
              </div>
            ))}
          </section>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={simulateFailure}
              onChange={(event) =>
                setSimulateFailure(event.target.checked)
              }
            />
            Simulate delivery failure
          </label>

          <section className="space-y-3" aria-label="Outbox entries">
            {entries.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No outbox entries yet. Load CDMs that trigger
                an alert rule.
              </p>
            )}

            {entries.map((entry) => (
              <article
                key={entry.id}
                className="space-y-3 rounded-lg border p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold">
                      {entry.ruleName}
                    </h3>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Event {entry.eventId} · Alert {entry.alertId}
                    </p>
                  </div>

                  <span
                    className="shrink-0 rounded border px-2 py-1 text-xs"
                    aria-label={`Delivery status: ${entry.status}`}
                  >
                    {STATUS_LABELS[entry.status]}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Channel: Local</p>
                  <p>Attempts: {entry.attempts}</p>
                  <p>
                    Last updated:{" "}
                    {new Date(entry.updatedAt).toLocaleString()}
                  </p>
                </div>

                {entry.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => deliver(entry.id)}
                    className="rounded-md bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-600"
                  >
                    Deliver
                  </button>
                )}

                {entry.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => retry(entry.id)}
                    className="rounded-md bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-600"
                  >
                    Retry
                  </button>
                )}

                {entry.status === "sent" && (
                  <p className="text-xs text-emerald-600">
                    Delivery completed locally.
                  </p>
                )}

                {entry.status === "suppressed" && (
                  <p className="text-xs text-amber-600">
                    Delivery suppressed. No message was sent.
                  </p>
                )}

                <details className="border-t pt-2 text-xs">
                  <summary className="cursor-pointer font-medium">
                    Delivery history ({entry.logs.length})
                  </summary>

                  <ul className="mt-3 space-y-2">
                    {entry.logs.map((log, index) => (
                      <li
                        key={`${log.at}-${index}`}
                        className="rounded-md bg-muted/50 p-2"
                      >
                        <p className="font-medium">
                          {STATUS_LABELS[log.status]}
                        </p>

                        <p className="mt-1">
                          {log.detail}
                        </p>

                        <p className="mt-1 text-muted-foreground">
                          {new Date(log.at).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              </article>
            ))}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
