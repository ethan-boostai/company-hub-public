import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { checkLegacyPin, checkPin, hashPin, isValidPin, legacyPinHash } from "@/lib/auth/pin";
import { hashToken, newToken } from "@/lib/auth/token";
import { cleanFileName, UPLOAD_FOLDER } from "@/lib/files/storage";
import { readTicket, signTicket, type UploadTicket } from "@/lib/files/ticket";
import { HousePdf } from "@/lib/pdf/house";
import { diff } from "@/lib/activity";

describe("PINs", () => {
  it("accepts exactly 4 digits", () => {
    expect(isValidPin("1234")).toBe(true);
    for (const bad of ["123", "12345", "12a4", " 1234", ""]) expect(isValidPin(bad)).toBe(false);
  });

  it("hashes with bcrypt and checks", async () => {
    const h = await hashPin("4321");
    expect(h.startsWith("$2")).toBe(true);
    expect(await checkPin("4321", h)).toBe(true);
    expect(await checkPin("1234", h)).toBe(false);
  });

  it("matches the old hub's SHA-256 PIN hash (independent vector from Python hashlib)", () => {
    const expected = "8781e81f4833a9b29301e165c35783863b088e43753d973c0b222fdef5f6b63f";
    expect(legacyPinHash("Test Office One", "1234", "test-prefix")).toBe(expected);
    expect(checkLegacyPin("Test Office One", "1234", expected, "test-prefix")).toBe(true);
    expect(checkLegacyPin("Test Office One", "9999", expected, "test-prefix")).toBe(false);
    expect(checkLegacyPin("Test Office One", "1234", expected, "")).toBe(false);
  });
});

describe("session tokens", () => {
  it("are random and stored only as a hash", () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});

describe("upload tickets", () => {
  const t: UploadTicket = {
    name: "a.pdf", size: 10, mime: "application/pdf", path: "x/a.pdf", entityTable: null, entityId: null,
    jobId: null, role: null, personId: 1, requestKey: "00000000-0000-4000-8000-000000000000", exp: Date.now() + 60_000,
  };
  it("round-trips", () => expect(readTicket(signTicket(t))).toEqual(t));
  it("rejects tampering", () => {
    const [body, mac] = signTicket(t).split(".");
    const forged = Buffer.from(JSON.stringify({ ...t, personId: 2 })).toString("base64url");
    expect(readTicket(`${forged}.${mac}`)).toBeNull();
    expect(readTicket(`${body}.x${mac}`)).toBeNull();
  });
  it("rejects expired tickets", () => expect(readTicket(signTicket({ ...t, exp: Date.now() - 1 }))).toBeNull());
});

describe("file names", () => {
  it("keep any type but drop unsafe characters and folders", () => {
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName('Job 12 - "RAMS" v2?.pdf')).toBe("Job 12 - RAMS v2.pdf");
    expect(cleanFileName("photo.HEIC")).toBe("photo.HEIC");
    expect(cleanFileName("")).toBe("file");
  });
  it("go to the SharePoint test folder in Phase 0", () => {
    expect(UPLOAD_FOLDER).toBe("CBS System/Hub uploads/Test");
  });
});

describe("house PDF", () => {
  it("builds a multi-page A4 document with page numbers and survives odd characters", async () => {
    const pdf = await HousePdf.create({ title: "Test document", jobNo: "12", subtitle: "Test site | Test client" });
    pdf.heading("Section");
    pdf.paragraph("Plain text with £ and – and an unsupported character → and emoji 🙂.");
    pdf.keyValues([["Prepared by", "Test Office One"]]);
    pdf.table([{ label: "No", width: 0.2 }, { label: "Text", width: 0.8 }], Array.from({ length: 120 }, (_, i) => [String(i), "Row text that is long enough to wrap onto more than one line in the table cell."]));
    const bytes = await pdf.finish();
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(2);
    const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
    expect(Math.round(w)).toBe(595);
    expect(Math.round(h)).toBe(842);
    expect(doc.getTitle()).toBe("Test document - Job 12");
  });
});

describe("activity diff", () => {
  it("lists only changed fields", () => {
    expect(diff({ a: 1, b: "x" }, { a: 1, b: "y", c: null }, ["a", "b", "c"])).toEqual({ b: ["x", "y"] });
    expect(diff(null, { a: 1 }, ["a"])).toEqual({ a: [null, 1] });
  });
});
