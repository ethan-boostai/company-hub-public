import { afterAll, describe, expect, it } from "vitest";
import { assetWarnings, dueBackLabel, materialTotals, plantState } from "@/app/(hub)/_site/rules";
import { equipmentDueItems } from "@/app/(hub)/equipment/rules";

const TODAY = "2026-11-10";

describe("plant on a job", () => {
  it("works out on job, due back soon, overdue and returned", () => {
    expect(plantState({ dueBack: null, returnedAt: null }, TODAY)).toBe("on_job");
    expect(plantState({ dueBack: "2026-11-20", returnedAt: null }, TODAY)).toBe("on_job");
    expect(plantState({ dueBack: "2026-11-12", returnedAt: null }, TODAY)).toBe("due_soon");
    expect(plantState({ dueBack: "2026-11-10", returnedAt: null }, TODAY)).toBe("due_soon");
    expect(plantState({ dueBack: "2026-11-09", returnedAt: null }, TODAY)).toBe("overdue");
    expect(plantState({ dueBack: "2026-11-01", returnedAt: "2026-11-05T10:00:00Z" }, TODAY)).toBe("returned");
    expect(dueBackLabel("2026-11-09", TODAY)).toBe("Was due back 9 Nov 2026");
    expect(dueBackLabel("2026-11-10", TODAY)).toBe("Due back today");
  });

  it("warns about repair, service and PAT test without blocking", () => {
    expect(assetWarnings({ status: "in_service", nextServiceOn: "2026-12-01", testTagDue: null }, TODAY)).toEqual([]);
    expect(assetWarnings({ status: "needs_repair", nextServiceOn: "2026-11-01", testTagDue: "2026-11-09" }, TODAY))
      .toEqual(["Needs repair", "Service overdue", "PAT test overdue"]);
  });

  it("puts plant due back on a job under Needs attention on Equipment and materials", () => {
    const base = { id: 1, name: "Breaker", assetTag: "ZZ1", status: "in_service" as const, nextServiceOn: null, testTagDue: null };
    const items = equipmentDueItems([
      { ...base, onJob: { jobNo: "12", dueBack: "2026-11-08" } },
      { ...base, id: 2, onJob: { jobNo: "12", dueBack: "2026-11-11" } },
      { ...base, id: 3, onJob: { jobNo: "12", dueBack: "2026-11-30" } },
    ], [], [], [], TODAY);
    expect(items.map((i) => [i.open.id, i.what, i.tone, i.detail])).toEqual([
      [1, "Due back", "overdue", "Job 12, was due back 8 Nov 2026"],
      [2, "Due back", "soon", "Job 12, due back 11 Nov 2026"],
    ]);
  });
});

describe("materials on a job", () => {
  it("adds up taken, returned and used, with the value at cost, ignoring moves between locations", () => {
    const m = { materialId: 1, name: "Sand", unit: "bag", cost: 4.5, inMove: false };
    const t = materialTotals([
      { ...m, change: -10 },
      { ...m, change: -2.5 },
      { ...m, change: 3 },
      { ...m, change: -4, inMove: true },
      { ...m, change: 4, inMove: true },
      { materialId: 2, name: "Cement", unit: "bag", cost: null, change: -1, inMove: false },
    ]);
    expect(t).toEqual([
      { materialId: 2, name: "Cement", unit: "bag", taken: 1, returned: 0, used: 1, value: null },
      { materialId: 1, name: "Sand", unit: "bag", taken: 12.5, returned: 3, used: 9.5, value: 42.75 },
    ]);
  });
});

// Needs a database: tests/setup.ts leaves DATABASE_URL only if it is a local or dev database.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("plant and stock in the database", async () => {
  const { db } = await import("@/lib/db");
  const { bookPlant, returnPlant, PlantRefused } = await import("@/app/(hub)/_site/plant");
  const { changeStock } = await import("@/app/(hub)/equipment/stock");
  const sql = db();
  const stamp = String(Date.now()).slice(-6);
  const ids = { job: 0, job2: 0, person: 0, asset: 0, material: 0 };

  afterAll(async () => {
    await sql`delete from job_plant where job_id in (${ids.job}, ${ids.job2})`;
    await sql`delete from stock_moves where asset_id = ${ids.asset} or material_id = ${ids.material}`;
    await sql`delete from material_stock where material_id = ${ids.material}`;
    await sql`delete from materials where id = ${ids.material}`;
    await sql`delete from assets where id = ${ids.asset}`;
    await sql`delete from jobs where id in (${ids.job}, ${ids.job2})`;
    await sql`delete from people where id = ${ids.person}`;
    // The connection closes after the last group below.
  });

  it("books an item to one job at a time, moves it, and returns it to the yard", async () => {
    const [j] = await sql`insert into jobs (sm8_uuid, job_no, sm8_status, stage) values (${`zz-site-${stamp}`}, ${`99${stamp}`}, 'Work Order', 'approved') returning id`;
    const [j2] = await sql`insert into jobs (sm8_uuid, job_no, sm8_status, stage) values (${`zz-site2-${stamp}`}, ${`98${stamp}`}, 'Work Order', 'approved') returning id`;
    const [p] = await sql`insert into people (name, created_by) values (${`ZZ Test Plant ${stamp}`}, 'test') returning id`;
    const [a] = await sql`insert into assets (asset_tag, name, category, location_place, created_by) values (${`ZZ${stamp}`}, 'ZZ Test Breaker', 'Breakers', 'CBS Warehouse', 'test') returning id`;
    Object.assign(ids, { job: Number(j.id), job2: Number(j2.id), person: Number(p.id), asset: Number(a.id) });

    const [bookingId] = await sql.begin((tx) => bookPlant(tx, {
      jobId: ids.job, assetIds: [ids.asset], to: { place: null, vehicleId: null, personId: ids.person }, dueBack: "2026-11-20", notes: null, by: "Test", source: "job",
    }));
    const [moved] = await sql`select location_place, location_person_id from assets where id = ${ids.asset}`;
    expect([moved.location_place, Number(moved.location_person_id)]).toEqual([null, ids.person]);
    const [b] = await sql`select out_with_label, asset_name from job_plant where id = ${bookingId}`;
    expect(b.out_with_label).toBe(`With ZZ Test Plant ${stamp}`);
    const [mv] = await sql`select reason, job_id from stock_moves where asset_id = ${ids.asset} order by id desc limit 1`;
    expect([mv.reason, Number(mv.job_id)]).toEqual([`Booked to job 99${stamp}`, ids.job]);

    await expect(sql.begin((tx) => bookPlant(tx, {
      jobId: ids.job2, assetIds: [ids.asset], to: { place: null, vehicleId: null, personId: ids.person }, dueBack: null, notes: null, by: "Test", source: "job",
    }))).rejects.toBeInstanceOf(PlantRefused);

    await sql.begin((tx) => returnPlant(tx, { bookingId, to: { place: "CBS Warehouse", vehicleId: null, personId: null }, by: "Test", jobId: ids.job }));
    const [back] = await sql`select location_place from assets where id = ${ids.asset}`;
    expect(back.location_place).toBe("CBS Warehouse");
    const [closed] = await sql`select returned_by, returned_to_label from job_plant where id = ${bookingId}`;
    expect([closed.returned_by, closed.returned_to_label]).toEqual(["Test", "CBS Warehouse"]);
    await expect(sql.begin((tx) => returnPlant(tx, { bookingId, to: { place: "CBS Warehouse", vehicleId: null, personId: null }, by: "Test" })))
      .rejects.toBeInstanceOf(PlantRefused);

    // Free again: it can go out on the other job.
    await sql.begin((tx) => bookPlant(tx, {
      jobId: ids.job2, assetIds: [ids.asset], to: { place: null, vehicleId: null, personId: ids.person }, dueBack: null, notes: null, by: "Test", source: "job",
    }));
  });

  it("links stock moves to the job given, or to the job whose number was typed", async () => {
    const [m] = await sql`insert into materials (name, unit, created_by) values (${`ZZ Test Sand ${stamp}`}, 'bag', 'test') returning id`;
    ids.material = Number(m.id);
    const mat = { id: ids.material, name: "ZZ Test Sand", unit: "bag" };
    const yard = { place: "CBS Warehouse", vehicleId: null, personId: null } as const;
    await sql.begin(async (tx) => {
      await changeStock(tx, mat, yard, 10, { by: "Test", reason: "Delivered" });
      await changeStock(tx, mat, yard, -4, { by: "Test", reason: "Used on job", jobId: ids.job });
      await changeStock(tx, mat, yard, 1, { by: "Test", reason: "Returned from job", jobRef: `98${stamp}` });
      await changeStock(tx, mat, yard, -1, { by: "Test", reason: "Used on job", jobRef: "not-a-job" });
    });
    const rows = await sql`select reason, job_id from stock_moves where material_id = ${ids.material} order by id`;
    expect(rows.map((r) => (r.job_id == null ? null : Number(r.job_id)))).toEqual([null, ids.job, ids.job2, null]);
  });
});

describe.skipIf(!url)("overdue plant actions and found, in the database", async () => {
  const { db } = await import("@/lib/db");
  const { bookPlant, extendPlant, movePlant, foundPlant, overduePlant, PlantRefused } = await import("@/app/(hub)/_site/plant");
  const sql = db();
  const stamp = String(Date.now()).slice(-6);
  const ids = { a: 0, b: 0, person: 0, asset: 0 };

  afterAll(async () => {
    await sql`delete from job_plant where job_id in (${ids.a}, ${ids.b})`;
    await sql`delete from stock_moves where asset_id = ${ids.asset}`;
    await sql`delete from assets where id = ${ids.asset}`;
    await sql`delete from jobs where id in (${ids.a}, ${ids.b})`;
    await sql`delete from people where id = ${ids.person}`;
    await sql.end();
  });

  it("extends, moves to another job, lists overdue plant, and found closes the booking", async () => {
    const [a] = await sql`insert into jobs (sm8_uuid, job_no, sm8_status, stage) values (${`zz-ov-a-${stamp}`}, ${`96${stamp}`}, 'Work Order', 'approved') returning id`;
    const [b] = await sql`insert into jobs (sm8_uuid, job_no, sm8_status, stage) values (${`zz-ov-b-${stamp}`}, ${`95${stamp}`}, 'Work Order', 'approved') returning id`;
    const [p] = await sql`insert into people (name, created_by) values (${`ZZ Test Mover ${stamp}`}, 'test') returning id`;
    const [x] = await sql`insert into assets (asset_tag, name, location_place, created_by) values (${`ZZO${stamp}`}, 'ZZ Test Mixer', 'CBS Warehouse', 'test') returning id`;
    Object.assign(ids, { a: Number(a.id), b: Number(b.id), person: Number(p.id), asset: Number(x.id) });
    const withP = { place: null, vehicleId: null, personId: ids.person } as const;

    const [first] = await sql.begin((tx) => bookPlant(tx, { jobId: ids.a, assetIds: [ids.asset], to: withP, dueBack: "2020-01-01", notes: null, by: "Test", source: "job" }));
    expect((await overduePlant(sql, "2026-11-10")).filter((o) => o.assetId === ids.asset).map((o) => [o.jobNo, o.dueBack])).toEqual([[`96${stamp}`, "2020-01-01"]]);

    await sql.begin((tx) => extendPlant(tx, { bookingId: first, dueBack: "2099-12-31", by: "Test" }));
    expect((await overduePlant(sql, "2026-11-10")).some((o) => o.assetId === ids.asset)).toBe(false);

    await expect(sql.begin((tx) => movePlant(tx, { bookingId: first, toJobId: ids.a, to: null, dueBack: null, by: "Test" }))).rejects.toBeInstanceOf(PlantRefused);
    const second = await sql.begin((tx) => movePlant(tx, { bookingId: first, toJobId: ids.b, to: null, dueBack: "2099-01-01", by: "Test" }));
    const bookings = await sql`select id, job_id, returned_to_label, returned_at from job_plant where asset_id = ${ids.asset} order by id`;
    expect(bookings.map((r) => [Number(r.job_id), r.returned_to_label, r.returned_at == null])).toEqual([
      [ids.a, `Moved to job 95${stamp}`, false],
      [ids.b, null, true],
    ]);
    const [still] = await sql`select location_person_id from assets where id = ${ids.asset}`;
    expect(Number(still.location_person_id)).toBe(ids.person); // moved with whoever had it

    const f = await sql.begin((tx) => foundPlant(tx, { assetId: ids.asset, to: { place: "CBS Warehouse", vehicleId: null, personId: null }, by: "ZZ Crew (yard)" }));
    expect(f).toEqual({ closedJobNo: `95${stamp}`, label: "CBS Warehouse" });
    const [closed] = await sql`select returned_at, returned_to_label from job_plant where id = ${second}`;
    expect([closed.returned_at != null, closed.returned_to_label]).toEqual([true, "Found: CBS Warehouse"]);
    const [here] = await sql`select location_place, status from assets where id = ${ids.asset}`;
    expect([here.location_place, here.status]).toEqual(["CBS Warehouse", "in_service"]);
    // Found again with no booking just moves it (nothing to close).
    expect((await sql.begin((tx) => foundPlant(tx, { assetId: ids.asset, to: withP, by: "ZZ Crew (yard)" }))).closedJobNo).toBe(null);
  });
});
