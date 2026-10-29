import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { photoTicket, readPhotoTicket, slotKey, sniffImage } from "@/app/team/photos";

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("team app photos", () => {
  beforeAll(() => {
    process.env.APP_SECRET ||= "unit-test-secret-unit-test-secret-1234";
  });

  it("recognises photos from their bytes, not their names", () => {
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0], "rest"))?.mime).toBe("image/jpeg");
    expect(sniffImage(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(sniffImage(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))?.mime).toBe("image/webp");
    expect(sniffImage(bytes([0, 0, 0, 24], "ftypheic", [0, 0]))?.mime).toBe("image/heic");
    expect(sniffImage(bytes("GIF89a"))?.ext).toBe("gif");
    expect(sniffImage(bytes("%PDF-1.7 not a photo"))).toBeNull();
    expect(sniffImage(bytes([0, 0, 0, 24], "ftypmp42", [0, 0]))).toBeNull(); // a video
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it("gives each photo slot of a report its own one-time key", () => {
    const k = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const keys = [1, 2, 3, 4].map((s) => slotKey(k, s));
    expect(new Set(keys).size).toBe(4);
    keys.forEach((x) => expect(x).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/));
    expect(slotKey(k.toUpperCase(), 1)).toBe(keys[0]);
    expect(slotKey("3f2504e0-4f89-41d3-9a0c-0305e82c3302", 1)).not.toBe(keys[0]);
  });

  it("only accepts a signed ticket for a record the team app creates", () => {
    const t = photoTicket({ table: "requests", id: 7, by: "Test Office One (team app)", key: "k" });
    expect(readPhotoTicket(t)).toEqual({ table: "requests", id: 7, by: "Test Office One (team app)", key: "k" });
    expect(readPhotoTicket(t.slice(0, -2) + "xx")).toBeNull();
    expect(readPhotoTicket(photoTicket({ table: "people", id: 1, by: "x", key: "k" }))).toBeNull();
    expect(readPhotoTicket("")).toBeNull();
  });
});

// Needs a database: tests/setup.ts leaves DATABASE_URL only if it is a local or dev database.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("per-record folders (database)", async () => {
  const { db } = await import("@/lib/db");
  const { recordFolder } = await import("@/lib/files/record-folder");
  const sql = db();
  const made: { table: string; id: number }[] = [];
  const add = async (table: string, row: Record<string, unknown>) => {
    const [r] = await sql<{ id: string }[]>`insert into ${sql(table)} ${sql(row as Record<string, string>)} returning id`;
    made.unshift({ table, id: Number(r.id) });
    return Number(r.id);
  };
  const reg = `ZZ${String(Date.now()).slice(-5)}F`;

  afterAll(async () => {
    for (const m of made) await sql`delete from ${sql(m.table)} where id = ${m.id}`;
    await sql.end();
  });

  it("puts Fleet files under the vehicle's reg", async () => {
    const v = await add("vehicles", { reg, make_model: "Ford Transit", created_by: "test" });
    expect(await recordFolder("vehicles", v)).toBe(`CBS System/Fleet/${reg}`);
    const c = await add("vehicle_checks", { vehicle_id: v, checked_on: "2026-10-29", checked_by: "test", status: "passed", created_by: "test" });
    expect(await recordFolder("vehicle_checks", c)).toBe(`CBS System/Fleet/${reg}/Vehicle Checks`);
    const a = await add("vehicle_accidents", { vehicle_id: v, description: "test", status: "reported", created_by: "test" });
    expect(await recordFolder("vehicle_accidents", a)).toBe(`CBS System/Fleet/${reg}/Accidents`);
    const s = await add("vehicle_services", { vehicle_id: v, serviced_on: "2026-10-29", created_by: "test" });
    expect(await recordFolder("vehicle_services", s)).toBe(`CBS System/Fleet/${reg}/Service History`);
  });

  it("puts subcontractors under H&S and suppliers under Operations, with safe names", async () => {
    const sub = await add("subcontractors", { company: ' ZZ Test: "Roofing" / Ltd. ', created_by: "test" });
    expect(await recordFolder("subcontractors", sub)).toBe("CBS System/H&S/Subcontractors/ZZ Test Roofing Ltd");
    const sup = await add("suppliers", { name: "ZZ Test Timber*", created_by: "test" });
    expect(await recordFolder("suppliers", sup)).toBe("CBS System/Operations/Suppliers/ZZ Test Timber");
    const d1 = await add("subcontractor_docs", { subcontractor_id: sub, item: "Insurance", created_by: "test" });
    expect(await recordFolder("subcontractor_docs", d1)).toBe("CBS System/H&S/Subcontractors/ZZ Test Roofing Ltd");
    const d2 = await add("subcontractor_docs", { supplier_id: sup, item: "Insurance", created_by: "test" });
    expect(await recordFolder("subcontractor_docs", d2)).toBe("CBS System/Operations/Suppliers/ZZ Test Timber");
  });

  it("gives each team request its own folder", async () => {
    const r = await add("requests", { requested_by: "test", category: "Other", details: "test", urgency: "no_rush", status: "new", source: "office", created_by: "test" });
    expect(await recordFolder("requests", r)).toBe(`CBS System/Operations/Team Requests/Request ${r}`);
  });

  it("refuses a missing record, and leaves tables with no folder function to the default", async () => {
    expect(await recordFolder("requests", 999999999)).toBeNull();
    expect(await recordFolder("vehicles", 0)).toBeNull();
    expect(await recordFolder("people", 1)).toBeUndefined();
    expect(await recordFolder("bad name; drop table x", 1)).toBeNull();
  });
});
