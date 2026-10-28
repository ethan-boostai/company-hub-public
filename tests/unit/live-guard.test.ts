import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { LIVE_PROJECT_REF, liveAllowed, liveRefusal, pointsAtLive } from "@/lib/live-guard.mjs";
import { liveTestRefusal } from "../test-database";

const pooler = `postgresql://postgres.${LIVE_PROJECT_REF}:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`;
const direct = `postgres://postgres:pw@db.${LIVE_PROJECT_REF}.supabase.co:5432/postgres`;
const encoded = pooler.replace("chvy", "%63hvy");
const upper = direct.toUpperCase();
const dev = "postgres://postgres.abcdefghijklmnopqrst:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";
const local = "postgres://postgres@127.0.0.1:54329/cbs_hub";

// The hard block on the live database (docs: README "Live database safety").
describe("live database block", () => {
  it("spots the live project however the address is written", () => {
    for (const u of [pooler, direct, encoded, upper]) expect(pointsAtLive(u), u).toBe(true);
    for (const u of [dev, local, "", undefined]) expect(pointsAtLive(u)).toBe(false);
  });

  it("refuses live unless it is the live site or the switch-over flag is set", () => {
    expect(liveRefusal(pooler, "x", { env: {} })).toMatch(/refused/);
    expect(liveRefusal(pooler, "x", { env: { VERCEL_ENV: "production" } })).toMatch(/refused/); // not on Vercel
    expect(liveRefusal(pooler, "x", { env: { VERCEL: "1", VERCEL_ENV: "preview" } })).toMatch(/refused/);
    expect(liveRefusal(pooler, "x", { env: { CBS_LIVE_DATABASE: "yes" } })).toMatch(/refused/);
    expect(liveRefusal(pooler, "x", { env: { VERCEL: "1", VERCEL_ENV: "production" } })).toBeNull();
    expect(liveRefusal(pooler, "x", { env: { CBS_LIVE_DATABASE: "switch-over" } })).toBeNull();
    expect(liveRefusal(dev, "x", { env: {} })).toBeNull();
    expect(liveAllowed({})).toBe(false);
  });

  it("never allows live for the tests or the local seed, even with the flag", () => {
    expect(liveRefusal(pooler, "x", { env: { CBS_LIVE_DATABASE: "switch-over" }, neverLive: true })).toMatch(/never runs against live/);
    expect(liveTestRefusal({ DATABASE_URL: pooler, CBS_LIVE_DATABASE: "switch-over" })).toMatch(/Tests refused/);
    expect(liveTestRefusal({ DATABASE_URL: pooler, TEST_DATABASE_URL: local })).toBeNull();
    expect(liveTestRefusal({ DATABASE_URL: local })).toBeNull();
  });

  // The scripts refuse before connecting (the live host is never contacted).
  const run = (script: string, env: Record<string, string>) => {
    try {
      execFileSync("node", [script, "Test Name", "1234"], { env: { PATH: process.env.PATH, ...env } as unknown as NodeJS.ProcessEnv, encoding: "utf8", stdio: "pipe" });
      return { code: 0, err: "" };
    } catch (e) {
      const x = e as { status: number; stderr: string };
      return { code: x.status, err: x.stderr };
    }
  };
  it.each(["scripts/db-migrate.mjs", "scripts/db-seed-local.mjs", "scripts/add-person.mjs"])("%s refuses the live database", (script) => {
    const r = run(script, { DATABASE_URL: pooler });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/refused/);
  });
  it("the local seed refuses live even with the switch-over flag", () => {
    const r = run("scripts/db-seed-local.mjs", { DATABASE_URL: pooler, CBS_LIVE_DATABASE: "switch-over" });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/never runs against live/);
  });

  it("the app refuses to start on the live database (server start hook)", async () => {
    const { register } = await import("@/instrumentation");
    const saved = { url: process.env.DATABASE_URL, runtime: process.env.NEXT_RUNTIME };
    const err = console.error;
    console.error = () => {};
    try {
      process.env.DATABASE_URL = pooler;
      process.env.NEXT_RUNTIME = "edge"; // throws instead of exiting, so the test can see it
      expect(() => register()).toThrow(/Starting the app refused/);
      process.env.DATABASE_URL = local;
      expect(() => register()).not.toThrow();
    } finally {
      console.error = err;
      if (saved.url === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = saved.url;
      if (saved.runtime === undefined) delete process.env.NEXT_RUNTIME;
      else process.env.NEXT_RUNTIME = saved.runtime;
    }
  });
});
