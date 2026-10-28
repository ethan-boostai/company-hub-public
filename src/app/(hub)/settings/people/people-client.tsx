"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CheckboxField, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { markPersonLeft, savePerson, setPersonPin } from "./actions";
import type { PersonRow } from "./data";

type Editing = PersonRow | "new" | null;

export function PeopleClient({ people: initial, openId }: { people: PersonRow[]; openId: number | null }) {
  const [people, setPeople] = useState(initial);
  const [query, setQuery] = useState("");
  const [showLeft, setShowLeft] = useState(false);
  const [editing, setEditing] = useState<Editing>(() => initial.find((p) => p.id === openId) ?? null);
  const [confirmLeft, setConfirmLeft] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => showLeft || p.active)
      .filter((p) => !q || [p.name, p.role, p.email, p.mobile].some((f) => f.toLowerCase().includes(q)));
  }, [people, query, showLeft]);

  function upsert(row: PersonRow) {
    setPeople((list) => {
      const i = list.findIndex((p) => p.id === row.id);
      const next = i >= 0 ? list.map((p) => (p.id === row.id ? row : p)) : [...list, row];
      return next.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    });
    setEditing(row);
  }

  const current = editing && editing !== "new" ? editing : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-56">
          <SearchBox value={query} onChange={setQuery} placeholder="Search people" label="Search people" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} />
          Show people who have left
        </label>
        <button type="button" onClick={() => setEditing("new")} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">
          Add person
        </button>
      </div>

      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <ul className="divide-y divide-line">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setEditing(p)} className="w-full text-left px-4 py-3 hover:bg-paper flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-muted">{p.role}</span>
                <span className="ml-auto flex gap-2 text-xs">
                  {!p.active && <span className="rounded bg-paper px-2 py-0.5">Left</span>}
                  {p.active && p.canSignIn && (
                    <span className={`rounded px-2 py-0.5 ${p.hasPin ? "bg-green-50 text-ok" : "bg-amber-50 text-amber-800"}`}>
                      {p.hasPin ? "Can sign in" : "No PIN yet"}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-6 text-sm text-muted">No people match.</li>}
        </ul>
      </div>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={current ? current.name : "Add person"}>
        {editing && (
          <div key={current ? `${current.id}-${current.name}-${current.active}` : "new"}>
            <GuardedForm action={savePerson} onSaved={(r) => r.data && upsert(r.data)}>
              {(state) => {
                const err = state && !state.ok ? state.fieldErrors ?? {} : {};
                return (
                  <>
                    {current && <input type="hidden" name="id" value={current.id} />}
                    <TextField label="Name" name="name" defaultValue={current?.name} error={err.name} autoComplete="off" required />
                    <TextField label="Role" name="role" defaultValue={current?.role} autoComplete="off" />
                    <TextField label="Mobile" name="mobile" type="tel" defaultValue={current?.mobile} />
                    <TextField label="Email" name="email" type="email" defaultValue={current?.email} error={err.email} spellCheck={false} />
                    <CheckboxField label="Can sign in to the hub (office)" name="can_sign_in" defaultChecked={current?.canSignIn} />
                    {current && <CheckboxField label="Still works here" name="active" defaultChecked={current.active} />}
                    <SaveButton>{current ? "Save" : "Add person"}</SaveButton>
                  </>
                );
              }}
            </GuardedForm>

            {current && current.canSignIn && current.active && (
              <div className="mt-8 border-t border-line pt-5">
                <h3 className="font-semibold mb-1">Sign-in PIN</h3>
                <p className="text-sm text-muted mb-3">{current.hasPin ? "Set a new PIN if they've forgotten theirs." : "They need a PIN before they can sign in."}</p>
                <GuardedForm action={setPersonPin} onSaved={(r) => r.data && upsert(r.data)}>
                  {(state) => {
                    const err = state && !state.ok ? state.fieldErrors ?? {} : {};
                    return (
                      <>
                        <input type="hidden" name="id" value={current.id} />
                        <TextField label="New 4-digit PIN" name="pin" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" error={err.pin} spellCheck={false} />
                        <TextField label="Type it again" name="pin2" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" error={err.pin2} spellCheck={false} />
                        <SaveButton>Set PIN</SaveButton>
                      </>
                    );
                  }}
                </GuardedForm>
              </div>
            )}

            {current && current.active && (
              <div className="mt-8 border-t border-line pt-5">
                <h3 className="font-semibold mb-1">Left the company</h3>
                <p className="text-sm text-muted mb-3">Keeps their history, stops sign-in and takes them off pick lists.</p>
                <button type="button" onClick={() => setConfirmLeft(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">
                  Mark as left
                </button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmLeft && !!current}
        title={`Mark ${current?.name ?? ""} as left?`}
        message="They won't be able to sign in and won't show in pick lists. Their records stay."
        confirmLabel="Mark as left"
        onClose={() => setConfirmLeft(false)}
        onConfirm={async () => {
          if (!current) return;
          const r = await markPersonLeft(current.id, crypto.randomUUID());
          if (r.ok && r.data) upsert(r.data);
          return r;
        }}
      />
    </div>
  );
}
