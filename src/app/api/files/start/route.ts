import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentPerson } from "@/lib/auth/session";
import { cleanFileName, MAX_UPLOAD_BYTES, storageMode, UPLOAD_FOLDER } from "@/lib/files/storage";
import { signTicket } from "@/lib/files/ticket";
import { db } from "@/lib/db";
import { taskFolder } from "@/lib/requirements";
import { recordFolder } from "@/lib/files/record-folder";
import { SharePointError, startUpload, UNREACHABLE } from "@/lib/files/sharepoint";

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
  // Task files: the job and folder come from the task itself, never the browser. Generic tasks (no job)
  // don't get file uploads. Job files go to CBS System/Operations/Jobs/Job N/<requirement's folder>.
  let folder = UPLOAD_FOLDER;
  let jobId = b.jobId ?? null;
  if (b.entityTable === "tasks") {
    const [t] = b.entityId
      ? await db()<{ job_id: string | null; job_no: string | null; req_key: string | null }[]>`
          select t.job_id, j.job_no, t.req_key from tasks t left join jobs j on j.id = t.job_id
          where t.id = ${b.entityId} and t.removed_at is null`
      : [];
    if (!t || !t.job_id || !t.job_no) {
      return NextResponse.json({ ok: false, message: "Files can only be added to tasks on a job." }, { status: 400 });
    }
    jobId = Number(t.job_id);
    folder = taskFolder(t.job_no, t.req_key);
  }
  // A record whose table has a folder function (upload_folder_<table>) gets its own folder.
  if (b.entityTable && b.entityTable !== "tasks") {
    const f = await recordFolder(b.entityTable, b.entityId ?? 0);
    if (f === null) return NextResponse.json({ ok: false, message: "That record no longer exists. Refresh the page." }, { status: 400 });
    if (f) folder = f;
  }

  const name = cleanFileName(b.name);
  const mode = storageMode();
  const ticketFor = (path: string) =>
    signTicket({
      name,
      size: b.size,
      mime: b.mime || "application/octet-stream",
      path,
      entityTable: b.entityTable ?? null,
      entityId: b.entityId ?? null,
      jobId,
      role: b.role ?? null,
      personId: person.id,
      requestKey: b.requestKey,
      exp: Date.now() + 60 * 60 * 1000,
    });

  if (mode === "local") {
    const ticket = ticketFor(`${randomUUID()}/${name}`);
    return NextResponse.json({ ok: true, mode, uploadUrl: `/api/files/local?t=${encodeURIComponent(ticket)}`, ticket });
  }
  try {
    const s = await startUpload(folder, name, b.size);
    // SharePoint may rename the file if the name is taken; the ticket keeps the folder it must land in.
    return NextResponse.json({ ok: true, mode, uploadUrl: s.uploadUrl, ticket: ticketFor(`${s.folder}/${s.name}`) });
  } catch (e) {
    const message = e instanceof SharePointError ? e.message : UNREACHABLE;
    return NextResponse.json({ ok: false, message }, { status: e instanceof SharePointError ? e.status : 502 });
  }
}
