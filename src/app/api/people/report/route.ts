import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth/session";
import { readDb } from "@/lib/db";
import { HousePdf, type Column } from "@/lib/pdf/house";

// Team list report in the house PDF format. The office chooses who (Current, Left, Hub sign-in,
// Crew, All) and which columns to include.
const COLS: Record<string, { label: string; width: number }> = {
  role: { label: "Role", width: 0.18 },
  mobile: { label: "Mobile", width: 0.15 },
  email: { label: "Email", width: 0.24 },
  signin: { label: "Hub sign-in", width: 0.13 },
  crew: { label: "Crew", width: 0.08 },
  status: { label: "Status", width: 0.1 },
};
const WHO: Record<string, string> = { current: "Current", left: "Left", signin: "Hub sign-in", crew: "Crew", all: "All" };

export async function GET(req: Request) {
  const me = await getCurrentPerson();
  if (!me) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const url = new URL(req.url);
  const who = WHO[url.searchParams.get("who") || ""] ? url.searchParams.get("who")! : "current";
  const cols = (url.searchParams.get("cols") || "").split(",").filter((c) => c in COLS);

  const sql = await readDb();
  const people = await sql<{ name: string; role: string | null; mobile: string | null; email: string | null; active: boolean; can_sign_in: boolean; has_pin: boolean; crew: boolean }[]>`
    select name, role, mobile, email, active, can_sign_in, (pin_hash is not null or legacy_pin_hash is not null) as has_pin, 'crew' = any(lists) as crew
    from people
    where case ${who}
      when 'current' then active
      when 'left' then not active
      when 'signin' then active and can_sign_in
      when 'crew' then active and 'crew' = any(lists)
      else true end
    order by active desc, lower(name)`;

  const pdf = await HousePdf.create({ title: "Team list", subtitle: `${WHO[who]} · ${people.length} ${people.length === 1 ? "person" : "people"}` });
  const used = cols.reduce((n, c) => n + COLS[c].width, 0);
  const columns: Column[] = [{ label: "Name", width: Math.max(0.2, 1 - used) }, ...cols.map((c) => COLS[c])];
  pdf.table(
    columns,
    people.map((p) => [
      p.name,
      ...cols.map((c) =>
        c === "role" ? p.role ?? "" :
        c === "mobile" ? p.mobile ?? "" :
        c === "email" ? p.email ?? "" :
        c === "signin" ? (p.can_sign_in ? (p.has_pin ? "Yes" : "No PIN yet") : "No") :
        c === "crew" ? (p.crew ? "Yes" : "") :
        p.active ? "Current" : "Left",
      ),
    ]),
  );
  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="Team list.pdf"', "Cache-Control": "private, no-store" },
  });
}
