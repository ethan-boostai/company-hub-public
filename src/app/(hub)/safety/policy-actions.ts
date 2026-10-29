"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { readFileBytes } from "@/lib/files/read-bytes";
import { SharePointError, UNREACHABLE } from "@/lib/files/sharepoint";
import { uploadBytes } from "@/lib/files/server-upload";
import { ukToday } from "../_registers/dates";
import { forLog, FormValues } from "../_registers/form-values";
import { docQuery, loadPolicy, type PolicyData } from "./policy-data";
import { buildPolicyPdf } from "./policy-pdf";
import { missingForIssue, policyFileName, type DocKind } from "./policy-rules";

export type PolicySaved = { all: PolicyData; id: number | null };
const GONE = { ok: false as const, message: "That document no longer exists. Refresh the page." };
const FOLDER = "CBS System/H&S/Policies";
const done = async (personId: number, id: number | null, message = "Saved."): Promise<ActionResult<PolicySaved>> =>
  ({ ok: true, message, data: { all: await loadPolicy(personId, db()), id } });

const FIELDS = ["version", "effective_on", "review_due", "paragraphs", "signatory_id", "signatory_role", "advisor", "notes"];

// Saves a draft (new or existing). Issued and superseded documents can't be changed.
export async function saveHsDocument(form: FormData): Promise<ActionResult<PolicySaved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const kind = f.oneOf<DocKind>("kind", ["policy", "manual"], "policy");
  const paragraphs = form.getAll("paragraph").map((p) => String(p).replace(/\r\n/g, "\n").trim()).filter(Boolean).slice(0, 40);
  if (paragraphs.some((p) => p.length > 3000)) f.errors.paragraphs = "Keep each paragraph under 3,000 characters.";
  const v = {
    version: f.required("version", "Enter the issue name, e.g. October 2026.", 60),
    effective_on: f.date("effective_on"),
    review_due: f.date("review_due"),
    paragraphs: kind === "policy" ? paragraphs : [],
    signatory_id: kind === "policy" ? f.id("signatory_id") : null,
    signatory_role: kind === "policy" ? f.text("signatory_role", 80) : null,
    advisor: kind === "policy" ? f.text("advisor", 120) : null,
    notes: f.text("notes", 4000),
  };
  if (!f.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: f.errors };

  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const rowId = await db().begin(async (tx) => {
        if (id) {
          const [before] = await tx`select ${tx(FIELDS)}, status from hs_documents where id = ${id} for update`;
          if (!before) return null;
          if (before.status !== "draft") throw new Error("not-draft");
          delete before.status;
          await tx`update hs_documents set ${tx(v as Record<string, unknown>)}, updated_at = now(), updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v, FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "hs_documents", rowId: id, action: "update", changes });
          return id;
        }
        const [r] = await tx<{ id: string }[]>`insert into hs_documents ${tx({ ...v, kind, created_by: person.name } as Record<string, unknown>)} returning id`;
        await logActivity(tx, { person: person.name, table: "hs_documents", rowId: Number(r.id), action: "create", changes: diff(null, { kind, ...v }, ["kind", ...FIELDS]) });
        return Number(r.id);
      });
      if (rowId === null) return GONE;
      return done(person.id, rowId);
    } catch (e) {
      if (e instanceof Error && e.message === "not-draft") return { ok: false, message: "An issued document can't be changed. Start a new issue instead." };
      if ((e as { code?: string }).code === "23505") return { ok: false, message: "Check the highlighted fields.", fieldErrors: { version: "There's already an issue with that name." } };
      if ((e as { code?: string }).code === "23503") return { ok: false, message: "The person you chose is no longer on the team. Choose another." };
      throw e;
    }
  });
}

export async function deleteHsDraft(id: number, requestKey: string): Promise<ActionResult<PolicySaved>> {
  return guarded(requestKey, async (person) => {
    const r = await db().begin(async (tx) => {
      const [d] = await tx<{ status: string; kind: string; version: string }[]>`select status, kind, version from hs_documents where id = ${id} for update`;
      if (!d) return "gone";
      if (d.status !== "draft") return "issued";
      await tx`delete from hs_documents where id = ${id}`;
      await logActivity(tx, { person: person.name, table: "hs_documents", rowId: id, action: "delete", changes: { version: [`${d.kind} ${d.version}`, null] } });
      return "ok";
    });
    if (r === "gone") return GONE;
    if (r === "issued") return { ok: false, message: "Only drafts can be deleted. An issued document stays on record." };
    return done(person.id, null, "Draft deleted.");
  });
}

// The manual PDF was uploaded to a draft manual: check it really is a PDF, then attach it.
export async function setManualFile(id: number, fileId: number, requestKey: string): Promise<ActionResult<PolicySaved>> {
  return guarded(requestKey, async (person) => {
    const sql = db();
    const [d] = await sql<{ kind: string; status: string; file_id: string | null }[]>`select kind, status, file_id from hs_documents where id = ${id}`;
    if (!d || d.kind !== "manual") return GONE;
    if (d.status !== "draft") return { ok: false, message: "An issued manual can't be changed. Start a new issue instead." };
    const [f] = await sql<{ name: string }[]>`select name from files where id = ${fileId} and entity_table = 'hs_documents' and entity_id = ${id}`;
    if (!f) return { ok: false, message: "The upload wasn't found. Try again." };
    let isPdf = false;
    try {
      const file = await readFileBytes(sql, fileId);
      isPdf = file.bytes.length > 4 && file.bytes[0] === 0x25 && file.bytes[1] === 0x50 && file.bytes[2] === 0x44 && file.bytes[3] === 0x46;
    } catch (e) {
      return { ok: false, message: e instanceof SharePointError ? e.message : UNREACHABLE };
    }
    if (!isPdf) {
      await sql`update files set superseded_by = ${fileId} where id = ${fileId}`; // not attached; kept out of lists
      return { ok: false, message: "The manual must be a PDF. Choose the PDF of the manual." };
    }
    await sql.begin(async (tx) => {
      await tx`update hs_documents set file_id = ${fileId}, updated_at = now(), updated_by = ${person.name} where id = ${id}`;
      if (d.file_id && Number(d.file_id) !== fileId) await tx`update files set superseded_by = ${fileId} where id = ${d.file_id}`;
      await logActivity(tx, { person: person.name, table: "hs_documents", rowId: id, action: "update", changes: { file: [d.file_id ? Number(d.file_id) : null, f.name] } });
    });
    return done(person.id, id, "Manual PDF added.");
  });
}

// A drawn signature from the signature pad: a PNG data URL, not too large.
function drawnSignature(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m || m[1].length > 700_000) return null;
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 ? bytes : null;
}

// Issue a draft: only people with the "Issue H&S policy" tick. A policy is signed (drawn now or the
// issuer's saved signature) and its PDF made and saved; a manual needs its PDF. The previous issued
// document of the same kind becomes Superseded.
export async function issueHsDocument(
  id: number,
  sign: { use: "saved" | "drawn" | "none"; drawn?: string; saveAsMine?: boolean },
  requestKey: string,
): Promise<ActionResult<PolicySaved>> {
  return guarded(requestKey, async (person) => {
    const sql = db();
    const [me] = await sql<{ can: boolean; sig: string | null }[]>`select active and 'hs_issue' = any(lists) as can, signature_file_id as sig from people where id = ${person.id}`;
    if (!me?.can) return { ok: false, message: "Only people with the \"Issue H&S policy\" tick on their Team record can issue this." };
    const [d] = await docQuery(sql, id);
    if (!d) return GONE;
    if (d.status !== "draft") return { ok: false, message: "This has already been issued." };
    const missing = missingForIssue(d);
    if (missing.length) return { ok: false, message: `Before it can be issued it needs ${missing.join(", ")}.` };
    const today = ukToday();

    let fileId = d.fileId;
    let signatureFileId: number | null = null;
    try {
      if (d.kind === "policy") {
        let signature: Uint8Array | null = null;
        if (sign.use === "saved") {
          if (!me.sig) return { ok: false, message: "You don't have a saved signature. Sign in the box instead." };
          signature = (await readFileBytes(sql, Number(me.sig), 2 * 1024 * 1024)).bytes;
          signatureFileId = Number(me.sig);
        } else {
          signature = drawnSignature(sign.drawn ?? "");
          if (!signature) return { ok: false, message: "Sign in the box first." };
          const saved = await uploadBytes({ folder: `${FOLDER}/Signatures`, name: `Signature - ${person.name} - ${today}.png`, bytes: signature, mime: "image/png",
            entityTable: "hs_documents", entityId: id, role: "signature", createdBy: person.name });
          signatureFileId = saved.id;
        }
        const bytes = await buildPolicyPdf(d, { signature, draft: false, issuedOn: today, issuedBy: person.name });
        const pdf = await uploadBytes({ folder: FOLDER, name: policyFileName("policy", d.version), bytes, mime: "application/pdf",
          entityTable: "hs_documents", entityId: id, role: "policy-pdf", createdBy: person.name });
        fileId = pdf.id;
      }
    } catch (e) {
      if (!(e instanceof SharePointError)) console.error("Policy issue failed", e);
      return { ok: false, message: `It wasn't issued: ${e instanceof SharePointError ? e.message : UNREACHABLE}` };
    }

    try {
      await sql.begin(async (tx) => {
        const [still] = await tx<{ status: string }[]>`select status from hs_documents where id = ${id} for update`;
        if (still?.status !== "draft") throw new Error("not-draft");
        const prev = await tx<{ id: string; version: string }[]>`update hs_documents set status = 'superseded', updated_at = now(), updated_by = ${person.name}
                                 where kind = ${d.kind} and status = 'issued' returning id, version`;
        await tx`update hs_documents set status = 'issued', issued_by = ${person.name}, issued_on = ${today}, file_id = ${fileId},
                   signature_file_id = ${signatureFileId}, signatory_name = ${d.kind === "policy" ? d.signatoryName : null},
                   updated_at = now(), updated_by = ${person.name} where id = ${id}`;
        if (d.kind === "policy" && sign.use === "drawn" && sign.saveAsMine && signatureFileId) {
          await tx`update people set signature_file_id = ${signatureFileId}, updated_by = ${person.name} where id = ${person.id}`;
        }
        await logActivity(tx, { person: person.name, table: "hs_documents", rowId: id, action: "update", changes: { status: ["draft", "issued"], issued_on: [null, today] } });
        for (const p of prev) await logActivity(tx, { person: person.name, table: "hs_documents", rowId: Number(p.id), action: "update", changes: { status: ["issued", "superseded"] } });
      });
    } catch (e) {
      if (e instanceof Error && e.message === "not-draft") return { ok: false, message: "This has already been issued." };
      throw e;
    }
    return done(person.id, id, `${d.kind === "policy" ? "Policy statement" : "Manual"} ${d.version} issued.`);
  });
}
