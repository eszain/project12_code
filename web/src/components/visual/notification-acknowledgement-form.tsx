"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NotificationAcknowledgementFormProps {
  alertId: number;
  onAcknowledge: (
    alertId: number,
    acknowledgedBy: string,
    note?: string
  ) => boolean;
}

export function NotificationAcknowledgementForm({
  alertId,
  onAcknowledge,
}: NotificationAcknowledgementFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [operator, setOperator] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  function acknowledge() {
    if (!operator.trim()) {
      setError("Operator name is required.");
      return;
    }

    try {
      onAcknowledge(
        alertId,
        operator.trim(),
        note.trim()
      );

      setError("");
      setExpanded(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not acknowledge notification."
      );
    }
  }

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        onClick={() => setExpanded(true)}
      >
        <Check className="mr-2 size-4" />
        Acknowledge
      </Button>
    );
  }

  return (
    <form
      className="mt-3 space-y-3 border-t pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        acknowledge();
      }}
    >
      <div className="space-y-1">
        <label
          htmlFor={`operator-${alertId}`}
          className="text-xs font-medium"
        >
          Acknowledged by
        </label>

        <Input
          id={`operator-${alertId}`}
          value={operator}
          placeholder="Operator name"
          onChange={(event) =>
            setOperator(event.target.value)
          }
          required
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor={`note-${alertId}`}
          className="text-xs font-medium"
        >
          Note (optional)
        </label>

        <textarea
          id={`note-${alertId}`}
          value={note}
          placeholder="Add a note..."
          onChange={(event) =>
            setNote(event.target.value)
          }
          rows={3}
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => {
            setExpanded(false);
            setError("");
          }}
        >
          Cancel
        </Button>

        <Button
          type="submit"
          size="sm"
          className="flex-1"
          disabled={!operator.trim()}
        >
          Confirm
        </Button>
      </div>
    </form>
  );
}