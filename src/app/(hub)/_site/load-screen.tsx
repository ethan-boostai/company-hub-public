"use client";

import { useState, type ReactNode } from "react";
import { inputClass } from "@/components/ui/fields";
import { niceDate, niceDateTime } from "../_registers/dates";
import { qty as fmt } from "../equipment/rules";
import type { Sheet, SheetLine, LoadResult } from "./load-up";
import { KIND_LABELS, OUTCOME_LABELS, outcomeOf, reasonLabel, reasonsFor, type Reason } from "./load-up-rules";

type Answer = { ticked: boolean; qty: string; reason: string; note: string };
type Reply = { ok: boolean; message: string };

const hasQty = (l: SheetLine) => l.kind === "material" || l.kind === "custom_material" || l.kind === "buy";

// The crew's checklist for one load-up sheet: tick what goes in the van, say why anything doesn't,
// then Mark as loaded. Used in the hub (signed-in name) and the yard app (name picked per action).
export function LoadScreen({ sheet, onLoad, onReport, ready = true, blocked, nameSlot }: {
  sheet: Sheet;
  onLoad: (results: LoadResult[], extra: string) => Promise<Reply>;
  onReport: (text: string) => Promise<Reply>;
  ready?: boolean; // false until the person has chosen their name (yard app)
  blocked?: string; // why the buttons can't be used yet
  nameSlot?: ReactNode;
}) {
  const [answers, setAnswers] = useState<Record<number, Answer>>(() =>
    Object.fromEntries(sheet.lines.map((l) => [l.id, { ticked: false, qty: l.qty == null ? "" : String(l.qty), reason: "", note: "" }])));
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Reply | null>(null);
  const [problem, setProblem] = useState("");
  const [reporting, setReporting] = useState(false);
  const [asked, setAsked] = useState(false); // Mark as loaded was pressed with lines not loaded
  const set = (id: number, a: Partial<Answer>) => setAnswers((x) => ({ ...x, [id]: { ...x[id], ...a } }));

  if (sheet.status === "loaded") return <LoadedView sheet={sheet} />;

  const outcome = (l: SheetLine) => {
    const a = answers[l.id];
    const q = a.qty.trim() === "" ? null : Number(a.qty);
    return outcomeOf({ kind: l.kind, qty: l.qty }, a.ticked, hasQty(l) ? q : null);
  };
  const missing = sheet.lines.filter((l) => outcome(l) !== "loaded" && !answers[l.id].reason);

  async function load() {
    if (busy || !ready) return;
    if (missing.length) {
      setAsked(true);
      setMsg({ ok: false, message: `Say why these weren't loaded: ${missing.map((l) => l.name).join(", ")}.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const results: LoadResult[] = sheet.lines.map((l) => {
        const a = answers[l.id];
        return { lineId: l.id, ticked: a.ticked, loadedQty: hasQty(l) && a.qty.trim() !== "" ? Number(a.qty) : null, reason: (a.reason || null) as Reason | null, note: a.note || null };
      });
      setMsg(await onLoad(results, extra));
    } catch {
      setMsg({ ok: false, message: "It wasn't saved. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function report() {
    if (busy || !ready || !problem.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await onReport(problem);
      setMsg(r);
      if (r.ok) {
        setProblem("");
        setReporting(false);
      }
    } catch {
      setMsg({ ok: false, message: "It wasn't sent. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const groups: [string, SheetLine[]][] = [
    ["Equipment", sheet.lines.filter((l) => l.kind === "equipment" || l.kind === "custom_equipment")],
    ["Materials", sheet.lines.filter((l) => l.kind === "material" || l.kind === "custom_material")],
    ["Buy on the way", sheet.lines.filter((l) => l.kind === "buy")],
  ];

  return (
    <div data-testid="load-screen">
      <SheetHeader sheet={sheet} />
      {nameSlot}
      {groups.map(([title, lines]) => lines.length > 0 && (
        <section key={title} className="mb-5">
          <h3 className="mb-2 font-semibold">{title}</h3>
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {lines.map((l) => {
              const a = answers[l.id];
              const out = outcome(l);
              return (
                <li key={l.id} className="p-3" data-testid={`load-line-${l.id}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex min-w-0 flex-1 items-start gap-3 cursor-pointer">
                      <input type="checkbox" className="mt-1 h-5 w-5 accent-brand" checked={a.ticked} onChange={(e) => set(l.id, { ticked: e.target.checked })}
                        aria-label={`${title === "Buy on the way" ? "Bought" : "Loaded"}: ${l.name}`} />
                      <span className="min-w-0">
                        <span className="font-medium">{l.name}</span>
                        <span className="block text-xs text-muted">
                          {[l.kind === "equipment" || l.kind === "material" ? l.category : l.kind === "buy" ? "" : KIND_LABELS[l.kind],
                            l.qty != null ? `Planned ${fmt(l.qty)} ${l.unit}`.trim() : "", l.fromLabel ? `from ${l.fromLabel}` : "",
                            l.buyFrom ? `from ${l.buyFrom}` : "", l.buyNote].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </label>
                    {hasQty(l) && a.ticked && (
                      <label className="flex items-center gap-2 text-sm">
                        <span>Qty</span>
                        <input value={a.qty} onChange={(e) => set(l.id, { qty: e.target.value })} inputMode="decimal" spellCheck={false}
                          className={`${inputClass} w-24`} aria-label={`Quantity loaded: ${l.name}`} />
                        <span className="text-muted">{l.unit}</span>
                      </label>
                    )}
                  </div>
                  {out !== "loaded" && (out === "part" || a.reason || asked) && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-[14rem_1fr] pl-8">
                      <select value={a.reason} onChange={(e) => set(l.id, { reason: e.target.value })} className={inputClass}
                        aria-label={`Why not ${out === "part" ? "all " : ""}loaded: ${l.name}`}>
                        <option value="">{out === "part" ? "Why not all of it?" : "Why not?"}</option>
                        {reasonsFor(l.kind).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <input value={a.note} onChange={(e) => set(l.id, { note: e.target.value })} spellCheck placeholder="Note (optional)"
                        className={inputClass} aria-label={`Note: ${l.name}`} maxLength={500} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {sheet.ppe.length > 0 && <p className="mb-2 text-sm"><strong>PPE:</strong> {sheet.ppe.join(", ")}</p>}
      {sheet.notes && <p className="mb-4 whitespace-pre-line text-sm"><strong>Notes:</strong> {sheet.notes}</p>}

      <label className="mb-4 block">
        <span className="mb-1 block text-sm font-medium">Anything else?</span>
        <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={2} spellCheck maxLength={2000} className={inputClass} />
      </label>
      {blocked && !ready && <p className="mb-3 text-sm text-danger">{blocked}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={load} disabled={busy || !ready} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-60">
          {busy ? "Saving…" : asked && sheet.lines.some((l) => outcome(l) !== "loaded") ? "Load and tell the office" : "Mark as loaded"}
        </button>
        <button type="button" onClick={() => setReporting((x) => !x)} disabled={busy} className="px-4 py-2 rounded-lg border border-line bg-white font-semibold">
          Report a problem
        </button>
      </div>
      {reporting && (
        <div className="mt-3 rounded-xl border border-line bg-white p-3">
          <label className="mb-2 block">
            <span className="mb-1 block text-sm font-medium">What&apos;s the problem?</span>
            <textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={3} spellCheck maxLength={2000} className={inputClass} />
          </label>
          <button type="button" onClick={report} disabled={busy || !ready || !problem.trim()} className="px-4 py-2 rounded-lg bg-dark text-white font-semibold disabled:opacity-60">
            {busy ? "Sending…" : "Send to the office"}
          </button>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.message}</p>}
    </div>
  );
}

export function SheetHeader({ sheet }: { sheet: Sheet }) {
  return (
    <dl className="mb-4 grid grid-cols-[8.5rem_1fr] gap-y-1.5 text-sm">
      <dt className="font-semibold">Date</dt><dd>{niceDate(sheet.sheetDate)}</dd>
      <dt className="font-semibold">Job</dt><dd>{sheet.jobNo}{sheet.jobTitle ? ` · ${sheet.jobTitle}` : ""}</dd>
      {sheet.site && <><dt className="font-semibold">Site</dt><dd>{sheet.site}</dd></>}
      <dt className="font-semibold">Van</dt><dd>{sheet.vehicleLabel || "Not set"}</dd>
      <dt className="font-semibold">Crew</dt><dd>{sheet.crewNames.join(", ") || "Not set"}</dd>
      <dt className="font-semibold">Due back</dt><dd>{sheet.dueBack ? niceDate(sheet.dueBack) : "Not set"}</dd>
      <dt className="font-semibold">Prepared by</dt><dd>{sheet.preparedBy || "Not set"}</dd>
    </dl>
  );
}

// After loading: what went, line by line, and any problems.
export function LoadedView({ sheet }: { sheet: Sheet }) {
  return (
    <div data-testid="loaded-view">
      <SheetHeader sheet={sheet} />
      <p className="mb-3 text-sm">Loaded {niceDateTime(sheet.loadedAt)} by {sheet.loadedBy}.</p>
      <ul className="mb-4 divide-y divide-line rounded-xl border border-line bg-white text-sm">
        {sheet.lines.map((l) => (
          <li key={l.id} className="flex flex-wrap justify-between gap-2 p-3">
            <span>{l.name}{l.qty != null ? ` (${fmt(l.qty)} ${l.unit})`.replace(" )", ")") : ""}</span>
            <span className={l.outcome === "loaded" ? "text-ok" : "text-danger"}>
              {l.outcome ? OUTCOME_LABELS[l.outcome] : ""}{l.outcome === "part" && l.loadedQty != null ? `: ${fmt(l.loadedQty)}` : ""}
              {l.reason ? ` (${reasonLabel(l.reason)}${l.reasonNote ? `: ${l.reasonNote}` : ""})` : ""}
            </span>
          </li>
        ))}
      </ul>
      {sheet.problems && (
        <section className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
          <h3 className="mb-1 font-semibold">Problems reported</h3>
          <p className="whitespace-pre-line">{sheet.problems}</p>
        </section>
      )}
    </div>
  );
}
