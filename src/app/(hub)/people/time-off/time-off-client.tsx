"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocViewer } from "@/components/ui/doc-viewer";
import { TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill, type PillTone } from "@/components/ui/register";
import { SearchBox } from "@/components/ui/search-box";
import { SelectWithAdd } from "@/components/ui/select-with-add";
import { TeamTabs } from "@/components/shell/team-tabs";
import { niceDate, niceDateTime } from "../../_registers/dates";
import { Choice, RecordSelect, StatusBox } from "../../_registers/ui";
import { deleteTimeOff, saveTimeOff, type Saved } from "./actions";
import type { TimeOffData, TimeOffRow } from "./data";
import { datesLabel, daysLabel, isWaiting, KIND_LIST, labelOf, PART_DAYS, STATUSES, waitingItems, whosOff, workingDays, type PartDay, type Status } from "./rules";

type Filter = "waiting" | "off" | "approved" | "declined" | "all";
type Open = { id: number | null; personId?: number };
const STATUS_TONE: Record<Status, PillTone> = { pending: "blue", under_review: "amber", approved: "green", declined: "grey" };

export function TimeOffClient({ initial, today, openId }: { initial: TimeOffData; today: string; openId: number | null }) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<Filter>("waiting");
  const [query, setQuery] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [open, setOpen] = useState<Open | null>(() => (openId && initial.rows.some((r) => r.id === openId) ? { id: openId } : null));
  const [reporting, setReporting] = useState(false);
  const nameOf = useMemo(() => new Map(data.people.map((p) => [p.id, p.name])), [data.people]);

  function saved(s: Saved, next: Open | null) {
    setData(s.all);
    setOpen(next);
  }

  const off = whosOff(data.rows, today);
  const offIds = new Set(off.map((r) => r.id));
  const tests: Record<Filter, (r: TimeOffRow) => boolean> = {
    waiting: (r) => isWaiting(r.status),
    off: (r) => offIds.has(r.id),
    approved: (r) => r.status === "approved",
    declined: (r) => r.status === "declined",
    all: () => true,
  };
  const q = query.trim().toLowerCase();
  const rows = data.rows
    .filter(tests[filter])
    .filter((r) => (!personFilter || String(r.personId) === personFilter) && (!kindFilter || r.kind === kindFilter))
    .filter((r) => !q || [nameOf.get(r.personId) ?? "", r.kind, r.notes, r.response, labelOf(STATUSES, r.status)].some((f) => f.toLowerCase().includes(q)));
  if (filter === "off") rows.sort((a, b) => a.fromDate.localeCompare(b.fromDate));

  const attention: AttentionItem[] = waitingItems(data.rows, today).map(({ row, level }) => ({
    key: `t${row.id}`,
    level,
    tag: labelOf(STATUSES, row.status),
    name: `${nameOf.get(row.personId) ?? ""} · ${row.kind}`,
    detail: `${datesLabel(row)} · ${daysLabel(row.days)}`,
    onOpen: () => setOpen({ id: row.id }),
  }));
  const waiting = data.rows.filter((r) => isWaiting(r.status)).length;
  const listPeople = data.people.filter((p) => p.active || data.rows.some((r) => r.personId === p.id));

  return (
    <RegisterLayout attention={attention}>
      <PageTop
        title="Team"
        countLabel={`${waiting} waiting for a decision`}
        reports={[{ label: "Create report", hint: "Choose people, dates and what to include", onSelect: () => setReporting(true) }]}
        newAction={{ label: "New time off", onSelect: () => setOpen({ id: null, personId: Number(personFilter) || undefined }) }}
      >
        <TeamTabs active="time-off" />
      </PageTop>

      <FilterPills<Filter> label="Show" value={filter} onChange={setFilter} options={[
        { value: "waiting", label: "Waiting", count: waiting },
        { value: "off", label: "Who's off (next 30 days)", count: off.length },
        { value: "approved", label: "Approved", count: data.rows.filter(tests.approved).length },
        { value: "declined", label: "Declined", count: data.rows.filter(tests.declined).length },
        { value: "all", label: "All", count: data.rows.length },
      ]} />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} label="Search time off" placeholder="Search people, types and notes" />
        <select aria-label="Person" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2">
          <option value="">Everyone</option>
          {listPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Type" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2">
          <option value="">All types</option>
          {data.kinds.map((k) => <option key={k}>{k}</option>)}
        </select>
      </FilterRow>

      <div data-testid="time-off-list">
        <DataTable label="Time off" rows={rows} rowKey={(r) => r.id} onOpen={(r) => setOpen({ id: r.id })}
          empty={q || personFilter || kindFilter ? "Nothing matches." : filter === "waiting" ? "Nothing waiting for a decision." : filter === "off" ? "Nobody is off in the next 30 days." : "No time off recorded yet."}
          columns={[
            { key: "person", label: "Person", className: "whitespace-nowrap", cell: (r) => nameOf.get(r.personId) ?? "", sub: (r) => `Asked ${niceDate(r.requestedAt.slice(0, 10))}` },
            { key: "kind", label: "Type", cell: (r) => r.kind },
            { key: "dates", label: "Dates", cell: (r) => datesLabel(r) },
            { key: "days", label: "Working days", className: "whitespace-nowrap", cell: (r) => daysLabel(r.days) },
            { key: "status", label: "Status", cell: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{labelOf(STATUSES, r.status)}</StatusPill> },
            { key: "from", label: "From", cell: (r) => (r.source === "team" ? "Team app" : "Office") },
          ]} />
      </div>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.id ? `${nameOf.get(data.rows.find((r) => r.id === open.id)?.personId ?? 0) ?? ""} · ${data.rows.find((r) => r.id === open.id)?.kind ?? ""}` : "New time off"} width="max-w-2xl">
        {open && (() => {
          const r = open.id ? data.rows.find((x) => x.id === open.id) ?? null : null;
          return <TimeOffForm key={r ? JSON.stringify(r) : `new-${open.personId ?? ""}`} row={r} personId={open.personId} data={data} onSaved={saved} />;
        })()}
      </Drawer>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} people={listPeople} today={today} />
    </RegisterLayout>
  );
}

function TimeOffForm({ row: r, personId, data, onSaved }: { row: TimeOffRow | null; personId?: number; data: TimeOffData; onSaved: (s: Saved, next: Open | null) => void }) {
  const [from, setFrom] = useState(r?.fromDate ?? "");
  const [to, setTo] = useState(r?.toDate ?? "");
  const [part, setPart] = useState<PartDay>(r?.partDay ?? "full");
  const [asking, setAsking] = useState(false);
  const end = to || from;
  const count = from && end >= from ? workingDays(from, end, from === end ? part : "full") : null;
  const people = data.people.filter((p) => p.active || p.id === (r?.personId ?? personId)).map((p) => ({ value: String(p.id), label: p.active ? p.name : `${p.name} (left)` }));

  return (
    <div>
      {r && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatusBox label="Status" value={labelOf(STATUSES, r.status)} tone={r.status === "approved" ? "ok" : r.status === "declined" ? "none" : "soon"}
            note={r.decidedBy && r.decidedAt ? `${r.decidedBy}, ${niceDateTime(r.decidedAt)}` : `Asked ${niceDateTime(r.requestedAt)}${r.source === "team" ? " in the team app" : ""}`} />
          <StatusBox label="Working days" value={daysLabel(r.days)} note={r.daysOverridden ? "Typed by the office" : "Worked out (Mon–Fri, no bank holidays)"} />
        </div>
      )}
      <GuardedForm action={saveTimeOff} onSaved={(res) => res.data && onSaved(res.data, { id: res.data.id })}>
        {(state) => {
          const err = state && !state.ok ? state.fieldErrors ?? {} : {};
          return (
            <>
              {r && <input type="hidden" name="id" value={r.id} />}
              <RecordSelect label="Person" name="person_id" options={people} defaultValue={String(r?.personId ?? personId ?? "") || ""} error={err.person_id} />
              <SelectWithAdd list={KIND_LIST} name="kind" label="Type of time off" options={data.kinds} defaultValue={r?.kind ?? "Annual leave"} />
              {err.kind && <p className="-mt-3 mb-4 text-sm text-danger">{err.kind}</p>}
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="First day off" name="from_date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} error={err.from_date} />
                <TextField label="Last day off" name="to_date" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={err.to_date} hint="Leave blank for one day" />
              </div>
              {(!end || from === end) && <Choice label="Full or part day" name="part_day" options={PART_DAYS} defaultValue={part} onChange={(v) => setPart(v as PartDay)} />}
              {from && end && from !== end && <input type="hidden" name="part_day" value="full" />}
              {err.part_day && <p className="-mt-3 mb-4 text-sm text-danger">{err.part_day}</p>}
              <TextField label="Working days" name="days" inputMode="decimal" defaultValue={r?.daysOverridden ? String(r.days) : ""} error={err.days} spellCheck={false}
                hint={count
                  ? `Worked out: ${daysLabel(count.days)}${count.bankHolidays.length ? ` (skips ${count.bankHolidays.length} bank holiday${count.bankHolidays.length === 1 ? "" : "s"})` : ""}.${count.unlisted ? " Bank holidays after 2027 aren't in the list yet: check the count." : ""} Leave blank to use it, or type the count.`
                  : "Worked out from the dates (Mon–Fri, skipping bank holidays). Leave blank to use it, or type the count."} />
              <TextArea label="Notes from the team member" name="notes" defaultValue={r?.notes} error={err.notes} rows={3} />
              <Choice label="Status" name="status" options={STATUSES} defaultValue={r?.status ?? "pending"} />
              <TextArea label="Office response" name="response" defaultValue={r?.response} error={err.response} rows={3} />
              <SaveButton>{r ? "Save" : "Add time off"}</SaveButton>
            </>
          );
        }}
      </GuardedForm>
      <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
        Files (sick notes and the like) can be added here once the hub&apos;s file routes check the Time off tick. Until then, keep them in SharePoint under CBS System/HR/Time Off.
      </p>
      {r && (
        <div className="mt-8 border-t border-line pt-5">
          <button type="button" onClick={() => setAsking(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">Delete this time off</button>
          <ConfirmDialog
            open={asking}
            title="Delete this time off?"
            message={`This deletes the ${r.kind.toLowerCase()} record for ${datesLabel(r)}. It cannot be undone.`}
            confirmLabel="Delete"
            onClose={() => setAsking(false)}
            onConfirm={async () => {
              const res = await deleteTimeOff(r.id, crypto.randomUUID());
              if (res.ok && res.data) onSaved(res.data, null);
              return res;
            }}
          />
        </div>
      )}
    </div>
  );
}

// "Create report": the office chooses people, dates and what to include; the PDF opens in-window.
function ReportDialog({ open, onClose, people, today }: { open: boolean; onClose: () => void; people: { id: number; name: string }[]; today: string }) {
  const [who, setWho] = useState("");
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(`${today.slice(0, 4)}-12-31`);
  const [declined, setDeclined] = useState(false);
  const [notes, setNotes] = useState(false);
  const [url, setUrl] = useState("");
  const box = "h-4 w-4 accent-brand";
  const bad = !from || !to || to < from;
  return (
    <>
      <Modal open={open && !url} onClose={onClose} title="Create report" size="max-w-md">
        <div className="p-5">
          <p className="text-lg font-semibold mb-3" aria-hidden="true">Create report</p>
          <label htmlFor="time-off-report-who" className="block text-sm font-medium mb-1">People</label>
          <select id="time-off-report-who" value={who} onChange={(e) => setWho(e.target.value)} className="mb-4 w-full rounded-lg border border-line bg-white px-3 py-2">
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-x-3">
            <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm mb-1"><input type="checkbox" className={box} checked={declined} onChange={(e) => setDeclined(e.target.checked)} /> Include declined requests</label>
          <label className="flex items-center gap-2 text-sm mb-4"><input type="checkbox" className={box} checked={notes} onChange={(e) => setNotes(e.target.checked)} /> Include notes and office responses</label>
          {bad && <p role="alert" className="text-sm text-danger mb-2">Choose a date range.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-line">Cancel</button>
            <button type="button" disabled={bad} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50"
              onClick={() => {
                const p = new URLSearchParams({ from, to });
                if (who) p.set("person", who);
                if (declined) p.set("declined", "1");
                if (notes) p.set("notes", "1");
                setUrl(`/people/time-off/report?${p}`);
              }}>
              Create report
            </button>
          </div>
        </div>
      </Modal>
      <DocViewer file={url ? { id: 0, name: "Time off.pdf", mime: "application/pdf", url } : null} onClose={() => { setUrl(""); onClose(); }} />
    </>
  );
}
