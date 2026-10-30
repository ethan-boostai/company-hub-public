import { afterAll, describe, expect, it } from "vitest";
import { assetStatusAfterReport, labelOf, REPORT_KINDS, TOOL_KINDS } from "@/app/(hub)/equipment/rules";

describe("tool report kinds", () => {
  it("adds Found for the yard, without offering it on the office and team forms", () => {
    expect(TOOL_KINDS.map((k) => k.value)).toEqual(["lost", "stolen", "damaged"]);
    expect(labelOf(REPORT_KINDS, "found")).toBe("Found");
    expect(assetStatusAfterReport("found")).toBe("in_service");
    expect(assetStatusAfterReport("damaged")).toBe("needs_repair");
    expect(assetStatusAfterReport("stolen")).toBe("lost");
  });
});

// Needs a database: tests/setup.ts leaves DATABASE_URL only if it is a local or dev database.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("yard reports in the database", async () => {
  const { db } = await import("@/lib/db");
  const { createToolReport, confirmReportStatus, createStocktake } = await import("@/app/(hub)/equipment/stock");
  const sql = db();
  const stamp = String(Date.now()).slice(-6);
  const ids = { asset: 0, material: 0 };

  afterAll(async () => {
    await sql`delete from tool_reports where asset_id = ${ids.asset}`;
    await sql`delete from stock_moves where asset_id = ${ids.asset}`;
    await sql`delete from stocktakes where counted_by = ${`ZZ Counter ${stamp}`}`;
    await sql`delete from material_stock where material_id = ${ids.material}`;
    await sql`delete from materials where id = ${ids.material}`;
    await sql`delete from assets where id = ${ids.asset}`;
    await sql.end();
  });

  const base = {
    assetId: 0, toolName: "", occurredAt: null, location: null, policeRef: null, details: "ZZ test", wants: "none" as const, urgency: null,
    repairNotes: null, replaceNotes: null, reportedBy: "ZZ Crew", reportedById: null, source: "yard" as const, confirmFirst: true,
  };

  it("leaves the status alone until the office confirms, then applies it (found: at the yard)", async () => {
    const [a] = await sql`insert into assets (asset_tag, name, location_vehicle_id, location_place, created_by) values (${`ZZY${stamp}`}, 'ZZ Test Laser', null, 'ZZ Site', 'test') returning id`;
    ids.asset = Number(a.id);
    const faulty = await sql.begin((tx) => createToolReport(tx, { ...base, kind: "damaged", assetId: ids.asset }, "ZZ Crew (yard)"));
    const [still] = await sql`select status from assets where id = ${ids.asset}`;
    expect(still.status).toBe("in_service");
    const [r] = await sql`select pending_status, request_id from tool_reports where id = ${faulty}`;
    expect([r.pending_status, r.request_id]).toEqual(["needs_repair", null]);

    expect(await sql.begin((tx) => confirmReportStatus(tx, faulty, "Test Office"))).toBe("needs_repair");
    const [after] = await sql`select status from assets where id = ${ids.asset}`;
    expect(after.status).toBe("needs_repair");
    await expect(sql.begin((tx) => confirmReportStatus(tx, faulty, "Test Office"))).rejects.toThrow("nothing-to-confirm");

    const found = await sql.begin((tx) => createToolReport(tx, { ...base, kind: "found", assetId: ids.asset, foundAtPlace: "CBS Warehouse" }, "ZZ Crew (yard)"));
    await sql.begin((tx) => confirmReportStatus(tx, found, "Test Office"));
    const [back] = await sql`select status, location_place from assets where id = ${ids.asset}`;
    expect([back.status, back.location_place]).toEqual(["in_service", "CBS Warehouse"]);
    const [mv] = await sql`select reason from stock_moves where asset_id = ${ids.asset} order by id desc limit 1`;
    expect(mv.reason).toBe(`Found (tool report ${found})`);
  });

  it("team-app and office reports still change the status straight away", async () => {
    await sql`update assets set status = 'in_service' where id = ${ids.asset}`;
    await sql.begin((tx) => createToolReport(tx, { ...base, source: "team", confirmFirst: false, kind: "lost", assetId: ids.asset }, "ZZ Crew (team app)"));
    const [a] = await sql`select status from assets where id = ${ids.asset}`;
    expect(a.status).toBe("lost");
  });

  it("saves a yard count as a pending stocktake with the register's figure", async () => {
    const [m] = await sql`insert into materials (name, unit, created_by) values (${`ZZ Test Sand ${stamp}`}, 'bag', 'test') returning id`;
    ids.material = Number(m.id);
    await sql`insert into material_stock (material_id, location_place, qty) values (${ids.material}, 'CBS Warehouse', 9)`;
    const sid = await sql.begin((tx) => createStocktake(tx, { place: "CBS Warehouse", vehicleId: null, personId: null }, [{ materialId: ids.material, counted: 8 }], `ZZ Counter ${stamp}`, null, "ZZ Crew (yard)"));
    const [st] = await sql`select status from stocktakes where id = ${sid}`;
    const [line] = await sql`select expected, counted from stocktake_lines where stocktake_id = ${sid}`;
    expect([st.status, Number(line.expected), Number(line.counted)]).toEqual(["pending", 9, 8]);
  });
});
