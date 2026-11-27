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

import { getNotificationHandler } from "@/lib/cads/notification-handlers";
import { Bell, Mail, Webhook, CheckCircle2, Clock, XCircle, Ban, Code2, ChevronDown } from "lucide-react";

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
  suppressed: "Suppressed",
};

const STATUS_STYLES: Record<DeliveryStatus, string> = {
  pending: "text-amber-500",
  sent: "text-emerald-500",
  failed: "text-red-500",
  suppressed: "text-muted-foreground",
};

const STATUS_ICONS = {
  pending: Clock,
  sent: CheckCircle2,
  failed: XCircle,
  suppressed: Ban,
};

const CHANNEL_ICONS = {
  local: Bell,
  webhook: Webhook,
  email: Mail,
};

function parseLogDetail(detail: string) {
  const start = detail.indexOf("{");

  if (start === -1) {
    return { message: detail, payload: null };
  }

  try {
    const payload = JSON.parse(detail.slice(start));

    return {
      message: detail.slice(0, start).trim().replace(/:$/, ""),
      payload: JSON.stringify(payload, null, 2),
    };
  } catch {
    return { message: detail, payload: null };
  }
}

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
                <p className={`text-xl font-semibold tabular-nums ${STATUS_STYLES[status]}`}>
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

            {entries.map((entry) => {
              const StatusIcon = STATUS_ICONS[entry.status];
              const ChannelIcon = CHANNEL_ICONS[entry.channel];

              return (
                <article
                  key={entry.id}
                  className="min-w-0 space-y-4 overflow-hidden rounded-xl border p-4 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold">
                        {entry.ruleName}
                      </h3>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Event {entry.eventId} · Alert {entry.alertId}
                      </p>
                    </div>

                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[entry.status]}`}
                      aria-label={`Delivery status: ${entry.status}`}
                    >
                      <StatusIcon className="size-3.5" />
                      {STATUS_LABELS[entry.status]}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Channel
                      </p>

                      <div className="flex items-center gap-1.5 font-medium">
                        <ChannelIcon className="size-4 shrink-0" />
                        <span className="break-words">
                          {getNotificationHandler(entry.channel).label}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Attempts
                      </p>

                      <p className="font-medium tabular-nums">
                        {entry.attempts}
                      </p>
                    </div>

                    <div className="col-span-2 space-y-1 border-t pt-2">
                      <p className="text-xs text-muted-foreground">
                        Last updated
                      </p>

                      <p className="text-xs font-medium">
                        {new Date(entry.updatedAt).toLocaleString()}
                      </p>
                    </div>
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
                    <div className="flex items-start gap-2 text-xs text-emerald-500">
                      <CheckCircle2 className="size-4 shrink-0" />

                      <p>
                        {entry.channel === "local"
                          ? "Delivery completed locally."
                          : `${getNotificationHandler(entry.channel).label} delivery recorded. No external message was sent.`}
                      </p>
                    </div>
                  )}

                  {entry.status === "suppressed" && (
                    <div className="flex items-start gap-2 text-xs text-amber-500">
                      <Ban className="size-4 shrink-0" />

                      <p>
                        Delivery suppressed. No message was sent.
                      </p>
                    </div>
                  )}

                  <details className="group/history border-t pt-3 text-xs">
                    <summary className="flex cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-2">
                        <Clock className="size-4 text-muted-foreground" />
                        Delivery history ({entry.logs.length})
                      </span>

                      <ChevronDown className="size-4 text-muted-foreground transition-transform group-open/history:rotate-180" />
                    </summary>

                    <ul className="mt-4 space-y-4">
                      {entry.logs.map((log, index) => {
                        const LogIcon = STATUS_ICONS[log.status];
                        const { message, payload } = parseLogDetail(log.detail);

                        return (
                          <li
                            key={`${log.at}-${index}`}
                            className="relative flex min-w-0 gap-3"
                          >
                            {index < entry.logs.length - 1 && (
                              <div className="absolute bottom-[-16px] left-[9px] top-5 w-px bg-border" />
                            )}

                            <LogIcon className={`relative z-10 mt-1 size-5 shrink-0 ${STATUS_STYLES[log.status]}`} />

                            <div className="min-w-0 flex-1 space-y-2 rounded-lg border bg-muted/30 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className={`font-semibold ${STATUS_STYLES[log.status]}`}>
                                  {STATUS_LABELS[log.status]}
                                </p>

                                <p className="text-[10px] text-muted-foreground">
                                  {new Date(log.at).toLocaleTimeString()}
                                </p>
                              </div>

                              <p className="break-words leading-relaxed">
                                {entry.channel === "local" && log.status === "sent"
                                  ? "Notification delivered successfully."
                                  : message}
                              </p>

                              <p className="text-[10px] text-muted-foreground">
                                {new Date(log.at).toLocaleDateString()}
                              </p>

                              {entry.channel !== "local" && payload && (
                                <details className="group/payload min-w-0 overflow-hidden rounded-md border bg-background">
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                                    <span className="flex items-center gap-2">
                                      <Code2 className="size-4" />
                                      View payload
                                    </span>

                                    <ChevronDown className="size-3.5 transition-transform group-open/payload:rotate-180" />
                                  </summary>

                                  <div className="border-t">
                                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                                      {payload}
                                    </pre>
                                  </div>
                                </details>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </article>
              );
            })}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}