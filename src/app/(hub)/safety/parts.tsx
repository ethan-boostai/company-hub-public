"use client";

import { ReportDialog as SharedReportDialog } from "@/components/ui/report-dialog";
import { useId, useState } from "react";
import { inputClass } from "@/components/ui/fields";
import { StatusPill } from "@/components/ui/register";
import { addSupplier } from "./actions";
import type { Pick } from "./data";
import { CONSEQUENCE, GHS, LIKELIHOOD, RATING_TONE, riskRating, type Rating } from "./rules";

export function RatingPill({ rating }: { rating: string | null }) {
  if (!rating) return <StatusPill tone="grey">Not rated</StatusPill>;
  return <StatusPill tone={RATING_TONE[rating as Rating] ?? "grey"}>{rating}</StatusPill>;
}

// Tick boxes for a fixed list (control types, PPE, who's exposed, equipment categories).
export function CheckGroup({ label, name, options, defaultValues, columns = 2 }: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValues: string[];
  columns?: 1 | 2 | 3;
}) {
  const cols = columns === 1 ? "" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <fieldset className="mb-4">
      <legend className="block text-sm font-medium mb-1">{label}</legend>
      {options.length === 0 ? (
        <p className="text-sm text-muted">None set up yet.</p>
      ) : (
        <div className={`grid gap-x-4 gap-y-1 ${cols}`}>
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" name={name} value={o.value} defaultChecked={defaultValues.includes(o.value)} className="h-5 w-5 accent-brand" />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

// Likelihood and consequence (1 to 5), with the rating worked out as you choose.
export function RiskFields({ title, prefix, likelihood, consequence }: { title: string; prefix: string; likelihood: number | null; consequence: number | null }) {
  const [l, setL] = useState(likelihood ?? 0);
  const [c, setC] = useState(consequence ?? 0);
  const id = useId();
  const rating = riskRating(l || null, c || null);
  return (
    <fieldset className="mb-4 rounded-lg border border-line p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-l`} className="block text-sm font-medium mb-1">Likelihood</label>
          <select id={`${id}-l`} name={`${prefix}likelihood`} value={l || ""} onChange={(e) => setL(Number(e.target.value))} className={inputClass}>
            <option value="">Choose…</option>
            {LIKELIHOOD.map((o) => <option key={o.value} value={o.value}>{o.value} {o.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-c`} className="block text-sm font-medium mb-1">Consequence</label>
          <select id={`${id}-c`} name={`${prefix}consequence`} value={c || ""} onChange={(e) => setC(Number(e.target.value))} className={inputClass}>
            <option value="">Choose…</option>
            {CONSEQUENCE.map((o) => <option key={o.value} value={o.value}>{o.value} {o.label}</option>)}
          </select>
        </div>
      </div>
      <p className="mt-2 flex items-center gap-2 text-sm" data-testid={`${prefix || "initial_"}rating`}>
        Rating: <span className="inline-block w-28"><RatingPill rating={rating} /></span>
        {rating && <span className="text-muted">({l} × {c} = {l * c})</span>}
      </p>
    </fieldset>
  );
}

// A GHS hazard pictogram: the red diamond, with a simple symbol inside.
export function GhsIcon({ value, size = 34 }: { value: string; size?: number }) {
  const sym: Record<string, string> = {
    explosive: "M12 7l1.2 3 3-1.2-1.6 2.8 2.8 1.4-3 .8.6 3-2.6-1.8-1.6 2.6-.6-3-3 .2 2.4-2-2.2-2.2 3 .2z",
    flammable: "M12 6c2.5 3 3.6 5 3.6 7.2A3.6 3.6 0 0 1 12 17a3.6 3.6 0 0 1-3.6-3.8c0-1.6.8-2.8 1.8-3.8.2 1.2.8 2 1.6 2.4-.4-2 0-4 .2-5.8z",
    oxidising: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM9 6.5c1 .8 2 1 3 1s2-.2 3-1",
    gas: "M8 9h8a2 2 0 0 1 0 6H8a2 2 0 0 1 0-6z",
    corrosive: "M8 7l2 4M13 7l1 4M7 15h10v2H7z",
    toxic: "M12 7a3.5 3.5 0 0 1 3.5 3.5c0 1.3-.7 2.2-1.5 2.8V15h-4v-1.7c-.8-.6-1.5-1.5-1.5-2.8A3.5 3.5 0 0 1 12 7zM8 17l8-1M8 16l8 1",
    harmful: "M12 7v6M12 15.5v1.5",
    health: "M12 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM9 17l1-5h4l1 5M10.5 13.5l1.5 1.5 1.5-1.5",
    environment: "M7 16c2-3 4-3 6 0s3 0 4-1M9 8v5M8 10h2",
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="shrink-0">
      <path d="M12 1.5L22.5 12 12 22.5 1.5 12z" fill="#fff" stroke="#d1121b" strokeWidth={1.8} strokeLinejoin="round" />
      <path d={sym[value] ?? ""} fill="none" stroke="#1d1d1d" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GhsPicker({ defaultValues }: { defaultValues: string[] }) {
  return (
    <fieldset className="mb-4">
      <legend className="block text-sm font-medium mb-1">Hazard pictograms (GHS)</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {GHS.map((g) => (
          <label key={g.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white p-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10">
            <input type="checkbox" name="ghs" value={g.value} defaultChecked={defaultValues.includes(g.value)} className="h-5 w-5 accent-brand" />
            <GhsIcon value={g.value} size={28} />
            <span>{g.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// A people dropdown (current team). People are added on the Team page, so there's no "Add new".
export function PersonSelect({ label, name, people, defaultValue, error }: { label: string; name: string; people: Pick[]; defaultValue: number | null; error?: string }) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium mb-1">{label}</label>
      <select id={id} name={name} defaultValue={defaultValue ?? ""} aria-invalid={!!error} className={inputClass}>
        <option value="">Choose…</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

const ADD = "__add_new__";

// Supplier dropdown with "+ Add new…": adds a supplier (just its name) to Subcontractors and suppliers.
export function SupplierSelect({ suppliers, defaultValue, error }: { suppliers: Pick[]; defaultValue: number | null; error?: string }) {
  const id = useId();
  const [extra, setExtra] = useState<Pick[]>([]);
  const [value, setValue] = useState(defaultValue ? String(defaultValue) : "");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const list = [...suppliers, ...extra.filter((e) => !suppliers.some((s) => s.id === e.id))];

  async function add() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await addSupplier(draft, crypto.randomUUID());
      if (!r.ok || !r.data) {
        setMsg(r.ok ? "Couldn't add it." : r.message);
        return;
      }
      const s = r.data;
      setExtra((x) => [...x, s]);
      setValue(String(s.id));
      setAdding(false);
      setDraft("");
    } catch {
      setMsg("Couldn't add it. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium mb-1">Supplier</label>
      <select id={id} name="supplier_id" value={value} aria-invalid={!!error} className={inputClass}
        onChange={(e) => (e.target.value === ADD ? setAdding(true) : setValue(e.target.value))}>
        <option value="">Choose…</option>
        {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        <option value={ADD}>+ Add new…</option>
      </select>
      {adding && (
        <div className="mt-2 flex gap-2">
          <input autoFocus spellCheck value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="New supplier" placeholder="New supplier" className={inputClass}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <button type="button" onClick={add} disabled={busy || !draft.trim()} className="px-3 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">{busy ? "Adding…" : "Add"}</button>
          <button type="button" onClick={() => { setAdding(false); setDraft(""); setMsg(""); }} disabled={busy} className="px-3 rounded-lg border border-line">Cancel</button>
        </div>
      )}
      {(error || msg) && <p role="alert" className="mt-1 text-sm text-danger">{error || msg}</p>}
    </div>
  );
}

// Reports ▾ > Create report for Hazards and CoSHH: which records and which columns, in the shared dialog.
export function SafetyReport({ open, onClose, title, fileName, url, whoOptions, columns }: {
  open: boolean;
  onClose: () => void;
  title: string;
  fileName: string;
  url: string; // e.g. /api/safety/hazards/report
  whoOptions: { value: string; label: string }[];
  columns: { key: string; label: string; on?: boolean }[];
}) {
  return (
    <SharedReportDialog
      open={open}
      onClose={onClose}
      id={`safety-${url}`}
      title={title}
      fileName={fileName}
      groups={[
        { key: "which", label: "Include", type: "pick", initial: whoOptions[0]?.value ?? "", options: whoOptions },
        { key: "cols", label: "Columns", type: "ticks", initial: columns.filter((c) => c.on !== false).map((c) => c.key), options: columns.map((c) => ({ value: c.key, label: c.label })) },
      ]}
      url={(h) => `${url}?which=${encodeURIComponent(h.pick("which"))}&cols=${h.ticked("cols").join(",")}`}
    />
  );
}
