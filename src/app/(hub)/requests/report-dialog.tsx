"use client";

import { useState } from "react";
import { DocViewer } from "@/components/ui/doc-viewer";
import { Modal } from "@/components/ui/overlay";
import { REQUEST_REPORT_COLUMNS, REQUEST_REPORT_WHICH } from "./report-options";

// "Create report": the office chooses which requests and which columns; the PDF opens in-window.
export function ReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [which, setWhich] = useState<string>("open");
  const [cols, setCols] = useState<string[]>(REQUEST_REPORT_COLUMNS.filter((c) => c.default).map((c) => c.key));
  const [url, setUrl] = useState("");
  const toggle = (k: string) => setCols((list) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]));
  const box = "h-4 w-4 accent-brand";
  return (
    <>
      <Modal open={open && !url} onClose={onClose} title="Create report" size="max-w-md">
        <div className="p-5">
          <p className="text-lg font-semibold mb-3" aria-hidden="true">Create report</p>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">Requests</legend>
            {REQUEST_REPORT_WHICH.map((w) => (
              <label key={w.value} className="flex items-center gap-2 text-sm mb-1">
                <input type="radio" name="which" className={box} checked={which === w.value} onChange={() => setWhich(w.value)} /> {w.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">Columns</legend>
            {REQUEST_REPORT_COLUMNS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm mb-1">
                <input type="checkbox" className={box} checked={cols.includes(c.key)} onChange={() => toggle(c.key)} /> {c.label}
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-line">Cancel</button>
            <button type="button" onClick={() => setUrl(`/requests/report?which=${which}&cols=${cols.join(",")}`)} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">
              Create report
            </button>
          </div>
        </div>
      </Modal>
      <DocViewer
        file={url ? { id: 0, name: "Team requests.pdf", mime: "application/pdf", url } : null}
        onClose={() => {
          setUrl("");
          onClose();
        }}
      />
    </>
  );
}
