import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPerson } from "@/lib/auth/session";
import { downloadItem } from "@/lib/files/graph";
import { LOCAL_DIR } from "@/lib/files/storage";

// Streams a file for the in-window viewer (or a new tab). Signed-in office users only.
export async function GET(req: Request, ctx: RouteContext<"/api/files/[id]/content">) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ ok: false }, { status: 404 });
  const [f] = await db()<{ name: string; mime: string | null; storage: string; storage_path: string | null; sharepoint_item_id: string | null }[]>`
    select name, mime, storage, storage_path, sharepoint_item_id from files where id = ${id}`;
  if (!f) return NextResponse.json({ ok: false }, { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const headers = {
    "Content-Type": f.mime || "application/octet-stream",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (f.storage === "local" && f.storage_path) {
    const target = path.join(LOCAL_DIR, f.storage_path);
    if (!target.startsWith(LOCAL_DIR + path.sep)) return NextResponse.json({ ok: false }, { status: 404 });
    const bytes = await readFile(target).catch(() => null);
    if (!bytes) return NextResponse.json({ ok: false, message: "File missing." }, { status: 404 });
    return new Response(new Uint8Array(bytes), { headers });
  }
  if (f.storage === "sharepoint" && f.sharepoint_item_id) {
    const res = await downloadItem(f.sharepoint_item_id).catch(() => null);
    if (!res || !res.ok || !res.body) return NextResponse.json({ ok: false, message: "SharePoint isn't reachable." }, { status: 502 });
    return new Response(res.body, { headers });
  }
  return NextResponse.json({ ok: false }, { status: 404 });
}
