
"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RotateCcw,
  Send,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";

import type { OutboxState } from "@/lib/cads/outbox";
import { getOutboxCounts } from "@/lib/cads/outbox";

interface OutboxPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: OutboxState;
  onDeliver: (
    id: number,
    simulateFailure: boolean,
  ) => void;
  onRetry: (
    id: number,
    simulateFailure: boolean,
  ) => void;
  onDeliverAll: (simulateFailure: boolean) => void;
}

export function OutboxPanel({
  open,
  onOpenChange,
  state,
  onDeliver,
  onRetry,
  onDeliverAll,
}: OutboxPanelProps) {
  const [simulateFailure, setSimulateFailure] =
    useState(false);

  const counts = getOutboxCounts(state);

  const sortedItems = [...state.items].sort(
    (a, b) => b.createdAt - a.createdAt || b.id - a.id,
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>Outbox & Delivery</SheetTitle>
          <SheetDescription>
            Demo-only delivery. No real emails,
            webhooks, or external notifications
            are sent.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          <div className="grid grid-cols-3 gap-2">
            <CountCard
              label="Pending"
              count={counts.pending}
            />
            <CountCard
              label="Sent"
              count={counts.sent}
            />
            <CountCard
              label="Failed"
              count={counts.failed}
            />
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={(event) =>
                  setSimulateFailure(
                    event.target.checked,
                  )
                }
              />
              Simulate delivery failure
            </label>

            <button
              type="button"
              disabled={counts.pending === 0}
              onClick={() =>
                onDeliverAll(simulateFailure)
              }
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              <Send className="size-4" />
              Deliver all pending
            </button>
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">
              Delivery queue ({state.items.length})
            </h3>

            {sortedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No delivery jobs yet.
              </p>
            ) : (
              sortedItems.map((item) => {
                const attempts = state.attempts
                  .filter(
                    (attempt) =>
                      attempt.outboxId === item.id,
                  )
                  .sort(
                    (a, b) =>
                      b.attemptedAt -
                        a.attemptedAt ||
                      b.id - a.id,
                  );

                return (
                  <article
                    key={item.id}
                    className="space-y-3 rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold">
                          Event {item.eventId}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Alert #{item.alertId} · Demo
                        </p>
                      </div>

                      <StatusLabel
                        status={item.status}
                      />
                    </div>

                    <p className="text-sm">
                      {item.ruleName}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Severity: {item.severity}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Attempts: {item.attempts}
                    </p>

                    {item.lastError && (
                      <p
                        role="alert"
                        className="rounded-md bg-red-50 p-2 text-xs text-red-700"
                      >
                        {item.lastError}
                      </p>
                    )}

                    {item.deliveredAt !== null && (
                      <p className="text-xs text-muted-foreground">
                        Delivered:{" "}
                        {new Date(
                          item.deliveredAt,
                        ).toLocaleString()}
                      </p>
                    )}

                    {item.status === "pending" && (
                      <button
                        type="button"
                        onClick={() =>
                          onDeliver(
                            item.id,
                            simulateFailure,
                          )
                        }
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted"
                      >
                        <Send className="size-3" />
                        Deliver
                      </button>
                    )}

                    {item.status === "failed" && (
                      <button
                        type="button"
                        onClick={() =>
                          onRetry(
                            item.id,
                            simulateFailure,
                          )
                        }
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-muted"
                      >
                        <RotateCcw className="size-3" />
                        Retry
                      </button>
                    )}

                    {attempts.length > 0 && (
                      <div className="space-y-2 border-t pt-3">
                        <p className="text-xs font-semibold">
                          Attempt history
                        </p>

                        {attempts.map((attempt) => (
                          <div
                            key={attempt.id}
                            className="rounded-md bg-muted p-2 text-xs"
                          >
                            <p>
                              Attempt #{attempt.id}:{" "}
                              {attempt.status}
                            </p>
                            <p className="text-muted-foreground">
                              {new Date(
                                attempt.attemptedAt,
                              ).toLocaleString()}
                            </p>
                            {attempt.error && (
                              <p>{attempt.error}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CountCard({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className="text-xl font-semibold">
        {count}
      </p>
      <p className="text-xs text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function StatusLabel({
  status,
}: {
  status: "pending" | "sent" | "failed";
}) {
  const config = {
    pending: {
      icon: Clock3,
      text: "Pending",
      className: "text-amber-600",
    },
    sent: {
      icon: CheckCircle2,
      text: "Sent",
      className: "text-green-600",
    },
    failed: {
      icon: AlertCircle,
      text: "Failed",
      className: "text-red-600",
    },
  }[status];

  const Icon = config.icon;

  return (
    <span
      className={`flex items-center gap-1 text-xs font-medium ${config.className}`}
    >
      <Icon className="size-3" />
      {config.text}
    </span>
  );
}
