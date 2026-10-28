import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth/session";
import { LOCAL_DIR, storageMode } from "@/lib/files/storage";
import { readTicket } from "@/lib/files/ticket";

// Development only: receives the file bytes and keeps them in .local/uploads.
export async function PUT(req: Request) {
  if (storageMode() !== "local") return NextResponse.json({ ok: false }, { status: 404 });
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const t = readTicket(new URL(req.url).searchParams.get("t") || "");
  if (!t || t.personId !== person.id) return NextResponse.json({ ok: false, message: "Upload expired. Try again." }, { status: 400 });

  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length !== t.size) return NextResponse.json({ ok: false, message: "The upload was incomplete. Try again." }, { status: 400 });
  const target = path.join(LOCAL_DIR, t.path);
  if (!target.startsWith(LOCAL_DIR + path.sep)) return NextResponse.json({ ok: false }, { status: 400 });
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return NextResponse.json({ ok: true });
}
