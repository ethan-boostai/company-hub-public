"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useScrollLock } from "./scroll-lock";

// Open overlays, newest last. Escape closes only the top one (a confirm over a drawer
// closes the confirm, not both).
const openStack: object[] = [];

function useEscape(open: boolean, onClose: () => void, disabled?: boolean) {
  const latest = useRef({ onClose, disabled });
  useEffect(() => {
    latest.current = { onClose, disabled };
  });
  useEffect(() => {
    if (!open) return;
    const me = {};
    openStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || openStack[openStack.length - 1] !== me) return;
      if (!latest.current.disabled) latest.current.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      openStack.splice(openStack.indexOf(me), 1);
    };
  }, [open]);
}

function useInitialFocus(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current.querySelector<HTMLElement>("[autofocus],input,select,textarea,button");
    (el ?? ref.current).focus();
  }, [open]);
  return ref;
}

// Side panel. Only the drawer scrolls; the page behind is locked.
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  busy,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  width?: string;
}) {
  useScrollLock(open);
  useEscape(open, onClose, busy);
  const ref = useInitialFocus(open);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`absolute right-0 top-0 h-full w-full ${width} bg-white shadow-xl flex flex-col outline-none`}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="flex-1 text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md px-3 py-1.5 text-sm border border-line hover:bg-paper disabled:opacity-50">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4" data-drawer-body>
          {children}
        </div>
        {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// Centred dialog on a dark backdrop.
export function Modal({
  open,
  onClose,
  title,
  children,
  busy,
  size = "max-w-md",
  dark,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  busy?: boolean;
  size?: string;
  dark?: boolean;
}) {
  useScrollLock(open);
  useEscape(open, onClose, busy);
  const ref = useInitialFocus(open);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className={`absolute inset-0 ${dark ? "bg-black/80" : "bg-black/40"}`} onClick={() => !busy && onClose()} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${size} max-h-full overflow-y-auto overscroll-contain bg-white rounded-xl shadow-xl outline-none`}
      >
        <h2 id={titleId} className="sr-only">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// Centred panel over a dimmed, blurred page (the live Job File's + New task box): 620px wide, at
// most 92% of the screen high; only its body scrolls. Used by the job page's + New task picker and
// by the task panel when a task is opened from the job page.
export function CentredPanel({
  open,
  onClose,
  title,
  subtitle,
  head,
  children,
  footer,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  head?: ReactNode; // under the title (e.g. the Office / On site toggle)
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
}) {
  useScrollLock(open);
  useEscape(open, onClose, busy);
  const ref = useInitialFocus(open);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(30,32,34,0.5)] backdrop-blur-[3px]" onClick={() => !busy && onClose()} aria-hidden="true" data-backdrop="blur" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-panel="centred"
        className="relative flex w-full max-w-[620px] max-h-[92vh] flex-col rounded-[14px] bg-white shadow-2xl outline-none"
      >
        <div className="border-b border-[#ecece9] px-[18px] pt-4 pb-2.5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 id={titleId} className="text-[19px] font-bold">{title}</h2>
              {subtitle && <div className="mt-0.5 text-[13px] text-[#5c5f62]">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-md px-2 text-2xl leading-none text-muted hover:text-ink disabled:opacity-50">
              ×
            </button>
          </div>
          {head}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-[18px] pt-1 pb-3" data-drawer-body>
          {children}
        </div>
        {footer && <div className="border-t border-[#ecece9] px-[18px] py-3">{footer}</div>}
      </div>
    </div>
  );
}
