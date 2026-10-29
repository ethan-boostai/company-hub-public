"use client";

import type { ReactNode } from "react";

// Shared register parts under the page top: filter pills, the search + dropdown filter row, and the
// list as a table (white card, uppercase grey headings, coloured status pills, › at the end of rows).

export function FilterPills<T extends string>({
  value,
  onChange,
  options,
  label = "Filter",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2 mb-3">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${on ? "border-dark bg-dark text-white" : "border-line bg-white text-ink hover:bg-paper"}`}
          >
            {o.label}
            {o.count !== undefined && <span className="text-brand">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// One row: the search box and any dropdown filters.
export function FilterRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 mb-3 [&>*:first-child]:flex-1 [&>*:first-child]:min-w-56">{children}</div>;
}

export type PillTone = "green" | "amber" | "red" | "grey" | "blue";
const PILL: Record<PillTone, string> = {
  green: "bg-[#1a7f37] text-white",
  amber: "bg-[#b46b00] text-white",
  red: "bg-danger text-white",
  grey: "bg-[#6b6e70] text-white",
  blue: "bg-[#2c5d8a] text-white",
};
export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[tone]}`}>{children}</span>;
}

export type Column<R> = { key: string; label: string; cell: (r: R) => ReactNode; className?: string };

export function DataTable<R>({
  rows,
  columns,
  rowKey,
  onOpen,
  empty = "Nothing matches.",
  label,
}: {
  rows: R[];
  columns: Column<R>[];
  rowKey: (r: R) => string | number;
  onOpen?: (r: R) => void;
  empty?: string;
  label: string;
}) {
  return (
    <div className="bg-white border border-line rounded-xl overflow-x-auto">
      <table className="w-full text-sm" aria-label={label}>
        <thead>
          <tr className="border-b border-line text-left">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted whitespace-nowrap ${c.className ?? ""}`}>
                {c.label}
              </th>
            ))}
            {onOpen && <th scope="col" className="w-8"><span className="sr-only">Open</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onOpen ? () => onOpen(r) : undefined}
              className={onOpen ? "cursor-pointer hover:bg-paper" : ""}
            >
              {columns.map((c, i) => (
                <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ""}`}>
                  {i === 0 && onOpen ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r); }} className="text-left font-medium hover:underline">
                      {c.cell(r)}
                    </button>
                  ) : (
                    c.cell(r)
                  )}
                </td>
              ))}
              {onOpen && <td aria-hidden="true" className="pr-4 text-right text-lg text-muted">›</td>}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (onOpen ? 1 : 0)} className="px-4 py-6 text-muted">{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
