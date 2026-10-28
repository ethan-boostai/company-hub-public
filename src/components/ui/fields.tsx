"use client";

import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 focus:outline-none focus:border-brand disabled:bg-paper";

// Text inputs always have spell check on (UK English comes from <html lang="en-GB">).
export function TextField({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium mb-1">{label}</label>
      <input id={id} spellCheck {...props} className={inputClass} aria-invalid={!!error} />
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function TextArea({
  label,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium mb-1">{label}</label>
      <textarea id={id} spellCheck rows={4} {...props} className={inputClass} aria-invalid={!!error} />
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function CheckboxField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className="mb-3 flex items-center gap-2">
      <input id={id} type="checkbox" {...props} className="h-5 w-5 accent-brand" />
      <label htmlFor={id} className="text-sm">{label}</label>
    </div>
  );
}

export { inputClass };
