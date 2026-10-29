import "server-only";
import { readDb } from "@/lib/db";
import { STAGES, jobTitle, stageOf } from "@/lib/jobs/stages";
import { STATUS_LABEL, type TaskStatus } from "@/lib/tasks/types";

// Global search: jobs (number, description, client), tasks and people. Used by the header search
// box (results as you type) and the /search page.
export type SearchHit = { kind: "job" | "task" | "person"; id: number; title: string; sub: string; href: string };
export type SearchResults = { jobs: SearchHit[]; tasks: SearchHit[]; people: SearchHit[] };

export const EMPTY_RESULTS: SearchResults = { jobs: [], tasks: [], people: [] };

export async function searchHub(raw: string, limit = 8): Promise<SearchResults> {
  const q = String(raw || "").trim().replace(/^#/, "").slice(0, 100);
  if (!q) return EMPTY_RESULTS;
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const start = `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const sql = await readDb();
  const [jobs, tasks, people] = await Promise.all([
    sql<{ id: string; job_no: string; sm8_description: string | null; client: string | null; stage: string; job_type: string }[]>`
      select j.id, j.job_no, j.sm8_description, c.name as client, j.stage, j.job_type
      from jobs j left join clients c on c.id = j.client_id
      where j.job_no ilike ${start} or j.sm8_description ilike ${like} or c.name ilike ${like}
      order by (j.job_no = ${q}) desc, (j.job_no ilike ${start}) desc, length(j.job_no), j.job_no desc
      limit ${limit}`,
    sql<{ id: string; title: string; status: TaskStatus; job_no: string | null }[]>`
      select t.id, t.title, t.status, j.job_no
      from tasks t left join jobs j on j.id = t.job_id
      where t.removed_at is null and (t.title ilike ${like} or j.job_no = ${q})
      order by (t.status = 'done'), t.id desc
      limit ${limit}`,
    sql<{ id: string; name: string; role: string | null; active: boolean }[]>`
      select id, name, role, active from people
      where name ilike ${like} or role ilike ${like} or email ilike ${like}
      order by active desc, lower(name) limit ${limit}`,
  ]);
  return {
    jobs: jobs.map((j) => ({
      kind: "job" as const,
      id: Number(j.id),
      title: `#${j.job_no} ${jobTitle(j.sm8_description)}`,
      sub: [j.client, STAGES[stageOf(j.stage)].label, j.job_type === "cdm" ? "CDM" : "Project"].filter(Boolean).join(" · "),
      href: `/jobs/${j.job_no}`,
    })),
    tasks: tasks.map((t) => ({
      kind: "task" as const,
      id: Number(t.id),
      title: t.title,
      sub: [t.job_no ? `Job ${t.job_no}` : "No job", STATUS_LABEL[t.status]].join(" · "),
      href: `/actions?task=${t.id}`,
    })),
    people: people.map((p) => ({
      kind: "person" as const,
      id: Number(p.id),
      title: p.name,
      sub: [p.role, p.active ? "" : "left"].filter(Boolean).join(" · "),
      href: `/settings/people?open=${p.id}`,
    })),
  };
}
