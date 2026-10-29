import "server-only";
import { readDb } from "@/lib/db";
import { openSignDocs } from "@/lib/signons/docs";
import { signNames } from "@/lib/signons/service";

export type CrewDoc = { type: string; id: number; label: string; fileId: number | null; acceptText: string; signedBy: string[] };
export type CrewData = { jobId: number; jobNo: string; title: string; site: string; isCdm: boolean; docs: CrewDoc[]; names: { today: string[]; crew: string[] } };

// What the job's crew page shows: the job, documents open for signing (and who has signed them).
export async function loadCrew(jobNo: string): Promise<CrewData | null> {
  const sql = await readDb();
  const [j] = await sql<{ id: string; job_no: string; sm8_description: string | null; site_address: string | null; job_type: string }[]>`
    select id, job_no, sm8_description, site_address, job_type from jobs where job_no = ${jobNo}`;
  if (!j) return null;
  const jobId = Number(j.id);
  const docs = await openSignDocs(sql, jobId);
  const signed = docs.length
    ? await sql<{ doc_type: string; doc_id: string; doc_revision: number; name: string }[]>`
        select doc_type, doc_id, doc_revision, name from sign_ons where job_id = ${jobId} order by signed_at`
    : [];
  return {
    jobId,
    jobNo: j.job_no,
    title: (j.sm8_description || "").split("\n")[0].slice(0, 120),
    site: j.site_address || "",
    isCdm: j.job_type === "cdm",
    docs: docs.map((d) => ({
      type: d.type, id: d.id, label: d.label, fileId: d.issuedFileId, acceptText: d.acceptText,
      signedBy: signed.filter((s) => s.doc_type === d.type && Number(s.doc_id) === d.id && s.doc_revision === d.revision).map((s) => s.name),
    })),
    names: await signNames(jobId),
  };
}
