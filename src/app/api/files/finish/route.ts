import { stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { claimRequestKey } from "@/lib/actions";
import { logActivity } from "@/lib/activity";
import { getCurrentPerson } from "@/lib/auth/session";
import { getItem } from "@/lib/files/graph";
import { LOCAL_DIR, storageMode } from "@/lib/files/storage";
import { readTicket } from "@/lib/files/ticket";

// Step 3 of an upload: checks the file arrived and records it. Each upload is recorded once only.
export async function POST(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { ticket?: string; itemId?: string } | null;
  const t = readTicket(body?.ticket || "");
  if (!t || t.personId !== person.id) return NextResponse.json({ ok: false, message: "Upload expired. Try again." }, { status: 400 });

  const mode = storageMode();
  let record: { storage: string; storage_path: string | null; sharepoint_item_id: string | null; sharepoint_url: string | null; name: string; size: number };
  if (mode === "local") {
    const s = await stat(path.join(LOCAL_DIR, t.path)).catch(() => null);
    if (!s || s.size !== t.size) return NextResponse.json({ ok: false, message: "The upload was incomplete. Try again." }, { status: 400 });
    record = { storage: "local", storage_path: t.path, sharepoint_item_id: null, sharepoint_url: null, name: t.name, size: t.size };
  } else {
    if (!body?.itemId) return NextResponse.json({ ok: false, message: "The upload was incomplete. Try again." }, { status: 400 });
    const item = await getItem(body.itemId).catch(() => null);
    const folder = t.path.split("/").slice(0, -1).join("/");
    if (!item || item.size !== t.size || !(item.parentReference?.path || "").endsWith(folder)) {
      return NextResponse.json({ ok: false, message: "The upload could not be checked. Try again." }, { status: 400 });
    }
    record = { storage: "sharepoint", storage_path: null, sharepoint_item_id: item.id, sharepoint_url: item.webUrl, name: item.name, size: item.size };
  }

  if (!(await claimRequestKey(t.requestKey, person.id))) {
    return NextResponse.json({ ok: false, duplicate: true, message: "This file was already added." }, { status: 409 });
  }
  const sql = db();
  const file = await sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into files (name, mime, size_bytes, storage, storage_path, sharepoint_item_id, sharepoint_url,
                         job_id, entity_table, entity_id, role, created_by)
      values (${record.name}, ${t.mime}, ${record.size}, ${record.storage}, ${record.storage_path}, ${record.sharepoint_item_id},
              ${record.sharepoint_url}, ${t.jobId}, ${t.entityTable}, ${t.entityId}, ${t.role}, ${person.name})
      returning id`;
    await logActivity(tx, {
      person: person.name, table: "files", rowId: Number(row.id), jobId: t.jobId, action: "create",
      changes: { name: [null, record.name], entity: [null, t.entityTable ? `${t.entityTable}:${t.entityId ?? ""}` : null] },
    });
    return { id: Number(row.id), name: record.name, mime: t.mime, size: record.size };
  });
  return NextResponse.json({ ok: true, file });
}
