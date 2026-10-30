"use client";

import { useMemo, useState } from "react";
import { inputClass, TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { SearchBox } from "@/components/ui/search-box";
import { Chip } from "../../../_registers/ui";
import { errorsOf, LocationSelect } from "../../../equipment/parts";
import { qty as fmt } from "../../../equipment/rules";
import type { Sheet } from "../../../_site/load-up";
import { DEFAULT_PPE, PPE } from "../../../_site/load-up-rules";
import { assetWarnings } from "../../../_site/rules";
import { saveLoadUp, type Saved } from "./actions";
import type { LoadUpData, PickAsset } from "./data";

type MatLine = { key: string; materialId: string; qty: string; from: string };
type FreeLine = { key: string; name: string; qty: string; unit: string; buyFrom?: string; buyNote?: string };
let seq = 0;
const k = () => `l${++seq}`;
const btn = "px-3 py-1.5 rounded-lg border border-line bg-white text-sm font-semibold hover:bg-paper disabled:opacity-50";
const del = "px-2 py-1 rounded-md text-sm text-danger hover:bg-red-50";

// Same-name items in a category are one row in the picker, with how many are free.
type Group = { key: string; name: string; category: string; ids: number[]; warn: string[] };

export function SheetForm({ jobId, jobNo, sheet, data, today, meId, onSaved, onDirty }: {
  jobId: number; jobNo: string; sheet: Sheet | null; data: LoadUpData; today: string; meId: number | null;
  onSaved: (s: Saved) => void; onDirty: (dirty: boolean) => void;
}) {
  const lines = sheet?.lines ?? [];
  const [date, setDate] = useState(sheet?.sheetDate ?? today);
  const scheduledOn = (d: string) => new Set(data.schedule.filter((b) => b.from <= d && b.to >= d).map((b) => b.personId));
  const [crew, setCrew] = useState<number[]>(() => sheet?.crewIds ?? [...scheduledOn(today)]);
  const [equip, setEquip] = useState<number[]>(() => lines.filter((l) => l.kind === "equipment" && l.assetId).map((l) => l.assetId!));
  const [customEquip, setCustomEquip] = useState<FreeLine[]>(() => lines.filter((l) => l.kind === "custom_equipment").map((l) => ({ key: k(), name: l.name, qty: l.qty == null ? "" : String(l.qty), unit: "" })));
  const [mats, setMats] = useState<MatLine[]>(() => lines.filter((l) => l.kind === "material" && l.materialId).map((l) => ({ key: k(), materialId: String(l.materialId), qty: l.qty == null ? "" : String(l.qty), from: l.fromKey })));
  const [customMats, setCustomMats] = useState<FreeLine[]>(() => lines.filter((l) => l.kind === "custom_material").map((l) => ({ key: k(), name: l.name, qty: l.qty == null ? "" : String(l.qty), unit: l.unit })));
  const [buys, setBuys] = useState<FreeLine[]>(() => lines.filter((l) => l.kind === "buy").map((l) => ({ key: k(), name: l.name, qty: l.qty == null ? "" : String(l.qty), unit: l.unit, buyFrom: l.buyFrom, buyNote: l.buyNote })));
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const scheduled = scheduledOn(date);
  const dirty = () => onDirty(true);

  // Equipment not lost or retired; items out on another job are shown but can't be added.
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const a of data.assets) {
      if (a.onJobNo && a.onJobNo !== jobNo) continue;
      const key = `${a.category}|${a.name.toLowerCase()}`;
      const g = m.get(key) ?? { key, name: a.name, category: a.category || "No category", ids: [], warn: [] };
      g.ids.push(a.id);
      for (const w of assetWarnings(a, today)) if (!g.warn.includes(w)) g.warn.push(w);
      m.set(key, g);
    }
    return [...m.values()];
  }, [data.assets, jobNo, today]);
  const assetById = useMemo(() => new Map(data.assets.map((a) => [a.id, a])), [data.assets]);
  const outElsewhere = data.assets.filter((a) => a.onJobNo && a.onJobNo !== jobNo);

  function addOne(g: Group) {
    // Prefer items with nothing to sort out, then the rest.
    const free = g.ids.filter((id) => !equip.includes(id));
    const pick = free.find((id) => !assetWarnings(assetById.get(id)!, today).length) ?? free[0];
    if (pick) {
      setEquip((e) => [...e, pick]);
      dirty();
    }
  }
  const q = query.trim().toLowerCase();
  const shownGroups = groups.filter((g) => !q || [g.name, g.category].some((x) => x.toLowerCase().includes(q)) ||
    g.ids.some((id) => assetById.get(id)!.tag.toLowerCase().includes(q)));
  const byCat = new Map<string, Group[]>();
  for (const g of shownGroups) byCat.set(g.category, [...(byCat.get(g.category) ?? []), g]);
  const ramsCats = data.ramsCategories;
  const chosen = equip.map((id) => assetById.get(id)).filter(Boolean) as PickAsset[];

  const payload = JSON.stringify([
    ...equip.map((id) => ({ kind: "equipment", assetId: id })),
    ...customEquip.map((l) => ({ kind: "custom_equipment", name: l.name, qty: l.qty })),
    ...mats.map((l) => ({ kind: "material", materialId: Number(l.materialId) || 0, qty: l.qty, from: l.from, name: data.materials.find((m) => String(m.id) === l.materialId)?.name })),
    ...customMats.map((l) => ({ kind: "custom_material", name: l.name, qty: l.qty, unit: l.unit })),
    ...buys.map((l) => ({ kind: "buy", name: l.name, qty: l.qty, unit: l.unit, buyFrom: l.buyFrom, buyNote: l.buyNote })),
  ]);
  const editFree = (set: React.Dispatch<React.SetStateAction<FreeLine[]>>, key: string, v: Partial<FreeLine>) => {
    set((x) => x.map((l) => (l.key === key ? { ...l, ...v } : l)));
    dirty();
  };

  return (
    <GuardedForm action={saveLoadUp} onSaved={(r) => { if (r.data) { onDirty(false); onSaved(r.data); } }}>
      {(state) => {
        const err = errorsOf(state);
        return (
          <div onChange={dirty}>
            <input type="hidden" name="job_id" value={jobId} />
            {sheet && <input type="hidden" name="id" value={sheet.id} />}
            <input type="hidden" name="lines" value={payload} />
            {crew.map((id) => <input key={id} type="hidden" name="crew_id" value={id} />)}

            <div className="grid sm:grid-cols-2 gap-x-4">
              <TextField label="Date" name="sheet_date" type="date" value={date} required error={err.sheet_date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (!sheet && e.target.value) setCrew([...scheduledOn(e.target.value)]);
                }} />
              <div className="mb-4">
                <label htmlFor="lu-van" className="block text-sm font-medium mb-1">Van</label>
                <select id="lu-van" name="vehicle_id" defaultValue={sheet?.vehicleId ? String(sheet.vehicleId) : ""} className={inputClass} aria-invalid={!!err.vehicle_id}>
                  <option value="">Choose…</option>
                  {data.vans.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
                {err.vehicle_id && <p className="mt-1 text-sm text-danger">{err.vehicle_id}</p>}
              </div>
              <TextField label="Equipment due back to the yard" name="due_back" type="date" defaultValue={sheet?.dueBack ?? ""} error={err.due_back} />
              <div className="mb-4">
                <label htmlFor="lu-prep" className="block text-sm font-medium mb-1">Prepared by</label>
                <select id="lu-prep" name="prepared_by_id" defaultValue={String(sheet ? sheet.preparedById ?? "" : meId ?? "")} className={inputClass}>
                  <option value="">Choose…</option>
                  {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <fieldset className="mb-5">
              <legend className="mb-1 text-sm font-medium">Crew</legend>
              <p className="mb-2 text-xs text-muted">
                {scheduled.size ? "Ticked from the ServiceM8 schedule for this day; change as needed." : "Nobody is on the ServiceM8 schedule for this job on this day."}
              </p>
              <div className="flex flex-wrap gap-2">
                {data.crew.map((p) => (
                  <label key={p.id} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm cursor-pointer ${crew.includes(p.id) ? "border-brand bg-orange-50" : "border-line bg-white"}`}>
                    <input type="checkbox" checked={crew.includes(p.id)} onChange={(e) => setCrew((c) => (e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id)))} />
                    {p.name}{scheduled.has(p.id) ? " (on the schedule)" : ""}
                  </label>
                ))}
                {data.crew.length === 0 && <p className="text-sm text-muted">No one is ticked as crew on People.</p>}
              </div>
            </fieldset>

            {/* Equipment */}
            <section className="mb-5 rounded-xl border border-line p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="mr-auto font-semibold">Equipment ({equip.length + customEquip.length})</h3>
                <button type="button" className={btn} onClick={() => setPicking((x) => !x)}>{picking ? "Done adding" : "Add equipment"}</button>
                <button type="button" className={btn} onClick={() => { setCustomEquip((x) => [...x, { key: k(), name: "", qty: "1", unit: "" }]); dirty(); }}>Add equipment not on the register</button>
              </div>
              {chosen.length === 0 && customEquip.length === 0 && <p className="text-sm text-muted">No equipment on this sheet yet.</p>}
              <ul className="divide-y divide-line" data-testid="sheet-equipment">
                {chosen.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="mr-auto min-w-0">
                      <span className="font-medium">{a.tag ? `${a.tag} ${a.name}` : a.name}</span>
                      <span className="block text-xs text-muted">{a.category} · {a.location}</span>
                    </span>
                    {assetWarnings(a, today).map((w) => <Chip key={w} tone="soon">{w}</Chip>)}
                    <button type="button" className={del} onClick={() => { setEquip((e) => e.filter((x) => x !== a.id)); dirty(); }} aria-label={`Remove ${a.name}`}>Remove</button>
                  </li>
                ))}
                {customEquip.map((l) => (
                  <li key={l.key} className="flex flex-wrap items-center gap-2 py-2">
                    <input value={l.name} onChange={(e) => editFree(setCustomEquip, l.key, { name: e.target.value })} placeholder="Name (not on the register)" spellCheck
                      aria-label="Equipment not on the register" className={`${inputClass} flex-1 min-w-48`} maxLength={200} />
                    <input value={l.qty} onChange={(e) => editFree(setCustomEquip, l.key, { qty: e.target.value })} inputMode="decimal" aria-label="How many" className={`${inputClass} w-20`} />
                    <button type="button" className={del} onClick={() => { setCustomEquip((x) => x.filter((y) => y.key !== l.key)); dirty(); }}>Remove</button>
                  </li>
                ))}
              </ul>
              {chosen.some((a) => assetWarnings(a, today).length) && (
                <p role="status" className="mt-2 rounded-lg border border-orange-200 bg-orange-50 p-2 text-sm text-orange-800">Sort the flagged items out before the job.</p>
              )}

              {ramsCats.length > 0 && (
                <div className="mt-3 rounded-lg bg-paper p-3" data-testid="rams-suggestions">
                  <p className="mb-2 text-sm font-medium">From this job&apos;s RAMS: {ramsCats.join(", ")}</p>
                  {ramsCats.map((c) => {
                    const gs = groups.filter((g) => g.category === c);
                    return (
                      <div key={c} className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                        <span className="w-40 font-semibold">{c}</span>
                        {gs.length === 0 && <span className="text-muted">Nothing free on the register.</span>}
                        {gs.map((g) => {
                          const left = g.ids.filter((id) => !equip.includes(id)).length;
                          return (
                            <button key={g.key} type="button" className={btn} disabled={!left} onClick={() => addOne(g)}>
                              Add {g.name}{left ? "" : " (all added)"}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {picking && (
                <div className="mt-3">
                  <SearchBox value={query} onChange={setQuery} placeholder="Search: name, tag, category" label="Search equipment to add" />
                  <div className="mt-2 max-h-[40vh] overflow-y-auto rounded-xl border border-line" data-testid="equipment-picker">
                    {[...byCat.entries()].map(([cat, gs]) => (
                      <div key={cat}>
                        <p className="bg-paper px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{cat}</p>
                        {gs.map((g) => {
                          const left = g.ids.filter((id) => !equip.includes(id)).length;
                          return (
                            <div key={g.key} className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
                              <span className="mr-auto min-w-0">
                                <span className="font-medium">{g.name}</span>
                                <span className="block text-xs text-muted">{g.ids.length === 1 ? assetById.get(g.ids[0])!.tag || "1 on the register" : `×${g.ids.length} on the register, ${left} not on this sheet`}</span>
                              </span>
                              {g.warn.map((w) => <Chip key={w} tone="soon">{w}</Chip>)}
                              <button type="button" className={btn} disabled={!left} onClick={() => addOne(g)} aria-label={`Add ${g.name}`}>Add</button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {byCat.size === 0 && <p className="p-3 text-sm text-muted">Nothing matches.</p>}
                  </div>
                  {outElsewhere.length > 0 && <p className="mt-1 text-xs text-muted">{outElsewhere.length} item{outElsewhere.length === 1 ? " is" : "s are"} out on other jobs and not shown.</p>}
                </div>
              )}
            </section>

            {/* Materials */}
            <section className="mb-5 rounded-xl border border-line p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="mr-auto font-semibold">Materials ({mats.length + customMats.length})</h3>
                <button type="button" className={btn} onClick={() => { setMats((x) => [...x, { key: k(), materialId: "", qty: "", from: "p:CBS Warehouse" }]); dirty(); }}>Add material</button>
                <button type="button" className={btn} onClick={() => { setCustomMats((x) => [...x, { key: k(), name: "", qty: "", unit: "" }]); dirty(); }}>Add material not from stock</button>
              </div>
              {mats.length === 0 && customMats.length === 0 && <p className="text-sm text-muted">No materials on this sheet yet.</p>}
              {mats.map((l, i) => {
                const m = data.materials.find((x) => String(x.id) === l.materialId);
                const here = m?.stock.find((s) => s.key.toLowerCase() === l.from.toLowerCase())?.qty ?? 0;
                const want = Number(l.qty) || 0;
                const hint = !m ? "" : want > here ? `Only ${fmt(here)} ${m.unit} here (${fmt(want - here)} short). Add an order task with + New task if needed.`
                  : want ? `Leaves ${fmt(here - want)} ${m.unit} here.` : `${fmt(here)} ${m.unit} here.`;
                return (
                  <div key={l.key} className="border-t border-line py-2 first:border-0" data-testid="sheet-material">
                    <div className="grid gap-2 sm:grid-cols-[1fr_6rem_1fr_auto] items-start">
                      <select value={l.materialId} aria-label={`Material ${i + 1}`} className={inputClass}
                        onChange={(e) => {
                          const mm = data.materials.find((x) => String(x.id) === e.target.value);
                          const best = mm?.stock.slice().sort((a, b) => b.qty - a.qty)[0]?.key;
                          setMats((x) => x.map((y) => (y.key === l.key ? { ...y, materialId: e.target.value, from: best ?? y.from } : y)));
                          dirty();
                        }}>
                        <option value="">Choose material…</option>
                        {data.materials.map((mm) => <option key={mm.id} value={mm.id}>{mm.name} ({mm.unit})</option>)}
                      </select>
                      <input value={l.qty} onChange={(e) => { setMats((x) => x.map((y) => (y.key === l.key ? { ...y, qty: e.target.value } : y))); dirty(); }}
                        inputMode="decimal" placeholder="Qty" aria-label={`Quantity ${i + 1}`} className={inputClass} spellCheck={false} />
                      <LocationSelect key={`${l.key}-${l.materialId}`} data={data.locations} name={`from_${l.key}`} label={`From ${i + 1}`} compact defaultValue={l.from}
                        onChange={(v) => { setMats((x) => x.map((y) => (y.key === l.key ? { ...y, from: v } : y))); dirty(); }} />
                      <button type="button" className={del} onClick={() => { setMats((x) => x.filter((y) => y.key !== l.key)); dirty(); }}>Remove</button>
                    </div>
                    {hint && <p className={`mt-1 text-xs ${want > here ? "text-danger" : "text-muted"}`}>{hint}</p>}
                  </div>
                );
              })}
              {customMats.map((l) => (
                <div key={l.key} className="grid gap-2 border-t border-line py-2 sm:grid-cols-[1fr_6rem_6rem_auto]">
                  <input value={l.name} onChange={(e) => editFree(setCustomMats, l.key, { name: e.target.value })} placeholder="Material not from stock (from the yard)" spellCheck
                    aria-label="Material not from stock" className={inputClass} maxLength={200} />
                  <input value={l.qty} onChange={(e) => editFree(setCustomMats, l.key, { qty: e.target.value })} inputMode="decimal" placeholder="Qty" aria-label="Quantity" className={inputClass} />
                  <input value={l.unit} onChange={(e) => editFree(setCustomMats, l.key, { unit: e.target.value })} placeholder="Unit" aria-label="Unit" className={inputClass} maxLength={30} spellCheck />
                  <button type="button" className={del} onClick={() => { setCustomMats((x) => x.filter((y) => y.key !== l.key)); dirty(); }}>Remove</button>
                </div>
              ))}
            </section>

            {/* Buy on the way */}
            <section className="mb-5 rounded-xl border border-line p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="mr-auto font-semibold">Buy on the way ({buys.length})</h3>
                <button type="button" className={btn} onClick={() => { setBuys((x) => [...x, { key: k(), name: "", qty: "", unit: "", buyFrom: "", buyNote: "" }]); dirty(); }}>Add something to buy</button>
              </div>
              {buys.map((l) => (
                <div key={l.key} className="border-t border-line py-2 first:border-0">
                  <div className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem]">
                    <input value={l.name} onChange={(e) => editFree(setBuys, l.key, { name: e.target.value })} placeholder="What to buy" spellCheck aria-label="What to buy" className={inputClass} maxLength={200} />
                    <input value={l.qty} onChange={(e) => editFree(setBuys, l.key, { qty: e.target.value })} inputMode="decimal" placeholder="Qty" aria-label="Quantity to buy" className={inputClass} />
                    <input value={l.unit} onChange={(e) => editFree(setBuys, l.key, { unit: e.target.value })} placeholder="Unit" aria-label="Unit to buy" className={inputClass} maxLength={30} spellCheck />
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input value={l.buyFrom} onChange={(e) => editFree(setBuys, l.key, { buyFrom: e.target.value })} placeholder="Where from (optional)" spellCheck aria-label="Where from" className={inputClass} maxLength={200} />
                    <input value={l.buyNote} onChange={(e) => editFree(setBuys, l.key, { buyNote: e.target.value })} placeholder="Note, e.g. on account (optional)" spellCheck aria-label="Buying note" className={inputClass} maxLength={500} />
                    <button type="button" className={del} onClick={() => { setBuys((x) => x.filter((y) => y.key !== l.key)); dirty(); }}>Remove</button>
                  </div>
                </div>
              ))}
            </section>

            <fieldset className="mb-4">
              <legend className="mb-2 text-sm font-medium">PPE</legend>
              <div className="flex flex-wrap gap-2">
                {PPE.map((p) => (
                  <label key={p} className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-sm cursor-pointer">
                    <input type="checkbox" name="ppe" value={p} defaultChecked={(sheet?.ppe ?? DEFAULT_PPE).includes(p)} />
                    {p}
                  </label>
                ))}
              </div>
            </fieldset>
            <TextArea label="Notes for the crew" name="notes" defaultValue={sheet?.notes} rows={3} error={err.notes} />
            <SaveButton>{sheet ? "Save" : "Create load-up sheet"}</SaveButton>
          </div>
        );
      }}
    </GuardedForm>
  );
}
