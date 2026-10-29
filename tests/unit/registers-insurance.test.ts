import { afterAll, describe, expect, it } from "vitest";
import {
  actionState, attentionItems, closedOnFor, expiryLabel, expiryState, isClosed, money, policyTitle, renewalDates,
} from "@/app/(hub)/insurance/rules";

const today = "2026-10-30";

describe("expiry", () => {
  it("is red once expired, orange within 30 days, yellow within 60 days", () => {
    expect(expiryState("2026-10-29", today)).toBe("overdue");
    expect(expiryState("2026-11-20", today)).toBe("soon");
    expect(expiryState("2026-12-20", today)).toBe("up");
    expect(expiryState("2027-06-01", today)).toBe("ok");
    expect(expiryState(null, today)).toBe("none");
    expect(expiryLabel("2026-10-30", today)).toBe("Expires today");
    expect(expiryLabel("2026-10-31", today)).toBe("1 day left");
    expect(expiryLabel("2026-10-01", today)).toBe("Expired 1 Oct 2026");
    expect(expiryLabel(null, today)).toBe("No expiry date");
  });

  it("flags a claim's next action when overdue or due within 7 days", () => {
    expect(actionState("2026-10-29", today)).toBe("overdue");
    expect(actionState("2026-11-06", today)).toBe("soon");
    expect(actionState("2026-11-07", today)).toBe("none");
    expect(actionState(null, today)).toBe("none");
  });
});

describe("claims", () => {
  it("treats Settled, Closed, Withdrawn and Declined as closed", () => {
    expect(["settled", "closed", "withdrawn", "declined"].every((s) => isClosed(s as never))).toBe(true);
    expect(["open", "lodged", "assessing", "approved"].some((s) => isClosed(s as never))).toBe(false);
  });

  it("sets the closed date to today when none is given, and clears it on reopening", () => {
    expect(closedOnFor("settled", null, today)).toBe(today);
    expect(closedOnFor("closed", "2026-09-01", today)).toBe("2026-09-01");
    expect(closedOnFor("open", "2026-09-01", today)).toBeNull();
  });
});

describe("policies", () => {
  it("renews from the day after the old period, for a year", () => {
    expect(renewalDates({ startsOn: "2025-11-01", expiresOn: "2026-10-31" }, today)).toEqual({ startsOn: "2026-11-01", expiresOn: "2027-10-31" });
    expect(renewalDates({ startsOn: null, expiresOn: null }, today)).toEqual({ startsOn: today, expiresOn: "2027-10-29" });
  });

  it("names a policy by type and name, and shows pounds", () => {
    expect(policyTitle({ policyType: "Motor vehicle", name: "Fleet" })).toBe("Motor vehicle - Fleet");
    expect(policyTitle({ policyType: "Public liability", name: "" })).toBe("Public liability");
    expect(money(5000000)).toBe("£5,000,000");
    expect(money(250.5)).toBe("£250.50");
    expect(money(null)).toBe("");
  });
});

describe("needs attention", () => {
  it("lists expiring current policies and accreditations, and every open claim", () => {
    const items = attentionItems(
      [
        { id: 1, policyType: "Public liability", name: "", expiresOn: "2026-11-15", renewedById: null },
        { id: 2, policyType: "Motor vehicle", name: "Fleet", expiresOn: "2026-10-01", renewedById: 3 }, // renewed: no reminder
        { id: 3, policyType: "Motor vehicle", name: "Fleet", expiresOn: "2027-09-30", renewedById: null },
      ],
      [
        { id: 1, claimNo: "CLM-001", claimType: "Vehicle", status: "lodged", nextAction: "Chase insurer", nextActionDue: "2026-10-28" },
        { id: 2, claimNo: "CLM-002", claimType: "Equipment", status: "settled", nextAction: "", nextActionDue: null },
        { id: 3, claimNo: "CLM-003", claimType: "Employment", status: "open", nextAction: "", nextActionDue: null },
      ],
      [
        { id: 1, name: "CHAS", expiresOn: "2026-12-20" },
        { id: 2, name: "ISO 9001", expiresOn: "2028-01-01" },
      ],
      today,
    );
    expect(items.map((i) => `${i.what}: ${i.name}`)).toEqual([
      "Open claim: CLM-001 Vehicle",       // next action overdue
      "Policy: Public liability",          // 16 days left
      "Accreditation: CHAS",               // 51 days left
      "Open claim: CLM-003 Employment",    // open, no next action
    ]);
    expect(items[0].detail).toBe("Lodged · Next: Chase insurer by 28 Oct 2026");
    expect(items[3].detail).toBe("Open · No next action set");
  });
});

// Needs a database: tests/setup.ts leaves DATABASE_URL only if it is a local or dev database.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("insurance in the database", async () => {
  const { db } = await import("@/lib/db");
  const { recordFolder } = await import("@/lib/files/record-folder");
  const { claimsLinkedTo } = await import("@/app/(hub)/insurance/data");
  const sql = db();
  const stamp = String(Date.now()).slice(-6);
  const ids: { policies: number[]; claims: number[]; certs: number[]; vehicles: number[] } = { policies: [], claims: [], certs: [], vehicles: [] };

  afterAll(async () => {
    if (ids.claims.length) await sql`delete from claims where id in ${sql(ids.claims)}`;
    if (ids.policies.length) await sql`delete from insurance_policies where id in ${sql(ids.policies.reverse())}`;
    if (ids.certs.length) await sql`delete from company_certs where id in ${sql(ids.certs)}`;
    if (ids.vehicles.length) await sql`delete from vehicles where id in ${sql(ids.vehicles)}`;
    await sql.end();
  });

  it("keeps every renewal of a policy in the first period's folder, and allows one renewal per period", async () => {
    const [a] = await sql<{ id: string }[]>`insert into insurance_policies (policy_type, name, created_by) values ('Motor vehicle', ${`ZZ Fleet/${stamp}`}, 'test') returning id`;
    ids.policies.push(Number(a.id));
    const [b] = await sql<{ id: string }[]>`insert into insurance_policies (policy_type, name, renewed_from_id, created_by) values ('Motor vehicle', 'ZZ renamed', ${a.id}, 'test') returning id`;
    ids.policies.push(Number(b.id));
    const folder = `CBS System/Operations/Insurance/Motor vehicle - ZZ Fleet${stamp}`;
    expect(await recordFolder("insurance_policies", Number(a.id))).toBe(folder);
    expect(await recordFolder("insurance_policies", Number(b.id))).toBe(folder);
    await expect(sql`insert into insurance_policies (policy_type, renewed_from_id) values ('Motor vehicle', ${a.id})`).rejects.toMatchObject({ code: "23505" });
  });

  it("numbers claims CLM-nnn, links them and gives each its own folder", async () => {
    const [v] = await sql<{ id: string }[]>`insert into vehicles (reg, created_by) values (${`ZZ${stamp}`}, 'test') returning id`;
    ids.vehicles.push(Number(v.id));
    const rows = await sql<{ id: string; claim_no: string }[]>`
      insert into claims (claim_type, vehicle_id, created_by) values ('Vehicle', ${v.id}, 'test'), ('Vehicle', ${v.id}, 'test') returning id, claim_no`;
    ids.claims.push(...rows.map((r) => Number(r.id)));
    for (const r of rows) expect(r.claim_no).toMatch(/^CLM-\d{3,}$/);
    expect(Number(rows[1].claim_no.slice(4))).toBe(Number(rows[0].claim_no.slice(4)) + 1);
    expect(await recordFolder("claims", Number(rows[0].id))).toBe(`CBS System/Operations/Insurance/Claims/${rows[0].claim_no}`);
    const linked = await claimsLinkedTo(sql, "vehicle", Number(v.id));
    expect(linked.map((c) => c.claimNo).sort()).toEqual(rows.map((r) => r.claim_no).sort());
    // Deleting the vehicle keeps its claims, without the link.
    await sql`delete from vehicles where id = ${v.id}`;
    ids.vehicles.pop();
    const [after] = await sql`select vehicle_id from claims where id = ${rows[0].id}`;
    expect(after.vehicle_id).toBeNull();
  });

  it("puts accreditations in their own folder", async () => {
    const [c] = await sql<{ id: string }[]>`insert into company_certs (name, created_by) values (${`ZZ CHAS ${stamp}`}, 'test') returning id`;
    ids.certs.push(Number(c.id));
    expect(await recordFolder("company_certs", Number(c.id))).toBe(`CBS System/Operations/Accreditations/ZZ CHAS ${stamp}`);
  });
});
