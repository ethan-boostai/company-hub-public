import { afterAll, describe, expect, it } from "vitest";
import { loadUpAttention, loadUpFileName, outcomeOf, problemLines, reasonsFor, sheetState } from "@/app/(hub)/_site/load-up-rules";

const TODAY = "2026-11-10";

describe("load-up sheet rules", () => {
  it("shows Draft, Ready to load, Overdue and Loaded", () => {
    expect(sheetState({ status: "draft", sheetDate: "2026-11-01" }, TODAY)).toBe("draft");
    expect(sheetState({ status: "ready", sheetDate: "2026-11-10" }, TODAY)).toBe("ready");
    expect(sheetState({ status: "ready", sheetDate: "2026-11-09" }, TODAY)).toBe("overdue");
    expect(sheetState({ status: "loaded", sheetDate: "2026-11-01" }, TODAY)).toBe("loaded");
  });

  it("puts problems, sheets not loaded and drafts close to their day under Needs attention", () => {
    const a = loadUpAttention([
      { id: 1, status: "loaded", sheetDate: "2026-11-01", problemsOpen: true },
      { id: 2, status: "ready", sheetDate: "2026-11-09", problemsOpen: false },
      { id: 3, status: "draft", sheetDate: "2026-11-12", problemsOpen: false },
      { id: 4, status: "draft", sheetDate: "2026-11-20", problemsOpen: false },
      { id: 5, status: "ready", sheetDate: "2026-11-10", problemsOpen: false },
    ], TODAY);
    expect(a.map((x) => [x.sheet.id, x.tag, x.level])).toEqual([[1, "Problems", "overdue"], [2, "Not loaded", "overdue"], [3, "Not sent to crew", "soon"]]);
  });

  it("works out loaded, part loaded and not loaded", () => {
    expect(outcomeOf({ kind: "equipment", qty: null }, true, null)).toBe("loaded");
    expect(outcomeOf({ kind: "equipment", qty: null }, false, null)).toBe("not_loaded");
    expect(outcomeOf({ kind: "material", qty: 10 }, true, 10)).toBe("loaded");
    expect(outcomeOf({ kind: "material", qty: 10 }, true, 6)).toBe("part");
    expect(outcomeOf({ kind: "material", qty: 10 }, true, 0)).toBe("not_loaded");
  });

  it("offers Couldn't buy it only for things bought on the way", () => {
    expect(reasonsFor("buy").map((r) => r.value)).toEqual(["not_needed", "couldnt_buy"]);
    expect(reasonsFor("equipment").map((r) => r.value)).not.toContain("couldnt_buy");
  });

  it("writes dated problem lines and names the file", () => {
    expect(problemLines([
      { name: "ZZ Breaker", outcome: "not_loaded", reason: "cant_find", note: "not in the cage", loadedQty: null, qty: null, unit: null },
      { name: "ZZ Sand", outcome: "part", reason: "out_of_stock", note: null, loadedQty: 6, qty: 10, unit: "bag" },
      { name: "ZZ Saw", outcome: "loaded", reason: null, note: null, loadedQty: null, qty: null, unit: null },
    ], "Van tyre low", "10/11/2026 07:15", "ZZ Crew", "when loading")).toEqual([
      "10/11/2026 07:15 ZZ Crew (when loading): Can't find it: ZZ Breaker - not in the cage",
      "10/11/2026 07:15 ZZ Crew (when loading): Out of stock: ZZ Sand (6 of 10 bag loaded)",
      "10/11/2026 07:15 ZZ Crew (when loading): Van tyre low",
    ]);
    expect(loadUpFileName({ id: 7, sheetDate: "2026-11-10", jobNo: "12" })).toBe("2026-11-10 - Job 12 - Load-up sheet 7.pdf");
  });
});

// Needs a database: tests/setup.ts leaves DATABASE_URL only if it is a local or dev database.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("loading a sheet in the database", async () => {
  const { db } = await import("@/lib/db");
  const { markLoaded, LoadUpRefused, loadSheets, buildLoadUpPdf } = await import("@/app/(hub)/_site/load-up");
  const sql = db();
  const stamp = String(Date.now()).slice(-6);
  const ids = { job: 0, van: 0, asset: 0, asset2: 0, material: 0, sheet: 0 };

  afterAll(async () => {
    await sql`delete from job_plant where job_id = ${ids.job}`;
    await sql`delete from load_up_sheets where job_id = ${ids.job}`;
    await sql`delete from stock_moves where material_id = ${ids.material} or asset_id in (${ids.asset}, ${ids.asset2})`;
    await sql`delete from material_stock where material_id = ${ids.material}`;
    await sql`delete from materials where id = ${ids.material}`;
    await sql`delete from assets where id in (${ids.asset}, ${ids.asset2})`;
    await sql`delete from vehicles where id = ${ids.van}`;
    await sql`delete from jobs where id = ${ids.job}`;
    await sql.end();
  });

  it("takes materials off stock where the line says, books equipment into the van and records problems", async () => {
    const [j] = await sql`insert into jobs (sm8_uuid, job_no, sm8_status, stage) values (${`zz-lu-${stamp}`}, ${`97${stamp}`}, 'Work Order', 'approved') returning id`;
    const [v] = await sql`insert into vehicles (reg, make_model, holds_stock, created_by) values (${`ZZ${stamp}L`}, 'ZZ Van', true, 'test') returning id`;
    const [a] = await sql`insert into assets (asset_tag, name, category, location_place, created_by) values (${`ZZL${stamp}`}, 'ZZ Test Breaker', 'Breakers', 'CBS Warehouse', 'test') returning id`;
    const [a2] = await sql`insert into assets (asset_tag, name, category, location_place, created_by) values (${`ZZM${stamp}`}, 'ZZ Test Saw', 'Saws', 'CBS Warehouse', 'test') returning id`;
    const [m] = await sql`insert into materials (name, unit, created_by) values (${`ZZ Test Sand ${stamp}`}, 'bag', 'test') returning id`;
    Object.assign(ids, { job: Number(j.id), van: Number(v.id), asset: Number(a.id), asset2: Number(a2.id), material: Number(m.id) });
    await sql`insert into material_stock (material_id, location_place, location_vehicle_id, qty) values (${ids.material}, 'CBS Warehouse', null, 10), (${ids.material}, null, ${ids.van}, 3)`;
    const [s] = await sql`insert into load_up_sheets (job_id, sheet_date, vehicle_id, vehicle_label, status, due_back, created_by)
      values (${ids.job}, '2026-11-10', ${ids.van}, 'ZZ Van', 'ready', '2026-11-20', 'test') returning id`;
    ids.sheet = Number(s.id);
    const blank = { asset_id: null, material_id: null, unit: null, qty: null, from_place: null, from_vehicle_id: null };
    const lines = await sql`insert into load_up_lines ${sql(([
      { sheet_id: ids.sheet, sort: 0, kind: "equipment", asset_id: ids.asset, name: "ZZ Test Breaker" },
      { sheet_id: ids.sheet, sort: 1, kind: "equipment", asset_id: ids.asset2, name: "ZZ Test Saw" },
      { sheet_id: ids.sheet, sort: 2, kind: "material", material_id: ids.material, name: "ZZ Test Sand", unit: "bag", qty: 6, from_place: "CBS Warehouse" },
      { sheet_id: ids.sheet, sort: 3, kind: "material", material_id: ids.material, name: "ZZ Test Sand", unit: "bag", qty: 4, from_vehicle_id: ids.van },
      { sheet_id: ids.sheet, sort: 4, kind: "buy", name: "ZZ Screws", qty: 1, unit: "box" },
    ] as Record<string, unknown>[]).map((l) => ({ ...blank, ...l })))} returning id`;
    const [breaker, saw, sandYard, sandVan, screws] = lines.map((l) => Number(l.id));

    // A missing reason is refused, and nothing changes.
    await expect(sql.begin((tx) => markLoaded(tx, ids.sheet, [
      { lineId: breaker, ticked: true, loadedQty: null, reason: null, note: null },
      { lineId: saw, ticked: false, loadedQty: null, reason: null, note: null },
      { lineId: sandYard, ticked: true, loadedQty: 6, reason: null, note: null },
      { lineId: sandVan, ticked: true, loadedQty: 4, reason: null, note: null },
      { lineId: screws, ticked: true, loadedQty: 1, reason: null, note: null },
    ], null, "ZZ Crew"))).rejects.toBeInstanceOf(LoadUpRefused);

    const r = await sql.begin((tx) => markLoaded(tx, ids.sheet, [
      { lineId: breaker, ticked: true, loadedQty: null, reason: null, note: null },
      { lineId: saw, ticked: false, loadedQty: null, reason: "faulty", note: "blade cracked" },
      { lineId: sandYard, ticked: true, loadedQty: 6, reason: null, note: null },
      { lineId: sandVan, ticked: true, loadedQty: 4, reason: null, note: null }, // only 3 on the van's record
      { lineId: screws, ticked: false, loadedQty: null, reason: "couldnt_buy", note: null },
    ], "Van tyre low", "ZZ Crew"));
    expect(r.problems).toBe(4); // saw, screws, extra note, the van's stock count

    const stock = await sql`select location_place, location_vehicle_id, qty from material_stock where material_id = ${ids.material} order by location_place nulls last`;
    expect(stock.map((x) => Number(x.qty))).toEqual([4, 0]); // yard 10 - 6; van 3 - 3
    const moves = await sql`select reason, change, job_id, notes from stock_moves where material_id = ${ids.material} order by id`;
    expect(moves.map((x) => [x.reason, Number(x.change), Number(x.job_id), x.notes])).toEqual([
      ["Loaded for job", -6, ids.job, `Load-up sheet ${ids.sheet}`],
      ["Loaded for job", -3, ids.job, `Load-up sheet ${ids.sheet}`],
    ]);
    const plant = await sql`select asset_id, source, load_up_sheet_id, due_back from job_plant where job_id = ${ids.job}`;
    expect(plant.map((x) => [Number(x.asset_id), x.source, Number(x.load_up_sheet_id)])).toEqual([[ids.asset, "load_up", ids.sheet]]);
    const [moved] = await sql`select location_vehicle_id from assets where id = ${ids.asset}`;
    expect(Number(moved.location_vehicle_id)).toBe(ids.van);

    const [sheet] = await loadSheets(sql, { ids: [ids.sheet] });
    expect(sheet.status).toBe("loaded");
    expect(sheet.problemsOpen).toBe(true);
    expect(sheet.problems).toContain("Faulty: ZZ Test Saw - blade cracked");
    expect(sheet.problems).toContain("Stock record showed only 3 bag");
    expect(sheet.lines.find((l) => l.id === saw)?.outcome).toBe("not_loaded");
    const pdf = await buildLoadUpPdf(sheet);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");

    await expect(sql.begin((tx) => markLoaded(tx, ids.sheet, [], null, "ZZ Crew"))).rejects.toThrow("already been marked as loaded");
  });

  it("suggests equipment from the categories ticked on the job's RAMS (not superseded ones)", async () => {
    const { loadLoadUp } = await import("@/app/(hub)/jobs/[jobNo]/load-up/data");
    await sql`insert into rams (job_id, seq, revision, status, title, data, created_by) values
      (${ids.job}, 1, 1, 'superseded', 'ZZ old', ${sql.json({ plantCategories: ["Ladders"] })}, 'test'),
      (${ids.job}, 1, 2, 'issued', 'ZZ RAMS', ${sql.json({ plantCategories: ["Saws", "Breakers"] })}, 'test'),
      (${ids.job}, 2, 1, 'draft', 'ZZ RAMS 2', ${sql.json({ plantCategories: ["Breakers"] })}, 'test')`;
    const data = await loadLoadUp(ids.job, sql);
    expect(data.ramsCategories).toEqual(["Breakers", "Saws"]);
    expect(data.sheets.map((x) => x.id)).toEqual([ids.sheet]);
    expect(data.assets.find((a) => a.id === ids.asset)?.onJobNo).toBe(`97${stamp}`);
    await sql`delete from rams where job_id = ${ids.job}`;
  });
});
