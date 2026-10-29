"use server";

import { claimRequestKey } from "@/lib/actions";
import { crewTokenOk } from "@/lib/signons/crew-link";
import { SignError, signOn } from "@/lib/signons/service";
import { readDb } from "@/lib/db";
import { loadSignDoc } from "@/lib/signons/docs";

// Signing on from the crew page: no sign-in. The job's crew link token is checked on every call, and
// the document must belong to that job. The signer's own name is recorded as who did it.
export async function crewSignOn(
  jobNo: string,
  token: string,
  doc: { type: string; id: number },
  p: { name: string; isWorker: boolean; company: string; accepted: boolean; signature: string },
  requestKey: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!crewTokenOk(jobNo, token)) return { ok: false, message: "This crew link isn't valid any more. Ask the office for the new one." };
  if (!(await claimRequestKey(requestKey, null))) return { ok: false, message: "This was already sent." };
  const sql = await readDb();
  const [j] = await sql<{ id: string }[]>`select id from jobs where job_no = ${jobNo}`;
  if (!j) return { ok: false, message: "This job isn't in the hub." };
  try {
    const d = await loadSignDoc(sql, doc.type, doc.id);
    if (!d || d.jobId !== Number(j.id)) return { ok: false, message: "That document isn't on this job." };
    const r = await signOn({ docType: doc.type, docId: doc.id, ...p, via: "crew", by: String(p.name || "").trim().slice(0, 80) || "Crew" });
    return { ok: true, message: r.note ?? "Signed." };
  } catch (e) {
    if (e instanceof SignError) return { ok: false, message: e.message };
    throw e;
  }
}
