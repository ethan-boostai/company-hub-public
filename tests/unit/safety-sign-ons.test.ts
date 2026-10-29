import { afterAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

describe("crew link", async () => {
  process.env.TEAM_LINK_KEY = process.env.TEAM_LINK_KEY || "unit-test-team-key-0123456789";
  const { crewToken, crewTokenOk } = await import("@/lib/signons/crew-link");
  it("opens only its own job", () => {
    const t = crewToken("12")!;
    expect(t).toMatch(/^[0-9a-f]{32}$/);
    expect(crewTokenOk("12", t)).toBe(true);
    expect(crewTokenOk("13", t)).toBe(false);
    expect(crewTokenOk("12", t.slice(0, 31) + (t[31] === "a" ? "b" : "a"))).toBe(false);
    expect(crewTokenOk("12", null)).toBe(false);
  });
});

const url = process.env.DATABASE_URL || "";
describe.skipIf(!/@(127\.0\.0\.1|localhost)[:/]/.test(url))("sign-ons (local database and storage)", async () => {
  const { db } = await import("@/lib/db");
  const { uploadBytes } = await import("@/lib/files/server-upload");
  const { readFileBytes } = await import("@/lib/files/read-bytes");
  const { registerSignDoc } = await import("@/lib/signons/docs");
  const { signOn, restamp } = await import("@/lib/signons/service");
  const sql = db();
  const [job] = await sql<{ id: string; job_no: string }[]>`select id, job_no from jobs order by id limit 1`;
  const made: number[] = [];

  // A fake signable document, so the sign-on service can be tested before any real document type.
  const doc = { open: true, revision: 1, signed: null as number | null, issued: 0 };
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  const issued = await uploadBytes({ folder: "CBS System/Hub uploads/Test", name: "ZZ unit RAMS.pdf", bytes: await pdf.save(), mime: "application/pdf", entityTable: null, entityId: null, createdBy: "unit test" });
  doc.issued = issued.id;
  made.push(issued.id);
  registerSignDoc("toolbox", {
    load: async (_s, id) => (id === 999001 ? {
      type: "toolbox", table: "files", id, jobId: Number(job.id), jobNo: job.job_no, revision: doc.revision, label: `ZZ unit doc rev ${doc.revision}`,
      issuedFileId: doc.issued, issuedFileName: "ZZ unit RAMS.pdf", folder: "CBS System/Hub uploads/Test", signedFileId: doc.signed, signable: doc.open, acceptText: "ok",
    } : null),
    openForJob: async () => [],
    setSignedFile: async (_s, _id, fileId) => { doc.signed = fileId; },
  });
  // A 1x1 PNG.
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const base = { docType: "toolbox", docId: 999001, isWorker: true, company: "", accepted: true, signature: png, via: "crew" as const, by: "ZZ Unit A" };

  afterAll(async () => {
    await sql`delete from sign_ons where doc_type = 'toolbox' and doc_id = 999001`;
    if (made.length) await sql`delete from files where id = any(${made}) or (role in ('signature', 'signed-copy') and created_by like 'ZZ Unit%')`;
    await sql.end();
  });

  it("records the sign-on and makes a signed copy (issued pages + the sign-on page)", async () => {
    const r = await signOn({ ...base, name: "ZZ Unit A" });
    expect(r.note).toBeUndefined();
    const rows = await sql`select name, company, signed_via, doc_revision, signature_file_id from sign_ons where doc_type = 'toolbox' and doc_id = 999001`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "ZZ Unit A", company: "Chelmsford Building Services", signed_via: "crew", doc_revision: 1 });
    expect(doc.signed).not.toBeNull();
    const copy = await readFileBytes(sql, doc.signed!);
    expect(copy.name).toBe("ZZ unit RAMS - signed (1).pdf");
    expect((await PDFDocument.load(copy.bytes)).getPageCount()).toBe(3);
  });

  it("refuses the same person twice on one revision, and a missing signature, company or tick", async () => {
    await expect(signOn({ ...base, name: "zz unit a" })).rejects.toThrow(/already signed/);
    await expect(signOn({ ...base, name: "ZZ Unit B", signature: "" })).rejects.toThrow(/Sign in the box/);
    await expect(signOn({ ...base, name: "ZZ Unit B", isWorker: false, company: " " })).rejects.toThrow(/company/);
    await expect(signOn({ ...base, name: "ZZ Unit B", accepted: false })).rejects.toThrow(/Tick/);
  });

  it("each signature re-saves the signed copy and marks the old one replaced", async () => {
    const before = doc.signed!;
    await signOn({ ...base, name: "ZZ Unit B", isWorker: false, company: "ZZ Scaffolding Ltd", by: "ZZ Unit B" });
    expect(doc.signed).not.toBe(before);
    const [old] = await sql<{ superseded_by: string }[]>`select superseded_by from files where id = ${before}`;
    expect(Number(old.superseded_by)).toBe(doc.signed);
    expect((await readFileBytes(sql, doc.signed!)).name).toBe("ZZ unit RAMS - signed (2).pdf");
  });

  it("a new revision needs signing again; a closed document can't be signed", async () => {
    doc.revision = 2;
    await signOn({ ...base, name: "ZZ Unit A", by: "ZZ Unit A" });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from sign_ons where doc_type = 'toolbox' and doc_id = 999001 and doc_revision = 2`;
    expect(n).toBe(1);
    doc.open = false;
    await expect(signOn({ ...base, name: "ZZ Unit C" })).rejects.toThrow(/isn't open for signing/);
    doc.open = true;
  });

  it("restamp after a removal leaves the person out", async () => {
    await sql`delete from sign_ons where doc_type = 'toolbox' and doc_id = 999001 and doc_revision = 2`;
    await restamp("toolbox", 999001, "ZZ Unit A");
    expect((await readFileBytes(sql, doc.signed!)).name).toBe("ZZ unit RAMS - signed (0).pdf");
  });
});
