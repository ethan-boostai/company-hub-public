import { getCurrentPerson } from "@/lib/auth/session";
import { readDb } from "@/lib/db";
import { HousePdf } from "@/lib/pdf/house";
import { PERMIT_LIST } from "@/lib/rams/content";
import { jobTypes } from "@/lib/rams/data";
import { niceDate, ukToday } from "../../../_registers/dates";
import { TEMPLATE_REPORT_COLUMNS, TEMPLATE_REPORT_DETAIL, TEMPLATE_REPORT_WHICH } from "../report-options";

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String((x as { task?: unknown })?.task ?? ""))).filter(Boolean) : [];
const permitLabel = (k: string) => PERMIT_LIST.find((p) => p.key === k)?.label ?? k;

// The RAMS job types report in the house PDF format, with what the office chose.
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return Response.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const which = TEMPLATE_REPORT_WHICH.find((w) => w.value === q.get("which"))?.value ?? "active";
  const wanted = new Set((q.get("cols") ?? "").split(","));
  const cols = TEMPLATE_REPORT_COLUMNS.filter((c) => wanted.has(c.key));
  const detail = new Set((q.get("detail") ?? "").split(",").filter((d) => TEMPLATE_REPORT_DETAIL.some((x) => x.key === d)));
  const today = ukToday();

  const sql = await readDb();
  const [types, used] = await Promise.all([
    jobTypes(sql, true),
    sql<{ template_key: string; n: number }[]>`select template_key, count(*)::int as n from rams where template_key is not null group by template_key`,
  ]);
  const counts = Object.fromEntries(used.map((u) => [u.template_key, u.n]));
  const rows = types.filter((t) => which === "all" || t.status === which);
  const whichLabel = TEMPLATE_REPORT_WHICH.find((w) => w.value === which)!.label;

  const pdf = await HousePdf.create({ title: "RAMS job types", subtitle: `${whichLabel} | ${niceDate(today)} | ${person.name}` });
  pdf.keyValues([["Job types", String(rows.length)], ["Created", `${niceDate(today)} by ${person.name}`]]);
  if (rows.length === 0) pdf.paragraph("No job types to show.");
  else {
    const used = cols.reduce((n, c) => n + c.width, 0);
    pdf.table(
      [{ label: "Job type", width: 1 - used }, ...cols.map((c) => ({ label: c.label, width: c.width }))],
      rows.map((t) => {
        const cell: Record<string, string> = {
          steps: String(list(t.template.steps).length),
          hazards: String(list(t.template.hazards).length),
          used: String(counts[t.key] ?? 0),
          status: t.status === "active" ? "In use" : "Retired",
        };
        return [t.name, ...cols.map((c) => cell[c.key] ?? "")];
      }),
    );
    if (detail.size) {
      for (const t of rows) {
        pdf.heading(t.name);
        if (detail.has("steplist")) {
          const steps = list(t.template.steps);
          pdf.paragraph(steps.length ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "No steps.");
        }
        if (detail.has("ppe")) {
          pdf.keyValues([
            ["PPE", list(t.template.ppe).join(", ") || "-"],
            ["Permits and competencies", list(t.template.permits).map(permitLabel).join(", ") || "-"],
          ]);
        }
      }
    }
  }
  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="RAMS job types - ${today}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
