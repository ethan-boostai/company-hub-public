"use client";

import { useMemo, useState } from "react";
import { inputClass, TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { SearchBox } from "@/components/ui/search-box";
import { SelectWithAdd } from "@/components/ui/select-with-add";
import { niceDateTime } from "../_registers/dates";
import { Chip, Choice, RecordSelect } from "../_registers/ui";
import { adjustStock, decideStocktake, moveStock, saveStocktake } from "./actions";
import type { MaterialRow, StocktakeRow } from "./data";
import { DeleteRecord, errorsOf, LocationSelect, SmallButton } from "./parts";
import { approvedQty, labelOf, locKey, locLabel, qty, REASON_LIST, STOCKTAKE_STATUSES } from "./rules";
import type { Common } from "./types";

const num = (s: string) => {
  const t = s.replace(/[,\s]/g, "");
  return /^\d{1,9}(\.\d{1,3})?$/.test(t) ? Number(t) : null;
};

/* ---------- Add or remove stock of one material ---------- */

export function AdjustStock({ material: m, data, onSaved }: Common & { material: MaterialRow }) {
  const [open, setOpen] = useState(false);
  if (!open) return <div className="mt-3"><SmallButton onClick={() => setOpen(true)}>Add or remove stock</SmallButton></div>;
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <GuardedForm action={adjustStock} onSaved={(r) => {
        if (r.data) onSaved(r.data, { kind: "material", id: m.id });
        setOpen(false);
      }}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              <input type="hidden" name="material_id" value={m.id} />
              <Choice label="Add or remove" name="direction" defaultValue="add" options={[{ value: "add", label: "Add stock" }, { value: "remove", label: "Remove stock" }]} />
              <div className="grid sm:grid-cols-2 gap-x-4">
                <LocationSelect data={data} name="location" label="Where" defaultValue={m.stock.length === 1 ? locKey(m.stock[0]) : ""} error={err.location} />
                <TextField label={`Quantity (${m.unit})`} name="qty" inputMode="decimal" error={err.qty} spellCheck={false} />
                <SelectWithAdd list={REASON_LIST} name="reason" label="Reason" options={data.reasons} />
                <TextField label="Job number (optional)" name="job_ref" inputMode="numeric" spellCheck={false} />
              </div>
              {err.reason && <p className="-mt-3 mb-3 text-sm text-danger">{err.reason}</p>}
              <TextField label="Note (optional)" name="notes" />
              <div className="flex gap-2">
                <SaveButton>Update stock</SaveButton>
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-line">Cancel</button>
              </div>
            </>
          );
        }}
      </GuardedForm>
    </div>
  );
}

/* ---------- Move stock ---------- */

type MovePick = { t: "m" | "a"; id: number; qty: string };

export function MoveForm({ from: start, data, onSaved }: Common & { from?: string }) {
  const [from, setFrom] = useState(start ?? "");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Record<string, MovePick>>({});
  const q = query.trim().toLowerCase();

  const here = useMemo(() => {
    if (!from) return [];
    const mats = data.materials.filter((m) => m.status === "active").flatMap((m) => {
      const s = m.stock.find((x) => locKey(x).toLowerCase() === from.toLowerCase());
      return s && s.qty > 0 ? [{ key: `m:${m.id}`, t: "m" as const, id: m.id, name: m.name, sub: `${qty(s.qty)} ${m.unit} here`, have: s.qty, unit: m.unit }] : [];
    });
    const kit = data.assets.filter((a) => a.status !== "retired" && locKey(a).toLowerCase() === from.toLowerCase())
      .map((a) => ({ key: `a:${a.id}`, t: "a" as const, id: a.id, name: a.assetTag ? `${a.assetTag} · ${a.name}` : a.name, sub: a.category, have: 0, unit: "" }));
    return [...mats, ...kit];
  }, [data, from]);
  const shown = here.filter((x) => !q || `${x.name} ${x.sub}`.toLowerCase().includes(q));
  const lines = Object.values(picked);
  const moveItems = lines.map((p) => (p.t === "m" ? { t: "m", id: p.id, qty: num(p.qty) ?? -1 } : { t: "a", id: p.id }));
  const nm = lines.filter((p) => p.t === "m").length;
  const toLabel = to ? locLabel(parseKey(to), data.vehicles, data.people) : "";

  return (
    <GuardedForm action={moveStock} onSaved={(r) => r.data && onSaved(r.data, null)}>
      {(state) => {
        const err = errorsOf(state);
        return (
          <>
            <p className="mb-4 text-sm text-muted">Quantities come off the From location and go onto the To location. Every line is logged in the stock history.</p>
            <div className="grid sm:grid-cols-2 gap-x-4">
              <LocationSelect key={`from-${from}`} data={data} name="from" label="From" allowPerson defaultValue={from} error={err.from}
                onChange={(v) => { setFrom(v); setPicked({}); }} />
              <LocationSelect data={data} name="to" label="To" allowPerson defaultValue={to} error={err.to} exclude={from} onChange={setTo} />
            </div>
            <input type="hidden" name="items" value={JSON.stringify(moveItems)} />
            {!from ? (
              <p className="mb-4 text-sm text-muted">Choose where the items are now.</p>
            ) : (
              <>
                <SearchBox value={query} onChange={setQuery} placeholder="Search items here" label="Search items to move" />
                <ul className="mt-3 mb-4 divide-y divide-line border border-line rounded-lg" data-testid="move-items">
                  {shown.map((x) => {
                    const p = picked[x.key];
                    const n = p ? num(p.qty) : null;
                    return (
                      <li key={x.key} className="px-3 py-2 flex flex-wrap items-center gap-2">
                        <input type="checkbox" id={`mv-${x.key}`} className="h-5 w-5 accent-brand" checked={!!p}
                          onChange={(e) => setPicked((s) => {
                            const next = { ...s };
                            if (e.target.checked) next[x.key] = { t: x.t, id: x.id, qty: x.t === "m" ? String(x.have) : "" };
                            else delete next[x.key];
                            return next;
                          })} />
                        <label htmlFor={`mv-${x.key}`} className="min-w-0 flex-1 text-sm">
                          <span className="font-medium">{x.name}</span>
                          {x.sub && <span className="block text-xs text-muted">{x.sub}</span>}
                        </label>
                        <Chip>{x.t === "m" ? "Material" : "Equipment"}</Chip>
                        {p && x.t === "m" && (
                          <span className="flex items-center gap-1 text-sm">
                            <label htmlFor={`qty-${x.key}`}>Qty</label>
                            <input id={`qty-${x.key}`} inputMode="decimal" spellCheck={false} value={p.qty} className={`${inputClass} w-24`}
                              onChange={(e) => setPicked((s) => ({ ...s, [x.key]: { ...p, qty: e.target.value } }))} />
                            {n == null || n <= 0 ? <span className="text-danger">Enter a quantity</span> : n > x.have ? <span className="text-danger">Only {qty(x.have)} here</span> : null}
                          </span>
                        )}
                      </li>
                    );
                  })}
                  {shown.length === 0 && <li className="px-3 py-4 text-sm text-muted">{q ? "Nothing matches the search." : "Nothing at this location."}</li>}
                </ul>
              </>
            )}
            <div className="grid sm:grid-cols-2 gap-x-4">
              <TextField label="Job number (optional)" name="job_ref" inputMode="numeric" spellCheck={false} />
              <TextField label="Note (optional)" name="notes" placeholder="e.g. van swap while it is at the garage" />
            </div>
            <p className="mb-3 text-sm">
              <b>{lines.length} item{lines.length === 1 ? "" : "s"}</b> · {nm} material{nm === 1 ? "" : "s"}, {lines.length - nm} equipment{toLabel ? ` · to ${toLabel}` : ""}
            </p>
            <SaveButton>{`Move ${lines.length} item${lines.length === 1 ? "" : "s"}`}</SaveButton>
          </>
        );
      }}
    </GuardedForm>
  );
}

function parseKey(k: string) {
  if (k.startsWith("p:")) return { place: k.slice(2), vehicleId: null, personId: null };
  if (k.startsWith("v:")) return { place: null, vehicleId: Number(k.slice(2)), personId: null };
  if (k.startsWith("u:")) return { place: null, vehicleId: null, personId: Number(k.slice(2)) };
  return null;
}

/* ---------- Stocktakes ---------- */

export function StocktakeForm({ stocktake, location, data, me, onOpen, onSaved }: Common & { stocktake: StocktakeRow | null; location?: string }) {
  if (stocktake) return <StocktakeView stocktake={stocktake} data={data} onOpen={onOpen} onSaved={onSaved} />;
  return <NewStocktake location={location} data={data} me={me} onSaved={onSaved} />;
}

function NewStocktake({ location, data, me, onSaved }: Pick2 & { location?: string }) {
  const [loc, setLoc] = useState(location?.startsWith("u:") ? "" : location ?? "");
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState("");
  const [counts, setCounts] = useState<Record<number, string>>({});
  const q = query.trim().toLowerCase();
  const list = data.materials.filter((m) => m.status === "active").map((m) => ({
    m, here: m.stock.find((s) => locKey(s).toLowerCase() === loc.toLowerCase())?.qty ?? 0,
  })).filter((x) => all || x.here > 0 || counts[x.m.id] !== undefined);
  const shown = list.filter((x) => !q || `${x.m.name} ${x.m.category}`.toLowerCase().includes(q));
  const entered = Object.entries(counts).filter(([, v]) => v.trim() !== "");
  const bad = entered.some(([, v]) => num(v) == null);
  const payload = entered.flatMap(([id, v]) => (num(v) == null ? [] : [{ materialId: Number(id), counted: num(v)! }]));
  const names = data.people.map((p) => ({ value: p.name, label: p.name }));

  return (
    <GuardedForm action={saveStocktake} onSaved={(r) => r.data && onSaved(r.data, { kind: "stocktake", id: r.data.id })}>
      {(state) => {
        const err = errorsOf(state);
        return (
          <>
            <p className="mb-4 text-sm text-muted">Count what is actually there and type it in. Leave a line blank to skip it. Stock doesn&apos;t change until the office approves the stocktake.</p>
            <div className="grid sm:grid-cols-2 gap-x-4">
              <LocationSelect data={data} name="location" label="Location counted" defaultValue={loc} error={err.location} onChange={(v) => { setLoc(v); setCounts({}); }} />
              <RecordSelect label="Counted by" name="counted_by" options={names} defaultValue={me} error={err.counted_by} />
            </div>
            <input type="hidden" name="counts" value={JSON.stringify(payload)} />
            {loc && (
              <>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <div className="flex-1 min-w-48"><SearchBox value={query} onChange={setQuery} placeholder="Search materials" label="Search materials to count" /></div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-5 w-5 accent-brand" /> Show all materials</label>
                </div>
                <ul className="mb-4 divide-y divide-line border border-line rounded-lg" data-testid="count-lines">
                  {shown.map(({ m, here }) => (
                    <li key={m.id} className="px-3 py-2 flex flex-wrap items-center gap-2">
                      <label htmlFor={`count-${m.id}`} className="min-w-0 flex-1 text-sm">
                        <span className="font-medium">{m.name}</span>
                        <span className="block text-xs text-muted">Hub shows {qty(here)} {m.unit}</span>
                      </label>
                      <input id={`count-${m.id}`} aria-label={`Count of ${m.name}`} inputMode="decimal" spellCheck={false} value={counts[m.id] ?? ""}
                        onChange={(e) => setCounts((c) => ({ ...c, [m.id]: e.target.value }))} className={`${inputClass} w-28`} placeholder={m.unit} />
                    </li>
                  ))}
                  {shown.length === 0 && <li className="px-3 py-4 text-sm text-muted">{q ? "Nothing matches the search." : "No materials here yet. Tick Show all materials to count something found here."}</li>}
                </ul>
              </>
            )}
            <TextArea label="Notes (optional)" name="notes" rows={2} />
            {bad && <p className="mb-3 text-sm text-danger">A count isn&apos;t a number. Fix it before sending.</p>}
            <SaveButton>{`Send ${payload.length} count${payload.length === 1 ? "" : "s"} for approval`}</SaveButton>
          </>
        );
      }}
    </GuardedForm>
  );
}

type Pick2 = Pick<Common, "data" | "me" | "onSaved">;

function StocktakeView({ stocktake: st, data, onSaved }: Pick<Common, "data" | "onOpen" | "onSaved"> & { stocktake: StocktakeRow }) {
  const [apply, setApply] = useState<Record<number, boolean>>(() => Object.fromEntries(st.lines.map((l) => [l.id, true])));
  const loc = st.place ? { place: st.place, vehicleId: null } : st.vehicleId ? { place: null, vehicleId: st.vehicleId } : null;
  const nowAt = (materialId: number) =>
    data.materials.find((m) => m.id === materialId)?.stock.find((s) => loc && locKey(s).toLowerCase() === locKey(loc).toLowerCase())?.qty ?? 0;
  return (
    <div>
      <p className="mb-2 text-sm">
        <b>{st.locationLabel}</b> · counted by {st.countedBy}, {niceDateTime(st.countedAt)}
      </p>
      <p className="mb-4"><Chip tone={st.status === "pending" ? "soon" : st.status === "approved" ? "ok" : "none"}>{labelOf(STOCKTAKE_STATUSES, st.status)}</Chip>
        {st.decidedAt && <span className="ml-2 text-sm text-muted">by {st.decidedBy}, {niceDateTime(st.decidedAt)}</span>}</p>
      {st.notes && <p className="mb-4 text-sm whitespace-pre-line">{st.notes}</p>}

      <GuardedForm action={decideStocktake} onSaved={(r) => r.data && onSaved(r.data, { kind: "stocktake", id: st.id })}>
        <input type="hidden" name="id" value={st.id} />
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm" data-testid="stocktake-lines">
            <thead>
              <tr className="text-left text-muted">
                {st.status === "pending" && <th className="py-1 pr-2">Use</th>}
                <th className="py-1 pr-2">Material</th>
                <th className="py-1 pr-2 text-right">Hub showed</th>
                <th className="py-1 pr-2 text-right">Counted</th>
                <th className="py-1 pr-2 text-right">Difference</th>
                <th className="py-1 text-right">{st.status === "pending" ? "Stock after" : "Set to"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {st.lines.map((l) => {
                const d = Math.round((l.counted - l.expected) * 1000) / 1000;
                const after = st.status === "pending" ? approvedQty(l.counted, l.expected, nowAt(l.materialId)) : l.newQty;
                return (
                  <tr key={l.id} className={st.status !== "pending" && !l.applied ? "text-muted line-through" : ""}>
                    {st.status === "pending" && (
                      <td className="py-1 pr-2">
                        <input type="checkbox" name="apply" value={l.id} aria-label={`Use the count for ${l.name}`} className="h-5 w-5 accent-brand"
                          checked={apply[l.id]} onChange={(e) => setApply((a) => ({ ...a, [l.id]: e.target.checked }))} />
                      </td>
                    )}
                    <td className="py-1 pr-2">{l.name}</td>
                    <td className="py-1 pr-2 text-right">{qty(l.expected)}</td>
                    <td className="py-1 pr-2 text-right">{qty(l.counted)}</td>
                    <td className={`py-1 pr-2 text-right ${d < 0 ? "text-danger" : d > 0 ? "text-ok" : ""}`}>{d > 0 ? "+" : ""}{qty(d)}</td>
                    <td className="py-1 text-right">{after == null ? "" : `${qty(after)} ${l.unit}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {st.status === "pending" ? (
          <>
            <p className="mb-3 text-xs text-muted">Stock after = counted + anything moved in or out since the count. Untick a line to leave that material as it is.</p>
            <Choice label="Decision" name="decision" defaultValue="approve" options={[{ value: "approve", label: "Approve the ticked lines" }, { value: "reject", label: "Reject the whole stocktake" }]} />
            <TextArea label="Note (optional)" name="decision_notes" rows={2} />
            <SaveButton>Save decision</SaveButton>
          </>
        ) : (
          st.decisionNotes && <p className="text-sm whitespace-pre-line">{st.decisionNotes}</p>
        )}
      </GuardedForm>
      <DeleteRecord kind="stocktakes" id={st.id} label="Delete this stocktake" onDeleted={(s) => onSaved(s, null)}
        message={st.status === "approved"
          ? "This deletes the stocktake record. Stock changes it made stay, and stay in the stock history. It cannot be undone."
          : "This deletes the stocktake and its counts. It cannot be undone."} />
    </div>
  );
}
