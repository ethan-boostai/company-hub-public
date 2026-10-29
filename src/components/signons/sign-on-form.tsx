"use client";

import { useId, useState } from "react";
import { inputClass } from "@/components/ui/fields";
import { SignaturePad } from "@/components/ui/signature-pad";

export type SignPayload = { name: string; isWorker: boolean; company: string; accepted: boolean; signature: string };

const OTHER = "__not_listed__";

// One person signs on: pick your name (on site today first), CBS or another company, tick to accept,
// sign. After signing, "Next person" clears it for the next one on the same device. The name is never
// remembered.
export function SignOnForm({
  docLabel,
  acceptText,
  names,
  onSign,
}: {
  docLabel: string;
  acceptText: string;
  names: { today: string[]; crew: string[] };
  onSign: (p: SignPayload) => Promise<{ ok: boolean; message?: string }>;
}) {
  const id = useId();
  const [round, setRound] = useState(0);
  const [pick, setPick] = useState("");
  const [typed, setTyped] = useState("");
  const [isWorker, setIsWorker] = useState(true);
  const [company, setCompany] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ name: string; note?: string } | null>(null);

  const name = pick === OTHER ? typed.trim() : pick;
  const ready = !!name && accepted && !!signature && (isWorker || !!company.trim());

  async function sign() {
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      const r = await onSign({ name, isWorker, company, accepted, signature });
      if (r.ok) setDone({ name, note: r.message });
      else setError(r.message || "It wasn't saved. Try again.");
    } catch {
      setError("It wasn't saved. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setRound((n) => n + 1);
    setPick("");
    setTyped("");
    setIsWorker(true);
    setCompany("");
    setAccepted(false);
    setSignature("");
    setError("");
    setDone(null);
  }

  if (done) {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="font-semibold text-ok">{done.name} has signed {docLabel}.</p>
        {done.note && done.note !== "Signed." && <p className="mt-1 text-sm">{done.note}</p>}
        <button type="button" onClick={next} className="mt-3 px-4 py-2 rounded-lg bg-brand text-white font-semibold">Next person</button>
      </div>
    );
  }

  return (
    <div key={round}>
      <div className="mb-4">
        <label htmlFor={`${id}-name`} className="block text-sm font-medium mb-1">Your name</label>
        <select id={`${id}-name`} value={pick} onChange={(e) => setPick(e.target.value)} className={inputClass}>
          <option value="">Choose your name…</option>
          {names.today.length > 0 && (
            <optgroup label="On site today">
              {names.today.map((n) => <option key={`t-${n}`} value={n}>{n}</option>)}
            </optgroup>
          )}
          {names.crew.length > 0 && (
            <optgroup label="Team">
              {names.crew.map((n) => <option key={`c-${n}`} value={n}>{n}</option>)}
            </optgroup>
          )}
          <option value={OTHER}>Not listed: type my name</option>
        </select>
      </div>
      {pick === OTHER && (
        <div className="mb-4">
          <label htmlFor={`${id}-typed`} className="block text-sm font-medium mb-1">Your full name</label>
          <input id={`${id}-typed`} value={typed} onChange={(e) => setTyped(e.target.value)} spellCheck autoComplete="off" className={inputClass} />
        </div>
      )}
      <fieldset className="mb-4">
        <legend className="block text-sm font-medium mb-1">Who do you work for?</legend>
        <div className="flex flex-wrap gap-2">
          {[true, false].map((w) => (
            <button key={String(w)} type="button" aria-pressed={isWorker === w} onClick={() => setIsWorker(w)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${isWorker === w ? "border-brand bg-brand text-white" : "border-line bg-white"}`}>
              {w ? "Chelmsford Building Services" : "Another company"}
            </button>
          ))}
        </div>
      </fieldset>
      {!isWorker && (
        <div className="mb-4">
          <label htmlFor={`${id}-company`} className="block text-sm font-medium mb-1">Company</label>
          <input id={`${id}-company`} value={company} onChange={(e) => setCompany(e.target.value)} spellCheck autoComplete="off" className={inputClass} />
        </div>
      )}
      <label className="mb-4 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand" />
        <span>{acceptText}</span>
      </label>
      <SignaturePad onChange={setSignature} label="Sign here" />
      <button type="button" onClick={sign} disabled={busy || !ready} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">
        {busy ? "Saving…" : "Sign"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
