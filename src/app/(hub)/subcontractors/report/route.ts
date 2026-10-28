import { readDb } from "@/lib/db";
import { getCurrentPerson } from "@/lib/auth/session";
import { HousePdf } from "@/lib/pdf/house";
import { niceDate, ukToday } from "../../_registers/dates";
import { loadCompanies } from "../data";
import { REPORT_COLUMNS } from "../report-options";
import { docLabel, docState, KIND_LABEL, type Kind } from "../rules";

// The subcontractors and suppliers report in the house PDF format, with what the office chose.
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return Response.json({ ok: false, message: "Sign in again." }, { status: 401 });
  await readDb();
  const q = new URL(req.url).searchParams;
  const include = new Set((q.get("include") ?? "").split(",").filter((k): k is Kind => k === "subcontractor" || k === "supplier"));
  const wanted = new Set((q.get("cols") ?? "").split(","));
  const cols = REPORT_COLUMNS.filter((c) => wanted.has(c.key));
  const docsMode = q.get("docs") === "none" ? "none" : q.get("docs") === "due" ? "due" : "all";
  const onlyApproved = q.get("approved") === "1";
  const today = ukToday();

  const data = await loadCompanies();
  const companies = data.companies.filter((c) => include.has(c.kind) && (!onlyApproved || c.kind === "supplier" || c.approved));
  const docsOf = (c: { kind: Kind; id: number }) => data.docs.filter((d) => d.kind === c.kind && d.companyId === c.id);

  const pdf = await HousePdf.create({
    title: "Subcontractors and suppliers",
    subtitle: `${[...include].map((k) => `${KIND_LABEL[k]}s`).join(" and ")} | ${niceDate(today)} | ${person.name}`,
  });
  pdf.keyValues([
    ["Companies", String(companies.length)],
    ["Created", `${niceDate(today)} by ${person.name}`],
  ]);

  // Company column takes whatever width the chosen columns leave.
  const used = cols.reduce((n, c) => n + c.width, 0);
  const companyWidth = Math.max(0.2, 1 - used);
  const scale = (1 - companyWidth) / (used || 1);
  pdf.heading("Companies");
  pdf.table(
    [{ label: "Company", width: companyWidth }, ...cols.map((c) => ({ label: c.label, width: c.width * scale }))],
    companies.map((c) => {
      const docs = docsOf(c);
      const expired = docs.filter((d) => docState(d.expiresOn, today) === "overdue").length;
      const cell: Record<string, string> = {
        type: KIND_LABEL[c.kind],
        trade: c.trade,
        contact: c.contact,
        phone: c.phone,
        email: c.email,
        approved: c.kind === "subcontractor" ? `${c.approved ? "Approved" : "Not approved"}${c.inducted ? ", inducted" : ""}` : "-",
        documents: docs.length ? `${docs.length}${expired ? `, ${expired} expired` : ""}` : "None",
      };
      return [c.name, ...cols.map((col) => cell[col.key] ?? "")];
    }),
  );

  if (docsMode !== "none") {
    const rows = companies.flatMap((c) =>
      docsOf(c)
        .filter((d) => docsMode === "all" || ["overdue", "soon", "up"].includes(docState(d.expiresOn, today)))
        .map((d) => [c.name, d.item, d.reference, d.expiresOn ? niceDate(d.expiresOn) : "No expiry", docLabel(d.expiresOn, today)]),
    );
    pdf.heading(docsMode === "due" ? "Documents expired or expiring" : "Documents");
    if (rows.length === 0) pdf.paragraph("No documents to show.");
    else {
      pdf.table(
        [
          { label: "Company", width: 0.26 },
          { label: "Document", width: 0.26 },
          { label: "Reference", width: 0.18 },
          { label: "Expires", width: 0.14 },
          { label: "Status", width: 0.16 },
        ],
        rows,
      );
    }
  }

  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Subcontractors and suppliers - ${today}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
