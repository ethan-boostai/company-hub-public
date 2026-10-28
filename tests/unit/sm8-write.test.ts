import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The write-back guard: only test job 12 may be changed in ServiceM8 until the Phase 1 switch-over.
const url = process.env.DATABASE_URL || "";
const local = /@(127\.0\.0\.1|localhost)[:/]/.test(url);

describe.skipIf(!local)("ServiceM8 write-back guard", async () => {
  const { writeToServiceM8, SM8_NOT_ALLOWED } = await import("@/lib/sm8/write");
  const { db } = await import("@/lib/db");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

  beforeAll(async () => {
    await sql`insert into jobs (sm8_uuid, job_no, sm8_status) values ('guard-uuid-12', '9999912', 'Quote'), ('guard-uuid-13', '9999913', 'Quote')
              on conflict do nothing`;
    await sql`update settings set value = jsonb_set(value, '{write_allow}', '["9999912"]') where key = 'sm8_sync'`;
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("N8N_SM8_KEY", "test-key");
    vi.stubEnv("N8N_WEBHOOK_BASE", "https://n8n.example.test/webhook");
  });
  afterEach(() => fetchMock.mockClear());
  afterAll(async () => {
    await sql`delete from jobs where sm8_uuid like 'guard-uuid-%'`;
    await sql`update settings set value = jsonb_set(value, '{write_allow}', '["12"]') where key = 'sm8_sync'`;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await sql.end();
    await db().end();
  });
  const change = (job_no: string, job_uuid: string) =>
    ({ action: "set_status", job_no, job_uuid, status: "Work Order", note: "", by: "Test Office One" }) as const;

  it("sends a change for the allowed test job", async () => {
    await writeToServiceM8(change("9999912", "guard-uuid-12"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses any other job without contacting ServiceM8", async () => {
    await expect(writeToServiceM8(change("9999913", "guard-uuid-13"))).rejects.toThrow(SM8_NOT_ALLOWED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses the allowed number paired with another job's ServiceM8 id", async () => {
    await expect(writeToServiceM8(change("9999912", "guard-uuid-13"))).rejects.toThrow(SM8_NOT_ALLOWED);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
