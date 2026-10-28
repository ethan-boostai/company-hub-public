"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { REQUEST_KEY_FIELD, type ActionResult } from "@/lib/action-types";

function newKey() {
  return crypto.randomUUID();
}

// A form that can never save twice: every save carries a one-time key, so a double click or a
// retried request sends the same key and the server refuses the second one. The key changes
// when the form is edited or a save fails, so the next real save gets a fresh key.
//
// It submits through onSubmit, not the form's action prop: React resets a form with an action prop
// after every save, even a refused one, which cleared everything the user typed. Here the fields are
// kept when a save is refused and reset only after a successful save (as before).
const PendingContext = createContext(false);

export function GuardedForm<T>({
  action,
  onSaved,
  children,
  className,
}: {
  action: (form: FormData) => Promise<ActionResult<T>>;
  onSaved?: (result: ActionResult<T> & { ok: true }) => void;
  children: ReactNode | ((state: ActionResult<T> | null) => ReactNode);
  className?: string;
}) {
  const [key, setKey] = useState("");
  // The key is made in the browser after load, never on the server: a server-made key could end up
  // in a cached page and be shared by two people.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setKey(newKey()), []);

  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult<T> | null, FormData>(async (prev, form) => {
    const result = await action(form);
    if (result.ok) {
      formRef.current?.reset();
      onSaved?.(result);
      return result;
    }
    if (result.duplicate && prev?.ok) return prev; // the first save already went through
    if (!result.duplicate) setKey(newKey());
    return result;
  }, null);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(form));
      }}
      onChange={() => setKey(newKey())}
      className={className}
      noValidate
    >
      <PendingContext.Provider value={pending}>
        <input type="hidden" name={REQUEST_KEY_FIELD} value={key} />
        {typeof children === "function" ? children(state) : children}
        <FormMessage state={state} />
      </PendingContext.Provider>
    </form>
  );
}

function FormMessage({ state }: { state: ActionResult<unknown> | null }) {
  if (!state || (state.ok && !state.message)) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`mt-3 text-sm ${state.ok ? "text-ok" : "text-danger"}`}>
      {state.message}
    </p>
  );
}

// Save button: disabled from the moment it is pressed until the server answers.
export function SaveButton({ children = "Save", className = "" }: { children?: ReactNode; className?: string }) {
  const pending = useContext(PendingContext);
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`px-4 py-2 rounded-lg bg-brand text-white font-semibold hover:bg-brand-dark disabled:opacity-60 ${className}`}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
