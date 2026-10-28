"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useScrollLock } from "./scroll-lock";

function useEscape(open: boolean, onClose: () => void, disabled?: boolean) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disabled) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, disabled]);
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
