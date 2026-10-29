import { afterAll, describe, expect, it } from "vitest";
import { BANK_HOLIDAYS, BANK_HOLIDAYS_LAST_YEAR } from "@/app/(hub)/people/time-off/bank-holidays";
import { datesLabel, waitingItems, whosOff, workingDays } from "@/app/(hub)/people/time-off/rules";

describe("working days", () => {
  it("counts Monday to Friday", () => {
    expect(workingDays("2026-11-02", "2026-11-06").days).toBe(5); // Mon to Fri
    expect(workingDays("2026-11-06", "2026-11-09").days).toBe(2); // Fri, Sat, Sun, Mon
    expect(workingDays("2026-11-07", "2026-11-08").days).toBe(0); // a weekend
  });

  it("skips England and Wales bank holidays, including substitute days", () => {
    const xmas = workingDays("2026-12-24", "2026-12-29"); // 25 Dec and 28 Dec (Boxing Day substitute)
    expect(xmas.days).toBe(2);
    expect(xmas.bankHolidays).toEqual(["2026-12-25", "2026-12-28"]);
    expect(workingDays("2027-03-26", "2027-03-29").days).toBe(0); // Good Friday to Easter Monday
  });

  it("counts a morning or afternoon as half a day, single days only", () => {
    expect(workingDays("2026-11-04", "2026-11-04", "morning").days).toBe(0.5);
    expect(workingDays("2026-11-07", "2026-11-07", "afternoon").days).toBe(0); // a Saturday
    expect(workingDays("2026-11-04", "2026-11-05", "morning").days).toBe(2); // ignored over a range
  });

  it("flags dates after the stored bank holiday list", () => {
    expect(workingDays("2027-12-30", "2028-01-04").unlisted).toBe(true);
    expect(workingDays("2027-06-01", "2027-06-02").unlisted).toBe(false);
    expect(Object.keys(BANK_HOLIDAYS).every((d) => Number(d.slice(0, 4)) <= BANK_HOLIDAYS_LAST_YEAR)).toBe(true);
    expect(Object.keys(BANK_HOLIDAYS).filter((d) => d.startsWith("2026"))).toHaveLength(8);
  });
});

describe("lists", () => {
  const today = "2026-10-30";
  const rows = [
    { id: 1, fromDate: "2026-11-02", toDate: "2026-11-03", status: "pending" as const, partDay: "full" as const },
    { id: 2, fromDate: "2026-12-14", toDate: "2026-12-15", status: "under_review" as const, partDay: "full" as const },
    { id: 3, fromDate: "2026-10-28", toDate: "2026-10-31", status: "approved" as const, partDay: "full" as const },
    { id: 4, fromDate: "2026-12-30", toDate: "2027-01-02", status: "approved" as const, partDay: "full" as const },
    { id: 5, fromDate: "2026-11-10", toDate: "2026-11-10", status: "declined" as const, partDay: "full" as const },
  ];

  it("waiting requests are overdue when they start within 7 days", () => {
    expect(waitingItems(rows, today).map((w) => `${w.row.id}:${w.level}`)).toEqual(["1:overdue", "2:soon"]);
  });

  it("Who's off: approved time off today or in the next 30 days", () => {
    expect(whosOff(rows, today).map((r) => r.id)).toEqual([3]);
  });

  it("describes the dates", () => {
    expect(datesLabel({ fromDate: "2026-11-04", toDate: "2026-11-04", partDay: "morning" })).toBe("4 Nov 2026 (morning only)");
    expect(datesLabel({ fromDate: "2026-11-02", toDate: "2026-11-06", partDay: "full" })).toBe("2 Nov 2026 to 6 Nov 2026");
  });
});

// Needs a database: tests/setup.ts leaves DATABASE_URL only if it is a local or dev database.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("time off in the database", async () => {
  const { db } = await import("@/lib/db");
  const { recordFolder } = await import("@/lib/files/record-folder");
  const sql = db();
  const stamp = String(Date.now()).slice(-6);
  let personId = 0;
  let rowId = 0;

  afterAll(async () => {
    if (rowId) await sql`delete from time_off where id = ${rowId}`;
    if (personId) await sql`delete from people where id = ${personId}`;
    await sql.end();
  });

  it("files time off under HR, not Operations, and refuses a part day over a range", async () => {
    const [p] = await sql<{ id: string }[]>`insert into people (name, created_by) values (${`ZZ Test Leave ${stamp}`}, 'test') returning id`;
    personId = Number(p.id);
    const [r] = await sql<{ id: string }[]>`
      insert into time_off (person_id, kind, from_date, to_date, days, created_by) values (${personId}, 'Annual leave', '2026-11-02', '2026-11-03', 2, 'test') returning id`;
    rowId = Number(r.id);
    expect(await recordFolder("time_off", rowId)).toBe(`CBS System/HR/Time Off/ZZ Test Leave ${stamp}`);
    await expect(sql`insert into time_off (person_id, kind, from_date, to_date, part_day, days) values (${personId}, 'Annual leave', '2026-11-02', '2026-11-03', 'morning', 1)`)
      .rejects.toMatchObject({ code: "23514" });
  });
});
