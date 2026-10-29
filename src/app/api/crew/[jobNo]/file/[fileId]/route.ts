import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { crewTokenOk } from "@/lib/signons/crew-link";
import { openSignDocs } from "@/lib/signons/docs";
import { fileLinks } from "@/lib/files/sharepoint";
import { LOCAL_DIR } from "@/lib/files/storage";
import "@/lib/signons/register";

// The crew page opens a document it is asked to sign (no sign-in): only with the job's crew link, and
// only the issued PDF of a document on that job that is open for signing.
export async function GET(req: Request, ctx: RouteContext<"/api/crew/[jobNo]/file/[fileId]">) {
  const { jobNo, fileId } = await ctx.params;
  const t = new URL(req.url).searchParams.get("t");
  if (!crewTokenOk(jobNo, t) || !/^\d+$/.test(fileId)) return new NextResponse("Not found.", { status: 404 });
  const sql = await readDb();
  const [j] = await sql<{ id: string }[]>`select id from jobs where job_no = ${jobNo}`;
  if (!j) return new NextResponse("Not found.", { status: 404 });
  const docs = await openSignDocs(sql, Number(j.id));
  if (!docs.some((d) => d.issuedFileId === Number(fileId))) return new NextResponse("Not found.", { status: 404 });
  const [f] = await sql<{ name: string; mime: string | null; storage: string; storage_path: string | null; sharepoint_item_id: string | null }[]>`
    select name, mime, storage, storage_path, sharepoint_item_id from files where id = ${fileId}`;
  if (!f) return new NextResponse("Not found.", { status: 404 });
  if (f.storage === "local" && f.storage_path) {
    const target = path.join(LOCAL_DIR, f.storage_path);
    if (!target.startsWith(LOCAL_DIR + path.sep)) return new NextResponse("Not found.", { status: 404 });
    const bytes = await readFile(target).catch(() => null);
    if (!bytes) return new NextResponse("File missing.", { status: 404 });
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": f.mime || "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`, "Cache-Control": "private, no-store" } });
  }
  if (f.sharepoint_item_id) {
    const links = await fileLinks(f.sharepoint_item_id).catch(() => null);
    const to = links?.downloadUrl || links?.previewUrl;
    if (to) return NextResponse.redirect(to, { status: 302, headers: { "Cache-Control": "no-store" } });
  }
  return new NextResponse("The file can't be opened right now.", { status: 502 });
}
