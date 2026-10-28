"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { addSelectOption } from "@/app/actions/select-options";
import { inputClass } from "./fields";

const ADD = "__add_new__";

// Every dropdown lets users add a new option, saved for everyone.
export function SelectWithAdd({
  list,
  name,
  label,
  options: initial,
  defaultValue = "",
  required,
}: {
  list: string;
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
  required?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  // Options from the server, plus any added here before the page refreshes. After an add the page
  // re-fetches its data, so every dropdown on the same list shows the new option.
  const [added, setAdded] = useState<string[]>([]);
  const options = [...initial];
  for (const o of [...added, defaultValue]) if (o && !options.includes(o)) options.push(o);
  const [value, setValue] = useState(defaultValue);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await addSelectOption(list, draft, crypto.randomUUID());
      if (!r.ok) {
        setError(r.message);
        return;
      }
      const v = r.data ?? draft.trim();
      if (!options.includes(v)) setAdded((a) => [...a, v]);
      setValue(v);
      router.refresh();
      setAdding(false);
      setDraft("");
    } catch {
      setError("Couldn't add it. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium mb-1">{label}</label>
      <select
        id={id}
        name={name}
        value={value}
        required={required}
        onChange={(e) => {
          if (e.target.value === ADD) {
            setAdding(true);
            return;
          }
          setValue(e.target.value);
        }}
        className={inputClass}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value={ADD}>+ Add new…</option>
      </select>
      {adding && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            spellCheck
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={`New ${label.toLowerCase()}`}
            aria-label={`New ${label.toLowerCase()}`}
            className={inputClass}
          />
          <button type="button" onClick={add} disabled={busy || !draft.trim()} className="px-3 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">
            {busy ? "Adding…" : "Add"}
          </button>
          <button type="button" onClick={() => { setAdding(false); setDraft(""); setError(""); }} disabled={busy} className="px-3 rounded-lg border border-line">
            Cancel
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
