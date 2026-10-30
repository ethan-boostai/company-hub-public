"use client";

import { useEffect, useId, useState } from "react";
import { addSelectOption } from "@/app/actions/select-options";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { inputClass } from "@/components/ui/fields";
import { niceDateTime } from "../_registers/dates";
import { vehicleLocationLabel } from "../fleet/rules";
import { deleteEquipmentRecord, listMoves, type Saved } from "./actions";
import type { EquipmentData, MoveRow } from "./data";
import { locKey, PLACE_LIST, qty } from "./rules";

const ADD = "__add_place__";

// What a location dropdown needs (the job pages pass just these).
export type LocationData = Pick<EquipmentData, "places" | "vehicles" | "people">;

// Where something is: a place, a vehicle that holds stock, or (equipment only) a person.
// Places are a dropdown list the office can add to; vehicles and people come from their registers.
export function LocationSelect({
  data, name, label, defaultValue = "", allowPerson = false, allowNone = false, noneLabel = "No location", error, onChange, exclude, compact = false,
  showPlaces = true,
}: {
  data: LocationData;
  showPlaces?: boolean; // false: vehicles and people only (who has it)
  name: string;
  label: string;
  defaultValue?: string;
  allowPerson?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  error?: string;
  onChange?: (key: string) => void;
  exclude?: string;
  compact?: boolean; // in a filter row: the label is read out but not shown
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [added, setAdded] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const places = [...data.places];
  for (const p of added) if (!places.some((x) => x.toLowerCase() === p.toLowerCase())) places.push(p);
  // Vehicles that hold stock, plus the current one even if it no longer does.
  const vehicles = data.vehicles.filter((v) => v.holdsStock || locKey({ place: null, vehicleId: v.id }) === defaultValue);
  const set = (v: string) => {
    setValue(v);
    onChange?.(v);
  };

  async function add() {
    if (busy) return;
    setBusy(true);
    setAddError("");
    try {
      const r = await addSelectOption(PLACE_LIST, draft, crypto.randomUUID());
      if (!r.ok) return setAddError(r.message);
      const v = r.data ?? draft.trim();
      setAdded((a) => [...a, v]);
      set(`p:${v}`);
      setAdding(false);
      setDraft("");
    } catch {
      setAddError("Couldn't add it. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "min-w-56" : "mb-4"}>
      <label htmlFor={id} className={compact ? "sr-only" : "block text-sm font-medium mb-1"}>{label}</label>
      <select id={id} name={name} value={value} aria-invalid={!!error} className={inputClass}
        onChange={(e) => (e.target.value === ADD ? setAdding(true) : set(e.target.value))}>
        <option value="">{allowNone ? noneLabel : "Choose…"}</option>
        {showPlaces && (
          <optgroup label="Places">
            {places.map((p) => `p:${p}` !== exclude && <option key={p} value={`p:${p}`}>{p}</option>)}
            <option value={ADD}>+ Add a new place…</option>
          </optgroup>
        )}
        {vehicles.length > 0 && (
          <optgroup label="Vehicles">
            {vehicles.map((v) => `v:${v.id}` !== exclude && <option key={v.id} value={`v:${v.id}`}>{vehicleLocationLabel(v)}</option>)}
          </optgroup>
        )}
        {allowPerson && (
          <optgroup label="With a person">
            {data.people.map((p) => `u:${p.id}` !== exclude && <option key={p.id} value={`u:${p.id}`}>With {p.name}</option>)}
          </optgroup>
        )}
      </select>
      {adding && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input aria-label="New place" spellCheck value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className={`${inputClass} flex-1 min-w-40`} placeholder="e.g. Site container" />
          <button type="button" disabled={busy || !draft.trim()} onClick={add} className="px-3 py-2 rounded-lg bg-dark text-white font-semibold disabled:opacity-50">
            {busy ? "Adding…" : "Add place"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 rounded-lg border border-line">Cancel</button>
          {addError && <p role="alert" className="w-full text-sm text-danger">{addError}</p>}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

import { MiniList, Section, SmallButton } from "../_registers/ui";

export { MiniList, Section, SmallButton };

// The stock history of one material or piece of equipment, newest first.
export function History({ kind, id, unit = "" }: { kind: "material" | "asset"; id: number; unit?: string }) {
  const [rows, setRows] = useState<MoveRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    listMoves(kind, id)
      .then((r) => live && (r.ok ? setRows(r.data ?? []) : setError(r.message)))
      .catch(() => live && setError("Couldn't load the history. Refresh to try again."));
    return () => {
      live = false;
    };
  }, [kind, id]);
  return (
    <Section title={kind === "material" ? "Stock history" : "Where it has been"}>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!rows && !error && <p className="text-sm text-muted">Loading…</p>}
      {rows && (
        <MiniList empty="Nothing yet." items={rows.map((m) => ({
          key: m.id,
          title: kind === "material" && m.change != null
            ? `${m.change > 0 ? "+" : ""}${qty(m.change)} ${unit} · ${m.locationLabel} (now ${qty(m.qtyAfter ?? 0)})`
            : m.reason,
          sub: [niceDateTime(m.at), m.by, kind === "material" ? m.reason : "", m.jobRef ? `Job ${m.jobRef}` : "", m.notes].filter(Boolean).join(" · "),
        }))} />
      )}
    </Section>
  );
}

// "Delete …" with the in-app "are you sure" step.
export function DeleteRecord({
  label, message, kind, id, onDeleted,
}: {
  label: string;
  message: string;
  kind: Parameters<typeof deleteEquipmentRecord>[0];
  id: number;
  onDeleted: (s: Saved) => void;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="mt-8 border-t border-line pt-5">
      <button type="button" onClick={() => setAsking(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">{label}</button>
      <ConfirmDialog
        open={asking}
        title={`${label}?`}
        message={message}
        confirmLabel="Delete"
        onClose={() => setAsking(false)}
        onConfirm={async () => {
          const r = await deleteEquipmentRecord(kind, id, crypto.randomUUID());
          if (r.ok && r.data) onDeleted(r.data);
          return r;
        }}
      />
    </div>
  );
}

export const errorsOf = (state: { ok: boolean; fieldErrors?: Record<string, string> } | null) =>
  (state && !state.ok ? state.fieldErrors ?? {} : {}) as Record<string, string>;
