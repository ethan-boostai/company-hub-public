import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL || "";
describe.skipIf(!/@(127\.0\.0\.1|localhost)[:/]/.test(url))("uploadBytes (local storage)", async () => {
  const { uploadBytes } = await import("@/lib/files/server-upload");
  const { LOCAL_DIR } = await import("@/lib/files/storage");
  const { db } = await import("@/lib/db");
  const made: number[] = [];
  afterAll(async () => {
    if (made.length) await db()`delete from files where id in ${db()(made)}`;
    await db().end();
  });

  it("stores the bytes and records one files row", async () => {
    const r = await uploadBytes({ folder: "CBS System/Hub uploads/Test", name: "team photo?.jpg", bytes: new Uint8Array([1, 2, 3]),
      mime: "image/jpeg", entityTable: "demo", entityId: 1, createdBy: "Test Person (team app)" });
    made.push(r.id);
    expect(r).toMatchObject({ name: "team photo.jpg", size: 3 });
    const [f] = await db()<{ storage: string; storage_path: string; created_by: string }[]>`select storage, storage_path, created_by from files where id = ${r.id}`;
    expect(f.storage).toBe("local");
    expect(f.created_by).toBe("Test Person (team app)");
    expect(existsSync(path.join(LOCAL_DIR, f.storage_path))).toBe(true);
  });

  it("refuses folders outside CBS System and empty files", async () => {
    await expect(uploadBytes({ folder: "Other/x", name: "a.jpg", bytes: new Uint8Array([1]), mime: "image/jpeg", entityTable: null, entityId: null, createdBy: "x" })).rejects.toThrow(/CBS System/);
    await expect(uploadBytes({ folder: "CBS System/x", name: "a.jpg", bytes: new Uint8Array(), mime: "image/jpeg", entityTable: null, entityId: null, createdBy: "x" })).rejects.toThrow(/empty/);
  });
});
