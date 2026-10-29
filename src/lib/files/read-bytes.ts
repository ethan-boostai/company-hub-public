import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { fileLinks, SharePointError, UNREACHABLE } from "./sharepoint";
import { LOCAL_DIR } from "./storage";

// The bytes of a stored file (local in development, SharePoint otherwise), for the server to build
// with (e.g. appending a safety data sheet to a CoSHH pack). Limited to `max` bytes.
export async function readFileBytes(sql: postgres.Sql, fileId: number, max = 30 * 1024 * 1024): Promise<{ name: string; mime: string; bytes: Uint8Array }> {
  const [f] = await sql<{ name: string; mime: string | null; storage: string; storage_path: string | null; sharepoint_item_id: string | null; size_bytes: string | null }[]>`
    select name, mime, storage, storage_path, sharepoint_item_id, size_bytes from files where id = ${fileId}`;
  if (!f) throw new SharePointError("The file is missing.", 404);
  if (Number(f.size_bytes ?? 0) > max) throw new SharePointError("The file is too large to add to the pack.", 400);
  const mime = f.mime || "application/octet-stream";
  if (f.storage === "local" && f.storage_path) {
    const target = path.join(LOCAL_DIR, f.storage_path);
    if (!target.startsWith(LOCAL_DIR + path.sep)) throw new SharePointError("The file is missing.", 404);
    return { name: f.name, mime, bytes: new Uint8Array(await readFile(target)) };
  }
  if (f.storage === "sharepoint" && f.sharepoint_item_id) {
    const links = await fileLinks(f.sharepoint_item_id);
    if (!links.downloadUrl) throw new SharePointError(UNREACHABLE, 502);
    let res: Response;
    try {
      res = await fetch(links.downloadUrl, { signal: AbortSignal.timeout(60_000) });
    } catch {
      throw new SharePointError(UNREACHABLE, 502);
    }
    if (!res.ok) throw new SharePointError(UNREACHABLE, 502);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > max) throw new SharePointError("The file is too large to add to the pack.", 400);
    return { name: f.name, mime, bytes };
  }
  throw new SharePointError("The file is missing.", 404);
}
