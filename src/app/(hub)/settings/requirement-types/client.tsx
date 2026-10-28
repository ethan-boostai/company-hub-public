"use client";

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CheckboxField, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { customId, REQ_STAGES } from "@/lib/requirements";
import type { ReqType } from "@/lib/tasks/requirement-types";
import { deleteRequirementType, saveRequirementType } from "./actions";

const stageLabel = (s: string) => REQ_STAGES.find((x) => x.key === s)?.label ?? s;

function Choice({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-brand/10">
      <input type="radio" name={name} value={value} defaultChecked={checked} />
      {label}
    </label>
  );
}

// Simple custom types the office adds: a plain task with a stage. Built-in types are in code.
export function RequirementTypesClient({ custom, builtIn }: { custom: ReqType[]; builtIn: ReqType[] }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ReqType | "new" | null>(null);
  const [deleting, setDeleting] = useState<ReqType | null>(null);
  const key = useRef<string | null>(null);
  const needle = q.trim().toLowerCase();
  const shown = custom.filter((t) => !needle || t.label.toLowerCase().includes(needle));
  const current = editing && editing !== "new" ? editing : null;

  return (
    <div>
      <section className="bg-white border border-line rounded-xl p-4 sm:p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-semibold flex-1">Custom types</h2>
          <button type="button" onClick={() => setEditing("new")} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">Add type</button>
        </div>
        <p className="text-sm text-muted mb-3">A custom type is a plain task with a stage. It appears in + New task under its stage.</p>
        <SearchBox value={q} onChange={setQ} placeholder="Search custom types" label="Search custom types" />
        <ul className="mt-3 divide-y divide-line border border-line rounded-lg" data-testid="custom-types">
          {shown.map((t) => (
            <li key={t.key}>
              <button type="button" onClick={() => setEditing(t)} className="w-full text-left px-3 py-2 hover:bg-paper flex flex-wrap gap-2 items-center">
                <span className="font-medium flex-1">{t.label}</span>
                <span className="text-xs text-muted">{stageLabel(t.stage)} · {t.side === "site" ? "On site" : "Office"}{t.repeatable ? " · Repeatable" : ""}</span>
                {!t.active && <span className="text-xs rounded bg-paper px-1.5 py-0.5">Off</span>}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">{custom.length ? "No match." : "No custom types yet."}</li>}
        </ul>
      </section>

      <section className="bg-white border border-line rounded-xl p-4 sm:p-5">
        <h2 className="font-semibold mb-1">Built-in types</h2>
        <p className="text-sm text-muted mb-3">These open their own page as each phase is built. They can&apos;t be changed here.</p>
        {REQ_STAGES.map((g) => (
          <div key={g.key} className="mb-3">
            <h3 className="text-sm font-semibold">{g.label}</h3>
            <p className="text-sm text-muted">
              {builtIn.filter((t) => t.stage === g.key).map((t) => `${t.label}${t.side === "site" ? " (on site)" : ""}${t.cdm ? " (CDM)" : ""}${t.repeatable ? " (repeatable)" : ""}`).join(" · ")}
            </p>
          </div>
        ))}
      </section>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={current ? current.label : "Add type"}>
        {editing && (
          <GuardedForm action={saveRequirementType} onSaved={() => setEditing(null)} key={current?.key ?? "new"}>
            {(state) => (
              <>
                {current && <input type="hidden" name="id" value={customId(current.key) ?? ""} />}
                <TextField label="Name" name="name" defaultValue={current?.label} required error={state && !state.ok ? state.fieldErrors?.name : undefined} />
                <fieldset className="mb-4">
                  <legend className="block text-sm font-medium mb-1">Stage</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {REQ_STAGES.map((s) => <Choice key={s.key} name="stage" value={s.key} label={s.label} checked={(current?.stage ?? "approved_planning") === s.key} />)}
                  </div>
                </fieldset>
                <fieldset className="mb-4">
                  <legend className="block text-sm font-medium mb-1">Task side</legend>
                  <div className="flex gap-2">
                    <Choice name="side" value="office" label="Office task" checked={(current?.side ?? "office") === "office"} />
                    <Choice name="side" value="site" label="On site task" checked={current?.side === "site"} />
                  </div>
                </fieldset>
                <CheckboxField label="Repeatable (every pick adds a new task)" name="repeatable" defaultChecked={current?.repeatable} />
                {current && <CheckboxField label="Switched on (shown in + New task)" name="active" defaultChecked={current.active} />}
                <SaveButton>{current ? "Save" : "Add type"}</SaveButton>
                {current && (
                  <button type="button" onClick={() => setDeleting(current)} className="block mt-6 text-sm text-danger underline">Delete type</button>
                )}
              </>
            )}
          </GuardedForm>
        )}
      </Drawer>
      <ConfirmDialog
        open={!!deleting}
        title={deleting ? `Delete ${deleting.label}?` : ""}
        message="Only types never used on a job can be deleted. Used types can be switched off instead."
        onConfirm={async () => {
          key.current ??= crypto.randomUUID();
          const r = await deleteRequirementType(customId(deleting!.key)!, key.current);
          key.current = null;
          if (r.ok) setEditing(null);
          return r;
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
