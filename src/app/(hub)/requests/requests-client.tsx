"use client";

import { useState } from "react";
import { TextArea } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { SelectWithAdd } from "@/components/ui/select-with-add";
import { niceDateTime } from "../_registers/dates";
import { DeleteButton } from "../_registers/delete-button";
import { RecordFiles } from "../_registers/record-files";
import { Chip, Choice, RecordSelect, ViewSwitch } from "../_registers/ui";
import { addSelectOption } from "@/app/actions/select-options";
import { deleteRequest, saveRequest } from "./actions";
import type { RequestRow, RequestsData } from "./data";
import { CATEGORY_LIST, isOpen, REQUEST_STATUSES, URGENCIES } from "./rules";

type Filter = "open" | "done" | "declined" | "all";
const label = (list: readonly { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label ?? v;

export function RequestsClient({ initial, openId = null }: { initial: RequestsData; openId?: number | null }) {
  const [rows, setRows] = useState(initial.requests);
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | "new" | null>(() => (openId && initial.requests.some((r) => r.id === openId) ? openId : null));
  const [categories, setCategories] = useState(initial.categories);

  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (filter === "open" && !isOpen(r.status)) return false;
    if (filter === "done" && r.status !== "done") return false;
    if (filter === "declined" && r.status !== "declined") return false;
    return !q || [r.requestedBy, r.category, r.details, r.response].some((f) => f.toLowerCase().includes(q));
  });
  const current = typeof open === "number" ? rows.find((r) => r.id === open) ?? null : null;

  function saved(r: RequestRow) {
    setRows((list) => [r, ...list.filter((x) => x.id !== r.id)].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)));
    setOpen(r.id);
  }

  return (
    <div>
      <ViewSwitch<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "open", label: "Open", count: rows.filter((r) => isOpen(r.status)).length },
          { value: "done", label: "Done", count: rows.filter((r) => r.status === "done").length },
          { value: "declined", label: "Declined", count: rows.filter((r) => r.status === "declined").length },
          { value: "all", label: "All", count: rows.length },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-56">
          <SearchBox value={query} onChange={setQuery} placeholder="Search requests" label="Search requests" />
        </div>
        <button type="button" onClick={() => setOpen("new")} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">
          Add request
        </button>
      </div>

      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <ul className="divide-y divide-line" data-testid="request-list">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r.id)} className="w-full text-left px-4 py-3 hover:bg-paper flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{r.requestedBy} · {r.category}</span>
                  <span className="block text-sm text-muted truncate">{niceDateTime(r.requestedAt)} · {r.details}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {isOpen(r.status) && <Chip tone={r.urgency === "today" ? "overdue" : r.urgency === "this_week" ? "soon" : "none"}>{label(URGENCIES, r.urgency)}</Chip>}
                  <Chip tone={r.status === "done" ? "ok" : r.status === "declined" ? "none" : "soon"}>{label(REQUEST_STATUSES, r.status)}</Chip>
                  {r.source === "team" && <Chip>Team app</Chip>}
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-6 text-sm text-muted">{q ? "Nothing matches the search." : "No requests here."}</li>}
        </ul>
      </div>

      <Drawer open={open !== null} onClose={() => setOpen(null)} title={current ? `${current.requestedBy} · ${current.category}` : "Add request"}>
        {open !== null && (
          <div key={current ? JSON.stringify(current) : "new"}>
            {current && !categories.some((c) => c.toLowerCase() === current.category.toLowerCase()) && (
              <TypedCategory value={current.category} onAdded={(v) => setCategories((list) => [...list, v])} />
            )}
            {current && (
              <p className="mb-4 text-sm text-muted">
                Requested {niceDateTime(current.requestedAt)}{current.source === "team" ? " in the team app" : ""}.
                {current.closedAt && ` Closed ${niceDateTime(current.closedAt)} by ${current.closedBy}.`}
              </p>
            )}
            <GuardedForm action={saveRequest} onSaved={(r) => r.data && saved(r.data)}>
              {(state) => {
                const err = state && !state.ok ? state.fieldErrors ?? {} : {};
                const people = initial.people.map((p) => ({ value: String(p.id), label: p.name }));
                if (current?.requestedById && !people.some((p) => p.value === String(current.requestedById))) {
                  people.push({ value: String(current.requestedById), label: current.requestedBy });
                }
                return (
                  <>
                    {current && <input type="hidden" name="id" value={current.id} />}
                    <RecordSelect label="Requested by" name="requested_by_id" options={people} defaultValue={current?.requestedById ? String(current.requestedById) : ""} error={err.requested_by_id} />
                    <SelectWithAdd list={CATEGORY_LIST} name="category" label="What is it for" options={categories} defaultValue={current?.category ?? ""} />
                    {err.category && <p className="-mt-3 mb-4 text-sm text-danger">{err.category}</p>}
                    <TextArea label="Details" name="details" defaultValue={current?.details} error={err.details} rows={4} />
                    <Choice label="How urgent" name="urgency" options={URGENCIES} defaultValue={current?.urgency ?? "this_week"} />
                    <Choice label="Status" name="status" options={REQUEST_STATUSES} defaultValue={current?.status ?? "new"} />
                    <TextArea label="Office response" name="response" defaultValue={current?.response} error={err.response} rows={3} />
                    <SaveButton>{current ? "Save" : "Add request"}</SaveButton>
                  </>
                );
              }}
            </GuardedForm>
            {current && (
              <>
                <RecordFiles entityTable="requests" entityId={current.id} title="Photos and files" />
                <DeleteButton
                  label="Delete this request"
                  message={`This deletes ${current.requestedBy}'s request (${current.category}). Files stay in SharePoint. It cannot be undone.`}
                  onDelete={(key) => deleteRequest(current.id, key)}
                  onDeleted={() => {
                    setRows((list) => list.filter((x) => x.id !== current.id));
                    setOpen(null);
                  }}
                />
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

// A category the crew typed under "Other": the office can make it a list option.
function TypedCategory({ value, onAdded }: { value: string; onAdded: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mb-4 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
      <p>&ldquo;{value}&rdquo; was typed under Other and isn&apos;t on the list.</p>
      <button type="button" disabled={busy} className="mt-2 px-3 py-1.5 rounded-lg border border-dark font-semibold disabled:opacity-60"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await addSelectOption(CATEGORY_LIST, value, crypto.randomUUID());
            if (r.ok) onAdded(r.data ?? value);
            else setError(r.message);
          } catch {
            setError("Couldn't add it. Check the connection and try again.");
          } finally {
            setBusy(false);
          }
        }}>
        {busy ? "Adding…" : `Add “${value}” to the list`}
      </button>
      {error && <p role="alert" className="mt-1 text-danger">{error}</p>}
    </div>
  );
}
