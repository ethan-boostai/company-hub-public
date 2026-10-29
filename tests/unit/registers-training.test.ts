import { afterAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { HousePdf } from "@/lib/pdf/house";
import {
  bestFor, bestRecords, cellText, isSuperseded, matrixPeople, matrixTickets, pdfCellText, ticketLabel, ticketState, trainingDueItems,
} from "@/app/(hub)/training/rules";

const today = "2026-10-30";
const rec = (id: number, personId: number, qualification: string, expiresOn: string | null) => ({ id, personId, qualification, expiresOn });

describe("ticket status", () => {
  it("is valid, expiring within 60 days, expired or missing", () => {
    expect(ticketState(rec(1, 1, "SMSTS", null), today)).toBe("valid");
    expect(ticketState(rec(1, 1, "SMSTS", "2027-06-01"), today)).toBe("valid");
    expect(ticketState(rec(1, 1, "SMSTS", "2026-12-29"), today)).toBe("expiring"); // 60 days
    expect(ticketState(rec(1, 1, "SMSTS", "2026-12-30"), today)).toBe("valid");    // 61 days
    expect(ticketState(rec(1, 1, "SMSTS", "2026-10-29"), today)).toBe("expired");
    expect(ticketState(undefined, today)).toBe("missing");
    expect(ticketLabel({ expiresOn: "2026-11-09" }, today)).toBe("Expires 9 Nov 2026 (10 days)");
    expect(ticketLabel({ expiresOn: null }, today)).toBe("No expiry");
  });

  it("writes cells for the screen and for the PDF", () => {
    expect(cellText(rec(1, 1, "SMSTS", "2027-03-12"), today)).toBe("12 Mar 2027");
    expect(cellText(rec(1, 1, "SMSTS", "2026-01-01"), today)).toBe("Expired");
    expect(cellText(rec(1, 1, "CSCS card", null), today)).toBe("No expiry");
    expect(cellText(undefined, today)).toBe("-");
    expect(pdfCellText(rec(1, 1, "SMSTS", "2027-03-12"), today, true)).toBe("OK 12 Mar 27");
    expect(pdfCellText(rec(1, 1, "SMSTS", "2026-11-03"), today, true)).toBe("DUE 3 Nov 26");
    expect(pdfCellText(rec(1, 1, "SMSTS", "2026-01-01"), today, false)).toBe("EXPIRED");
    expect(pdfCellText(undefined, today, true)).toBe("-");
  });
});

describe("best record", () => {
  it("counts no expiry first, then the latest expiry, then the newest record", () => {
    const records = [
      rec(1, 1, "SMSTS", "2025-01-01"),
      rec(2, 1, "smsts", "2029-01-01"),   // same ticket, different case
      rec(3, 1, "CSCS card", "2027-01-01"),
      rec(4, 1, "CSCS card", null),        // no expiry wins
      rec(5, 2, "IPAF (MEWP)", "2027-01-01"),
      rec(6, 2, "IPAF (MEWP)", "2027-01-01"), // same date: newest wins
    ];
    const best = bestRecords(records);
    expect(bestFor(best, 1, "SMSTS")?.id).toBe(2);
    expect(bestFor(best, 1, "CSCS card")?.id).toBe(4);
    expect(bestFor(best, 2, "IPAF (MEWP)")?.id).toBe(6);
    expect(isSuperseded(best, records[0])).toBe(true);
    expect(isSuperseded(best, records[1])).toBe(false);
  });
});

describe("matrix", () => {
  const people = [
    { id: 1, name: "Zara", active: true, crew: true },
    { id: 2, name: "Adam", active: true, crew: false },
    { id: 3, name: "Left", active: false, crew: true },
    { id: 4, name: "Gone", active: false, crew: false },
  ];
  const records = [rec(1, 1, "SMSTS", null), rec(2, 3, "PASMA", "2026-01-01"), rec(3, 2, "ZZ Custom ticket", null)];

  it("uses the crew tick on People for the crew list, and keeps leavers with tickets on Everyone", () => {
    expect(matrixPeople(people, records, "crew").map((p) => p.name)).toEqual(["Zara"]);
    expect(matrixPeople(people, records, "active").map((p) => p.name)).toEqual(["Adam", "Left", "Zara"]);
  });

  it("lists tickets on file in the standard order, then others; or all standard; or the chosen ones", () => {
    expect(matrixTickets(records, "on_file")).toEqual(["SMSTS", "PASMA", "ZZ Custom ticket"]);
    const all = matrixTickets(records, "standard");
    expect(all[0]).toBe("CSCS card");
    expect(all.at(-1)).toBe("ZZ Custom ticket");
    expect(all).toHaveLength(23);
    expect(matrixTickets(records, "chosen", ["PASMA"])).toEqual(["PASMA"]);
  });

  it("lists expired and expiring tickets of active people only", () => {
    const due = trainingDueItems(
      [rec(1, 1, "SMSTS", "2026-11-15"), rec(2, 1, "PASMA", "2026-10-01"), rec(3, 1, "PASMA", "2027-10-01"), rec(4, 4, "IPAF (MEWP)", "2026-10-01"), rec(5, 2, "CSCS card", "2026-10-29")],
      people, today,
    );
    expect(due.map((d) => `${d.person} ${d.qualification} ${d.state}`)).toEqual(["Adam CSCS card expired", "Zara SMSTS expiring"]);
  });
});

describe("house PDF", () => {
  it("is portrait by default and A4 landscape when asked", async () => {
    for (const landscape of [false, true]) {
      const pdf = await HousePdf.create({ title: "ZZ Test", landscape });
      pdf.table([{ label: "A", width: 1 }], [["x"]]);
      const doc = await PDFDocument.load(await pdf.finish());
      const { width, height } = doc.getPage(0).getSize();
      expect([Math.round(width), Math.round(height)]).toEqual(landscape ? [842, 595] : [595, 842]);
    }
  });
});

// Needs a database: tests/setup.ts leaves DATABASE_URL only if it is a local or dev database.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("training in the database", async () => {
  const { db } = await import("@/lib/db");
  const { recordFolder } = await import("@/lib/files/record-folder");
  const sql = db();
  const stamp = String(Date.now()).slice(-6);
  let personId = 0;
  let recordId = 0;

  afterAll(async () => {
    if (recordId) await sql`delete from training_records where id = ${recordId}`;
    if (personId) await sql`delete from people where id = ${personId}`;
    await sql.end();
  });

  it("files training under the person's name, and keeps people with training from being deleted", async () => {
    const [p] = await sql<{ id: string }[]>`insert into people (name, created_by) values (${`ZZ Test: Person/${stamp}`}, 'test') returning id`;
    personId = Number(p.id);
    const [r] = await sql<{ id: string }[]>`insert into training_records (person_id, qualification, created_by) values (${personId}, 'SMSTS', 'test') returning id`;
    recordId = Number(r.id);
    expect(await recordFolder("training_records", recordId)).toBe(`CBS System/H&S/Training/ZZ Test Person${stamp}`);
    await expect(sql`delete from people where id = ${personId}`).rejects.toMatchObject({ code: "23503" });
  });
});
