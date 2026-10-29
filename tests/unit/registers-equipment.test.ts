import { afterAll, describe, expect, it } from "vitest";
import {
  approvedQty, assetStatusAfterReport, equipmentDueItems, isLow, locKey, locLabel, parseLocKey, qty, reportUrgency, requestFor,
} from "@/app/(hub)/equipment/rules";

describe("equipment locations", () => {
  it("round-trips a place, a vehicle and a person through one key", () => {
    expect(locKey({ place: "CBS Warehouse", vehicleId: null })).toBe("p:CBS Warehouse");
    expect(parseLocKey("p:CBS Warehouse")).toEqual({ place: "CBS Warehouse", vehicleId: null, personId: null });
    expect(parseLocKey("v:12")).toEqual({ place: null, vehicleId: 12, personId: null });
    expect(parseLocKey("u:5")).toEqual({ place: null, vehicleId: null, personId: 5 });
    expect(locKey(null)).toBe("");
  });

  it("refuses bad keys, and people where only stock places are allowed", () => {
    expect(parseLocKey("")).toBeNull();
    expect(parseLocKey("v:0")).toBeNull();
    expect(parseLocKey("v:abc")).toBeNull();
    expect(parseLocKey("p:   ")).toBeNull();
    expect(parseLocKey("x:1")).toBeNull();
    expect(parseLocKey("u:5", false)).toBeNull();
  });

  it("labels vehicles as Make model - Driver (REG)", () => {
    const vans = [{ id: 3, reg: "ZZ01ZZA", makeModel: "Ford Transit", driver: "ZZ Person H" }];
    expect(locLabel({ place: null, vehicleId: 3 }, vans, [])).toBe("Ford Transit - ZZ Person H (ZZ01ZZA)");
    expect(locLabel({ place: null, vehicleId: null, personId: 9 }, [], [{ id: 9, name: "Joe" }])).toBe("With Joe");
    expect(locLabel(null, [], [])).toBe("No location");
  });
});

describe("stock numbers", () => {
  it("approving a stocktake keeps moves made since the count", () => {
    expect(approvedQty(5, 6, 6)).toBe(5); // nothing moved: the count wins
    expect(approvedQty(5, 6, 7)).toBe(6); // 1 delivered since the count
    expect(approvedQty(5, 6, 4)).toBe(3); // 2 used since the count
    expect(approvedQty(1, 6, 0)).toBe(0); // never below zero
    expect(approvedQty(2.5, 1.25, 1.25)).toBe(2.5);
  });

  it("shows quantities without trailing zeros, and flags low stock at the minimum", () => {
    expect(qty(2.5)).toBe("2.5");
    expect(qty(1000)).toBe("1,000");
    expect(qty(0.1 + 0.2)).toBe("0.3");
    expect(isLow(5, 5)).toBe(true);
    expect(isLow(6, 5)).toBe(false);
    expect(isLow(0, null)).toBe(false);
  });
});

describe("tool reports", () => {
  it("damaged needs repair; lost and stolen are lost", () => {
    expect(assetStatusAfterReport("damaged")).toBe("needs_repair");
    expect(assetStatusAfterReport("lost")).toBe("lost");
    expect(assetStatusAfterReport("stolen")).toBe("lost");
  });

  it("stolen is always today; nothing asked for means no urgency", () => {
    expect(reportUrgency("stolen", "replace", "no_rush")).toBe("today");
    expect(reportUrgency("lost", "replace", "no_rush")).toBe("no_rush");
    expect(reportUrgency("damaged", "repair", null)).toBe("this_week");
    expect(reportUrgency("lost", "none", "today")).toBeNull();
  });

  it("a replacement or a repair raises a Team request that points back to the report", () => {
    const base = { id: 7, kind: "damaged" as const, toolName: "Breaker (CBS1023)", replaceNotes: "", repairNotes: "new chuck" };
    expect(requestFor({ ...base, wants: "none" })).toBeNull();
    expect(requestFor({ ...base, wants: "replace" })).toEqual({ category: "Tools or equipment", details: "Replace: Breaker (CBS1023) (damaged).\nSee tool report 7." });
    expect(requestFor({ ...base, wants: "repair" })).toEqual({ category: "Tool repair", details: "Repair: Breaker (CBS1023) (damaged). new chuck\nSee tool report 7." });
  });
});

describe("needs attention", () => {
  const today = "2026-10-29";
  it("lists service and PAT due, repairs, low stock, stocktakes to approve and new reports", () => {
    const items = equipmentDueItems(
      [
        { id: 1, name: "Breaker", assetTag: "CBS1", status: "in_service", nextServiceOn: "2026-11-05", testTagDue: "2026-10-01" },
        { id: 2, name: "Saw", assetTag: "", status: "needs_repair", nextServiceOn: null, testTagDue: null },
        { id: 3, name: "Old drill", assetTag: "", status: "retired", nextServiceOn: "2026-10-01", testTagDue: null },
        { id: 4, name: "Grinder", assetTag: "", status: "in_service", nextServiceOn: "2027-06-01", testTagDue: null },
      ],
      [
        { id: 1, name: "Sand", status: "active", minLevel: 5, total: 3, unit: "bag" },
        { id: 2, name: "Cement", status: "active", minLevel: 5, total: 9, unit: "bag" },
        { id: 3, name: "Old paint", status: "discontinued", minLevel: 5, total: 0, unit: "tin" },
      ],
      [{ id: 1, locationLabel: "CBS Warehouse", status: "pending", countedAt: "2026-10-28T10:00:00Z" }, { id: 2, locationLabel: "Van", status: "approved", countedAt: "2026-10-28T10:00:00Z" }],
      [{ id: 1, toolName: "Drill", kind: "lost", status: "new" }, { id: 2, toolName: "Saw", kind: "damaged", status: "closed" }],
      today,
    );
    const seen = items.map((i) => `${i.what}: ${i.name}`);
    expect(seen).toEqual(expect.arrayContaining([
      "Service: CBS1 Breaker", "PAT test: CBS1 Breaker", "Needs repair: Saw", "Low stock: Sand", "Stocktake to approve: CBS Warehouse", "Tool report: Drill",
    ]));
    expect(seen.some((s) => s.includes("Old drill") || s.includes("Grinder") || s.includes("Cement") || s.includes("Old paint"))).toBe(false);
    expect(items[0].tone).toBe("overdue");
  });
});

// Needs a database: tests/setup.ts leaves DATABASE_URL only if it is a local or dev database.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("equipment in the database", async () => {
  const { db } = await import("@/lib/db");
  const { recordFolder } = await import("@/lib/files/record-folder");
  const { changeStock, createToolReport, NotEnough, stockAt } = await import("@/app/(hub)/equipment/stock");
  const sql = db();
  const stamp = String(Date.now()).slice(-6);
  const ids: { assets: number[]; materials: number[]; reports: number[]; requests: number[] } = { assets: [], materials: [], reports: [], requests: [] };

  afterAll(async () => {
    if (ids.requests.length) await sql`delete from requests where id in ${sql(ids.requests)}`;
    if (ids.reports.length) await sql`delete from tool_reports where id in ${sql(ids.reports)}`;
    if (ids.assets.length) await sql`delete from assets where id in ${sql(ids.assets)}`;
    if (ids.materials.length) await sql`delete from materials where id in ${sql(ids.materials)}`;
    await sql.end();
  });

  it("puts equipment, services, materials and tool reports in their folders", async () => {
    const [a] = await sql<{ id: string }[]>`insert into assets (asset_tag, name, created_by) values (${`ZZ${stamp}`}, 'ZZ Test: Breaker/110V', 'test') returning id`;
    ids.assets.push(Number(a.id));
    expect(await recordFolder("assets", Number(a.id))).toBe(`CBS System/Operations/Equipment/ZZ${stamp} - ZZ Test Breaker110V`);
    const [s] = await sql<{ id: string }[]>`insert into asset_services (asset_id, serviced_on, created_by) values (${a.id}, '2026-10-29', 'test') returning id`;
    expect(await recordFolder("asset_services", Number(s.id))).toBe(`CBS System/Operations/Equipment/ZZ${stamp} - ZZ Test Breaker110V/Service History`);
    const [m] = await sql<{ id: string }[]>`insert into materials (name, unit, created_by) values (${`ZZ Test Sand ${stamp}`}, 'bag', 'test') returning id`;
    ids.materials.push(Number(m.id));
    expect(await recordFolder("materials", Number(m.id))).toBe(`CBS System/Operations/Materials/ZZ Test Sand ${stamp}`);
    const [r] = await sql<{ id: string }[]>`insert into tool_reports (kind, tool_name, reported_by) values ('lost', 'ZZ test', 'test') returning id`;
    ids.reports.push(Number(r.id));
    expect(await recordFolder("tool_reports", Number(r.id))).toBe(`CBS System/Operations/Equipment/Tool Reports/Report ${r.id}`);
  });

  it("never lets stock go below zero, and logs every change", async () => {
    const [m] = await sql<{ id: string }[]>`insert into materials (name, unit, created_by) values (${`ZZ Test Grit ${stamp}`}, 'bag', 'test') returning id`;
    const mat = { id: Number(m.id), name: "Grit", unit: "bag" };
    ids.materials.push(mat.id);
    const yard = { place: "CBS Warehouse", vehicleId: null, personId: null } as const;
    await sql.begin(async (tx) => {
      expect(await changeStock(tx, mat, yard, 3, { by: "test", reason: "Delivered" })).toBe(3);
      expect(await changeStock(tx, mat, yard, -1.5, { by: "test", reason: "Used on job" })).toBe(1.5);
    });
    await expect(sql.begin((tx) => changeStock(tx, mat, yard, -2, { by: "test", reason: "Used on job" }))).rejects.toBeInstanceOf(NotEnough);
    await sql.begin(async (tx) => expect(await stockAt(tx, mat.id, yard)).toBe(1.5));
    const moves = await sql`select change, qty_after, reason from stock_moves where material_id = ${mat.id} order by id`;
    expect(moves.map((x) => [Number(x.change), Number(x.qty_after), x.reason])).toEqual([[3, 3, "Delivered"], [-1.5, 1.5, "Used on job"]]);
  });

  it("a tool report marks the equipment and raises a linked Team request", async () => {
    const [a] = await sql<{ id: string }[]>`insert into assets (name, created_by) values (${`ZZ Test Saw ${stamp}`}, 'test') returning id`;
    ids.assets.push(Number(a.id));
    const rid = await sql.begin((tx) => createToolReport(tx, {
      kind: "stolen", assetId: Number(a.id), toolName: "", occurredAt: null, location: "Site", policeRef: "ZZ1", details: null,
      wants: "replace", urgency: "no_rush", repairNotes: null, replaceNotes: "same model", reportedBy: "Test", reportedById: null, source: "team",
    }, "Test (team app)"));
    ids.reports.push(rid);
    const [r] = await sql`select tool_name, urgency, request_id, police_ref from tool_reports where id = ${rid}`;
    ids.requests.push(Number(r.request_id));
    expect(r.tool_name).toBe(`ZZ Test Saw ${stamp}`);
    expect(r.urgency).toBe("today");
    expect(r.police_ref).toBe("ZZ1");
    const [asset] = await sql`select status from assets where id = ${a.id}`;
    expect(asset.status).toBe("lost");
    const [req] = await sql`select category, urgency, details, source from requests where id = ${r.request_id}`;
    expect(req).toMatchObject({ category: "Tools or equipment", urgency: "today", source: "team" });
    expect(req.details).toContain(`See tool report ${rid}.`);
  });
});
