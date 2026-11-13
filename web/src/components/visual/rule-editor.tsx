
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";
import type { AlertRule, RuleChange } from "@/lib/cads/store";

type Draft = {
  name: string;
  pcMin: string;
  missDistanceMaxM: string;
  hoursToTcaMax: string;
  objectIds: string;
};

const blank: Draft = {
  name: "",
  pcMin: "",
  missDistanceMaxM: "",
  hoursToTcaMax: "",
  objectIds: "",
};

const toDraft = (rule: AlertRule): Draft => ({
  name: rule.name,
  pcMin: rule.pcMin?.toString() ?? "",
  missDistanceMaxM: rule.missDistanceMaxM?.toString() ?? "",
  hoursToTcaMax: rule.hoursToTcaMax?.toString() ?? "",
  objectIds: rule.objectIds.join(", "),
});

function parseNumber(value: string, label: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return n;
}

function parseDraft(d: Draft): Omit<AlertRule, "id"> {
  if (!d.name.trim()) throw new Error("Rule name is required");

  const result = {
    name: d.name.trim(),
    pcMin: parseNumber(d.pcMin, "Pc"),
    missDistanceMaxM: parseNumber(d.missDistanceMaxM, "Miss distance"),
    hoursToTcaMax: parseNumber(d.hoursToTcaMax, "Time to TCA"),
    objectIds: [
      ...new Set(
        d.objectIds
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ],
  };

  if (result.pcMin !== null && result.pcMin > 1) {
    throw new Error("Pc must be at most 1");
  }

  if (
    result.pcMin === null &&
    result.missDistanceMaxM === null &&
    result.hoursToTcaMax === null &&
    result.objectIds.length === 0
  ) {
    throw new Error("Set at least one alert condition");
  }

  return result;
}

export function RuleEditor({
  open,
  onOpenChange,
  rules,
  changes,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: AlertRule[];
  changes: RuleChange[];
  onCreate: (input: Omit<AlertRule, "id">) => unknown;
  onUpdate: (id: number, input: Omit<AlertRule, "id">) => unknown;
  onDelete: (id: number) => unknown;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const startNew = () => {
    setEditingId(null);
    setDraft(blank);
    setError("");
    setFormOpen(true);
  };

  const startEdit = (rule: AlertRule) => {
    setEditingId(rule.id);
    setDraft(toDraft(rule));
    setError("");
    setFormOpen(true);
  };

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const input = parseDraft(draft);

      if (editingId === null) {
        onCreate(input);
      } else {
        onUpdate(editingId, input);
      }

      setFormOpen(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = (id: number) => {
    onDelete(id);
    if (editingId === id) setFormOpen(false);
  };

  const field = (
    key: keyof Draft,
    label: string,
    placeholder: string,
  ) => (
    <label className="block space-y-1 text-sm" key={key}>
      <span>{label}</span>
      <Input
        value={draft[key]}
        placeholder={placeholder}
        onChange={(e) =>
          setDraft((old) => ({
            ...old,
            [key]: e.target.value,
          }))
        }
      />
    </label>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-lg overflow-y-auto sm:w-[480px]"
      >
        <SheetHeader>
          <SheetTitle>Alert rules</SheetTitle>
          <SheetDescription>
            Conditions are combined with AND. Editing a rule
            re-evaluates the latest CDM for each event.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <Button type="button" onClick={startNew}>
            Create rule
          </Button>

          <section aria-label="Existing rules" className="space-y-2">
            {rules.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No rules configured.
              </p>
            )}

            {rules.map((rule) => (
              <div
                key={rule.id}
                className="space-y-2 rounded-md border p-3"
              >
                <p className="font-medium">{rule.name}</p>

                <p className="text-xs text-muted-foreground">
                  {[
                    rule.pcMin !== null
                      ? `Pc ≥ ${rule.pcMin}`
                      : null,
                    rule.missDistanceMaxM !== null
                      ? `Miss distance ≤ ${rule.missDistanceMaxM} m`
                      : null,
                    rule.hoursToTcaMax !== null
                      ? `Time to TCA ≤ ${rule.hoursToTcaMax} h`
                      : null,
                    rule.objectIds.length
                      ? `Watch list: ${rule.objectIds.join(", ")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => startEdit(rule)}
                  >
                    Edit
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => remove(rule.id)}
                    aria-label={`Delete ${rule.name}`}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </section>

          {formOpen && (
            <form
              onSubmit={save}
              className="space-y-3 rounded-md border p-3"
              aria-label="Rule form"
            >
              <h3 className="font-semibold">
                {editingId === null ? "New rule" : "Edit rule"}
              </h3>

              {field("name", "Rule name", "Collision warning")}
              {field("pcMin", "Pc at or above", "0.0001")}
              {field(
                "missDistanceMaxM",
                "Miss distance at or below (m)",
                "500",
              )}
              {field(
                "hoursToTcaMax",
                "Time to TCA at or below (hours)",
                "24",
              )}
              {field(
                "objectIds",
                "Watch list object IDs (comma-separated)",
                "12345, 67890",
              )}

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <Button type="submit">Save rule</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          <section
            aria-label="Rule change history"
            className="space-y-2"
          >
            <h3 className="font-semibold">Change history</h3>

            {changes.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No changes yet.
              </p>
            )}

            {changes.map((change) => (
              <div
                key={change.id}
                className="rounded-md border p-2 text-xs"
              >
                <p className="font-medium">
                  {change.action} —{" "}
                  {change.after?.name ?? change.before?.name}
                </p>

                <p className="text-muted-foreground">
                  {new Date(change.at).toLocaleString()}
                </p>

                {change.action === "updated" && (
                  <p>
                    Previous: {JSON.stringify(change.before)}
                    {" → "}
                    New: {JSON.stringify(change.after)}
                  </p>
                )}
              </div>
            ))}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
