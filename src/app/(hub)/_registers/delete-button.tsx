"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ActionResult } from "@/lib/action-types";

// "Delete …" at the foot of a register drawer, with the in-app "are you sure" step.
export function DeleteButton({
  label,
  message,
  onDelete,
  onDeleted,
}: {
  label: string;
  message: string;
  onDelete: (requestKey: string) => Promise<ActionResult<unknown>>;
  onDeleted: () => void;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="mt-8 border-t border-line pt-5">
      <button type="button" onClick={() => setAsking(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">
        {label}
      </button>
      <ConfirmDialog
        open={asking}
        title={`${label}?`}
        message={message}
        confirmLabel="Delete"
        onClose={() => setAsking(false)}
        onConfirm={async () => {
          const r = await onDelete(crypto.randomUUID());
          if (r.ok) onDeleted();
          return r;
        }}
      />
    </div>
  );
}
