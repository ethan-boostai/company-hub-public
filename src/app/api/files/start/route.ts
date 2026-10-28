import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentPerson } from "@/lib/auth/session";
import { cleanFileName, MAX_UPLOAD_BYTES, storageMode, uploadPath } from "@/lib/files/storage";
import { signTicket } from "@/lib/files/ticket";
import { createUploadSession } from "@/lib/files/graph";

const Body = z.object({
  name: z.string().min(1).max(400),
  size: z.number().int().positive(),
  mime: z.string().max(200).optional().default(""),
  entityTable: z.string().regex(/^[a-z_]{1,60}$/).nullable().optional(),
  entityId: z.number().int().positive().nullable().optional(),
  jobId: z.number().int().positive().nullable().optional(),
  role: z.string().max(60).nullable().optional(),
  requestKey: z.string().uuid(),
});

// Step 1 of an upload: checks the request and says where the browser should send the file.
export async function POST(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "That upload request was not valid." }, { status: 400 });
  const b = parsed.data;
  if (b.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, message: "That file is over 250 MB. Upload a smaller copy." }, { status: 400 });
  }
  // Generic tasks (no job) don't get file uploads.
  if (b.entityTable === "tasks" && !b.jobId) {
    return NextResponse.json({ ok: false, message: "Files can only be added to tasks on a job." }, { status: 400 });
  }

  const name = cleanFileName(b.name);
  const mode = storageMode();
  const path = mode === "local" ? `${randomUUID()}/${name}` : uploadPath(name);
  const ticket = signTicket({
    name,
    size: b.size,
    mime: b.mime || "application/octet-stream",
    path,
    entityTable: b.entityTable ?? null,
    entityId: b.entityId ?? null,
    jobId: b.jobId ?? null,
    role: b.role ?? null,
    personId: person.id,
    requestKey: b.requestKey,
    exp: Date.now() + 60 * 60 * 1000,
  });

  if (mode === "local") {
    return NextResponse.json({ ok: true, mode, uploadUrl: `/api/files/local?t=${encodeURIComponent(ticket)}`, ticket });
  }
  try {
    const uploadUrl = await createUploadSession(path);
    return NextResponse.json({ ok: true, mode, uploadUrl, ticket });
  } catch {
    return NextResponse.json({ ok: false, message: "SharePoint isn't reachable right now. Try again shortly." }, { status: 502 });
  }
}
