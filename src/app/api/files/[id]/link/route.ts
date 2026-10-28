import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentPerson } from "@/lib/auth/session";
import { fileLinks, SharePointError, UNREACHABLE } from "@/lib/files/sharepoint";

export type FileLinks = {
  ok: true;
  name: string;
  mime: string;
  storage: string;
  // The file itself. For SharePoint this is a short-lived link that downloads (it can be fetched by the
  // browser and shown, but never opened directly); for local files it opens inline.
  fileUrl: string | null;
  // SharePoint's own viewer page (PDFs, Office files, drawings, photos), safe to show in a frame.
  previewUrl: string | null;
  // Always downloads.
  downloadUrl: string;
};

// Fresh links for the in-window viewer and the full-screen page. Asked for on every open: the SharePoint
// links only last a few minutes. Signed-in office users only.
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]/link">) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ ok: false, message: "File not found." }, { status: 404 });
  const [f] = await db()<{ name: string; mime: string | null; storage: string; sharepoint_item_id: string | null }[]>`
    select name, mime, storage, sharepoint_item_id from files where id = ${id}`;
  if (!f) return NextResponse.json({ ok: false, message: "File not found." }, { status: 404 });

  const base = { ok: true as const, name: f.name, mime: f.mime || "", storage: f.storage, downloadUrl: `/api/files/${id}/content?download=1` };
  if (f.storage === "sharepoint" && f.sharepoint_item_id) {
    try {
      const l = await fileLinks(f.sharepoint_item_id);
      const body: FileLinks = { ...base, fileUrl: l.downloadUrl, previewUrl: l.previewUrl };
      return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      const err = e instanceof SharePointError ? e : new SharePointError(UNREACHABLE, 502);
      return NextResponse.json({ ok: false, message: err.message }, { status: err.status });
    }
  }
  const body: FileLinks = { ...base, fileUrl: `/api/files/${id}/content`, previewUrl: null };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
