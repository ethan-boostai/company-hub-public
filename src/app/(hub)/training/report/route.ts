import { readDb } from "@/lib/db";
import { getCurrentPerson } from "@/lib/auth/session";
import { HousePdf } from "@/lib/pdf/house";
import { niceDate, ukToday } from "../../_registers/dates";
import { isoDate } from "../../_registers/form-values";
import { expiryLabel } from "../../insurance/rules";
import { loadTraining } from "../data";
import { bestFor, bestRecords, matrixPeople, matrixTickets, pdfCellText, type PeopleChoice, type TicketChoice } from "../rules";

const PER_TABLE = 10; // ticket columns per table, so cells stay readable on A4 landscape

// The training matrix in the house PDF format, A4 landscape, with what the office chose.
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return Response.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const sql = await readDb();
  const q = new URL(req.url).searchParams;
  const peopleChoice: PeopleChoice = q.get("people") === "crew" ? "crew" : "active";
  const ticketChoice: TicketChoice = q.get("tickets") === "standard" ? "standard" : q.get("tickets") === "chosen" ? "chosen" : "on_file";
  const chosen = q.getAll("t").map((t) => t.trim()).filter(Boolean).slice(0, 100);
  const withDates = q.get("dates") === "1";
  const withEmpty = q.get("empty") === "1";
  const withCerts = q.get("certs") === "1";
  const today = ukToday();

  const data = await loadTraining();
  const best = bestRecords(data.records);
  const tickets = matrixTickets(data.records, ticketChoice, chosen);
  const people = matrixPeople(data.people, data.records, peopleChoice)
    .filter((p) => withEmpty || tickets.some((t) => bestFor(best, p.id, t)));

  const pdf = await HousePdf.create({
    title: "Training matrix",
    subtitle: `${peopleChoice === "crew" ? "Crew list" : "Everyone active"} | As at ${niceDate(today)} | ${person.name}`,
    landscape: true,
  });
  pdf.heading("Team tickets and qualifications");
  pdf.paragraph(`OK = valid${withDates ? " (date shown is the expiry)" : ""}. DUE = expires within 60 days. EXPIRED = has expired. - = not on file. Only the latest record for each ticket counts.`, 8.5);

  if (people.length === 0 || tickets.length === 0) {
    pdf.paragraph(people.length === 0 ? "Nobody to show." : "No tickets to show.");
  } else {
    const parts = Math.ceil(tickets.length / PER_TABLE);
    for (let i = 0; i < parts; i++) {
      const cols = tickets.slice(i * PER_TABLE, (i + 1) * PER_TABLE);
      if (parts > 1 && i > 0) pdf.paragraph(`Tickets continued (${i + 1} of ${parts})`, 8.5);
      const nameW = 0.16;
      const w = (1 - nameW) / Math.max(cols.length, 6);
      pdf.table(
        [{ label: "Person", width: nameW }, ...cols.map((c) => ({ label: c, width: w }))],
        people.map((p) => [p.active ? p.name : `${p.name} (left)`, ...cols.map((t) => pdfCellText(bestFor(best, p.id, t), today, withDates))]),
      );
    }
  }

  if (withCerts) {
    const certs = await sql`select name, issuer, reference, level, expires_on from company_certs order by lower(name)`;
    pdf.heading("Company accreditations and memberships");
    if (certs.length === 0) pdf.paragraph("None recorded.");
    else {
      pdf.table(
        [{ label: "Accreditation", width: 0.26 }, { label: "Organisation", width: 0.22 }, { label: "Number", width: 0.16 }, { label: "Grade / level", width: 0.14 }, { label: "Renews or expires", width: 0.22 }],
        certs.map((c) => {
          const exp = isoDate(c.expires_on);
          return [c.name, c.issuer ?? "", c.reference ?? "", c.level ?? "", exp ? expiryLabel(exp, today) : "No expiry"];
        }),
      );
    }
  }

  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Training matrix - ${today}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
