"use client";

import { useState } from "react";
import { DocViewer } from "@/components/ui/doc-viewer";
import { Modal } from "@/components/ui/overlay";
import { EQUIPMENT_COLUMNS, MATERIAL_COLUMNS } from "./report-options";

// "Create report": the office chooses what goes in, then the PDF opens in-window.
export function ReportDialog({ open, where, whereLabel, onClose }: { open: boolean; where: string; whereLabel: string; onClose: () => void }) {
  const [kit, setKit] = useState(true);
  const [mats, setMats] = useState(true);
  const [here, setHere] = useState(true);
  const [kitCols, setKitCols] = useState<string[]>(EQUIPMENT_COLUMNS.filter((c) => c.default).map((c) => c.key));
  const [matCols, setMatCols] = useState<string[]>(MATERIAL_COLUMNS.filter((c) => c.default).map((c) => c.key));
  const [onlyLow, setOnlyLow] = useState(false);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [retired, setRetired] = useState(false);
  const [url, setUrl] = useState("");
  const flip = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const nothing = !kit && !mats;

  function create() {
    const p = new URLSearchParams();
    p.set("include", [kit && "equipment", mats && "materials"].filter(Boolean).join(","));
    p.set("kit", kitCols.join(","));
    p.set("mat", matCols.join(","));
    if (where && here) p.set("where", where);
    if (onlyLow) p.set("low", "1");
    if (onlyAttention) p.set("attention", "1");
    if (retired) p.set("retired", "1");
    setUrl(`/equipment/report?${p}`);
  }

  const box = "h-4 w-4 accent-brand";
  return (
    <>
      <Modal open={open && !url} onClose={onClose} title="Create report" size="max-w-lg">
        <div className="p-5">
          <p className="text-lg font-semibold mb-3" aria-hidden="true">Create report</p>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">Include</legend>
            <label className="flex items-center gap-2 text-sm mb-1"><input type="checkbox" className={box} checked={kit} onChange={(e) => setKit(e.target.checked)} /> Equipment</label>
            <label className="flex items-center gap-2 text-sm mb-1"><input type="checkbox" className={box} checked={mats} onChange={(e) => setMats(e.target.checked)} /> Materials</label>
            {where && <label className="flex items-center gap-2 text-sm mb-1"><input type="checkbox" className={box} checked={here} onChange={(e) => setHere(e.target.checked)} /> Only {whereLabel}</label>}
            <label className="flex items-center gap-2 text-sm mb-1"><input type="checkbox" className={box} checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} /> Only equipment needing attention (repair, lost, service or PAT due)</label>
            <label className="flex items-center gap-2 text-sm mb-1"><input type="checkbox" className={box} checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Only materials at or below their minimum</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={box} checked={retired} onChange={(e) => setRetired(e.target.checked)} /> Include retired equipment and discontinued materials</label>
          </fieldset>
          {kit && (
            <fieldset className="mb-4">
              <legend className="text-sm font-medium mb-1">Equipment columns</legend>
              <div className="grid grid-cols-2 gap-1">
                {EQUIPMENT_COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm"><input type="checkbox" className={box} checked={kitCols.includes(c.key)} onChange={() => setKitCols((l) => flip(l, c.key))} /> {c.label}</label>
                ))}
              </div>
            </fieldset>
          )}
          {mats && (
            <fieldset className="mb-4">
              <legend className="text-sm font-medium mb-1">Material columns</legend>
              <div className="grid grid-cols-2 gap-1">
                {MATERIAL_COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm"><input type="checkbox" className={box} checked={matCols.includes(c.key)} onChange={() => setMatCols((l) => flip(l, c.key))} /> {c.label}</label>
                ))}
              </div>
            </fieldset>
          )}
          {nothing && <p role="alert" className="text-sm text-danger mb-2">Tick equipment, materials or both.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-line">Cancel</button>
            <button type="button" onClick={create} disabled={nothing} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">Create report</button>
          </div>
        </div>
      </Modal>
      <DocViewer
        file={url ? { id: 0, name: "Equipment and materials.pdf", mime: "application/pdf", url } : null}
        onClose={() => {
          setUrl("");
          onClose();
        }}
      />
    </>
  );
}
