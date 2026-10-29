"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { Chip, ViewSwitch } from "../_registers/ui";
import type { Saved } from "./actions";
import type { TrainingData } from "./data";
import { TrainingForm, type Open } from "./forms";
import { ReportDialog, type MatrixChoice } from "./report-dialog";
import {
  bestFor, bestRecords, cellText, isSuperseded, MATRIX_COLOURS, matrixPeople, matrixTickets, STANDARD_QUALS, STATE_TONE, ticketLabel, ticketState,
  trainingDueItems, type PeopleChoice, type TicketChoice, type TicketState,
} from "./rules";

type Tab = "records" | "matrix";

const cellStyle = (s: TicketState) => ({ backgroundColor: MATRIX_COLOURS[s].fill, color: MATRIX_COLOURS[s].text });

export function TrainingClient({ initial, today, start }: { initial: TrainingData; today: string; start: Tab }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>(start);
  const [open, setOpen] = useState<Open | null>(null);
  const [reporting, setReporting] = useState(false);
  const [query, setQuery] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [peopleChoice, setPeopleChoice] = useState<PeopleChoice>("active");
  const [ticketChoice, setTicketChoice] = useState<TicketChoice>("on_file");
  const [chosen, setChosen] = useState<string[]>([]);
  const [matrixQuery, setMatrixQuery] = useState("");

  const best = useMemo(() => bestRecords(data.records), [data.records]);
  const due = useMemo(() => trainingDueItems(data.records, data.people, today), [data, today]);
  const nameOf = useMemo(() => new Map(data.people.map((p) => [p.id, p.name])), [data.people]);

  function saved(s: Saved, next: Open | null) {
    setData(s.all);
    setOpen(next);
  }

  // Training records list.
  const q = query.trim().toLowerCase();
  const records = data.records
    .filter((r) => (showOld || !isSuperseded(best, r)) && (!personFilter || String(r.personId) === personFilter) &&
      (!q || [nameOf.get(r.personId) ?? "", r.qualification, r.provider, r.reference, r.notes].some((f) => f.toLowerCase().includes(q))))
    .sort((a, b) => (nameOf.get(a.personId) ?? "").localeCompare(nameOf.get(b.personId) ?? "") || a.qualification.localeCompare(b.qualification) || b.id - a.id);
  const listPeople = data.people.filter((p) => p.active || data.records.some((r) => r.personId === p.id));

  // Matrix.
  const mq = matrixQuery.trim().toLowerCase();
  const people = matrixPeople(data.people, data.records, peopleChoice).filter((p) => !mq || p.name.toLowerCase().includes(mq));
  const tickets = matrixTickets(data.records, ticketChoice, chosen);
  const allTickets = matrixTickets(data.records, "standard");
  const matrix: MatrixChoice = { people: peopleChoice, tickets: ticketChoice, chosen };

  return (
    <div>
      <section className="mb-5 bg-white border border-line rounded-xl" data-testid="attention">
        <h2 className="font-semibold px-4 py-3 flex items-center gap-2">
          <span className="flex-1">Tickets expired or expiring</span>
          <span className="text-sm text-muted font-normal">{due.length === 0 ? "Nothing expiring in the next 60 days" : `${due.length} ticket${due.length === 1 ? "" : "s"}`}</span>
        </h2>
        {due.length > 0 && (
          <ul className="divide-y divide-line border-t border-line">
            {due.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => setOpen({ id: d.id })} className="w-full text-left px-4 py-2 hover:bg-paper flex flex-wrap items-center gap-x-3">
                  <Chip tone={STATE_TONE[d.state]}>{d.state === "expired" ? "Expired" : "Expiring"}</Chip>
                  <span className="font-medium">{d.person}</span>
                  <span>{d.qualification}</span>
                  <span className="text-sm text-muted">{d.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ViewSwitch<Tab> value={tab} onChange={setTab} options={[
        { value: "records", label: "Training records", count: data.records.filter((r) => !isSuperseded(best, r)).length },
        { value: "matrix", label: "Matrix" },
      ]} />

      {tab === "records" && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex-1 min-w-56">
              <SearchBox value={query} onChange={setQuery} label="Search training" placeholder="Search people, tickets, providers and numbers" />
            </div>
            <select aria-label="Person" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2">
              <option value="">Everyone</option>
              {listPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Show replaced records
            </label>
            <button type="button" onClick={() => setOpen({ id: null, personId: Number(personFilter) || undefined })} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">Add training</button>
            <button type="button" onClick={() => setReporting(true)} className="px-4 py-2 rounded-lg border border-dark font-semibold hover:bg-white">Create report</button>
          </div>
          <div className="bg-white border border-line rounded-xl overflow-hidden">
            <ul className="divide-y divide-line" data-testid="training-list">
              {records.map((r) => {
                const old = isSuperseded(best, r);
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => setOpen({ id: r.id })} className="w-full text-left px-4 py-3 hover:bg-paper flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{nameOf.get(r.personId)} · {r.qualification}</span>
                        <span className="block text-sm text-muted truncate">{[r.provider, r.reference].filter(Boolean).join(" · ")}</span>
                      </span>
                      {old ? <Chip>Replaced</Chip> : <Chip tone={STATE_TONE[ticketState(r, today)]}>{ticketLabel(r, today)}</Chip>}
                    </button>
                  </li>
                );
              })}
              {records.length === 0 && <li className="px-4 py-6 text-sm text-muted">{q || personFilter ? "Nothing matches." : "No training recorded yet."}</li>}
            </ul>
          </div>
        </>
      )}

      {tab === "matrix" && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex-1 min-w-56">
              <SearchBox value={matrixQuery} onChange={setMatrixQuery} label="Search people on the matrix" placeholder="Search people" />
            </div>
            <select aria-label="People" value={peopleChoice} onChange={(e) => setPeopleChoice(e.target.value as PeopleChoice)} className="rounded-lg border border-line bg-white px-3 py-2">
              <option value="active">Everyone active</option>
              <option value="crew">Crew list only</option>
            </select>
            <select aria-label="Tickets" value={ticketChoice} onChange={(e) => {
              const v = e.target.value as TicketChoice;
              if (v === "chosen" && chosen.length === 0) setChosen(matrixTickets(data.records, "on_file"));
              setTicketChoice(v);
            }} className="rounded-lg border border-line bg-white px-3 py-2">
              <option value="on_file">Tickets on file</option>
              <option value="standard">All standard tickets</option>
              <option value="chosen">Choose tickets…</option>
            </select>
            <button type="button" onClick={() => setReporting(true)} className="px-4 py-2 rounded-lg border border-dark font-semibold hover:bg-white">Create report</button>
          </div>
          {ticketChoice === "chosen" && (
            <fieldset className="mb-3 bg-white border border-line rounded-xl p-3">
              <legend className="text-sm font-medium px-1">Tickets to show</legend>
              <div className="grid sm:grid-cols-3 gap-1">
                {allTickets.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-brand" checked={chosen.includes(t)}
                      onChange={() => setChosen((c) => (c.includes(t) ? c.filter((x) => x !== t) : allTickets.filter((x) => x === t || c.includes(x))))} /> {t}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <p className="text-sm text-muted mb-2 flex flex-wrap gap-2 items-center">
            {(["valid", "expiring", "expired", "missing"] as const).map((k) => (
              <span key={k} className="rounded px-2 py-0.5" style={cellStyle(k)}>{MATRIX_COLOURS[k].label}</span>
            ))}
            <span>Select a ticket to open it, or a gap to add one.</span>
          </p>
          {people.length === 0 || tickets.length === 0 ? (
            <p className="bg-white border border-line rounded-xl px-4 py-6 text-sm text-muted">
              {people.length === 0 ? (mq ? "Nobody matches the search." : "Nobody to show. Tick people for the crew list on People.") : "No tickets to show. Choose All standard tickets to fill gaps."}
            </p>
          ) : (
            <div className="bg-white border border-line rounded-xl overflow-x-auto" data-testid="matrix">
              <table className="text-sm border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 bg-brand text-white text-left px-3 py-2 min-w-40">Person</th>
                    {tickets.map((t) => <th key={t} scope="col" className="bg-brand text-white font-semibold px-2 py-2 min-w-24 text-center">{t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.id}>
                      <th scope="row" className="sticky left-0 z-10 bg-white text-left px-3 py-2 border-b border-line whitespace-nowrap">
                        <button type="button" className="font-semibold hover:underline" onClick={() => { setPersonFilter(String(p.id)); setTab("records"); }}>
                          {p.name}{!p.active && " (left)"}
                        </button>
                      </th>
                      {tickets.map((t) => {
                        const r = bestFor(best, p.id, t);
                        const s = ticketState(r, today);
                        const text = cellText(r, today);
                        return (
                          <td key={t} className="p-0 border border-white">
                            <button type="button" aria-label={`${p.name}, ${t}: ${s === "missing" ? "missing" : text}`}
                              onClick={() => setOpen(r ? { id: r.id } : { id: null, personId: p.id, qualification: t })}
                              style={cellStyle(s)} className="w-full px-2 py-2 font-semibold text-center whitespace-nowrap hover:brightness-95">
                              {text}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {open && (() => {
        const r = open.id ? data.records.find((x) => x.id === open.id) ?? null : null;
        if (open.id && !r) return null;
        const title = r ? `${nameOf.get(r.personId)} · ${r.qualification}` : "Add training";
        return (
          <Drawer open onClose={() => setOpen(null)} title={title} width="max-w-2xl">
            <TrainingForm key={r ? JSON.stringify(r) : `new-${open.personId ?? ""}-${open.qualification ?? ""}`} record={r} prefill={open}
              data={data} today={today} onOpen={setOpen} onSaved={saved} />
          </Drawer>
        );
      })()}
      <ReportDialog open={reporting} onClose={() => setReporting(false)} matrix={matrix} standardCount={STANDARD_QUALS.length} />
    </div>
  );
}
