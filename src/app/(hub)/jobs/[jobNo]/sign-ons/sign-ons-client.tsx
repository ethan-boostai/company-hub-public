"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill, type Column } from "@/components/ui/register";
import { SearchBox } from "@/components/ui/search-box";
import { niceDateTime } from "../../../_registers/dates";
import { deleteSignOn, markReviewed } from "./actions";
import type { SignOnRow } from "./data";

type Filter = "review" | "all";

export function SignOnsClient({ jobId, jobNo, initial, crewLink }: { jobId: number; jobNo: string; initial: SignOnRow[]; crewLink: string | null }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<Filter>(() => (initial.some((r) => !r.reviewed) ? "review" : "all"));
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const FILTERS: { value: Filter; label: string; test: (r: SignOnRow) => boolean }[] = [
    { value: "review", label: "To review", test: (r) => !r.reviewed },
    { value: "all", label: "All", test: () => true },
  ];
  const q = query.trim().toLowerCase();
  const shown = rows.filter(FILTERS.find((f) => f.value === filter)!.test)
    .filter((r) => !q || [r.name, r.company, r.docLabel].some((x) => x.toLowerCase().includes(q)));
  const open = rows.find((r) => r.id === openId) ?? null;
  const toReview = rows.filter((r) => !r.reviewed);
  const attention: AttentionItem[] = toReview.slice(0, 50).map((r) => ({
    key: `s${r.id}`, level: "soon", tag: "To review", name: r.name, detail: `Signed ${r.docLabel}, ${niceDateTime(r.signedAt)}`, onOpen: () => setOpenId(r.id),
  }));

  async function review(list: number[]) {
    if (busy || !list.length) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await markReviewed(jobId, list, crypto.randomUUID());
      if (r.ok && r.data) setRows(r.data);
      else if (!r.ok) setMsg(r.message);
    } catch {
      setMsg("It wasn't saved. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<SignOnRow>[] = [
    { key: "name", label: "Name", cell: (r) => r.name, sub: (r) => r.company },
    { key: "doc", label: "Document", cell: (r) => r.docLabel },
    { key: "signed", label: "Signed", cell: (r) => niceDateTime(r.signedAt), sub: (r) => (r.via === "crew" ? "Crew page" : "Office") },
    { key: "reviewed", label: "Reviewed", cell: (r) => (r.reviewed ? <StatusPill tone="green">Reviewed</StatusPill> : <StatusPill tone="amber">To review</StatusPill>) },
  ];
  const fullLink = crewLink && typeof window !== "undefined" ? `${window.location.origin}${crewLink}` : crewLink ?? "";

  return (
    <RegisterLayout attention={attention}>
      <PageTop
        title="Sign-ons"
        count={rows.length}
        more={[
          ...(toReview.length ? [{ label: `Mark all ${toReview.length} reviewed`, onSelect: () => review(toReview.map((r) => r.id)) }] : []),
          { label: "Crew page link", hint: "The job's onsite page: sign-ons with no sign-in", onSelect: () => setLinkOpen(true) },
        ]}
      />
      <FilterPills label="Show" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: rows.filter(f.test).length }))} />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder="Search: name, company or document" label="Search sign-ons" />
      </FilterRow>
      {msg && <p role="alert" className="mb-3 text-sm text-danger">{msg}</p>}
      <DataTable label="Sign-ons" rows={shown} columns={columns} rowKey={(r) => r.id} onOpen={(r) => setOpenId(r.id)}
        empty={rows.length ? "Nothing matches." : "Nobody has signed anything on this job yet. People sign from a document (RAMS and others), or on the crew page."} />

      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open ? open.name : ""} width="max-w-[560px]">
        {open && (
          <div>
            <dl className="mb-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="font-semibold">Company</dt><dd>{open.company}</dd>
              <dt className="font-semibold">Document</dt><dd>{open.docLabel}</dd>
              <dt className="font-semibold">Signed</dt><dd>{niceDateTime(open.signedAt)} ({open.via === "crew" ? "crew page" : "office"})</dd>
              {open.presenter && <><dt className="font-semibold">Presented by</dt><dd>{open.presenter}</dd></>}
              <dt className="font-semibold">Reviewed</dt><dd>{open.reviewed ? `Yes, by ${open.reviewedBy}` : "Not yet"}</dd>
            </dl>
            {open.signatureFileId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${open.signatureFileId}/content`} alt={`Signature of ${open.name}`} className="mb-4 h-24 w-auto rounded border border-line bg-white p-2" />
            )}
            <div className="flex flex-wrap gap-3 border-t border-line pt-4">
              {!open.reviewed && (
                <button type="button" disabled={busy} onClick={() => review([open.id])} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">Mark reviewed</button>
              )}
              <button type="button" onClick={() => setConfirmDelete(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">Remove sign-on</button>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete && !!open}
        title={`Remove ${open?.name ?? ""}'s sign-on?`}
        message="They'll need to sign again. The document's signed copy is made again without them."
        confirmLabel="Remove sign-on"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!open) return;
          const r = await deleteSignOn(jobId, open.id, crypto.randomUUID());
          if (r.ok && r.data) {
            setRows(r.data);
            setOpenId(null);
          }
          return r;
        }}
      />

      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title={`Crew page for job ${jobNo}`} size="max-w-lg">
        <div className="p-5">
          {crewLink ? (
            <>
              <p className="mb-3 text-sm">The crew open this on site (no sign-in) to sign documents. Anyone with the link can open this job&apos;s crew page, so share it with the crew only.</p>
              <input readOnly value={fullLink} aria-label="Crew page link" onFocus={(e) => e.currentTarget.select()} className="mb-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
              <div className="flex gap-3">
                <button type="button" onClick={() => navigator.clipboard?.writeText(fullLink).catch(() => {})} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">Copy link</button>
                <a href={crewLink} target="_blank" rel="noopener" className="px-4 py-2 rounded-lg border border-dark font-semibold">Open crew page</a>
              </div>
            </>
          ) : (
            <p className="text-sm text-danger">The crew page isn&apos;t set up on this site yet (the team link key is missing).</p>
          )}
        </div>
      </Modal>
    </RegisterLayout>
  );
}
