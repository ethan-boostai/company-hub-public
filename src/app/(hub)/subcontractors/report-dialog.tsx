"use client";

import { useState } from "react";
import { DocViewer } from "@/components/ui/doc-viewer";
import { Modal } from "@/components/ui/overlay";
import { REPORT_COLUMNS } from "./report-options";

// "Create report": the office chooses what goes in, then the PDF opens in-window.
export function ReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [subs, setSubs] = useState(true);
  const [sups, setSups] = useState(true);
  const [cols, setCols] = useState<string[]>(REPORT_COLUMNS.filter((c) => c.default).map((c) => c.key));
  const [docs, setDocs] = useState<"none" | "all" | "due">("all");
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [url, setUrl] = useState("");

  const toggle = (k: string) => setCols((list) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]));
  const nothing = !subs && !sups;

  function create() {
    const p = new URLSearchParams();
    p.set("include", [subs && "subcontractor", sups && "supplier"].filter(Boolean).join(","));
    p.set("cols", cols.join(","));
    p.set("docs", docs);
    if (onlyApproved) p.set("approved", "1");
    setUrl(`/subcontractors/report?${p}`);
  }

  const box = "h-4 w-4 accent-brand";
  return (
    <>
      <Modal open={open && !url} onClose={onClose} title="Create report" size="max-w-lg">
        <div className="p-5">
          <p className="text-lg font-semibold mb-3" aria-hidden="true">Create report</p>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">Include</legend>
            <label className="flex items-center gap-2 text-sm mb-1"><input type="checkbox" className={box} checked={subs} onChange={(e) => setSubs(e.target.checked)} /> Subcontractors</label>
            <label className="flex items-center gap-2 text-sm mb-1"><input type="checkbox" className={box} checked={sups} onChange={(e) => setSups(e.target.checked)} /> Suppliers</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={box} checked={onlyApproved} onChange={(e) => setOnlyApproved(e.target.checked)} /> Only subcontractors approved to work</label>
          </fieldset>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">Columns</legend>
            <div className="grid grid-cols-2 gap-1">
              {REPORT_COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className={box} checked={cols.includes(c.key)} onChange={() => toggle(c.key)} /> {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">Documents</legend>
            {([["all", "List every document"], ["due", "Only expired or expiring documents"], ["none", "Leave documents out"]] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm mb-1">
                <input type="radio" name="docs" className={box} checked={docs === v} onChange={() => setDocs(v)} /> {l}
              </label>
            ))}
          </fieldset>
          {nothing && <p role="alert" className="text-sm text-danger mb-2">Tick subcontractors, suppliers or both.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-line">Cancel</button>
            <button type="button" onClick={create} disabled={nothing} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">
              Create report
            </button>
          </div>
        </div>
      </Modal>
      <DocViewer
        file={url ? { id: 0, name: "Subcontractors and suppliers.pdf", mime: "application/pdf", url } : null}
        onClose={() => {
          setUrl("");
          onClose();
        }}
      />
    </>
  );
}
