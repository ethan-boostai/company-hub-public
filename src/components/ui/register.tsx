"use client";

import { useSyncExternalStore, type ReactNode } from "react";

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
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[15px] font-semibold ${on ? "border-dark bg-dark text-white" : "border-line bg-white text-ink hover:bg-paper"}`}
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
// Pale tinted pills with dark text, as live; they fill the column (up to 14rem).
const PILL: Record<PillTone, string> = {
  green: "bg-[#dcf2e3] text-[#17713a]",
  amber: "bg-[#f8e7bf] text-[#7a4a00]",
  red: "bg-[#f9dcda] text-[#a3231b]",
  grey: "bg-[#ebebe8] text-[#3d4043]",
  blue: "bg-[#dce8f4] text-[#24527d]",
};
export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`block w-full max-w-56 truncate rounded-full px-3 py-0.5 text-sm font-semibold ${PILL[tone]}`}>{children}</span>;
}

// The first column is the record's name (bold); `sub` adds the grey line under it. On phones the
// table becomes stacked rows (name, grey line, then the other cells wrapped under it, ›);
// `phone: false` leaves a column out there.
export type Column<R> = { key: string; label: string; cell: (r: R) => ReactNode; sub?: (r: R) => ReactNode; className?: string; phone?: boolean };

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
  const phone = usePhone();
  const [first, ...rest] = columns;
  const phoneCols = rest.filter((c) => c.phone !== false);
  // Phones: stacked rows, no sideways scrolling. One or the other is rendered, never both.
  if (phone) return (
    <ul aria-label={label} className="bg-white border border-line rounded-xl divide-y divide-line">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{first?.cell(r)}</span>
              {first?.sub && <span className="block text-sm text-muted">{first.sub(r)}</span>}
              {phoneCols.length > 0 && (
                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm [&_.max-w-56]:w-auto">
                  {phoneCols.map((c) => (
                    <span key={c.key} className="min-w-0">{c.cell(r)}</span>
                  ))}
                </span>
              )}
            </span>
            {onOpen && <span aria-hidden="true" className="text-lg text-muted">›</span>}
          </>
        );
        return (
          <li key={rowKey(r)}>
            {onOpen ? (
              <button type="button" onClick={() => onOpen(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">{inner}</button>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">{inner}</div>
            )}
          </li>
        );
      })}
      {rows.length === 0 && <li className="px-4 py-6 text-muted">{empty}</li>}
    </ul>
  );
  return (
    <div className="bg-white border border-line rounded-xl overflow-x-auto">
      <table className="w-full text-[15px]" aria-label={label}>
        <thead>
          <tr className="border-b border-line bg-[#f7f7f5] text-left">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-muted whitespace-nowrap ${c.className ?? ""}`}>
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
                <td key={c.key} className={`px-5 py-3.5 align-middle ${c.className ?? ""}`}>
                  {i === 0 ? (
                    <>
                      {onOpen ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r); }} className="text-left font-bold hover:underline">
                          {c.cell(r)}
                        </button>
                      ) : (
                        <span className="font-bold">{c.cell(r)}</span>
                      )}
                      {c.sub && <span className="block text-sm text-muted">{c.sub(r)}</span>}
                    </>
                  ) : (
                    c.cell(r)
                  )}
                </td>
              ))}
              {onOpen && <td aria-hidden="true" className="pr-5 text-right text-lg text-muted">›</td>}
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

// Under 640px wide (the `sm` break). The server and first paint assume a wide screen.
const PHONE = "(max-width: 639.98px)";
function usePhone() {
  return useSyncExternalStore(
    (l) => {
      const m = window.matchMedia(PHONE);
      m.addEventListener("change", l);
      return () => m.removeEventListener("change", l);
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}
