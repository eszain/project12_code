
"use client";

import { CheckCircle2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";

import {
  latestRevision,
  type AlertOccurrence,
  type CdmEvent,
} from "@/lib/cads/store";

import {
  countUnacknowledgedAlerts,
} from "@/lib/cads/notification-acknowledgement";

import {
  NotificationAcknowledgementForm,
} from "@/components/visual/notification-acknowledgement-form";

interface NotificationsSheetProps {
  alerts: AlertOccurrence[];
  events: CdmEvent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: number) => void;
  onAcknowledge: (
    alertId: number,
    acknowledgedBy: string,
    note?: string
  ) => boolean;
}

function eventTitle(event: CdmEvent): string {
  const cdm = latestRevision(event).cdm;

  return `${
    cdm.sat1.name ?? cdm.sat1.designator
  } / ${
    cdm.sat2.name ?? cdm.sat2.designator
  }`;
}

export function NotificationsSheet({
  alerts,
  events,
  open,
  onOpenChange,
  onSelect,
  onAcknowledge,
}: NotificationsSheetProps) {
  const unacknowledgedCount =
    countUnacknowledgedAlerts(alerts);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent
        side="left"
        className="w-[28rem] max-w-[90vw]"
      >
        <SheetHeader>
          <SheetTitle>
            Notifications
          </SheetTitle>

          <SheetDescription>
            {unacknowledgedCount} unacknowledged
            {" · "}
            {alerts.length} recorded alerts.
            No external messages are sent.
          </SheetDescription>
        </SheetHeader>

        <div
          className="flex-1 space-y-2 overflow-y-auto px-4 pb-4"
          aria-label="Recent alerts"
        >
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No alerts yet. Load sample data to
              evaluate the default rule.
            </p>
          ) : (
            alerts.map((alert) => {
              const event = events.find(
                (item) =>
                  item.id === alert.eventId
              );

              const acknowledgement =
                alert.acknowledgement;

              return (
                <article
                  key={alert.id}
                  data-testid={`notification-${alert.id}`}
                  data-acknowledged={
                    acknowledgement
                      ? "true"
                      : "false"
                  }
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {alert.ruleName}
                    </p>

                    {acknowledgement ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" />
                        Acknowledged
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                        {alert.severity}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm">
                    {event
                      ? eventTitle(event)
                      : `Event ${alert.eventId}`}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {alert.matched.join("; ")}
                  </p>

                  <button
                    type="button"
                    className="mt-2 text-sm underline underline-offset-2"
                    onClick={() => {
                      onSelect(alert.eventId);
                      onOpenChange(false);
                    }}
                  >
                    View event
                  </button>

                  {acknowledgement ? (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-4 shrink-0" />

                        <span className="break-words">
                          Acknowledged by{" "}
                          {
                            acknowledgement.acknowledgedBy
                          }
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Severity: {alert.severity}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        At:{" "}
                        {new Date(
                          acknowledgement.acknowledgedAt
                        ).toLocaleString()}
                      </p>

                      {acknowledgement.note && (
                        <p className="break-words text-xs">
                          Note:{" "}
                          {acknowledgement.note}
                        </p>
                      )}
                    </div>
                  ) : (
                    <NotificationAcknowledgementForm
                      alertId={alert.id}
                      onAcknowledge={onAcknowledge}
                    />
                  )}
                </article>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
