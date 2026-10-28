import "server-only";
import { db } from "@/lib/db";

// Changes made in the hub go to ServiceM8 (the master) through the n8n workflow "CBS Hub - ServiceM8",
// webhook cbs-hub-sm8-write, protected by the X-CBS-SM8-Key header (N8N_SM8_KEY). n8n also adds a
// ServiceM8 job note naming who made the change. ServiceM8 then sends its own webhook back, which
// confirms the change in the hub.

export const SM8_NOT_ALLOWED =
  "Until the Phase 1 switch-over is approved, the hub can only change test job 12 in ServiceM8. Nothing was changed.";
export const SM8_UNREACHABLE = "ServiceM8 isn't reachable right now. Nothing was changed. Try again shortly.";

export class Sm8Error extends Error {}

export type Sm8Write =
  | { action: "set_folder"; job_no: string; job_uuid: string; folder_uuid: string; days: number; note: string; by: string }
  | { action: "set_status"; job_no: string; job_uuid: string; status: string; note: string; by: string };

// Only jobs in the database's ServiceM8 write allow list (test job 12 until the switch-over) may be
// changed. Checked against the stored job, so the number and ServiceM8 id must belong together.
export async function writeAllowed(jobNo: string, jobUuid: string): Promise<boolean> {
  const [r] = await db()<{ ok: boolean }[]>`
    select cbs_sync.sm8_write_allowed(${jobNo}) and exists (select 1 from jobs where job_no = ${jobNo} and sm8_uuid = ${jobUuid}) as ok`;
  return !!r?.ok;
}

export async function writeToServiceM8(change: Sm8Write): Promise<void> {
  if (!(await writeAllowed(change.job_no, change.job_uuid))) throw new Sm8Error(SM8_NOT_ALLOWED);
  const key = process.env.N8N_SM8_KEY;
  if (!key) {
    console.error("N8N_SM8_KEY is not set");
    throw new Sm8Error(SM8_UNREACHABLE);
  }
  const base = (process.env.N8N_WEBHOOK_BASE || "https://old-hub.example/webhook").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/cbs-hub-sm8-write`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CBS-SM8-Key": key },
      body: JSON.stringify(change),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    console.error("ServiceM8 write failed", e);
    throw new Sm8Error(SM8_UNREACHABLE);
  }
  const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (res.ok && data?.ok) return;
  console.error(`ServiceM8 write replied ${res.status}`, data?.message || "");
  throw new Sm8Error(res.status === 400 && data?.message ? `ServiceM8 didn't accept the change: ${data.message}` : SM8_UNREACHABLE);
}
