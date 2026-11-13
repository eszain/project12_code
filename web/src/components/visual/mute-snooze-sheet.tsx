
"use client";

import { useState } from "react";
import { BellOff, BellRing, Clock3 } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";
import type { NotificationPause, NotificationPauseChange } from "@/lib/cads/store";

type Mode = "mute" | "snooze";
type Duration = "1h" | "6h" | "24h" | "custom";

export function MuteSnoozeSheet({
  open, onOpenChange, eventId, eventName, currentPause, history, onPause, onResume,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: number;
  eventName: string;
  currentPause: NotificationPause | null;
  history: NotificationPauseChange[];
  onPause: (eventId: number, mode: Mode, reason: string, resumeAt: number | null) => void;
  onResume: (eventId: number) => void;
}) {
  const [mode, setMode] = useState<Mode>("snooze");
  const [duration, setDuration] = useState<Duration>("1h");
  const [customUntil, setCustomUntil] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) { setError("Please provide a reason."); return; }
    const now = Date.now();
    let resumeAt: number | null = null;
    if (mode === "snooze") {
      const hours = duration === "1h" ? 1 : duration === "6h" ? 6 : 24;
      resumeAt = duration === "custom" ? new Date(customUntil).getTime() : now + hours * 3600000;
      if (!Number.isFinite(resumeAt) || resumeAt <= now) {
        setError("Choose a future resume time."); return;
      }
    }
    try {
      onPause(eventId, mode, reason.trim(), resumeAt);
      setReason(""); setError(""); setCustomUntil("");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not pause notifications.");
    }
  }

  function resume() {
    try {
      onResume(eventId);
      setError("");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resume notifications.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-[30rem] max-w-[95vw] flex-col">
        <SheetHeader>
          <SheetTitle>Notification settings</SheetTitle>
          <SheetDescription>
            {eventName}. Collision risk analysis and alert history are not affected.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
          {currentPause && (
            <section className="space-y-2 rounded-lg border p-4">
              <h3 className="flex items-center gap-2 font-semibold">
                <BellOff className="size-4 text-amber-500" />
                {currentPause.mode === "mute" ? "Muted" : "Snoozed"}
              </h3>
              <p className="text-sm">Reason: {currentPause.reason}</p>
              <p className="text-xs">Started: {new Date(currentPause.startedAt).toLocaleString()}</p>
              {currentPause.resumeAt !== null && (
                <p className="text-xs">Resumes: {new Date(currentPause.resumeAt).toLocaleString()}</p>
              )}
              <button type="button" onClick={resume}
                className="flex items-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm text-white">
                <BellRing className="size-4" /> Resume notifications
              </button>
            </section>
          )}
          <form onSubmit={save} className="space-y-4">
            <h3 className="font-semibold">Pause notifications</h3>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Notification mode">
              <button type="button" aria-pressed={mode === "mute"} onClick={() => setMode("mute")}
                className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm ${mode === "mute" ? "border-sky-500 bg-sky-500/10" : ""}`}>
                <BellOff className="size-4" /> Mute
              </button>
              <button type="button" aria-pressed={mode === "snooze"} onClick={() => setMode("snooze")}
                className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm ${mode === "snooze" ? "border-sky-500 bg-sky-500/10" : ""}`}>
                <Clock3 className="size-4" /> Snooze
              </button>
            </div>
            {mode === "snooze" && (
              <div className="space-y-2">
                <label htmlFor="pause-duration" className="block text-sm font-medium">Resume after</label>
                <select id="pause-duration" value={duration} onChange={(e) => setDuration(e.target.value as Duration)}
                  className="w-full rounded-md border bg-background p-2 text-sm">
                  <option value="1h">1 hour</option>
                  <option value="6h">6 hours</option>
                  <option value="24h">24 hours</option>
                  <option value="custom">Custom date and time</option>
                </select>
                {duration === "custom" && (
                  <label className="block space-y-1 text-sm">
                    <span>Resume at</span>
                    <input type="datetime-local" required value={customUntil} onChange={(e) => setCustomUntil(e.target.value)}
                      className="w-full rounded-md border bg-background p-2" />
                  </label>
                )}
              </div>
            )}
            <label className="block space-y-1 text-sm">
              <span>Reason (required)</span>
              <textarea required maxLength={500} rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-md border bg-background p-2" placeholder="Why are notifications being paused?" />
            </label>
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            <button type="submit" className="w-full rounded-md bg-sky-700 p-2 text-sm text-white">
              {mode === "mute" ? "Mute notifications" : "Snooze notifications"}
            </button>
          </form>
          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Pause history</h3>
            {history.length === 0 && <p className="text-sm text-muted-foreground">No changes recorded.</p>}
            {history.map((entry) => (
              <article key={entry.id} className="rounded-lg border p-2 text-xs">
                <strong>{entry.action.toUpperCase()}</strong> — {entry.reason}
                <p className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
                {entry.resumeAt !== null && <p>Scheduled resume: {new Date(entry.resumeAt).toLocaleString()}</p>}
              </article>
            ))}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
