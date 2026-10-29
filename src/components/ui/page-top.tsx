"use client";

import { useState, type ReactNode } from "react";
import { MenuButton, type MenuItem } from "./menu-button";
import { Drawer } from "./overlay";

// Something on a page that needs looking at. Pages pass in their own items.
export type AttentionItem = {
  key: string;
  level: "overdue" | "soon";
  tag: string; // short coloured tag, e.g. "MOT", "Service", "Insurance"
  name: string; // the record, e.g. a vehicle reg or a person
  detail: string; // e.g. "Expired 3 Oct" or "Due in 12 days"
  onOpen: () => void; // opens the record
};

export type NewAction = { label: string; onSelect: () => void } | { label: string; items: MenuItem[] };

const ORANGE_BTN = "inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white whitespace-nowrap hover:bg-brand-dark";

// Standard page top (every register, always in this order). Left: the title, with "N records" under
// it. Right: Needs attention, Reports ▾, More ▾ (only with other actions), then the one orange + New.
export function PageTop({
  title,
  count,
  countLabel,
  attention,
  reports,
  more,
  newAction,
  children,
}: {
  title: string;
  count?: number;
  countLabel?: string; // overrides "N records"
  attention?: AttentionItem[];
  reports?: MenuItem[];
  more?: MenuItem[];
  newAction?: NewAction;
  children?: ReactNode; // anything under the title row (tabs)
}) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {(countLabel || count !== undefined) && (
            <p className="text-sm text-muted" data-testid="record-count">
              {countLabel ?? `${count} ${count === 1 ? "record" : "records"}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {attention && <NeedsAttention items={attention} />}
          {reports && reports.length > 0 && <MenuButton label="Reports" items={reports} />}
          {more && more.length > 0 && <MenuButton label="More" items={more} />}
          {newAction &&
            ("items" in newAction ? (
              <MenuButton label={`+ ${newAction.label}`} items={newAction.items} tone="orange" />
            ) : (
              <button type="button" onClick={newAction.onSelect} className={ORANGE_BTN}>
                + {newAction.label}
              </button>
            ))}
        </div>
      </div>
      {children}
    </div>
  );
}

const TAG: Record<AttentionItem["level"], string> = {
  overdue: "bg-danger text-white",
  soon: "bg-[#b46b00] text-white",
};

// Needs attention: a count button (red if anything is overdue, amber if only due soon, grey "All
// clear" if nothing) that opens the 560px right-hand drawer, items grouped Overdue then Due soon.
export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  const [open, setOpen] = useState(false);
  const overdue = items.filter((i) => i.level === "overdue");
  const soon = items.filter((i) => i.level === "soon");
  const tone = overdue.length
    ? "bg-danger text-white border-danger"
    : soon.length
      ? "bg-[#b46b00] text-white border-[#b46b00]"
      : "bg-paper text-muted border-line";
  return (
    <>
      <button
        type="button"
        onClick={() => items.length && setOpen(true)}
        aria-disabled={!items.length}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold whitespace-nowrap ${tone}`}
      >
        {items.length ? (
          <>
            Needs attention
            <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{items.length}</span>
          </>
        ) : (
          "All clear"
        )}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Needs attention" width="max-w-[560px]">
        {[
          { label: "Overdue", rows: overdue },
          { label: "Due soon", rows: soon },
        ].map((g) =>
          g.rows.length ? (
            <section key={g.label} className="mb-5" aria-label={g.label}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">
                {g.label} ({g.rows.length})
              </h3>
              <ul className="divide-y divide-line border border-line rounded-lg">
                {g.rows.map((i) => (
                  <li key={i.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        i.onOpen();
                      }}
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-paper"
                    >
                      <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${TAG[i.level]}`}>{i.tag}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{i.name}</span>
                        <span className="block text-sm text-muted">{i.detail}</span>
                      </span>
                      <span aria-hidden="true" className="text-muted">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )}
      </Drawer>
    </>
  );
}
