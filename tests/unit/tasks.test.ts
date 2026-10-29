import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The task rules (src/lib/tasks/service.ts), on the local test database only.
const url = process.env.DATABASE_URL || "";
describe.skipIf(!/@(127\.0\.0\.1|localhost)[:/]/.test(url))("tasks", async () => {
  const svc = await import("@/lib/tasks/service");
  const { db } = await import("@/lib/db");
  const sql = db();
  let approved = 0;
  let estimate = 0;
  const by = "Test Office One";
  const run = <T,>(fn: (tx: postgres.TransactionSql) => Promise<T>) => sql.begin(fn) as Promise<T>;
  const task = async (id: number) => (await sql`select * from tasks where id = ${id}`)[0];

  beforeAll(async () => {
    const [a] = await sql`insert into jobs (sm8_uuid, job_no, sm8_status, stage) values ('tasks-test-a', '9999801', 'Work Order', 'approved') returning id`;
    const [e] = await sql`insert into jobs (sm8_uuid, job_no, sm8_status, stage) values ('tasks-test-e', '9999802', 'Quote', 'estimate') returning id`;
    approved = Number(a.id);
    estimate = Number(e.id);
  });
  afterAll(async () => {
    await sql`delete from tasks where created_by = ${by} and (job_id in (${approved}, ${estimate}) or job_id is null and title like 'Test task%')`;
    await sql`delete from jobs where sm8_uuid like 'tasks-test-%'`;
    await sql.end();
  });

  it("adds a requirement once; a second add points at the existing task", async () => {
    const id = await run((tx) => svc.createTask(tx, { jobId: approved, reqKey: "rams" }, by));
    const t = await task(id);
    expect(t).toMatchObject({ title: "CBS RAMS", status: "todo", stage: "approved_planning", side: "office", is_repeat: false });
    const [jr] = await sql`select "on" from job_requirements where job_id = ${approved} and req_key = 'rams'`;
    expect(jr.on).toBe(true);
    await expect(run((tx) => svc.createTask(tx, { jobId: approved, reqKey: "rams" }, by))).rejects.toMatchObject({ existingId: id });
  });

  it("repeatable requirements make a new numbered task every time", async () => {
    const a = await run((tx) => svc.createTask(tx, { jobId: approved, reqKey: "supplier_pos" }, by));
    const b = await run((tx) => svc.createTask(tx, { jobId: approved, reqKey: "supplier_pos" }, by));
    expect((await task(a)).title).toBe("Supplier POs");
    expect((await task(b))).toMatchObject({ title: "Supplier POs 2", repeat_no: 2, is_repeat: true });
  });

  it("locks approved-stage and CDM-only requirements", async () => {
    await expect(run((tx) => svc.createTask(tx, { jobId: estimate, reqKey: "rams" }, by))).rejects.toThrow(/unlocks once the job is Approved/);
    await expect(run((tx) => svc.createTask(tx, { jobId: approved, reqKey: "visitors" }, by))).rejects.toThrow(/CDM jobs/);
    const ok = await run((tx) => svc.createTask(tx, { jobId: estimate, reqKey: "survey" }, by));
    expect((await task(ok)).side).toBe("site");
  });

  it("one-off tasks: office by default, no job allowed, requirements need a job", async () => {
    const id = await run((tx) => svc.createTask(tx, { jobId: null, reqKey: null, title: "Test task one-off" }, by));
    expect((await task(id))).toMatchObject({ side: "office", job_id: null, req_key: null });
    await expect(run((tx) => svc.createTask(tx, { jobId: null, reqKey: "rams" }, by))).rejects.toThrow(/only be added to a job/);
  });

  it("Done by hand, verify after Done, and leaving Done clears both", async () => {
    const id = await run((tx) => svc.createTask(tx, { jobId: approved, reqKey: null, title: "Test task done" }, by));
    await expect(run((tx) => svc.setVerified(tx, id, true, by))).rejects.toThrow(/Only a Done task/);
    await run((tx) => svc.setStatus(tx, id, "done", by));
    await run((tx) => svc.setVerified(tx, id, true, by));
    expect(await task(id)).toMatchObject({ status: "done", done_by: by, verified_by: by });
    await run((tx) => svc.setStatus(tx, id, "in_progress", by));
    expect(await task(id)).toMatchObject({ status: "in_progress", done_at: null, verified_at: null });
  });

  it("In hand is a note on In progress only", async () => {
    const id = await run((tx) => svc.createTask(tx, { jobId: approved, reqKey: null, title: "Test task in hand" }, by));
    const patch = { title: "Test task in hand", notes: "", assigneeId: null, dueOn: null };
    await run((tx) => svc.updateTask(tx, id, { ...patch, status: "in_progress", inHandNote: "Waiting for the supplier" }, by));
    expect(await task(id)).toMatchObject({ status: "in_progress", in_hand_note: "Waiting for the supplier", in_hand_by: by });
    await run((tx) => svc.updateTask(tx, id, { ...patch, status: "todo", inHandNote: "Waiting for the supplier" }, by));
    expect(await task(id)).toMatchObject({ status: "todo", in_hand_note: null });
  });

  it("send back is a marker: status To do or In progress, with the office note", async () => {
    const id = await run((tx) => svc.createTask(tx, { jobId: approved, reqKey: "preuse" }, by));
    await sql`update tasks set status = 'in_progress', submitted_at = now(), submitted_by = 'Test Site Lead' where id = ${id}`;
    await expect(run((tx) => svc.sendBack(tx, id, "todo", "", by))).rejects.toThrow(/Say what needs doing/);
    await run((tx) => svc.sendBack(tx, id, "todo", "Photo of the guard missing", by));
    expect(await task(id)).toMatchObject({ status: "todo", submitted_at: null, sent_back_note: "Photo of the guard missing", sent_back_by: by });
  });

  it("remove from job hides the task and switches the requirement off; it can be added again", async () => {
    const id = await run((tx) => svc.createTask(tx, { jobId: approved, reqKey: "coshh" }, by));
    await run((tx) => svc.removeTask(tx, id, by));
    expect((await task(id)).removed_by).toBe(by);
    const [jr] = await sql`select "on" from job_requirements where job_id = ${approved} and req_key = 'coshh'`;
    expect(jr.on).toBe(false);
    const again = await run((tx) => svc.createTask(tx, { jobId: approved, reqKey: "coshh" }, by));
    expect(again).not.toBe(id);
  });
});
