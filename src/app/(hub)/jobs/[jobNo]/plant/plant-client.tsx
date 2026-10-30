"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer } from "@/components/ui/overlay";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill, type Column } from "@/components/ui/register";
import { SearchBox } from "@/components/ui/search-box";
import { niceDate, niceDateTime } from "../../../_registers/dates";
import { Chip, RecordSelect } from "../../../_registers/ui";
import { TwoLine } from "../../../_site/ui";
import { errorsOf, LocationSelect } from "../../../equipment/parts";
import { assetWarnings, dueBackLabel, PLANT_STATE_LABELS, PLANT_STATE_TONES, plantState } from "../../../_site/rules";
import { bookJobPlant, deleteJobPlant, moveJobPlant, returnJobPlant, saveJobPlant } from "./actions";
import type { Booking, PlantData } from "./data";

type Filter = "out" | "returned" | "all";
const SOURCES: Record<Booking["source"], string> = { job: "Job page", load_up: "Load-up sheet", yard: "Yard" };
const itemLabel = (b: { assetTag: string; assetName: string }) => (b.assetTag ? `${b.assetTag} ${b.assetName}` : b.assetName);

export function PlantClient({ jobId, jobNo, today, initial }: { jobId: number; jobNo: string; today: string; initial: PlantData }) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<Filter>("out");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const FILTERS: { value: Filter; label: string; test: (b: Booking) => boolean }[] = [
    { value: "out", label: "On job", test: (b) => !b.returnedAt },
    { value: "returned", label: "Returned", test: (b) => !!b.returnedAt },
    { value: "all", label: "All", test: () => true },
  ];
  const q = query.trim().toLowerCase();
  const shown = data.bookings.filter(FILTERS.find((f) => f.value === filter)!.test)
    .filter((b) => !q || [b.assetTag, b.assetName, b.category, b.outWith, b.bookedBy, b.notes].some((x) => x.toLowerCase().includes(q)));
  const open = data.bookings.find((b) => b.id === openId) ?? null;

  const attention: AttentionItem[] = [];
  for (const b of data.bookings) {
    if (b.returnedAt) continue;
    const st = plantState(b, today);
    if (st === "overdue" || st === "due_soon") {
      attention.push({ key: `d${b.id}`, level: st === "overdue" ? "overdue" : "soon", tag: "Due back", name: itemLabel(b), detail: dueBackLabel(b.dueBack, today), onOpen: () => setOpenId(b.id) });
    }
    if (b.asset?.status === "needs_repair") attention.push({ key: `r${b.id}`, level: "overdue", tag: "Needs repair", name: itemLabel(b), detail: `With ${b.outWith}`, onOpen: () => setOpenId(b.id) });
  }

  const columns: Column<Booking>[] = [
    { key: "item", label: "Item", cell: (b) => itemLabel(b), sub: (b) => b.category },
    { key: "with", label: "With", cell: (b) => <TwoLine main={b.returnedAt ? `Back at ${b.returnedTo}` : b.outWith}
      sub={`Booked out ${niceDate(b.bookedAt.slice(0, 10))} by ${b.bookedBy}`} /> },
    { key: "state", label: "Status", cell: (b) => {
      const st = plantState(b, today);
      return <TwoLine main={<StatusPill tone={PLANT_STATE_TONES[st]}>{PLANT_STATE_LABELS[st]}</StatusPill>}
        sub={b.returnedAt ? `Returned ${niceDate(b.returnedAt.slice(0, 10))}` : b.dueBack ? `Due back ${niceDate(b.dueBack)}` : "No due back date"} />;
    } },
  ];


  const onJob = data.bookings.filter((b) => !b.returnedAt).length;

  return (
    <RegisterLayout attention={attention}>
      <PageTop title="Plant" countLabel={`${onJob} on the job · ${data.bookings.length} ${data.bookings.length === 1 ? "record" : "records"}`}
        newAction={{ label: "Book plant", onSelect: () => setBooking(true) }} />
      <FilterPills label="Show" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: data.bookings.filter(f.test).length }))} />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder="Search: item, tag, who has it" label="Search plant" />
      </FilterRow>
      <DataTable label="Plant on this job" rows={shown} columns={columns} rowKey={(b) => b.id} onOpen={(b) => setOpenId(b.id)}
        empty={data.bookings.length ? "Nothing matches." : "No plant has been booked to this job yet. Use + Book plant, or load it from a load-up sheet."} />
      <p className="mt-4 text-sm text-muted">Hired-in plant will show here once purchase orders are built.</p>

      <Drawer open={booking} onClose={() => setBooking(false)} title={`Book plant to job ${jobNo}`} width="max-w-[640px]">
        {booking && <BookForm jobId={jobId} data={data} today={today} onSaved={(d) => { setData(d); setBooking(false); setFilter("out"); }} />}
      </Drawer>

      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open ? itemLabel(open) : ""} width="max-w-[560px]">
        {open && (
          <div key={`${open.id}-${open.returnedAt}-${open.dueBack}-${open.notes}`}>
            <div className="mb-4 flex flex-wrap gap-2">
              {(() => { const st = plantState(open, today); return <StatusPill tone={PLANT_STATE_TONES[st]}>{PLANT_STATE_LABELS[st]}</StatusPill>; })()}
              {open.asset && assetWarnings(open.asset, today).map((w) => <Chip key={w} tone="soon">{w}</Chip>)}
            </div>
            <dl className="mb-4 grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
              <dt className="font-semibold">Category</dt><dd>{open.category || "None"}</dd>
              <dt className="font-semibold">Booked out</dt><dd>{niceDateTime(open.bookedAt)} by {open.bookedBy} ({SOURCES[open.source]})</dd>
              <dt className="font-semibold">Went with</dt><dd>{open.outWith || "Not recorded"}</dd>
              {open.returnedAt && <><dt className="font-semibold">Returned</dt><dd>{niceDateTime(open.returnedAt)} by {open.returnedBy}, to {open.returnedTo}</dd></>}
              <dt className="font-semibold">Now</dt><dd>{open.asset ? open.asset.location : "No longer on the register"}</dd>
            </dl>
            {open.assetId && open.asset && (
              <Link href={`/equipment?asset=${open.assetId}`} className="mb-4 inline-block text-sm text-brand underline">Open in Equipment and materials</Link>
            )}

            {!open.returnedAt && (
              <section className="mb-5 rounded-xl border border-line p-4">
                <h3 className="mb-2 font-semibold">Back in the yard</h3>
                <GuardedForm action={returnJobPlant} onSaved={(r) => r.data && setData(r.data)}>
                  {(state) => {
                    const err = errorsOf(state);
                    return (
                      <>
                        <input type="hidden" name="job_id" value={jobId} />
                        <input type="hidden" name="id" value={open.id} />
                        <LocationSelect data={data.locations} name="return_to" label="Back to" defaultValue="p:CBS Warehouse" allowPerson error={err.return_to} />
                        <SaveButton>Back in the yard</SaveButton>
                      </>
                    );
                  }}
                </GuardedForm>
              </section>
            )}

            {!open.returnedAt && (
              <section className="mb-5 rounded-xl border border-line p-4" aria-label="Move to another job">
                <h3 className="mb-2 font-semibold">Move to another job</h3>
                <GuardedForm action={moveJobPlant} onSaved={(r) => r.data && setData(r.data)}>
                  {(state) => {
                    const err = errorsOf(state);
                    return (
                      <>
                        <input type="hidden" name="job_id" value={jobId} />
                        <input type="hidden" name="id" value={open.id} />
                        <RecordSelect label="To job" name="to_job_id" error={err.to_job_id}
                          options={data.jobs.map((j) => ({ value: String(j.id), label: `${j.jobNo}${j.title ? ` · ${j.title}` : ""}` }))} />
                        <TextField label="Due back from that job" name="move_due_back" type="date" min={today} error={err.move_due_back} />
                        <SaveButton>Move</SaveButton>
                      </>
                    );
                  }}
                </GuardedForm>
              </section>
            )}

            <GuardedForm action={saveJobPlant} onSaved={(r) => r.data && setData(r.data)}>
              {(state) => {
                const err = errorsOf(state);
                return (
                  <>
                    <input type="hidden" name="job_id" value={jobId} />
                    <input type="hidden" name="id" value={open.id} />
                    {!open.returnedAt && <h3 className="mb-2 font-semibold">Extend</h3>}
                    <TextField label="Due back" name="due_back" type="date" defaultValue={open.dueBack ?? ""} error={err.due_back} />
                    <TextArea label="Notes" name="notes" defaultValue={open.notes} rows={3} error={err.notes} />
                    <SaveButton>Save</SaveButton>
                  </>
                );
              }}
            </GuardedForm>

            <div className="mt-6 border-t border-line pt-4">
              <button type="button" onClick={() => setConfirmDelete(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">Remove this booking</button>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete && !!open}
        title={`Remove the booking for ${open ? itemLabel(open) : ""}?`}
        message="Only for a booking made by mistake. The item stays where it is now; to bring it back, use Return instead. It cannot be undone."
        confirmLabel="Remove booking"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!open) return;
          const r = await deleteJobPlant(jobId, open.id, crypto.randomUUID());
          if (r.ok && r.data) {
            setData(r.data);
            setOpenId(null);
          }
          return r;
        }}
      />
    </RegisterLayout>
  );
}

// Free equipment (not lost, retired or out on a job), grouped by category, with warnings shown.
function BookForm({ jobId, data, today, onSaved }: { jobId: number; data: PlantData; today: string; onSaved: (d: PlantData) => void }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const m = new Map<string, PlantData["free"]>();
    for (const a of data.free) {
      if (q && ![a.tag, a.name, a.category, a.location].some((x) => x.toLowerCase().includes(q))) continue;
      const k = a.category || "No category";
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()];
  }, [data.free, q]);
  const pickedWarn = data.free.filter((a) => picked.includes(a.id) && assetWarnings(a, today).length);

  return (
    <GuardedForm action={bookJobPlant} onSaved={(r) => r.data && onSaved(r.data)}>
      {(state) => {
        const err = errorsOf(state);
        return (
          <>
            <input type="hidden" name="job_id" value={jobId} />
            {picked.map((id) => <input key={id} type="hidden" name="asset_id" value={id} />)}
            <SearchBox value={query} onChange={setQuery} placeholder="Search: name, tag, category, where it is" label="Search equipment to book" />
            <div className="mt-3 mb-4 max-h-[45vh] overflow-y-auto rounded-xl border border-line" data-testid="book-items">
              {groups.length === 0 && <p className="p-3 text-sm text-muted">{data.free.length ? "Nothing matches." : "All equipment is out, lost or retired."}</p>}
              {groups.map(([cat, list]) => (
                <fieldset key={cat} className="border-b border-line last:border-0">
                  <legend className="sr-only">{cat}</legend>
                  <p className="bg-paper px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{cat}</p>
                  {list.map((a) => {
                    const warn = assetWarnings(a, today);
                    return (
                      <label key={a.id} className="flex items-start gap-3 px-3 py-2 border-t border-line first:border-0 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={picked.includes(a.id)}
                          onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                        <span className="min-w-0">
                          <span className="font-medium">{a.tag ? `${a.tag} ${a.name}` : a.name}</span>
                          <span className="block text-xs text-muted">{a.location}</span>
                          {warn.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{warn.map((w) => <Chip key={w} tone="soon">{w}</Chip>)}</span>}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>
            {pickedWarn.length > 0 && (
              <p role="status" className="mb-4 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 p-3 text-sm">
                Sort these out before the job: {pickedWarn.map((a) => `${a.tag ? `${a.tag} ` : ""}${a.name} (${assetWarnings(a, today).join(", ").toLowerCase()})`).join("; ")}.
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-x-4">
              <LocationSelect data={data.locations} name="out_with" label="Out with" allowPerson showPlaces={false} error={err.out_with} />
              <TextField label="Due back" name="due_back" type="date" min={today} error={err.due_back} />
            </div>
            <TextArea label="Notes" name="notes" rows={2} error={err.notes} />
            <SaveButton>{picked.length === 1 ? "Book 1 item" : `Book ${picked.length} items`}</SaveButton>
          </>
        );
      }}
    </GuardedForm>
  );
}
