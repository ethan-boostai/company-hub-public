import { describe, expect, it } from "vitest";
import { chooseTestDatabase, isSafeTestDatabase, LIVE_PROJECT_REF } from "../test-database";

describe("tests never use the live database", () => {
  it("allows a local database", () => {
    expect(isSafeTestDatabase("postgres://postgres@127.0.0.1:54329/cbs_hub")).toBe(true);
    expect(isSafeTestDatabase("postgres://postgres@localhost/cbs_hub")).toBe(true);
  });
  it("refuses the live project, however it is written", () => {
    const pooler = `postgres://postgres.${LIVE_PROJECT_REF}:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`;
    const direct = `postgres://postgres:pw@db.${LIVE_PROJECT_REF}.supabase.co:5432/postgres`;
    expect(isSafeTestDatabase(pooler)).toBe(false);
    expect(isSafeTestDatabase(direct)).toBe(false);
    expect(isSafeTestDatabase(pooler, LIVE_PROJECT_REF)).toBe(false);
  });
  it("refuses any other remote database unless it is the named dev project", () => {
    const dev = "postgres://postgres.abcdefghijklmnopqrst:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";
    expect(isSafeTestDatabase(dev)).toBe(false);
    expect(isSafeTestDatabase(dev, "abcdefghijklmnopqrst")).toBe(true);
    expect(isSafeTestDatabase("postgres://u:p@example.com/db", "abcdefghijklmnopqrst")).toBe(false);
  });
  it("prefers TEST_DATABASE_URL and drops an unsafe one", () => {
    expect(chooseTestDatabase({ TEST_DATABASE_URL: "postgres://postgres@127.0.0.1/t", DATABASE_URL: "x" })).toBe("postgres://postgres@127.0.0.1/t");
    expect(chooseTestDatabase({ DATABASE_URL: `postgres://u:p@db.${LIVE_PROJECT_REF}.supabase.co/postgres` })).toBeNull();
    expect(chooseTestDatabase({})).toBeNull();
  });
  it("the guard ran for this file: DATABASE_URL is safe or gone", () => {
    const url = process.env.DATABASE_URL;
    expect(url === undefined || isSafeTestDatabase(url)).toBe(true);
  });
});
