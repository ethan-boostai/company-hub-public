"use client";

import { useId, useState, type ReactNode } from "react";
import type { Due } from "./dates";

const DUE_CLASS: Record<Due, string> = {
  overdue: "bg-red-50 text-danger border-red-200",
  soon: "bg-orange-50 text-orange-800 border-orange-200",
  up: "bg-yellow-50 text-yellow-800 border-yellow-200",
  ok: "bg-green-50 text-ok border-green-200",
  none: "bg-paper text-muted border-line",
};

export function Chip({ tone = "none", children }: { tone?: Due; children: ReactNode }) {
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${DUE_CLASS[tone]}`}>{children}</span>;
}

// One of the boxes at the top of a record: a label, a big value and a short status line.
export function StatusBox({ label, value, note, tone = "none" }: { label: string; value: string; note?: string; tone?: Due }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${DUE_CLASS[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="font-semibold text-ink">{value || "Not set"}</p>
      {note && <p className="text-xs">{note}</p>}
    </div>
  );
}

// A fixed set of choices (statuses, frequencies) shown as buttons. Not a dropdown: these values
// drive the register's rules, so they can't be added to.
export function Choice({
  label,
  name,
  options,
  defaultValue,
  onChange,
}: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValue: string;
  onChange?: (v: string) => void;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  return (
    <fieldset className="mb-4">
      <legend className="block text-sm font-medium mb-1">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium ${value === o.value ? "border-brand bg-brand text-white" : "border-line bg-white hover:bg-paper"}`}
          >
            <input
              type="radio"
              name={name}
              id={`${id}-${o.value}`}
              value={o.value}
              checked={value === o.value}
              onChange={() => {
                setValue(o.value);
                onChange?.(o.value);
              }}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Switch between the lists on a register page.
export function ViewSwitch<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-2 mb-4">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${value === o.value ? "border-dark bg-dark text-white" : "border-line bg-white hover:bg-paper"}`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// A plain select over records (vehicles, people). Records are added on their own register,
// so these don't offer "Add new".
export function RecordSelect({
  label,
  name,
  options,
  defaultValue,
  error,
  placeholder = "Choose…",
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  error?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium mb-1">{label}</label>
      <select id={id} name={name} defaultValue={defaultValue ?? ""} aria-invalid={!!error}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 focus:outline-none focus:border-brand">
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

// A titled part of a drawer, with an optional button on the right.
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h3 className="font-semibold flex-1">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SmallButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="px-3 py-1.5 rounded-lg border border-dark text-sm font-semibold hover:bg-paper disabled:opacity-50">
      {children}
    </button>
  );
}

export function MiniList({ items, empty }: { items: { key: number | string; title: string; sub?: string; chips?: ReactNode; onClick?: () => void }[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line border border-line rounded-lg">
      {items.map((i) => {
        const inner = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{i.title}</span>
              {i.sub && <span className="block text-xs text-muted">{i.sub}</span>}
            </span>
            {i.chips && <span className="flex flex-wrap gap-1">{i.chips}</span>}
          </>
        );
        return (
          <li key={i.key}>
            {i.onClick ? (
              <button type="button" onClick={i.onClick} className="w-full text-left px-3 py-2 hover:bg-paper flex flex-wrap items-center gap-x-2">{inner}</button>
            ) : (
              <div className="px-3 py-2 flex flex-wrap items-center gap-x-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The shared table's StatusPill colour for a due state: overdue red, due soon amber, fine green.
export function dueTone(d: Due): "red" | "amber" | "green" | "grey" {
  return d === "overdue" ? "red" : d === "soon" || d === "up" ? "amber" : d === "ok" ? "green" : "grey";
}
