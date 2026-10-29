import "server-only";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { readFileBytes } from "@/lib/files/read-bytes";
import { uploadBytes } from "@/lib/files/server-upload";
import { SharePointError, UNREACHABLE } from "@/lib/files/sharepoint";
import { HousePdf } from "@/lib/pdf/house";
import { loadSignDoc, signAdapter, type SignDoc } from "./docs";
import "./register";

export const CBS_COMPANY = "Chelmsford Building Services";

export type SignInput = {
  docType: string;
  docId: number;
  name: string;
  isWorker: boolean;
  company: string;
  accepted: boolean;
  signature: string; // PNG data URL from the signature pad
  via: "office" | "crew";
  presenter?: string | null;
  by: string; // who is recording it (the signed-in office person, or the signer on the crew page)
};

export class SignError extends Error {}

const clean = (s: string, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function signatureBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m || m[1].length > 700_000) return null;
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 ? bytes : null;
}

// One person signs on to a document's current revision. Saves the signature (PNG) in the job's folder,
// records the sign-on, then re-makes the signed copy (Ethan: every time someone signs).
export async function signOn(input: SignInput): Promise<{ doc: SignDoc; note?: string }> {
  const sql = db();
  const doc = await loadSignDoc(sql, input.docType, input.docId);
  if (!doc) throw new SignError("That document no longer exists.");
  if (!doc.signable) throw new SignError("This document isn't open for signing: it isn't issued, or a newer revision replaced it.");
  const name = clean(input.name, 80);
  if (!name) throw new SignError("Pick or type your name.");
  const company = input.isWorker ? CBS_COMPANY : clean(input.company, 120);
  if (!company) throw new SignError("Enter your company.");
  if (!input.accepted) throw new SignError("Tick to confirm you have read and understood it.");
  const sig = signatureBytes(input.signature);
  if (!sig) throw new SignError("Sign in the box first.");

  const [already] = await sql`select 1 from sign_ons where doc_type = ${doc.type} and doc_id = ${doc.id} and doc_revision = ${doc.revision} and lower(name) = lower(${name})`;
  if (already) throw new SignError(`${name} has already signed this revision.`);

  let fileId: number;
  try {
    const saved = await uploadBytes({
      folder: `${doc.folder}/Signatures`, name: `${doc.label} - ${name}.png`, bytes: sig, mime: "image/png",
      entityTable: "sign_ons", entityId: null, jobId: doc.jobId, role: "signature", createdBy: input.by,
    });
    fileId = saved.id;
  } catch (e) {
    throw new SignError(e instanceof SharePointError ? e.message : UNREACHABLE);
  }

  const [person] = await sql<{ id: string }[]>`select id from people where lower(name) = lower(${name}) and active`;
  try {
    await sql.begin(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into sign_ons (job_id, doc_type, doc_id, doc_revision, doc_label, name, company, is_worker, person_id, accepted,
                              signature_file_id, signed_via, presenter, created_by)
        values (${doc.jobId}, ${doc.type}, ${doc.id}, ${doc.revision}, ${doc.label}, ${name}, ${company}, ${input.isWorker},
                ${person ? Number(person.id) : null}, true, ${fileId}, ${input.via}, ${input.presenter ? clean(input.presenter, 80) : null}, ${input.by})
        returning id`;
      await tx`update files set entity_id = ${row.id} where id = ${fileId}`;
      await logActivity(tx, { person: input.by, table: "sign_ons", rowId: Number(row.id), jobId: doc.jobId, action: "create",
        changes: { name: [null, name], document: [null, doc.label] } });
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new SignError(`${name} has already signed this revision.`);
    throw e;
  }
  const note = await restamp(doc.type, doc.id, input.by);
  return { doc, note };
}

type SignRow = { name: string; company: string | null; signed_at: Date; signature_file_id: string | null; signed_via: string };

// The signed copy: the issued PDF with a "Sign-on" section added (name, company, when, signature),
// current revision only. Saved next to the issued PDF; the copy before is marked replaced.
export async function restamp(docType: string, docId: number, by: string): Promise<string | undefined> {
  const sql = db();
  const doc = await loadSignDoc(sql, docType, docId);
  if (!doc || !doc.issuedFileId) return undefined;
  const rows = await sql<SignRow[]>`
    select name, company, signed_at, signature_file_id, signed_via from sign_ons
    where doc_type = ${doc.type} and doc_id = ${doc.id} and doc_revision = ${doc.revision} order by signed_at, id`;
  try {
    const issued = await readFileBytes(sql, doc.issuedFileId);
    const signatures = await Promise.all(rows.map((r) => (r.signature_file_id ? readFileBytes(sql, Number(r.signature_file_id), 2 * 1024 * 1024).then((f) => f.bytes).catch(() => null) : null)));
    const stamp = await HousePdf.create({ title: `Sign-on - ${doc.label}`, jobNo: doc.jobNo, subtitle: `${rows.length} ${rows.length === 1 ? "person has" : "people have"} signed this revision` });
    if (!rows.length) stamp.paragraph("Nobody has signed this revision yet.");
    for (const [i, r] of rows.entries()) {
      stamp.keyValues([[`${i + 1}. ${r.name}`, `${r.company ?? ""} | signed ${r.signed_at.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })}${r.signed_via === "crew" ? " on the crew page" : ""}`]], 9);
      if (signatures[i]) await stamp.image(signatures[i]!, { widthMm: 50, heightMm: 14 });
    }
    const out = await PDFDocument.load(issued.bytes, { ignoreEncryption: true });
    const extra = await PDFDocument.load(await stamp.finish());
    for (const p of await out.copyPages(extra, extra.getPageIndices())) out.addPage(p);
    const bytes = await out.save();

    const base = doc.issuedFileName.replace(/\.pdf$/i, "");
    const saved = await uploadBytes({
      folder: doc.folder, name: `${base} - signed (${rows.length}).pdf`, bytes, mime: "application/pdf",
      entityTable: doc.table, entityId: doc.id, jobId: doc.jobId, role: "signed-copy", createdBy: by,
    });
    await sql.begin(async (tx) => {
      if (doc.signedFileId) await tx`update files set superseded_by = ${saved.id} where id = ${doc.signedFileId}`;
      await signAdapter(doc.type)!.setSignedFile(tx, doc.id, saved.id);
    });
    return undefined;
  } catch (e) {
    if (!(e instanceof SharePointError)) console.error("Signed copy failed", e);
    return "Signed. The signed copy couldn't be saved just now; it's made again with the next signature, or from the document page.";
  }
}

// Names for the signing page: who is booked on this job today in ServiceM8 first, then the crew list.
export async function signNames(jobId: number): Promise<{ today: string[]; crew: string[] }> {
  const sql = db();
  const today = await sql<{ name: string }[]>`
    select distinct coalesce(p.name, nullif(trim(concat_ws(' ', s.first_name, s.last_name)), '')) as name
    from jobs j
    join sm8_bookings b on b.job_sm8_uuid = j.sm8_uuid and b.active
    left join people p on p.sm8_staff_uuid = b.staff_sm8_uuid and p.active
    left join sm8_staff s on s.sm8_uuid = b.staff_sm8_uuid
    where j.id = ${jobId}
      and (b.starts_at at time zone 'Europe/London')::date <= (now() at time zone 'Europe/London')::date
      and (coalesce(b.ends_at, b.starts_at) at time zone 'Europe/London')::date >= (now() at time zone 'Europe/London')::date`;
  const crew = await sql<{ name: string }[]>`select name from people where active and 'crew' = any(lists) order by lower(name)`;
  const t = today.map((r) => r.name).filter(Boolean);
  return { today: t, crew: crew.map((r) => r.name).filter((n) => !t.includes(n)) };
}
