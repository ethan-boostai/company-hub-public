"use client";

import { useState } from "react";
import { Modal } from "./overlay";

// In-app "are you sure" step. Never use the browser's confirm().
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<{ ok: boolean; message?: string } | void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await onConfirm();
      if (r && !r.ok) setError(r.message || "That didn't work. Try again.");
      else onClose();
    } catch {
      setError("That didn't work. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { setError(""); onClose(); }} title={title} busy={busy}>
      <div className="p-5">
        <p className="text-lg font-semibold mb-2" aria-hidden="true">{title}</p>
        <p className="text-sm text-muted">{message}</p>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg border border-line hover:bg-paper disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className={`px-4 py-2 rounded-lg text-white font-semibold disabled:opacity-60 ${danger ? "bg-danger" : "bg-brand"}`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
