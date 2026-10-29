"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type MenuItem =
  | { label: string; onSelect: () => void; hint?: string; danger?: boolean }
  | { label: string; href: string; hint?: string; newTab?: boolean };

// A button with a ▾ that opens a short list (Reports ▾, More ▾, + New ▾, the name pill).
export function MenuButton({
  label,
  items,
  tone = "plain",
  align = "right",
  caret = true,
  ariaLabel,
  footer,
}: {
  label: ReactNode;
  items: MenuItem[];
  tone?: "plain" | "orange" | "pill";
  align?: "left" | "right";
  caret?: boolean;
  ariaLabel?: string;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const btn =
    tone === "orange"
      ? "bg-brand text-white font-semibold hover:bg-brand-dark border border-brand"
      : tone === "pill"
        ? "bg-white border border-line rounded-full pl-1 pr-3 text-ink hover:bg-paper"
        : "bg-white border border-line text-ink font-medium hover:bg-paper";

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap ${btn}`}
      >
        {label}
        {caret && <span aria-hidden="true" className="text-xs opacity-80">▾</span>}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-1 z-50 min-w-52 rounded-lg border border-line bg-white py-1 shadow-lg`}
        >
          {items.map((it) =>
            "href" in it ? (
              <Link
                key={it.label}
                role="menuitem"
                href={it.href}
                target={it.newTab ? "_blank" : undefined}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-sm text-ink hover:bg-paper"
              >
                {it.label}
                {it.hint && <span className="block text-xs text-muted">{it.hint}</span>}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={`block w-full text-left px-3 py-2 text-sm hover:bg-paper ${it.danger ? "text-danger" : "text-ink"}`}
              >
                {it.label}
                {it.hint && <span className="block text-xs text-muted">{it.hint}</span>}
              </button>
            ),
          )}
          {footer}
        </div>
      )}
    </div>
  );
}
