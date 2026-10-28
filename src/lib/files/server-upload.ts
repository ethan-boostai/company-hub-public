import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { fileInfo, SharePointError, startUpload, UNREACHABLE } from "./sharepoint";
import { cleanFileName, LOCAL_DIR, storageMode } from "./storage";

// For small files the server already holds (e.g. a team app photo, up to a few MB): sends the bytes to
// SharePoint through n8n, checks the result, and records the files row and activity log, the same way
// /api/files/finish does. The caller chooses the folder (inside CBS System) and checks everything else.
export async function uploadBytes(input: {
  folder: string;
  name: string;
  bytes: Uint8Array;
  mime: string;
  entityTable: string | null;
  entityId: number | null;
  jobId?: number | null;
  role?: string | null;
  createdBy: string;
}): Promise<{ id: number; name: string; size: number }> {
  const name = cleanFileName(input.name);
  const size = input.bytes.byteLength;
  if (!size) throw new SharePointError("The file is empty.", 400);
  if (!input.folder.startsWith("CBS System/")) throw new SharePointError("Folder must be inside CBS System.", 400);

  let rec: { storage: string; storage_path: string | null; item: string | null; url: string | null; name: string; size: number };
  if (storageMode() === "local") {
    const rel = `${randomUUID()}/${name}`;
    await mkdir(path.join(LOCAL_DIR, path.dirname(rel)), { recursive: true });
    await writeFile(path.join(LOCAL_DIR, rel), input.bytes);
    rec = { storage: "local", storage_path: rel, item: null, url: null, name, size };
  } else {
    const s = await startUpload(input.folder, name, size);
    let res: Response;
    try {
      res = await fetch(s.uploadUrl, {
        method: "PUT",
        headers: { "Content-Range": `bytes 0-${size - 1}/${size}`, "Content-Length": String(size) },
        body: Buffer.from(input.bytes),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new SharePointError(UNREACHABLE, 502);
    }
    const sent = (await res.json().catch(() => null)) as { id?: string } | null;
    if (!res.ok || !sent?.id) {
      await fetch(s.uploadUrl, { method: "DELETE" }).catch(() => undefined);
      throw new SharePointError(UNREACHABLE, 502);
    }
    const item = await fileInfo(sent.id);
    if (item.size !== size || item.path !== s.folder) throw new SharePointError("The upload could not be checked.", 502);
    rec = { storage: "sharepoint", storage_path: null, item: item.id, url: item.webUrl, name: item.name, size: item.size };
  }

  return db().begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into files (name, mime, size_bytes, storage, storage_path, sharepoint_item_id, sharepoint_url,
                         job_id, entity_table, entity_id, role, created_by)
      values (${rec.name}, ${input.mime || "application/octet-stream"}, ${rec.size}, ${rec.storage}, ${rec.storage_path},
              ${rec.item}, ${rec.url}, ${input.jobId ?? null}, ${input.entityTable}, ${input.entityId}, ${input.role ?? null}, ${input.createdBy})
      returning id`;
    await logActivity(tx, {
      person: input.createdBy, table: "files", rowId: Number(row.id), jobId: input.jobId ?? null, action: "create",
      changes: { name: [null, rec.name], entity: [null, input.entityTable ? `${input.entityTable}:${input.entityId ?? ""}` : null] },
    });
    return { id: Number(row.id), name: rec.name, size: rec.size };
  });
}
