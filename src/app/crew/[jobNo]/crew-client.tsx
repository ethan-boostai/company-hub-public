"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignOnForm } from "@/components/signons/sign-on-form";
import { crewSignOn } from "./actions";
import type { CrewData, CrewDoc } from "./data";

// The crew page: what to sign on this job. Each person opens the document, then signs (name picked
// each time). More onsite pages (pre-start, toolbox talk, site inspection, report) join this list as
// they are built.
export function CrewClient({ data, token }: { data: CrewData; token: string }) {
  const router = useRouter();
  const [signing, setSigning] = useState<CrewDoc | null>(null);
  const fileUrl = (d: CrewDoc) => (d.fileId ? `/api/crew/${data.jobNo}/file/${d.fileId}?t=${encodeURIComponent(token)}` : null);

  return (
    <div className="mx-auto max-w-xl p-4">
      <header className="mb-4 rounded-xl bg-white border border-line p-4 border-t-4 border-t-brand">
        <p className="text-sm text-muted">CBS crew page</p>
        <h1 className="text-xl font-bold">Job {data.jobNo}{data.title ? `: ${data.title}` : ""}</h1>
        {data.site && <p className="text-sm text-muted">{data.site}</p>}
      </header>

      {signing ? (
        <section className="rounded-xl bg-white border border-line p-4" aria-label={`Sign ${signing.label}`}>
          <button type="button" onClick={() => { setSigning(null); router.refresh(); }} className="mb-3 text-sm underline">‹ Back to the list</button>
          <h2 className="mb-1 text-lg font-semibold">{signing.label}</h2>
          {fileUrl(signing) && (
            <a href={fileUrl(signing)!} target="_blank" rel="noopener" className="mb-4 inline-block px-4 py-2 rounded-lg border border-dark font-semibold">Read the document</a>
          )}
          <SignOnForm
            docLabel={signing.label}
            acceptText={signing.acceptText}
            names={data.names}
            onSign={(p) => crewSignOn(data.jobNo, token, { type: signing.type, id: signing.id }, p, crypto.randomUUID())}
          />
        </section>
      ) : (
        <section aria-label="To sign">
          <h2 className="mb-2 text-lg font-semibold">To sign</h2>
          {data.docs.length === 0 ? (
            <p className="rounded-xl bg-white border border-line p-4 text-sm text-muted">Nothing to sign on this job right now.</p>
          ) : (
            <ul className="space-y-2">
              {data.docs.map((d) => (
                <li key={`${d.type}-${d.id}`}>
                  <button type="button" onClick={() => setSigning(d)} className="w-full rounded-xl bg-white border border-line p-4 text-left hover:bg-paper">
                    <span className="block font-semibold">{d.label}</span>
                    <span className="block text-sm text-muted">{d.signedBy.length ? `Signed by ${d.signedBy.length}: ${d.signedBy.join(", ")}` : "Nobody has signed yet"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
