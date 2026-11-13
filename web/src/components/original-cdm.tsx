"use client";

import { useState } from "react";

/** Read-only view of the field map the parser stored. Nothing here is reformatted. */
export function OriginalCdm({ raw }: { raw: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="rounded-md border px-3 py-2 text-sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        View original CDM
      </button>
      {open && (
        <pre
          aria-label="Original CDM fields"
          className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs"
        >
          {JSON.stringify(raw, null, 2)}
        </pre>
      )}
    </div>
  );
}
