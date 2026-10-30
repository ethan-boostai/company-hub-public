"use client";

import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

// The one button. Every hub page uses it (CLAUDE.md, "Page standard"); nobody styles their own.
//   tone:  primary = the orange one (one per page or dialog), secondary = white with a line,
//          danger = red (deletes, behind an are-you-sure), quiet = no border (small in-line actions).
//   size:  page = the page top's height (same as Reports ▾ and More ▾), form = dialogs and panels.
// No double saves: while `busy` is true, or while a promise returned by onClick is running, the
// button is disabled and shows `busyLabel`. Server actions still guard on their side.
export { buttonClass, type ButtonSize, type ButtonTone } from "./button-class";
import { buttonClass, type ButtonSize, type ButtonTone } from "./button-class";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  tone?: ButtonTone;
  size?: ButtonSize;
  busy?: boolean;
  busyLabel?: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => unknown;
};

export function Button({ tone = "secondary", size = "form", busy, busyLabel, onClick, disabled, className = "", type = "button", children, ...rest }: Props) {
  const [running, setRunning] = useState(false);
  const lock = useRef(false);
  const working = !!busy || running;

  async function click(e: React.MouseEvent<HTMLButtonElement>) {
    if (lock.current || working) return;
    const r = onClick?.(e);
    if (r && typeof (r as Promise<unknown>).then === "function") {
      lock.current = true;
      setRunning(true);
      try {
        await r;
      } finally {
        lock.current = false;
        setRunning(false);
      }
    }
  }

  return (
    <button
      type={type}
      {...rest}
      onClick={onClick ? click : undefined}
      disabled={disabled || working}
      aria-busy={working || undefined}
      className={buttonClass(tone, size, className)}
    >
      {working && busyLabel ? busyLabel : children}
    </button>
  );
}
