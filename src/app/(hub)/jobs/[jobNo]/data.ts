import "server-only";
import { readDb } from "@/lib/db";

export type JobDetail = {
  id: number;
  sm8Uuid: string;
  jobNo: string;
  status: string;
  stage: string;
  folderUuid: string | null;
  folderName: string | null;
  description: string;
  site: string;
  client: string;
  contact: string;
  po: string;
  value: number;
  bookedUntil: string | null;
  jobType: string;
  jobTypeSince: string | null;
  jobTypeBy: string | null;
  notes: string;
  updatedAt: string | null;
};

export async function getJob(jobNo: string): Promise<JobDetail | null> {
  if (!/^\d{1,10}$/.test(jobNo)) return null;
  const sql = await readDb();
  const [r] = await sql<{
    id: string; sm8_uuid: string; job_no: string; sm8_status: string | null; stage: string; sm8_folder_uuid: string | null;
    folder_name: string | null; sm8_description: string | null; site_address: string | null; client: string | null;
    sm8_job_contact: { first?: string; last?: string } | null; sm8_po_number: string | null; sm8_invoice_total: string | null;
    sm8_booked_until: Date | null; job_type: string; job_type_since: Date | null; job_type_by: string | null; notes: string | null;
    updated_at: Date | null;
  }[]>`
    select j.*, f.name as folder_name, c.name as client
    from jobs j left join sm8_folders f on f.sm8_uuid = j.sm8_folder_uuid left join clients c on c.id = j.client_id
    where j.job_no = ${jobNo}`;
  if (!r) return null;
  const contact = [r.sm8_job_contact?.first, r.sm8_job_contact?.last].filter(Boolean).join(" ").trim();
  return {
    id: Number(r.id),
    sm8Uuid: r.sm8_uuid,
    jobNo: r.job_no,
    status: r.sm8_status || "Quote",
    stage: r.stage,
    folderUuid: r.sm8_folder_uuid,
    folderName: r.folder_name ? r.folder_name.trim() : null,
    description: r.sm8_description || "",
    site: r.site_address || "",
    client: r.client || "",
    contact,
    po: r.sm8_po_number || "",
    value: Number(r.sm8_invoice_total || 0),
    bookedUntil: r.sm8_booked_until ? r.sm8_booked_until.toISOString() : null,
    jobType: r.job_type,
    jobTypeSince: r.job_type_since ? r.job_type_since.toISOString() : null,
    jobTypeBy: r.job_type_by,
    notes: r.notes || "",
    updatedAt: r.updated_at ? r.updated_at.toISOString() : null,
  };
}
