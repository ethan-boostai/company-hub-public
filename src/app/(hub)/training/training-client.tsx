"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { TeamTabs } from "@/components/shell/team-tabs";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill, type PillTone } from "@/components/ui/register";

const PILL_TONE: Record<TicketState, PillTone> = { valid: "green", expiring: "amber", expired: "red", missing: "grey" };
import type { Saved } from "./actions";
import type { TrainingData } from "./data";
import { TrainingForm, type Open } from "./forms";
import { ReportDialog, type MatrixChoice } from "./report-dialog";
import {
  bestFor, bestRecords, cellText, isSuperseded, MATRIX_COLOURS, matrixPeople, matrixTickets, STANDARD_QUALS, ticketLabel, ticketState,
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

  const attention: AttentionItem[] = due.map((d) => ({
    key: `t${d.id}`,
    level: d.state === "expired" ? "overdue" : "soon",
    tag: d.state === "expired" ? "Expired" : "Expiring",
    name: d.person,
    detail: `${d.qualification} · ${d.detail}`,
    onOpen: () => setOpen({ id: d.id }),
  }));
  const current = data.records.filter((r) => !isSuperseded(best, r)).length;

  return (
    <RegisterLayout attention={attention}>
      <PageTop
        title="Team"
        countLabel={`${current} training record${current === 1 ? "" : "s"}`}
        reports={[{ label: "Create report", hint: "The training matrix, A4 landscape", onSelect: () => setReporting(true) }]}
        newAction={{ label: "New training record", onSelect: () => setOpen({ id: null, personId: Number(personFilter) || undefined }) }}
      >
        <TeamTabs active="training" />
      </PageTop>

      <FilterPills<Tab> label="Show" value={tab} onChange={setTab} options={[
        { value: "records", label: "Training records", count: current },
        { value: "matrix", label: "Matrix" },
      ]} />

      {tab === "records" && (
        <>
          <FilterRow>
            <SearchBox value={query} onChange={setQuery} label="Search training" placeholder="Search people, tickets, providers and numbers" />
            <select aria-label="Person" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2">
              <option value="">Everyone</option>
              {listPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Show replaced records
            </label>
          </FilterRow>
          <div data-testid="training-list">
            <DataTable label="Training records" rows={records} rowKey={(r) => r.id} onOpen={(r) => setOpen({ id: r.id })}
              empty={q || personFilter ? "Nothing matches." : "No training recorded yet."} columns={[
                { key: "person", label: "Person", cell: (r) => nameOf.get(r.personId) ?? "" },
                { key: "ticket", label: "Ticket or qualification", cell: (r) => r.qualification },
                { key: "ref", label: "Provider / number", cell: (r) => [r.provider, r.reference].filter(Boolean).join(" · ") },
                { key: "status", label: "Status", cell: (r) => (isSuperseded(best, r)
                  ? <StatusPill tone="grey">Replaced</StatusPill>
                  : <StatusPill tone={PILL_TONE[ticketState(r, today)]}>{ticketLabel(r, today)}</StatusPill>) },
              ]} />
          </div>
        </>
      )}

      {tab === "matrix" && (
        <>
          <FilterRow>
            <SearchBox value={matrixQuery} onChange={setMatrixQuery} label="Search people on the matrix" placeholder="Search people" />
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
          </FilterRow>
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
    </RegisterLayout>
  );
}
