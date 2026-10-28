import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

// Runs the ServiceM8 sync functions against the local dev database only (they write test rows).
const url = process.env.DATABASE_URL || "";
const local = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
const events = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/sm8-events-test-job.json"), "utf8"));
const JOB = "01a18295-f573-79fe-9531-536fcf0f1b5d";
const MAINT = "01a15ea9-6031-79fe-9531-85247ade10bb";
const CLIENT = "01a18296-2204-79fe-9531-b3059f6d7fbb";

describe.skipIf(!local)("ServiceM8 sync (database functions)", () => {
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  const apply = async (ev: unknown) => (await sql`select cbs_sync.sm8_apply_event(${sql.json(ev as never)}) as r`)[0].r;
  // Tests change the allow lists the way an approved migration does (the lock needs this opt-in).
  const setting = async (v: object) => {
    await sql`select set_config('cbs.allow_sync_settings', 'on', false)`;
    await sql`update settings set value = ${sql.json(v as never)} where key = 'sm8_sync'`;
    await sql`select set_config('cbs.allow_sync_settings', '', false)`;
  };
  const job = async () => (await sql`select * from jobs where sm8_uuid = ${JOB}`)[0];

  beforeEach(async () => {
    await sql`delete from sm8_events where event_id like 'smwe_test-%' or event_id like 'test-%'`;
    await sql`delete from jobs where sm8_uuid = 'other-uuid'`;
    await sql`delete from jobs where sm8_uuid = ${JOB} or job_no in ('10279')`;
    await sql`delete from client_contacts where sm8_uuid like 'test-%'`;
    await sql`delete from clients where sm8_uuid = ${CLIENT} or sm8_uuid like 'test-%'`;
    await sql`delete from cbs_sync.read_cursors`;
    await sql`delete from sm8_folders where sm8_uuid = ${MAINT}`;
    await setting({ allow: ["12"], folder_keeper: false });
  });
  afterAll(async () => {
    await setting({ allow: ["12"], folder_keeper: false });
    await sql.end();
  });

  it("applies the test job's events in delivery order, keeping the client a later copy left blank", async () => {
    for (const ev of events.slice(0, 6)) await apply(ev);
    const j = await job();
    expect(j.job_no).toBe("12");
    expect(j.sm8_status).toBe("Work Order");
    expect(j.stage).toBe("approved");
    expect(j.sm8_folder_uuid).toBe(MAINT);
    expect(j.sm8_last_kept_folder_uuid).toBe(MAINT);
    expect(j.client_id).not.toBeNull();
    const [f] = await sql`select name from sm8_folders where sm8_uuid = ${MAINT}`;
    expect(f.name).toBe("Maintenance"); // trimmed
    const moves = await sql`select kind, to_value from job_moves where job_id = ${j.id} order by id`;
    expect(moves.map((m) => m.kind)).toEqual(["status", "folder"]);
  });

  it("skips a repeat delivery of the same event", async () => {
    expect((await apply(events[0])).outcome).toBe("applied");
    expect((await apply(events[0])).outcome).toBe("duplicate");
  });

  it("ignores an older copy that arrives late", async () => {
    await apply(events[5]); // 12:58:34, Maintenance
    const late = await apply(events[4]); // 12:57:25
    expect(late.outcome).toBe("stale");
    expect((await job()).sm8_folder_uuid).toBe(MAINT);
  });

  it("puts a Work Order back in its folder only when the folder keeper is on", async () => {
    for (const ev of events.slice(0, 6)) await apply(ev);
    const off = await apply(events[6]);
    expect(off.actions).toEqual([]);
    expect((await job()).sm8_folder_uuid).toBeNull();

    await sql`delete from sm8_events where event_id = 'smwe_test-07'`;
    await setting({ allow: ["12"], folder_keeper: true });
    const on = await apply(events[6]);
    expect(on.actions).toHaveLength(1);
    expect(on.actions[0]).toMatchObject({ action: "restore_folder", job_uuid: JOB, folder_uuid: MAINT, job_no: "12" });
  });

  it("never files a Quote job", async () => {
    await setting({ allow: ["12"], folder_keeper: true });
    const r = await apply({ ...events[0], id: "test-quote", data: { ...events[0].data, queue_uuid: "" } });
    expect(r.actions).toEqual([]);
  });

  it("stores only allowed jobs, and other jobs' events leave nothing behind", async () => {
    const other = {
      ...events[0], id: "test-other",
      data: { ...events[0].data, uuid: "other-uuid", generated_job_id: "10279", company_uuid: "test-other-client" },
      related: { ...events[0].related, company: { uuid: "test-other-client", name: "Someone else" } },
    };
    expect((await apply(other)).outcome).toBe("skipped");
    expect((await sql`select count(*)::int as n from jobs where job_no = '10279'`)[0].n).toBe(0);
    expect((await sql`select count(*)::int as n from clients where sm8_uuid = 'test-other-client'`)[0].n).toBe(0);
    expect((await sql`select count(*)::int as n from sm8_events where event_id = 'test-other'`)[0].n).toBe(0);
  });

  it("stores only the allowed job's client and that client's contacts", async () => {
    await apply(events[0]);
    expect((await sql`select count(*)::int as n from clients where sm8_uuid = ${CLIENT}`)[0].n).toBe(1);
    // a company event or read for any other client is ignored
    expect((await apply({ id: "test-co", type: "company.updated", data: { uuid: "test-other-client", name: "Someone else" } })).outcome).toBe("skipped");
    const clients = (await sql`select cbs_sync.sm8_apply_records('client', ${sql.json([{ uuid: "test-other-client", name: "X" }, { uuid: CLIENT, name: "TEST - Hub rebuild - do not invoice", edit_date: "2026-10-28 13:00:00" }] as never)}) as r`)[0].r;
    expect(clients).toMatchObject({ received: 2, applied: 1 });
    const contacts = [
      { uuid: "test-c1", company_uuid: CLIENT, first: "Test", last: "Contact", edit_date: "2026-10-28 13:01:00" },
      { uuid: "test-c2", company_uuid: "test-other-client", first: "Not", last: "Kept", edit_date: "2026-10-28 13:02:00" },
    ];
    expect((await sql`select cbs_sync.sm8_apply_records('contact', ${sql.json(contacts as never)}) as r`)[0].r).toMatchObject({ received: 2, applied: 1 });
    expect((await sql`select sm8_uuid from client_contacts where sm8_uuid like 'test-%'`).map((r) => r.sm8_uuid)).toEqual(["test-c1"]);
    expect((await sql`select count(*)::int as n from clients where sm8_uuid = 'test-other-client'`)[0].n).toBe(0);
  });

  it("remembers where each 5-minute read got to, including records it didn't keep", async () => {
    const since = async (k: string) => (await sql`select cbs_sync.sm8_sync_since(${k}) as s`)[0].s;
    expect(await since("contact")).toBeNull();
    await sql`select cbs_sync.sm8_apply_records('contact', ${sql.json([{ uuid: "test-c9", company_uuid: "test-other-client", edit_date: "2026-10-28 14:05:00" }] as never)})`;
    expect(await since("contact")).toBe("2026-10-28 14:05:00");
    await sql`select cbs_sync.sm8_apply_records('contact', ${sql.json([{ uuid: "test-c9", company_uuid: "test-other-client", edit_date: "2026-10-28 09:00:00" }] as never)})`;
    expect(await since("contact")).toBe("2026-10-28 14:05:00"); // never goes backwards
  });

  it("stores scheduled bookings for jobs the hub holds", async () => {
    await apply(events[0]);
    const rows = [
      { uuid: "test-act-1", job_uuid: JOB, staff_uuid: "s1", start_date: "2026-10-30 08:00:00", end_date: "2026-10-30 17:00:00", active: 1, activity_was_scheduled: 1, edit_date: "2026-10-28 13:00:00" },
      { uuid: "test-act-2", job_uuid: "not-held", staff_uuid: "s1", start_date: "2026-10-30 08:00:00", end_date: "2026-10-30 17:00:00", active: 1, activity_was_scheduled: 1, edit_date: "2026-10-28 13:00:00" },
    ];
    const r = (await sql`select cbs_sync.sm8_apply_records('booking', ${sql.json(rows as never)}) as r`)[0].r;
    expect(r).toMatchObject({ received: 2, applied: 1 });
    const [b] = await sql`select active, starts_at from sm8_bookings where sm8_uuid = 'test-act-1'`;
    expect(b.active).toBe(true);
    expect(new Date(b.starts_at).toISOString()).toBe("2026-10-30T08:00:00.000Z"); // GMT in late October
    await sql`delete from sm8_bookings where sm8_uuid like 'test-act-%'`;
  });

  // The n8n login: only the three sync functions, nothing else (no tables, no other functions).
  it("the sync role can run the three sync functions and nothing else", async () => {
    const asSync = <T,>(q: (tx: postgres.TransactionSql) => Promise<T>) =>
      sql.begin(async (tx) => {
        await tx`set local role cbs_n8n_sync`;
        return q(tx);
      });
    expect(await asSync(async (tx) => (await tx`select cbs_sync.sm8_sync_since('job') as s`)[0].s)).toBeNull();
    expect((await asSync(async (tx) => (await tx`select cbs_sync.sm8_apply_event(${tx.json(events[0] as never)}) as r`)[0].r)).outcome).toBe("applied");
    for (const q of [
      "select * from public.jobs limit 1",
      "select * from public.settings limit 1",
      "select * from cbs_sync.read_cursors limit 1",
      "insert into public.jobs (sm8_uuid, job_no) values ('x', 'x')",
      "select cbs_sync.sm8_upsert_job('{}'::jsonb)",
      "select cbs_sync.sm8_write_allowed('12')",
      "create table cbs_sync.x (id int)",
      "create table public.x (id int)",
    ]) {
      await expect(asSync((tx) => tx.unsafe(q)), q).rejects.toThrow(/permission denied/);
    }
    const [t] = await sql`select rolconfig from pg_roles where rolname = 'cbs_n8n_sync'`;
    expect(t.rolconfig).toContain("statement_timeout=15s");
  });
});
