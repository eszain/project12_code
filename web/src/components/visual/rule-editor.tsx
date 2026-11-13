
"use client";

import { useState } from "react";
import {
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type {
  AlertRule,
  RuleChange,
} from "@/lib/cads/store";

type RuleInput = Omit<AlertRule, "id">;

const emptyRule = (): RuleInput => ({
  name: "",
  pcMin: null,
  missDistanceMaxM: null,
  hoursToTcaMax: null,
  objectIds: [],
});

export function RuleEditor({
  open,
  onOpenChange,
  rules,
  history,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: AlertRule[];
  history: RuleChange[];
  onCreate: (rule: RuleInput) => void;
  onUpdate: (id: number, rule: RuleInput) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState<
    number | null
  >(null);

  const [form, setForm] = useState<
    RuleInput | null
  >(null);

  const [error, setError] = useState("");
  const [watchText, setWatchText] = useState("");

  function edit(rule?: AlertRule) {
    setEditing(rule?.id ?? null);

    setForm(
      rule
        ? {
            name: rule.name,
            pcMin: rule.pcMin,
            missDistanceMaxM: rule.missDistanceMaxM,
            hoursToTcaMax: rule.hoursToTcaMax,
            objectIds: [...rule.objectIds],
          }
        : emptyRule()
    );

    setWatchText(
      rule?.objectIds.join(", ") ?? ""
    );

    setError("");
  }

  function save(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!form) return;

    const input = {
      ...form,
      objectIds: [
        ...new Set(
          watchText
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        ),
      ],
    };

    try {
      if (editing === null) {
        onCreate(input);
      } else {
        onUpdate(editing, input);
      }

      setForm(null);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save rule."
      );
    }
  }

  function numberField(
    label: string,
    field:
      | "pcMin"
      | "missDistanceMaxM"
      | "hoursToTcaMax",
    placeholder: string
  ) {
    if (!form) return null;

    return (
      <label className="block space-y-1 text-sm">
        <span>{label}</span>

        <Input
          type="number"
          min="0"
          max={
            field === "pcMin"
              ? "1"
              : undefined
          }
          step="any"
          aria-label={label}
          placeholder={placeholder}
          value={form[field] ?? ""}
          onChange={(event) =>
            setForm({
              ...form,
              [field]:
                event.target.value.trim() === ""
                  ? null
                  : Number(event.target.value),
            })
          }
        />
      </label>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);

        if (!value) {
          setForm(null);
        }
      }}
    >
      <SheetContent
        side="left"
        className="!w-[32rem] max-w-[95vw]"
      >
        <SheetHeader>
          <SheetTitle>Alert rules</SheetTitle>

          <SheetDescription>
            Configure limits for source CDMs.
            All conditions in one rule must match.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          {form ? (
            <form
              onSubmit={save}
              className="space-y-4"
            >
              <h3 className="font-semibold">
                {editing === null
                  ? "Create rule"
                  : "Edit rule"}
              </h3>

              <label className="block space-y-1 text-sm">
                <span>Rule name</span>

                <Input
                  aria-label="Rule name"
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                    })
                  }
                />
              </label>

              {numberField(
                "Minimum Pc",
                "pcMin",
                "0.0001"
              )}

              {numberField(
                "Maximum miss distance (m)",
                "missDistanceMaxM",
                "500"
              )}

              {numberField(
                "Maximum time to TCA (hours)",
                "hoursToTcaMax",
                "24"
              )}

              <label className="block space-y-1 text-sm">
                <span>
                  Watch list (object designators,
                  comma-separated)
                </span>

                <Input
                  aria-label="Watch list"
                  value={watchText}
                  onChange={(event) =>
                    setWatchText(
                      event.target.value
                    )
                  }
                />
              </label>

              {error && (
                <p
                  role="alert"
                  className="text-sm text-red-500"
                >
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <Button type="submit">
                  Save rule
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setForm(null)
                  }
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <Button
                type="button"
                onClick={() => edit()}
              >
                <Plus className="size-4" />
                Create rule
              </Button>

              <section
                className="space-y-2"
                aria-label="Existing rules"
              >
                {rules.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No rules configured.
                  </p>
                )}

                {rules.map((rule) => (
                  <article
                    key={rule.id}
                    className="flex items-start justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold">
                        {rule.name}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {[
                          rule.pcMin !== null
                            ? `Pc ≥ ${rule.pcMin}`
                            : null,
                          rule.missDistanceMaxM !== null
                            ? `Miss distance ≤ ${rule.missDistanceMaxM} m`
                            : null,
                          rule.hoursToTcaMax !== null
                            ? `TCA ≤ ${rule.hoursToTcaMax} h`
                            : null,
                          rule.objectIds.length
                            ? `Watch: ${rule.objectIds.join(", ")}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${rule.name}`}
                        onClick={() =>
                          edit(rule)
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>

                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${rule.name}`}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${rule.name}?`
                            )
                          ) {
                            onDelete(rule.id);
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </article>
                ))}
              </section>

              <section
                className="space-y-2 border-t pt-4"
                aria-label="Rule change history"
              >
                <h3 className="text-sm font-semibold">
                  Change history
                </h3>

                {history.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No changes yet.
                  </p>
                )}

                {history.map((change) => (
                  <div
                    key={change.id}
                    className="rounded-lg border p-2 text-xs"
                  >
                    <strong>
                      {change.action.toUpperCase()}
                    </strong>
                    {" — "}
                    {change.ruleName}

                    <p className="text-muted-foreground">
                      {new Date(
                        change.createdAt
                      ).toLocaleString()}
                    </p>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
