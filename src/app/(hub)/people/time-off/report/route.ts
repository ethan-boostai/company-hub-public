import { getCurrentPerson } from "@/lib/auth/session";
import { HousePdf } from "@/lib/pdf/house";
import { isIsoDate, niceDate, ukToday } from "../../../_registers/dates";
import { canSeeTimeOff } from "../../data";
import { loadTimeOff } from "../data";
import { datesLabel, daysLabel, labelOf, STATUSES } from "../rules";

// The Time off report in the house PDF format. Time off tick only (checked here, on the server).
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return Response.json({ ok: false, message: "Sign in again." }, { status: 401 });
  if (!(await canSeeTimeOff(person.id))) return Response.json({ ok: false, message: "You don't have access to Time off." }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const today = ukToday();
  const from = isIsoDate(q.get("from") ?? "") ? q.get("from")! : `${today.slice(0, 4)}-01-01`;
  const to = isIsoDate(q.get("to") ?? "") ? q.get("to")! : `${today.slice(0, 4)}-12-31`;
  const personId = Number(q.get("person")) || null;
  const withDeclined = q.get("declined") === "1";
  const withNotes = q.get("notes") === "1";

  const data = await loadTimeOff();
  const nameOf = new Map(data.people.map((p) => [p.id, p.name]));
  const rows = data.rows
    .filter((r) => r.toDate >= from && r.fromDate <= to && (!personId || r.personId === personId) && (withDeclined || r.status !== "declined"))
    .sort((a, b) => (nameOf.get(a.personId) ?? "").localeCompare(nameOf.get(b.personId) ?? "") || a.fromDate.localeCompare(b.fromDate));

  const pdf = await HousePdf.create({
    title: "Time off",
    subtitle: `${personId ? nameOf.get(personId) ?? "" : "Everyone"} | ${niceDate(from)} to ${niceDate(to)} | ${person.name}`,
  });
  // Approved working days per person in the range (whole records that overlap it).
  const totals = new Map<number, number>();
  for (const r of rows) if (r.status === "approved") totals.set(r.personId, (totals.get(r.personId) ?? 0) + r.days);
  pdf.heading("Approved working days");
  if (totals.size === 0) pdf.paragraph("No approved time off in this range.");
  else pdf.table([{ label: "Person", width: 0.6 }, { label: "Working days", width: 0.4 }], [...totals].map(([id, d]) => [nameOf.get(id) ?? "", daysLabel(d)]));

  pdf.heading("Requests");
  if (rows.length === 0) pdf.paragraph("Nothing in this range.");
  else {
    pdf.table(
      withNotes
        ? [{ label: "Person", width: 0.15 }, { label: "Type", width: 0.13 }, { label: "Dates", width: 0.2 }, { label: "Days", width: 0.08 }, { label: "Status", width: 0.11 }, { label: "Notes", width: 0.17 }, { label: "Office response", width: 0.16 }]
        : [{ label: "Person", width: 0.22 }, { label: "Type", width: 0.2 }, { label: "Dates", width: 0.3 }, { label: "Days", width: 0.12 }, { label: "Status", width: 0.16 }],
      rows.map((r) => [
        nameOf.get(r.personId) ?? "", r.kind, datesLabel(r), daysLabel(r.days), labelOf(STATUSES, r.status),
        ...(withNotes ? [r.notes, r.response] : []),
      ]),
    );
  }
  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Time off - ${today}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
