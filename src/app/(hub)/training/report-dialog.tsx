"use client";

import { useState } from "react";
import { DocViewer } from "@/components/ui/doc-viewer";
import { Modal } from "@/components/ui/overlay";
import type { PeopleChoice, TicketChoice } from "./rules";

export type MatrixChoice = { people: PeopleChoice; tickets: TicketChoice; chosen: string[] };

// "Create report": the training matrix as a landscape house PDF. Starts from what the matrix shows.
export function ReportDialog({ open, onClose, matrix, standardCount }: { open: boolean; onClose: () => void; matrix: MatrixChoice; standardCount: number }) {
  return open ? <Dialog onClose={onClose} matrix={matrix} standardCount={standardCount} /> : null;
}

function Dialog({ onClose, matrix, standardCount }: { onClose: () => void; matrix: MatrixChoice; standardCount: number }) {
  const [people, setPeople] = useState<PeopleChoice>(matrix.people);
  const [tickets, setTickets] = useState<TicketChoice>(matrix.tickets === "chosen" && matrix.chosen.length === 0 ? "on_file" : matrix.tickets);
  const [dates, setDates] = useState(true);
  const [empty, setEmpty] = useState(true);
  const [certs, setCerts] = useState(true);
  const [url, setUrl] = useState("");

  function create() {
    const p = new URLSearchParams();
    p.set("people", people);
    p.set("tickets", tickets);
    if (tickets === "chosen") for (const t of matrix.chosen) p.append("t", t);
    if (dates) p.set("dates", "1");
    if (empty) p.set("empty", "1");
    if (certs) p.set("certs", "1");
    setUrl(`/training/report?${p}`);
  }

  const box = "h-4 w-4 accent-brand";
  const radio = <T extends string>(name: string, value: T, current: T, set: (v: T) => void, label: string, disabled = false) => (
    <label className={`flex items-center gap-2 text-sm mb-1 ${disabled ? "opacity-50" : ""}`}>
      <input type="radio" name={name} className={box} checked={current === value} disabled={disabled} onChange={() => set(value)} /> {label}
    </label>
  );
  return (
    <>
      <Modal open={!url} onClose={onClose} title="Create report" size="max-w-lg">
        <div className="p-5">
          <p className="text-lg font-semibold mb-1" aria-hidden="true">Create report</p>
          <p className="text-sm text-muted mb-3">Training matrix, A4 landscape.</p>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">People</legend>
            {radio("people", "active", people, setPeople, "Everyone active")}
            {radio("people", "crew", people, setPeople, "Crew list only (ticked on People)")}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={box} checked={empty} onChange={(e) => setEmpty(e.target.checked)} /> Include people with no tickets</label>
          </fieldset>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">Tickets</legend>
            {radio("tickets", "on_file", tickets, setTickets, "Tickets on file")}
            {radio("tickets", "standard", tickets, setTickets, `All standard tickets (${standardCount})`)}
            {radio("tickets", "chosen", tickets, setTickets, `The tickets chosen on the matrix (${matrix.chosen.length})`, matrix.chosen.length === 0)}
          </fieldset>
          <fieldset className="mb-4">
            <legend className="text-sm font-medium mb-1">Also</legend>
            <label className="flex items-center gap-2 text-sm mb-1"><input type="checkbox" className={box} checked={dates} onChange={(e) => setDates(e.target.checked)} /> Show expiry dates</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={box} checked={certs} onChange={(e) => setCerts(e.target.checked)} /> Add the company accreditations</label>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-line">Cancel</button>
            <button type="button" onClick={create} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">Create report</button>
          </div>
        </div>
      </Modal>
      <DocViewer file={url ? { id: 0, name: "Training matrix.pdf", mime: "application/pdf", url } : null} onClose={onClose} />
    </>
  );
}
