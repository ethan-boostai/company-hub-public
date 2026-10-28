import "server-only";

// Microsoft Graph for SharePoint. Single-tenant app registration: tenant-specific token URL, never /common.
// Not yet tested against the live tenant (needs the app registration's ids and secret).

let cached: { token: string; exp: number } | null = null;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${env("MS_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("MS_CLIENT_ID"),
      client_secret: env("MS_CLIENT_SECRET"),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Microsoft sign-in failed (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

function drivePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

const GRAPH = "https://graph.microsoft.com/v1.0";

// Starts a resumable upload. The browser then sends the file straight to the returned URL in chunks.
export async function createUploadSession(path: string): Promise<string> {
  const res = await fetch(`${GRAPH}/drives/${env("SHAREPOINT_DRIVE_ID")}/root:/${drivePath(path)}:/createUploadSession`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
  });
  if (!res.ok) throw new Error(`SharePoint upload could not start (${res.status})`);
  return ((await res.json()) as { uploadUrl: string }).uploadUrl;
}

export type DriveItem = { id: string; name: string; size: number; webUrl: string; parentReference?: { path?: string } };

export async function getItem(id: string): Promise<DriveItem> {
  const res = await fetch(`${GRAPH}/drives/${env("SHAREPOINT_DRIVE_ID")}/items/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!res.ok) throw new Error(`SharePoint file not found (${res.status})`);
  return (await res.json()) as DriveItem;
}

export async function downloadItem(id: string): Promise<Response> {
  return fetch(`${GRAPH}/drives/${env("SHAREPOINT_DRIVE_ID")}/items/${encodeURIComponent(id)}/content`, {
    headers: { Authorization: `Bearer ${await token()}` },
    redirect: "follow",
  });
}
