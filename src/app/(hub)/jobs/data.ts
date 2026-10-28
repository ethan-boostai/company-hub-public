import "server-only";
import { readDb } from "@/lib/db";

export type JobListRow = {
  id: number;
  jobNo: string;
  status: string;
  stage: string;
  folderUuid: string | null;
  description: string;
  site: string;
  client: string;
  po: string;
  value: number;
  bookedUntil: string | null;
  nextBooking: string | null;
  jobType: string;
};
export type Folder = { uuid: string; name: string };

export async function listFolders(): Promise<Folder[]> {
  const sql = await readDb();
  const rows = await sql<{ sm8_uuid: string; name: string }[]>`
    select sm8_uuid, name from sm8_folders where active order by sort nulls last, lower(name)`;
  return rows.map((r) => ({ uuid: r.sm8_uuid, name: r.name.trim() }));
}

export async function listJobs(): Promise<JobListRow[]> {
  const sql = await readDb();
  const rows = await sql<{
    id: string; job_no: string; sm8_status: string | null; stage: string; sm8_folder_uuid: string | null;
    sm8_description: string | null; site_address: string | null; client: string | null; sm8_po_number: string | null;
    sm8_invoice_total: string | null; sm8_booked_until: Date | null; next_booking: Date | null; job_type: string;
  }[]>`
    select j.id, j.job_no, j.sm8_status, j.stage, j.sm8_folder_uuid, j.sm8_description, j.site_address,
           c.name as client, j.sm8_po_number, j.sm8_invoice_total, j.sm8_booked_until, j.job_type,
           (select min(b.starts_at) from sm8_bookings b
             where b.job_sm8_uuid = j.sm8_uuid and b.active and b.ends_at > now()) as next_booking
    from jobs j left join clients c on c.id = j.client_id
    where j.sm8_active
    order by length(j.job_no) desc, j.job_no desc`;
  return rows.map((r) => ({
    id: Number(r.id),
    jobNo: r.job_no,
    status: r.sm8_status || "Quote",
    stage: r.stage,
    folderUuid: r.sm8_folder_uuid,
    description: r.sm8_description || "",
    site: (r.site_address || "").split(/\r?\n/)[0].trim(),
    client: r.client || "",
    po: r.sm8_po_number || "",
    value: Number(r.sm8_invoice_total || 0),
    bookedUntil: r.sm8_booked_until ? r.sm8_booked_until.toISOString() : null,
    nextBooking: r.next_booking ? r.next_booking.toISOString() : null,
    jobType: r.job_type,
  }));
}
