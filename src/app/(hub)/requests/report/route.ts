import { getCurrentPerson } from "@/lib/auth/session";
import { HousePdf } from "@/lib/pdf/house";
import { niceDate, niceDateTime, ukToday } from "../../_registers/dates";
import { loadRequests } from "../data";
import { REQUEST_REPORT_COLUMNS, REQUEST_REPORT_WHICH } from "../report-options";
import { isOpen, REQUEST_STATUSES, URGENCIES } from "../rules";

const label = (list: readonly { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label ?? v;

// The Team requests report in the house PDF format, with what the office chose.
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return Response.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const which = REQUEST_REPORT_WHICH.find((w) => w.value === q.get("which"))?.value ?? "open";
  const wanted = new Set((q.get("cols") ?? "").split(","));
  const cols = REQUEST_REPORT_COLUMNS.filter((c) => wanted.has(c.key));
  const today = ukToday();

  const data = await loadRequests();
  const rows = data.requests.filter((r) => which === "all" || (which === "open" ? isOpen(r.status) : r.status === which));

  const pdf = await HousePdf.create({ title: "Team requests", subtitle: `${label(REQUEST_REPORT_WHICH, which)} | ${niceDate(today)} | ${person.name}` });
  pdf.keyValues([["Requests", String(rows.length)], ["Created", `${niceDate(today)} by ${person.name}`]]);
  const used = cols.reduce((n, c) => n + c.width, 0);
  const firstW = Math.max(0.18, 1 - used);
  const scale = (1 - firstW) / (used || 1);
  if (rows.length === 0) pdf.paragraph("No requests to show.");
  else {
    pdf.table(
      [{ label: "Requested by", width: firstW }, ...cols.map((c) => ({ label: c.label, width: c.width * scale }))],
      rows.map((r) => {
        const cell: Record<string, string> = {
          category: r.category, details: r.details, urgency: isOpen(r.status) ? label(URGENCIES, r.urgency) : "-",
          status: label(REQUEST_STATUSES, r.status), response: r.response, from: r.source === "team" ? "Team app" : "Office",
        };
        return [`${r.requestedBy}\n${niceDateTime(r.requestedAt)}`, ...cols.map((c) => cell[c.key] ?? "")];
      }),
    );
  }
  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Team requests - ${today}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
