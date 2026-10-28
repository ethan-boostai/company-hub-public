"use client";

import { useActionState, useState } from "react";
import { signIn, type SignInState } from "./actions";
import { SearchBox } from "@/components/ui/search-box";

export function SignInForm({ names, next }: { names: string[]; next: string }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [query, setQuery] = useState("");
  const [state, action, pending] = useActionState<SignInState, FormData>(async (prev, form) => {
    const result = await signIn(prev, form);
    setPin("");
    return result;
  }, {});

  if (!name) {
    const shown = names.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase()));
    return (
      <div className="bg-white border border-line rounded-xl p-4">
        <p className="text-sm text-muted mb-3">Pick your name</p>
        <SearchBox value={query} onChange={setQuery} placeholder="Search names" label="Search names" />
        <ul className="mt-3 grid gap-2">
          {shown.map((n) => (
            <li key={n}>
              <button
                type="button"
                onClick={() => setName(n)}
                className="w-full text-left px-4 py-3 rounded-lg border border-line hover:border-brand hover:bg-brand/5 font-medium"
              >
                {n}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="text-sm text-muted px-1">No names match.</li>}
        </ul>
      </div>
    );
  }

  const press = (d: string) => {
    if (pending || pin.length >= 4) return;
    setPin(pin + d);
  };

  return (
    <form action={action} className="bg-white border border-line rounded-xl p-5">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="next" value={next} />
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted">Signing in as</p>
          <p className="font-semibold text-lg">{name}</p>
        </div>
        <button type="button" disabled={pending} className="text-sm underline text-muted" onClick={() => { setName(""); setPin(""); }}>
          Not you?
        </button>
      </div>
      <label htmlFor="pin" className="block text-sm font-medium mb-1">4-digit PIN</label>
      <input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        pattern="\d{4}"
        maxLength={4}
        autoFocus
        value={pin}
        disabled={pending}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        className="w-full text-center text-2xl tracking-[0.6em] py-3 border border-line rounded-lg focus:outline-none focus:border-brand"
        aria-describedby="pin-msg"
      />
      <div className="grid grid-cols-3 gap-2 mt-4" aria-hidden="true">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" tabIndex={-1} onClick={() => press(d)} disabled={pending} className="py-3 rounded-lg border border-line text-lg font-semibold hover:bg-paper">
            {d}
          </button>
        ))}
        <button type="button" tabIndex={-1} onClick={() => setPin(pin.slice(0, -1))} disabled={pending} className="py-3 rounded-lg border border-line text-sm hover:bg-paper">
          Back
        </button>
        <button type="button" tabIndex={-1} onClick={() => press("0")} disabled={pending} className="py-3 rounded-lg border border-line text-lg font-semibold hover:bg-paper">
          0
        </button>
        <span />
      </div>
      <p id="pin-msg" role="alert" className="min-h-6 mt-3 text-sm text-danger">{state.message}</p>
      <button
        type="submit"
        disabled={pending || pin.length !== 4}
        className="w-full mt-2 py-3 rounded-lg bg-brand text-white font-semibold disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
