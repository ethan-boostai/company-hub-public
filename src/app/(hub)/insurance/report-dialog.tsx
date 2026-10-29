"use client";

import { useState } from "react";
import { DocViewer } from "@/components/ui/doc-viewer";
import { Modal } from "@/components/ui/overlay";

// "Create report": the office chooses what goes in, then the PDF opens in-window.
export function ReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [policies, setPolicies] = useState(true);
  const [covers, setCovers] = useState(true);
  const [past, setPast] = useState(false);
  const [claims, setClaims] = useState<"none" | "open" | "all">("open");
  const [amounts, setAmounts] = useState(true);
  const [certs, setCerts] = useState(true);
  const [costs, setCosts] = useState(false);
  const [url, setUrl] = useState("");
  const nothing = !policies && claims === "none" && !certs;

  function create() {
    const p = new URLSearchParams();
    if (policies) p.set("policies", past ? "all" : "current");
    if (policies && covers) p.set("covers", "1");
    p.set("claims", claims);
    if (claims !== "none" && amounts) p.set("amounts", "1");
    if (certs) p.set("certs", "1");
    if (certs && costs) p.set("costs", "1");
    setUrl(`/insurance/report?${p}`);
  }

  const box = "h-4 w-4 accent-brand";
  const check = (label: string, value: boolean, set: (v: boolean) => void, indent = false, disabled = false) => (
    <label className={`flex items-center gap-2 text-sm mb-1 ${indent ? "ml-6" : ""} ${disabled ? "opacity-50" : ""}`}>
      <input type="checkbox" className={box} checked={value} disabled={disabled} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  );
  return (
    <>
      <Modal open={open && !url} onClose={onClose} title="Create report" size="max-w-lg">
        <div className="p-5">
          <p className="text-lg font-semibold mb-3" aria-hidden="true">Create report</p>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">Policies</legend>
            {check("Include policies", policies, setPolicies)}
            {check("List each policy's covers, limits and excesses", covers, setCovers, true, !policies)}
            {check("Include earlier periods", past, setPast, true, !policies)}
          </fieldset>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">Claims</legend>
            {([["open", "Open claims"], ["all", "All claims"], ["none", "Leave claims out"]] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm mb-1">
                <input type="radio" name="claims" className={box} checked={claims === v} onChange={() => setClaims(v)} /> {l}
              </label>
            ))}
            {check("Show amounts claimed, excess and settled", amounts, setAmounts, true, claims === "none")}
          </fieldset>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">Accreditations</legend>
            {check("Include accreditations", certs, setCerts)}
            {check("Show annual costs", costs, setCosts, true, !certs)}
          </fieldset>
          {nothing && <p role="alert" className="text-sm text-danger mb-2">Choose at least one part to include.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-line">Cancel</button>
            <button type="button" onClick={create} disabled={nothing} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">
              Create report
            </button>
          </div>
        </div>
      </Modal>
      <DocViewer
        file={url ? { id: 0, name: "Insurance and accreditations.pdf", mime: "application/pdf", url } : null}
        onClose={() => {
          setUrl("");
          onClose();
        }}
      />
    </>
  );
}
