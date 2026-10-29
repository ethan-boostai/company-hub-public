"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { MenuButton, type MenuItem } from "./menu-button";
import { useScrollLock } from "./scroll-lock";

// Something on a page that needs looking at. Pages pass in their own items.
export type AttentionItem = {
  key: string;
  level: "overdue" | "soon";
  tag: string; // short coloured tag, e.g. "MOT", "Service", "Insurance"
  name: string; // the record, e.g. a vehicle reg or a person
  detail: string; // e.g. "Was due 3 Oct 2026"
  onOpen: () => void; // opens the record
};

export type NewAction = { label: string; onSelect: () => void } | { label: string; items: MenuItem[] };

// Reports ▾, More ▾ and + New share one height and corner radius.
export const TOP_BTN = "inline-flex h-11 items-center gap-1.5 rounded-lg px-4 text-[15px] whitespace-nowrap";

// Standard page top (every register, always in this order). Left: the title, with "N records" under
// it. Right: Reports ▾, More ▾ (only with other actions), then the one orange + New.
export function PageTop({
  title,
  count,
  countLabel,
  reports,
  more,
  newAction,
  children,
}: {
  title: string;
  count?: number;
  countLabel?: string; // overrides "N records"
  reports?: MenuItem[];
  more?: MenuItem[];
  newAction?: NewAction;
  children?: ReactNode; // anything under the title row (tabs)
}) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-3xl font-bold text-ink">{title}</h1>
          {(countLabel || count !== undefined) && (
            <p className="mt-0.5 text-base text-muted" data-testid="record-count">
              {countLabel ?? `${count} ${count === 1 ? "record" : "records"}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {reports && reports.length > 0 && <MenuButton label="Reports" items={reports} />}
          {more && more.length > 0 && <MenuButton label="More" items={more} />}
          {newAction &&
            ("items" in newAction ? (
              <MenuButton label={`+ ${newAction.label}`} items={newAction.items} tone="orange" />
            ) : (
              <button type="button" onClick={newAction.onSelect} className={`${TOP_BTN} border border-brand bg-brand font-semibold text-white hover:bg-brand-dark`}>
                + {newAction.label}
              </button>
            ))}
        </div>
      </div>
      {children}
    </div>
  );
}

// A register page: the content (page top, pills, search, list) on the left and the Needs attention
// panel down the right, the same pattern as the job page's Tasks panel.
export function RegisterLayout({ attention, children }: { attention: AttentionItem[]; children: ReactNode }) {
  return (
    <div className="min-[1100px]:flex min-[1100px]:items-stretch">
      <div className="min-w-0 flex-1 p-4 sm:p-6">{children}</div>
      <NeedsAttentionPanel items={attention} />
    </div>
  );
}

// Shown or hidden is remembered on this device. Storage can be missing (private window); then it's
// just shown.
const KEY = "cbs.needsAttention.hidden";
const listeners = new Set<() => void>();
function readHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function setHidden(v: boolean) {
  try {
    if (v) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* not remembered; still changes now */
  }
  memo = v;
  listeners.forEach((l) => l());
}
let memo: boolean | null = null;
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const useHidden = () =>
  useSyncExternalStore(subscribe, () => (memo ??= readHidden()), () => false);

const TAG: Record<AttentionItem["level"], string> = {
  overdue: "bg-[#f9dcda] text-[#a3231b]",
  soon: "bg-[#f8e7bf] text-[#7a4a00]",
};

function tone(items: AttentionItem[]) {
  if (items.some((i) => i.level === "overdue")) return "border-[#e9a9a4] bg-[#f9dcda] text-[#a3231b]";
  if (items.length) return "border-[#e8cd8a] bg-[#f8e7bf] text-[#7a4a00]";
  return "border-line bg-white text-muted";
}

// Needs attention: open down the right of every register page (320px), Overdue then Due soon; » hides
// it to a slim « tab. Under 1100px wide it sits behind a button bottom right and opens full screen.
export function NeedsAttentionPanel({ items }: { items: AttentionItem[] }) {
  const hidden = useHidden();
  const [openSmall, setOpenSmall] = useState(false);
  useScrollLock(openSmall);

  const body = (onPicked?: () => void) => <AttentionList items={items} onPicked={onPicked} />;

  return (
    <>
      {/* Wide screens: the right-hand column. */}
      {hidden ? (
        <aside aria-label="Needs attention" className="hidden min-[1100px]:block sticky top-0 h-screen w-11 shrink-0 border-l border-line bg-white">
          <button
            type="button"
            onClick={() => setHidden(false)}
            aria-label={`Show Needs attention (${items.length})`}
            className="flex h-full w-full flex-col items-center gap-3 pt-5 text-sm font-semibold text-ink hover:bg-paper"
          >
            <span aria-hidden="true" className="text-lg leading-none">«</span>
            <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
              Needs attention {items.length > 0 && <span className={`ml-1 rounded-full border px-1.5 ${tone(items)}`}>{items.length}</span>}
            </span>
          </button>
        </aside>
      ) : (
        <aside aria-label="Needs attention" className="hidden min-[1100px]:flex sticky top-0 h-screen w-[320px] shrink-0 flex-col border-l border-line bg-white">
          <div className="flex items-center gap-2 px-5 pt-5 pb-3">
            <h2 className="flex-1 text-lg font-bold">Needs attention{items.length > 0 && ` (${items.length})`}</h2>
            <button type="button" onClick={() => setHidden(true)} aria-label="Hide Needs attention" className="rounded-lg px-2 py-1 text-lg leading-none text-muted hover:bg-paper hover:text-ink">
              »
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{body()}</div>
        </aside>
      )}

      {/* Narrower screens: a button bottom right that opens the panel full screen. */}
      <div className="min-[1100px]:hidden">
        <button
          type="button"
          onClick={() => setOpenSmall(true)}
          className={`fixed bottom-4 right-4 z-20 rounded-xl border px-4 py-3 font-semibold shadow-lg ${tone(items)}`}
        >
          {items.length ? `Needs attention ${items.length}` : "Needs attention"}
        </button>
        {openSmall && (
          <div role="dialog" aria-modal="true" aria-label="Needs attention" className="fixed inset-0 z-[35] flex flex-col bg-white">
            <div className="flex items-center gap-2 border-b border-line px-5 py-4">
              <h2 className="flex-1 text-lg font-bold">Needs attention{items.length > 0 && ` (${items.length})`}</h2>
              <button type="button" onClick={() => setOpenSmall(false)} aria-label="Close Needs attention" className="rounded-lg border border-line px-2.5 py-1 text-lg leading-none">
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{body(() => setOpenSmall(false))}</div>
          </div>
        )}
      </div>
    </>
  );
}

function AttentionList({ items, onPicked }: { items: AttentionItem[]; onPicked?: () => void }) {
  if (!items.length) {
    return (
      <div className="pt-2" data-testid="all-clear">
        <p className="flex items-center gap-2 text-base font-semibold text-[#17713a]">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12.5l2.7 2.7L16 9.8" />
          </svg>
          All clear
        </p>
        <p className="mt-1 text-sm text-muted">Nothing overdue or due in the next 30 days</p>
      </div>
    );
  }
  return (
    <>
      {[
        { label: "Overdue", rows: items.filter((i) => i.level === "overdue") },
        { label: "Due soon", rows: items.filter((i) => i.level === "soon") },
      ].map((g) =>
        g.rows.length ? (
          <section key={g.label} aria-label={g.label} className="mt-3">
            <h3 className="border-b border-line pb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-muted">{g.label}</h3>
            <ul className="divide-y divide-line">
              {g.rows.map((i) => (
                <li key={i.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onPicked?.();
                      i.onOpen();
                    }}
                    className="block w-full py-3 text-left hover:bg-paper"
                  >
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${TAG[i.level]}`}>{i.tag}</span>
                    <span className="mt-1 block font-semibold">{i.name}</span>
                    <span className="block text-sm text-muted">{i.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </>
  );
}
