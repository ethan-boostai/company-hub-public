"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocViewer, type ViewableFile } from "@/components/ui/doc-viewer";
import { CheckboxField, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageTop, RegisterLayout } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill, type Column } from "@/components/ui/register";
import { SearchBox } from "@/components/ui/search-box";
import { TeamTabs } from "@/components/shell/team-tabs";
import { markPersonLeft, savePerson, setPersonPin } from "./actions";
import type { PersonRow } from "./data";

type Editing = PersonRow | "new" | null;
type Filter = "current" | "left" | "signin" | "crew" | "all";

const FILTERS: { value: Filter; label: string; test: (p: PersonRow) => boolean }[] = [
  { value: "current", label: "Current", test: (p) => p.active },
  { value: "left", label: "Left", test: (p) => !p.active },
  { value: "signin", label: "Hub sign-in", test: (p) => p.active && p.canSignIn },
  { value: "crew", label: "Crew", test: (p) => p.active && p.crew },
  { value: "all", label: "All", test: () => true },
];

const REPORT_COLUMNS = [
  { key: "role", label: "Role" },
  { key: "mobile", label: "Mobile" },
  { key: "email", label: "Email" },
  { key: "signin", label: "Hub sign-in" },
  { key: "crew", label: "Crew" },
  { key: "status", label: "Status" },
] as const;

// Yes / No as live; whether they have a PIN yet shows in their drawer.
function signIn(p: PersonRow) {
  return p.canSignIn ? <StatusPill tone="green">Yes</StatusPill> : <StatusPill tone="grey">No</StatusPill>;
}

export function PeopleClient({ people: initial, openId }: { people: PersonRow[]; openId: number | null }) {
  const [people, setPeople] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("current");
  const [editing, setEditing] = useState<Editing>(() => initial.find((p) => p.id === openId) ?? null);
  const [confirmLeft, setConfirmLeft] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState<ViewableFile | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.value === filter)!.test;
    return people.filter(test).filter((p) => !q || [p.name, p.role, p.email, p.mobile].some((f) => f.toLowerCase().includes(q)));
  }, [people, query, filter]);

  function upsert(row: PersonRow) {
    setPeople((list) => {
      const i = list.findIndex((p) => p.id === row.id);
      const next = i >= 0 ? list.map((p) => (p.id === row.id ? row : p)) : [...list, row];
      return next.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    });
    setEditing(row);
  }

  const current = editing && editing !== "new" ? editing : null;
  const columns: Column<PersonRow>[] = [
    { key: "name", label: "Name", cell: (p) => p.name, sub: (p) => p.email },
    { key: "role", label: "Role", cell: (p) => p.role },
    { key: "mobile", label: "Mobile", cell: (p) => p.mobile },
    { key: "signin", label: "Hub sign-in", cell: signIn },
    { key: "status", label: "Status", cell: (p) => (p.active ? <StatusPill tone="green">Current</StatusPill> : <StatusPill tone="grey">Left</StatusPill>) },
  ];

  return (
    <RegisterLayout attention={[]}>
      <PageTop
        title="Team"
        count={people.length}
        reports={[{ label: "Create report", hint: "Choose who and what to include", onSelect: () => setReportOpen(true) }]}
        newAction={{ label: "New team member", onSelect: () => setEditing("new") }}
      >
        <TeamTabs active="team" />
      </PageTop>

      <FilterPills
        label="Show"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: people.filter(f.test).length }))}
      />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder="Search the team: name, role, mobile or email" label="Search the team" />
      </FilterRow>
      <DataTable label="Team" rows={shown} columns={columns} rowKey={(p) => p.id} onOpen={(p) => setEditing(p)} empty="No people match." />

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={current ? current.name : "New team member"} width="max-w-[560px]">
        {editing && (
          <div key={current ? `${current.id}-${current.name}-${current.active}-${current.crew}-${current.timeOff}-${current.hsIssue}` : "new"}>
            <GuardedForm action={savePerson} onSaved={(r) => r.data && upsert(r.data)}>
              {(state) => {
                const err = state && !state.ok ? state.fieldErrors ?? {} : {};
                return (
                  <>
                    {current && <input type="hidden" name="id" value={current.id} />}
                    <TextField label="Name" name="name" defaultValue={current?.name} error={err.name} autoComplete="off" required />
                    <TextField label="Role" name="role" defaultValue={current?.role} autoComplete="off" />
                    <TextField label="Mobile" name="mobile" type="tel" defaultValue={current?.mobile} />
                    <TextField label="Email" name="email" type="email" defaultValue={current?.email} error={err.email} spellCheck={false} />
                    <CheckboxField label="Crew (shown in the team app and the training matrix's crew list)" name="crew" defaultChecked={current?.crew} />
                    <CheckboxField label="Time off (can see the Time off tab, its notes and files, including sick notes)" name="time_off" defaultChecked={current?.timeOff} />
                    <CheckboxField label="Issue H&S policy (can issue the H&S policy statement and manual)" name="hs_issue" defaultChecked={current?.hsIssue} />
                    <CheckboxField label="Can sign in to the hub (office)" name="can_sign_in" defaultChecked={current?.canSignIn} />
                    {current && <CheckboxField label="Still works here" name="active" defaultChecked={current.active} />}
                    <SaveButton>{current ? "Save" : "Add team member"}</SaveButton>
                  </>
                );
              }}
            </GuardedForm>

            {current && current.canSignIn && current.active && (
              <div className="mt-8 border-t border-line pt-5">
                <h3 className="font-semibold mb-1">Sign-in PIN: {current.hasPin ? "set" : "not set yet"}</h3>
                <p className="text-sm text-muted mb-3">{current.hasPin ? "Set a new PIN if they've forgotten theirs." : "They need a PIN before they can sign in."}</p>
                <GuardedForm action={setPersonPin} onSaved={(r) => r.data && upsert(r.data)}>
                  {(state) => {
                    const err = state && !state.ok ? state.fieldErrors ?? {} : {};
                    return (
                      <>
                        <input type="hidden" name="id" value={current.id} />
                        <TextField label="New 4-digit PIN" name="pin" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" error={err.pin} spellCheck={false} />
                        <TextField label="Type it again" name="pin2" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" error={err.pin2} spellCheck={false} />
                        <SaveButton>Set PIN</SaveButton>
                      </>
                    );
                  }}
                </GuardedForm>
              </div>
            )}

            {current && current.active && (
              <div className="mt-8 border-t border-line pt-5">
                <h3 className="font-semibold mb-1">Left the company</h3>
                <p className="text-sm text-muted mb-3">Keeps their history, stops sign-in and takes them off pick lists.</p>
                <button type="button" onClick={() => setConfirmLeft(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">
                  Mark as left
                </button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmLeft && !!current}
        title={`Mark ${current?.name ?? ""} as left?`}
        message="They won't be able to sign in and won't show in pick lists. Their records stay."
        confirmLabel="Mark as left"
        onClose={() => setConfirmLeft(false)}
        onConfirm={async () => {
          if (!current) return;
          const r = await markPersonLeft(current.id, crypto.randomUUID());
          if (r.ok && r.data) upsert(r.data);
          return r;
        }}
      />

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Create report" size="max-w-md">
        <form
          className="p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const cols = REPORT_COLUMNS.map((c) => c.key).filter((k) => f.get(`col_${k}`) === "on");
            const who = String(f.get("who") || "current");
            setReportOpen(false);
            setReport({ id: 0, name: "Team list.pdf", mime: "application/pdf", url: `/api/people/report?who=${who}&cols=${cols.join(",")}` });
          }}
        >
          <fieldset className="mb-4">
            <legend className="block text-sm font-medium mb-1">Who</legend>
            <select name="who" defaultValue={filter} className="w-full rounded-lg border border-line bg-white px-3 py-2">
              {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </fieldset>
          <fieldset className="mb-5">
            <legend className="block text-sm font-medium mb-1">Include</legend>
            {REPORT_COLUMNS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" name={`col_${c.key}`} defaultChecked={c.key !== "email"} className="h-4 w-4 accent-brand" />
                {c.label}
              </label>
            ))}
          </fieldset>
          <button type="submit" className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">Create report</button>
        </form>
      </Modal>
      <DocViewer file={report} onClose={() => setReport(null)} />
    </RegisterLayout>
  );
}
