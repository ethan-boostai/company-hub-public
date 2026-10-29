"use client";

import { useMemo, useState, type ReactNode } from "react";
import { inputClass } from "@/components/ui/fields";
import { StatusPill } from "@/components/ui/register";
import type { ActionResult } from "@/lib/action-types";
import {
  CLOSE_STEPS, fromLibrary, newId, OPEN_STEPS, PERMIT_LIST, PPE_LIST, STANDARD_KEYS, STANDARD_LABELS,
  type RamsContent, type RegisterHazard, type Step,
} from "@/lib/rams/content";
import type { BuilderLists } from "@/lib/rams/data";
import { riskRating } from "@/app/(hub)/safety/rules";

export type EditorValue = { title: string; preparedById: number | null; approvedById: number | null; approverRole: string; dated: string | null; notes: string; content: RamsContent };

const CODES = [["E", "Eliminate"], ["S", "Substitute"], ["I", "Isolate"], ["G", "Engineering"], ["A", "Administrative"], ["P", "PPE"]] as const;
const TONE = { Low: "green", Medium: "amber", High: "red", Extreme: "red" } as const;

function Rating({ l, c }: { l: number; c: number }) {
  const r = riskRating(l, c);
  return r ? <StatusPill tone={TONE[r]}>{`${l}×${c} ${r}`}</StatusPill> : null;
}

function Card({ n, title, children, open = false }: { n: string; title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="mb-3 rounded-xl border border-line bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 font-semibold">{n}. {title}</summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}

const Text = ({ value, onChange, rows = 0, label }: { value: string; onChange: (v: string) => void; rows?: number; label: string }) =>
  rows ? (
    <Field label={label}><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} spellCheck className={inputClass} /></Field>
  ) : (
    <Field label={label}><input value={value} onChange={(e) => onChange(e.target.value)} spellCheck className={inputClass} /></Field>
  );

function Scale({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm">
        {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </label>
  );
}

function CodePicks({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {CODES.map(([k, name]) => {
        const on = value.includes(k);
        return (
          <button key={k} type="button" title={name} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
            className={`h-8 min-w-8 rounded-md border px-2 text-sm font-semibold ${on ? "border-brand bg-brand text-white" : "border-line bg-white"}`}>
            {k}<span className="sr-only"> {name}</span>
          </button>
        );
      })}
    </div>
  );
}

function RiskRow<T extends { il: number; ic: number; rl: number; rc: number }>({ v, set, prefix }: { v: T; set: (p: Partial<T>) => void; prefix: string }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Scale label={`${prefix} likelihood`} value={v.il} onChange={(il) => set({ il } as Partial<T>)} />
      <Scale label={`${prefix} consequence`} value={v.ic} onChange={(ic) => set({ ic } as Partial<T>)} />
      <span className="pb-1"><Rating l={v.il} c={v.ic} /></span>
      <Scale label={`${prefix} after: likelihood`} value={v.rl} onChange={(rl) => set({ rl } as Partial<T>)} />
      <Scale label={`${prefix} after: consequence`} value={v.rc} onChange={(rc) => set({ rc } as Partial<T>)} />
      <span className="pb-1"><Rating l={v.rl} c={v.rc} /></span>
    </div>
  );
}

// The RAMS builder (the old builder's sections). `mode="template"` edits a job type: no people,
// dates or sign-off. Nothing here saves by itself; onSave gets the whole value.
export function RamsEditor({
  initial,
  lists,
  mode = "rams",
  onSave,
  onAddToLibrary,
  readOnly = false,
  extra,
}: {
  initial: EditorValue;
  lists: BuilderLists;
  mode?: "rams" | "template";
  onSave: (v: EditorValue) => Promise<ActionResult<unknown>>;
  onAddToLibrary?: (h: RegisterHazard) => Promise<ActionResult<{ ramsKey: string }>>;
  readOnly?: boolean;
  // More buttons in the save bar (e.g. Issue), given the current value and whether it's saved.
  extra?: (v: EditorValue, saved: boolean, saving: boolean) => ReactNode;
}) {
  const [v, setV] = useState<EditorValue>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [libQuery, setLibQuery] = useState("");
  const [newHaz, setNewHaz] = useState<(RegisterHazard & { toLibrary: boolean }) | null>(null);
  const c = v.content;

  const set = (p: Partial<EditorValue>) => { setV((x) => ({ ...x, ...p })); setDirty(true); setMsg(null); };
  const setC = (p: Partial<RamsContent>) => set({ content: { ...v.content, ...p } });
  const setStep = (id: string, p: Partial<Step>) => setC({ steps: c.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const moveStep = (id: string, d: -1 | 1) => {
    const i = c.steps.findIndex((s) => s.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= c.steps.length) return;
    const steps = [...c.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setC({ steps });
  };
  const setHaz = (i: number, p: Partial<RegisterHazard>) => setC({ register: c.register.map((h, k) => (k === i ? { ...h, ...p } : h)) });
  const inRegister = new Set(c.register.map((h) => h.key).filter(Boolean));
  const suggested = useMemo(() => {
    const cats = new Set(c.plantCategories);
    return lists.hazards.filter((h) => !inRegister.has(h.ramsKey) && h.plantCategories.some((p) => cats.has(p)));
  }, [c.plantCategories, lists.hazards, c.register]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = libQuery.trim().toLowerCase();
  const libMatches = q ? lists.hazards.filter((h) => !inRegister.has(h.ramsKey) && h.hazard.toLowerCase().includes(q)).slice(0, 12) : [];

  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await onSave(v);
      setMsg({ ok: r.ok, text: r.ok ? r.message || "Saved." : r.message });
      if (r.ok) setDirty(false);
    } catch {
      setMsg({ ok: false, text: "It wasn't saved. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function addNewHazard() {
    if (!newHaz || !newHaz.name.trim() || busy) return;
    let key = "";
    if (newHaz.toLibrary && onAddToLibrary) {
      setBusy(true);
      try {
        const r = await onAddToLibrary(newHaz);
        if (!r.ok) { setMsg({ ok: false, text: r.message }); return; }
        key = r.data?.ramsKey ?? "";
        setMsg({ ok: true, text: r.message || "Added to the hazards library." });
      } catch {
        setMsg({ ok: false, text: "It wasn't added to the library. Check the connection and try again." });
        return;
      } finally {
        setBusy(false);
      }
    }
    const { toLibrary: _t, ...h } = newHaz;
    void _t;
    setC({ register: [...c.register, { ...h, key }] });
    setNewHaz(null);
  }

  const people = (
    <>
      <option value="">Choose…</option>
      {lists.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </>
  );

  const allGroups: { g: Step["group"]; label: string }[] = [{ g: "open", label: "Opening steps" }, { g: "task", label: "The task" }, { g: "close", label: "Closing steps" }];
  const groups = mode === "template" ? allGroups.filter((x) => x.g === "task") : allGroups;

  return (
    <fieldset disabled={readOnly} className="min-w-0">
      <Card n="1" title="General details" open>
        <Text label={mode === "template" ? "Activity (job type)" : "Activity"} value={v.title} onChange={(title) => set({ title })} />
        <Text label="Task (short)" value={c.meta.taskShort} onChange={(taskShort) => setC({ meta: { ...c.meta, taskShort } })} />
        {mode === "rams" && (
          <>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Text label="Site" value={c.meta.site} onChange={(site) => setC({ meta: { ...c.meta, site } })} />
              <Text label="Client" value={c.meta.client} onChange={(client) => setC({ meta: { ...c.meta, client } })} />
              <Text label="Client contact" value={c.meta.clientContact} onChange={(clientContact) => setC({ meta: { ...c.meta, clientContact } })} />
              <Text label="Supervisor" value={c.meta.supervisor} onChange={(supervisor) => setC({ meta: { ...c.meta, supervisor } })} />
              <Text label="Start date" value={c.meta.startDate} onChange={(startDate) => setC({ meta: { ...c.meta, startDate } })} />
              <Text label="Duration" value={c.meta.duration} onChange={(duration) => setC({ meta: { ...c.meta, duration } })} />
              <Text label="Responsible person" value={c.meta.responsible} onChange={(responsible) => setC({ meta: { ...c.meta, responsible } })} />
              <Field label="Dated"><input type="date" value={v.dated ?? ""} onChange={(e) => set({ dated: e.target.value || null })} className={inputClass} /></Field>
            </div>
          </>
        )}
      </Card>

      <Card n="2" title="Description of works" open>
        <Text label="Description of works" rows={5} value={c.scope} onChange={(scope) => setC({ scope })} />
      </Card>

      {mode === "rams" && <Card n="3" title="Risk rating">
        <p className="text-sm">Risk = likelihood × consequence (1 to 5 each): 1–4 Low, 5–9 Medium, 10–19 High, 20–25 Extreme. Each step and hazard is rated before and after its controls.</p>
      </Card>}

      <Card n="4" title={`Method statement (${c.steps.length} steps)`} open>
        {groups.map(({ g, label }) => (
          <div key={g} className="mb-4">
            <h4 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">{label}</h4>
            {c.steps.filter((s) => s.group === g).map((s) => {
              const i = c.steps.findIndex((x) => x.id === s.id) + 1;
              return (
                <div key={s.id} className="mb-3 rounded-lg border border-line p-3" aria-label={`Step ${i}`} role="group">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-semibold">Step {i}</span>
                    <span className="flex-1" />
                    <button type="button" aria-label={`Move step ${i} up`} onClick={() => moveStep(s.id, -1)} className="rounded border border-line px-2">↑</button>
                    <button type="button" aria-label={`Move step ${i} down`} onClick={() => moveStep(s.id, 1)} className="rounded border border-line px-2">↓</button>
                    <button type="button" aria-label={`Remove step ${i}`} onClick={() => setC({ steps: c.steps.filter((x) => x.id !== s.id) })} className="rounded border border-line px-2">×</button>
                  </div>
                  <Text label="Task" rows={2} value={s.task} onChange={(task) => setStep(s.id, { task })} />
                  <Text label="Hazards" rows={2} value={s.hazards} onChange={(hazards) => setStep(s.id, { hazards })} />
                  <Text label="Controls" rows={3} value={s.controls} onChange={(controls) => setStep(s.id, { controls })} />
                  <RiskRow v={s} set={(p) => setStep(s.id, p)} prefix={`Step ${i}`} />
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <Text label="Who" value={s.who} onChange={(who) => setStep(s.id, { who })} />
                    <div><span className="block text-sm font-medium mb-1">Control types</span><CodePicks label={`Step ${i} control types`} value={s.codes} onChange={(codes) => setStep(s.id, { codes })} /></div>
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={() => {
              const blank: Step = { id: newId(), group: g, task: "", hazards: "", controls: "", il: 3, ic: 3, rl: 1, rc: 2, who: "", codes: [] };
              const last = c.steps.map((x) => x.group).lastIndexOf(g);
              const steps = [...c.steps];
              steps.splice(last >= 0 ? last + 1 : g === "open" ? 0 : g === "task" ? steps.filter((x) => x.group === "open").length : steps.length, 0, blank);
              setC({ steps });
            }} className="px-3 py-1.5 rounded-lg border border-dark text-sm font-semibold">Add step ({label.toLowerCase()})</button>
          </div>
        ))}
        {mode === "template" && <p className="mb-2 text-sm text-muted">The standard opening and closing steps are added to every RAMS made from this job type.</p>}
        {mode === "rams" && !c.steps.some((s) => s.group === "open") && (
          <button type="button" onClick={() => setC({ steps: [...OPEN_STEPS.map((s) => ({ ...s, id: newId(), group: "open" as const })), ...c.steps] })} className="mr-2 text-sm underline">Add the standard opening steps</button>
        )}
        {mode === "rams" && !c.steps.some((s) => s.group === "close") && (
          <button type="button" onClick={() => setC({ steps: [...c.steps, ...CLOSE_STEPS.map((s) => ({ ...s, id: newId(), group: "close" as const }))] })} className="text-sm underline">Add the standard closing steps</button>
        )}
      </Card>

      <Card n="5" title={`Hazard register (${c.register.length})`} open>
        {c.register.map((h, i) => (
          <div key={`${h.key}-${i}`} className="mb-3 rounded-lg border border-line p-3" role="group" aria-label={`Hazard ${h.name}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex-1 font-semibold">{h.name}</span>
              {!h.key && <span className="text-xs text-muted">Not in the library</span>}
              <button type="button" aria-label={`Remove hazard ${h.name}`} onClick={() => setC({ register: c.register.filter((_, k) => k !== i) })} className="rounded border border-line px-2">×</button>
            </div>
            <Text label="Harm" rows={2} value={h.harm} onChange={(harm) => setHaz(i, { harm })} />
            <Text label="Controls" rows={3} value={h.controls} onChange={(controls) => setHaz(i, { controls })} />
            <RiskRow v={h} set={(p) => setHaz(i, p)} prefix={h.name} />
            <div className="mt-2"><CodePicks label={`${h.name} control types`} value={h.codes} onChange={(codes) => setHaz(i, { codes })} /></div>
          </div>
        ))}
        <Field label="Add from the hazards library">
          <input type="search" value={libQuery} onChange={(e) => setLibQuery(e.target.value)} placeholder="Search the hazards library" spellCheck className={inputClass} />
        </Field>
        {libMatches.length > 0 && (
          <ul className="mb-3 divide-y divide-line rounded-lg border border-line">
            {libMatches.map((h) => (
              <li key={h.id}><button type="button" onClick={() => { setC({ register: [...c.register, fromLibrary(h)] }); setLibQuery(""); }} className="w-full px-3 py-2 text-left text-sm hover:bg-paper">Add {h.hazard}</button></li>
            ))}
          </ul>
        )}
        {suggested.length > 0 && (
          <div className="mb-3 rounded-lg border border-[#e8cd8a] bg-[#f8e7bf] p-3 text-sm">
            <p className="mb-2 font-semibold">Suggested by the equipment ticked in section 6:</p>
            <div className="flex flex-wrap gap-2">
              {suggested.map((h) => <button key={h.id} type="button" onClick={() => setC({ register: [...c.register, fromLibrary(h)] })} className="rounded-lg border border-dark bg-white px-2 py-1">+ {h.hazard}</button>)}
            </div>
          </div>
        )}
        {newHaz ? (
          <div className="rounded-lg border border-dark p-3" role="group" aria-label="New hazard">
            <Text label="Hazard" value={newHaz.name} onChange={(name) => setNewHaz({ ...newHaz, name })} />
            <Text label="Harm" rows={2} value={newHaz.harm} onChange={(harm) => setNewHaz({ ...newHaz, harm })} />
            <Text label="Controls" rows={2} value={newHaz.controls} onChange={(controls) => setNewHaz({ ...newHaz, controls })} />
            <RiskRow v={newHaz} set={(p) => setNewHaz({ ...newHaz, ...p })} prefix="New hazard" />
            {onAddToLibrary && mode === "template" && <p className="mt-2 text-sm text-muted">Job types use hazards from the library, so this is added to the hazards library too.</p>}
            {onAddToLibrary && mode === "rams" && (
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={newHaz.toLibrary} onChange={(e) => setNewHaz({ ...newHaz, toLibrary: e.target.checked })} className="h-5 w-5 accent-brand" />Also add to the hazards library</label>
            )}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={addNewHazard} disabled={!newHaz.name.trim() || busy} className="px-3 py-1.5 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">Add hazard</button>
              <button type="button" onClick={() => setNewHaz(null)} className="px-3 py-1.5 rounded-lg border border-line">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setNewHaz({ key: "", name: "", harm: "", controls: "", il: 3, ic: 3, rl: 1, rc: 2, who: "", codes: [], toLibrary: mode === "template" })} className="px-3 py-1.5 rounded-lg border border-dark text-sm font-semibold">+ Add hazard</button>
        )}
      </Card>

      <Card n="6" title="Resources and plant">
        {mode === "rams" && (
          <>
            <Text label="Workers" rows={2} value={c.res.workers} onChange={(workers) => setC({ res: { ...c.res, workers } })} />
            <Text label="Subcontractors" value={c.res.subcontractors} onChange={(subcontractors) => setC({ res: { ...c.res, subcontractors } })} />
          </>
        )}
        <Text label="Plant and tools" rows={2} value={c.res.plant} onChange={(plant) => setC({ res: { ...c.res, plant } })} />
        <fieldset className="mb-3">
          <legend className="block text-sm font-medium mb-1">Equipment used (each suggests its hazards in section 5)</legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {lists.categories.map((cat) => (
              <label key={cat} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" checked={c.plantCategories.includes(cat)} onChange={(e) => setC({ plantCategories: e.target.checked ? [...c.plantCategories, cat] : c.plantCategories.filter((x) => x !== cat) })} className="h-5 w-5 accent-brand" />
                {cat}
              </label>
            ))}
            {lists.categories.length === 0 && <p className="text-sm text-muted">No equipment categories yet.</p>}
          </div>
        </fieldset>
        <Text label="Materials" rows={2} value={c.res.materials} onChange={(materials) => setC({ res: { ...c.res, materials } })} />
        {mode === "rams" && <fieldset>
          <legend className="block text-sm font-medium mb-1">CoSHH substances used (assessed ones from the CoSHH register)</legend>
          {lists.substances.length === 0 ? <p className="text-sm text-muted">No assessed substances in the CoSHH register yet.</p> : (
            <div className="grid gap-x-4 sm:grid-cols-2">
              {lists.substances.map((s) => (
                <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" checked={c.coshh.includes(s.id)} onChange={(e) => setC({ coshh: e.target.checked ? [...c.coshh, s.id] : c.coshh.filter((x) => x !== s.id) })} className="h-5 w-5 accent-brand" />
                  {s.name}{s.supplier ? ` (${s.supplier})` : ""}
                </label>
              ))}
            </div>
          )}
        </fieldset>}
      </Card>

      <Card n="7" title="PPE">
        <div className="mb-3 grid gap-x-4 sm:grid-cols-2">
          {Array.from(new Set([...PPE_LIST, ...c.ppe])).map((p) => (
            <label key={p} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={c.ppe.includes(p)} onChange={(e) => setC({ ppe: e.target.checked ? [...c.ppe, p] : c.ppe.filter((x) => x !== p) })} className="h-5 w-5 accent-brand" />{p}
            </label>
          ))}
        </div>
        <Text label="Other PPE notes" rows={2} value={c.ppeExtra} onChange={(ppeExtra) => setC({ ppeExtra })} />
      </Card>

      <Card n="8" title="Permits, licences and competencies">
        <div className="mb-3 grid gap-x-4">
          {PERMIT_LIST.map((p) => (
            <label key={p.key} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={c.permits.includes(p.key)} onChange={(e) => setC({ permits: e.target.checked ? [...c.permits, p.key] : c.permits.filter((x) => x !== p.key) })} className="h-5 w-5 accent-brand" />{p.label}
            </label>
          ))}
        </div>
        <Text label="Other permits or competencies" rows={2} value={c.permitExtra} onChange={(permitExtra) => setC({ permitExtra })} />
      </Card>

      {mode === "rams" && (
        <Card n="9–10" title="Emergency, welfare, consultation and review">
          {STANDARD_KEYS.map((k) => <Text key={k} label={STANDARD_LABELS[k]} rows={2} value={c.std[k]} onChange={(t) => setC({ std: { ...c.std, [k]: t } })} />)}
        </Card>
      )}

      {mode === "rams" && (
        <Card n="11" title="Sign-off" open>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Prepared by"><select value={v.preparedById ?? ""} onChange={(e) => set({ preparedById: Number(e.target.value) || null })} className={inputClass}>{people}</select></Field>
            <Field label="Approved by"><select value={v.approvedById ?? ""} onChange={(e) => set({ approvedById: Number(e.target.value) || null })} className={inputClass}>{people}</select></Field>
            <Text label="Approver's role" value={v.approverRole} onChange={(approverRole) => set({ approverRole })} />
          </div>
          <Text label="Notes (not printed)" rows={2} value={v.notes} onChange={(notes) => set({ notes })} />
        </Card>
      )}

      {!readOnly && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-line bg-paper px-1 py-3">
          <button type="button" onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">
            {busy ? "Saving…" : mode === "template" ? "Save job type" : "Save draft"}
          </button>
          {extra?.(v, !dirty, busy)}
          {dirty && !msg && <span className="text-sm text-muted">Unsaved changes</span>}
          {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
        </div>
      )}
    </fieldset>
  );
}
