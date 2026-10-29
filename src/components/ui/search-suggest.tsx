"use client";

import { useEffect, useId, useRef, useState } from "react";

export type Suggestion = { key: string; group?: string; title: string; sub?: string };

// A search box that lists matching results under it as you type. Click a result (or use the arrow
// keys and Enter) to open it. Used by the header search and the Jobs page search.
export function SearchSuggest({
  value,
  onChange,
  results,
  onPick,
  onSubmit,
  busy = false,
  placeholder = "Search",
  label = "Search",
  emptyText,
  dark = false,
}: {
  value: string;
  onChange: (v: string) => void;
  results: Suggestion[];
  onPick: (s: Suggestion) => void;
  onSubmit?: () => void; // Enter with nothing highlighted
  busy?: boolean;
  placeholder?: string;
  label?: string;
  emptyText?: string;
  dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const pick = (s: Suggestion) => {
    setOpen(false);
    setHi(-1);
    onPick(s);
  };
  const showList = open && value.trim().length > 0;

  return (
    <div ref={wrap} className="relative w-full">
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={hi >= 0 ? `${listId}-${hi}` : undefined}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHi(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(results.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(-1, h - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (hi >= 0 && results[hi]) pick(results[hi]);
            else if (results.length === 1) pick(results[0]);
            else onSubmit?.();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        spellCheck
        className={
          dark
            ? "w-full rounded-lg border border-white/30 bg-white/10 text-white placeholder:text-white/60 px-3 py-1.5 focus:outline-none focus:bg-white focus:text-ink"
            : "w-full rounded-lg border border-line bg-white px-3 py-2 focus:outline-none focus:border-brand"
        }
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} results`}
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[70vh] overflow-y-auto overscroll-contain rounded-lg border border-line bg-white text-ink shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted" role="presentation">{busy ? "Searching…" : emptyText || "No matches."}</li>
          ) : (
            results.map((s, i) => (
              <li key={s.key} role="presentation">
                {s.group && (i === 0 || results[i - 1].group !== s.group) && (
                  <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted" role="presentation">{s.group}</div>
                )}
                <button
                  type="button"
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === hi}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(s)}
                  className={`block w-full text-left px-3 py-2 ${i === hi ? "bg-paper" : ""}`}
                >
                  <span className="block font-medium truncate">{s.title}</span>
                  {s.sub && <span className="block text-sm text-muted truncate">{s.sub}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
