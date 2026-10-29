"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RamsEditor } from "@/components/rams/rams-editor";
import { inputClass } from "@/components/ui/fields";
import { MenuButton } from "@/components/ui/menu-button";
import { StatusPill } from "@/components/ui/register";
import type { RamsContent } from "@/lib/rams/content";
import type { BuilderLists } from "@/lib/rams/data";
import { addLibraryHazard } from "@/app/(hub)/jobs/[jobNo]/rams/actions";
import { saveJobType, setJobTypeStatus } from "../../actions";

export function JobTypeEditor({ id, name: name0, status: status0, activity, content, lists, missing }: {
  id: number; name: string; status: "active" | "retired"; activity: string; content: RamsContent; lists: BuilderLists; missing: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(name0);
  const [status, setStatus] = useState(status0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function changeStatus(to: "active" | "retired") {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await setJobTypeStatus(id, to, crypto.randomUUID());
      setMsg({ ok: r.ok, text: r.message ?? "" });
      if (r.ok) { setStatus(to); router.refresh(); }
    } catch {
      setMsg({ ok: false, text: "It wasn't saved. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <Link href="/safety/templates" className="text-sm underline">All RAMS job types</Link>
      <div className="mt-2 mb-4 flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-3xl font-bold text-ink">{name0}</h1>
          <p className="mt-1 flex items-center gap-2 text-muted">
            RAMS job type {status === "active" ? <StatusPill tone="green">In use</StatusPill> : <StatusPill tone="grey">Retired</StatusPill>}
          </p>
        </div>
        <MenuButton label="More" items={[status === "active"
          ? { label: "Retire job type", hint: "Hidden from + New > CBS RAMS. RAMS made from it don't change.", onSelect: () => changeStatus("retired") }
          : { label: "Bring back job type", onSelect: () => changeStatus("active") }]} />
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mb-3 text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
      {missing.length > 0 && (
        <p className="mb-3 rounded-lg border border-[#e8cd8a] bg-[#f8e7bf] p-3 text-sm">
          Hazards this job type names that aren&apos;t active in the library: {missing.join(", ")}. They&apos;re left out of new RAMS. Saving removes them from the job type.
        </p>
      )}
      <label className="mb-4 block max-w-xl">
        <span className="block text-sm font-medium mb-1">Job type name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} spellCheck className={inputClass} />
      </label>
      <RamsEditor
        mode="template"
        initial={{ title: activity, preparedById: null, approvedById: null, approverRole: "", dated: null, notes: "", content }}
        lists={lists}
        onSave={async (v) => {
          const r = await saveJobType(id, name, v.title, v.content, crypto.randomUUID());
          if (r.ok) router.refresh();
          return r;
        }}
        onAddToLibrary={(h) => addLibraryHazard(h, `Job type ${name0}`, crypto.randomUUID())}
      />
    </div>
  );
}
