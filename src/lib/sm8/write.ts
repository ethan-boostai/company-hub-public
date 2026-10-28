import "server-only";

// Changes made in the hub go to ServiceM8 (the master) through the n8n workflow "CBS Hub - ServiceM8",
// webhook cbs-hub-sm8-write, protected by the X-CBS-SM8-Key header (N8N_SM8_KEY). n8n also adds a
// ServiceM8 job note naming who made the change. ServiceM8 then sends its own webhook back, which
// confirms the change in the hub.

export const SM8_UNREACHABLE = "ServiceM8 isn't reachable right now. Nothing was changed. Try again shortly.";

export class Sm8Error extends Error {}

export type Sm8Write =
  | { action: "set_folder"; job_uuid: string; folder_uuid: string; days: number; note: string; by: string }
  | { action: "set_status"; job_uuid: string; status: string; note: string; by: string };

export async function writeToServiceM8(change: Sm8Write): Promise<void> {
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
