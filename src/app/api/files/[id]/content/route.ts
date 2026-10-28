import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPerson } from "@/lib/auth/session";
import { fileLinks, SharePointError, UNREACHABLE } from "@/lib/files/sharepoint";
import { LOCAL_DIR } from "@/lib/files/storage";

// A plain page for the viewer frame or new tab when the file can't be shown (never raw JSON).
function messagePage(message: string, status: number) {
  const safe = message.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>File</title>` +
      `<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#222">` +
      `<p style="padding:24px;text-align:center">${safe}</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

// Opens a file for the in-window viewer (or a new tab). Signed-in office users only.
//  ?view=1      SharePoint's own viewer (PDFs, Office files, drawings) for SharePoint files
//  ?download=1  download the file
//  (none)       the file itself (images in the viewer)
// SharePoint files redirect to a short-lived link from n8n, fetched fresh on every open.
export async function GET(req: Request, ctx: RouteContext<"/api/files/[id]/content">) {
  const person = await getCurrentPerson();
  if (!person) return messagePage("Sign in again to open this file.", 401);
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return messagePage("File not found.", 404);
  const [f] = await db()<{ name: string; mime: string | null; storage: string; storage_path: string | null; sharepoint_item_id: string | null }[]>`
    select name, mime, storage, storage_path, sharepoint_item_id from files where id = ${id}`;
  if (!f) return messagePage("File not found.", 404);

  const params = new URL(req.url).searchParams;
  const download = params.get("download") === "1";

  if (f.storage === "local" && f.storage_path) {
    const target = path.join(LOCAL_DIR, f.storage_path);
    if (!target.startsWith(LOCAL_DIR + path.sep)) return messagePage("File not found.", 404);
    const bytes = await readFile(target).catch(() => null);
    if (!bytes) return messagePage("File missing.", 404);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": f.mime || "application/octet-stream",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (f.storage === "sharepoint" && f.sharepoint_item_id) {
    try {
      const links = await fileLinks(f.sharepoint_item_id);
      const target = params.get("view") === "1" && !download ? links.previewUrl || links.downloadUrl : links.downloadUrl || links.previewUrl;
      if (!target) return messagePage(UNREACHABLE, 502);
      return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      const err = e instanceof SharePointError ? e : new SharePointError(UNREACHABLE, 502);
      return messagePage(err.message, err.status);
    }
  }
  return messagePage("File not found.", 404);
}
