import "server-only";

// SharePoint through n8n. The app never holds a Microsoft credential: the n8n workflow "CBS Hub - Files"
// talks to SharePoint, and each webhook is protected by the X-CBS-Files-Key header (N8N_FILES_KEY).
// Swapping the SharePoint credential inside n8n needs no change here.

export const UNREACHABLE = "SharePoint isn't reachable right now. Try again shortly.";

export class SharePointError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Route = "start" | "info" | "link";

function base(): string {
  return (process.env.N8N_WEBHOOK_BASE || "https://old-hub.example/webhook").replace(/\/+$/, "");
}

async function call<T>(route: Route, body: Record<string, unknown>): Promise<T> {
  const key = process.env.N8N_FILES_KEY;
  if (!key) {
    console.error("N8N_FILES_KEY is not set");
    throw new SharePointError(UNREACHABLE, 502);
  }
  let res: Response;
  try {
    res = await fetch(`${base()}/cbs-hub-files-${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CBS-Files-Key": key },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    console.error(`SharePoint (${route}) call failed`, e);
    throw new SharePointError(UNREACHABLE, 502);
  }
  const data = (await res.json().catch(() => null)) as ({ ok?: boolean; message?: string } & T) | null;
  if (res.ok && data?.ok) return data;
  // 400/404 come from the workflow with a plain message. Anything else (wrong key, n8n down, SharePoint down)
  // is shown as "not reachable"; n8n emails an alert for SharePoint failures.
  if ((res.status === 400 || res.status === 404) && data?.message) throw new SharePointError(data.message, res.status);
  console.error(`SharePoint (${route}) replied ${res.status}`, data?.message || "");
  throw new SharePointError(UNREACHABLE, 502);
}

// Starts a resumable upload. The browser then sends the file in chunks straight to the returned URL.
export function startUpload(folder: string, fileName: string, size: number) {
  return call<{ uploadUrl: string; expires: string | null; folder: string; name: string }>("start", { folder, fileName, size });
}

export type SharePointFile = { id: string; name: string; size: number; webUrl: string; mime: string; path: string };

export function fileInfo(itemId: string) {
  return call<SharePointFile>("info", { itemId });
}

// Short-lived links (minutes): downloadUrl for the file itself, previewUrl for SharePoint's viewer.
export function fileLinks(itemId: string) {
  return call<SharePointFile & { downloadUrl: string | null; previewUrl: string | null }>("link", { itemId });
}
