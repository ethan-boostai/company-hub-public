import "server-only";
import { readDb } from "@/lib/db";

export type PersonRow = {
  id: number;
  name: string;
  role: string;
  mobile: string;
  email: string;
  active: boolean;
  canSignIn: boolean;
  hasPin: boolean;
  crew: boolean; // on the crew list (team app names, training matrix "Crew list only")
  timeOff: boolean; // may see the Team page's Time off tab, its notes and files (sick notes). Off by default.
  hsIssue: boolean; // may issue the H&S policy and manual. Off by default.
  permitApprove: boolean; // may approve permits to work. Off by default.
};

type Raw = { id: string; name: string; role: string | null; mobile: string | null; email: string | null; active: boolean; can_sign_in: boolean; has_pin: boolean; crew: boolean; time_off: boolean; hs_issue: boolean; permit_approve: boolean };

function toRow(r: Raw): PersonRow {
  return {
    id: Number(r.id),
    name: r.name,
    role: r.role ?? "",
    mobile: r.mobile ?? "",
    email: r.email ?? "",
    active: r.active,
    canSignIn: r.can_sign_in,
    hasPin: r.has_pin,
    crew: r.crew,
    timeOff: r.time_off,
    hsIssue: r.hs_issue,
    permitApprove: r.permit_approve,
  };
}

export async function listPeople(): Promise<PersonRow[]> {
  const sql = await readDb();
  const rows = await sql<Raw[]>`
    select id, name, role, mobile, email, active, can_sign_in, (pin_hash is not null or legacy_pin_hash is not null) as has_pin,
           'crew' = any(lists) as crew, 'time_off' = any(lists) as time_off, 'hs_issue' = any(lists) as hs_issue, 'permit_approve' = any(lists) as permit_approve
    from people order by active desc, lower(name)`;
  return rows.map(toRow);
}

export async function loadPerson(id: number): Promise<PersonRow | null> {
  const sql = await readDb();
  const [r] = await sql<Raw[]>`
    select id, name, role, mobile, email, active, can_sign_in, (pin_hash is not null or legacy_pin_hash is not null) as has_pin,
           'crew' = any(lists) as crew, 'time_off' = any(lists) as time_off, 'hs_issue' = any(lists) as hs_issue, 'permit_approve' = any(lists) as permit_approve
    from people where id = ${id}`;
  return r ? toRow(r) : null;
}

// Who may see the Team page's Time off tab, including its notes and files (it holds sick notes):
// people with the Time off tick ('time_off' in people.lists). Nobody is ticked by default.
export async function canSeeTimeOff(personId: number): Promise<boolean> {
  const sql = await readDb();
  const [r] = await sql<{ ok: boolean }[]>`select active and 'time_off' = any(lists) as ok from people where id = ${personId}`;
  return !!r?.ok;
}

// Who may issue the H&S policy statement and the H&S manual: people with the "Issue H&S policy" tick
// ('hs_issue' in people.lists). Nobody is ticked by default.
export async function canIssuePolicy(personId: number): Promise<boolean> {
  const sql = await readDb();
  const [r] = await sql<{ ok: boolean }[]>`select active and 'hs_issue' = any(lists) as ok from people where id = ${personId}`;
  return !!r?.ok;
}

// Who may approve permits to work: people with the "Can approve permits" tick ('permit_approve' in
// people.lists). Nobody is ticked by default.
export async function canApprovePermits(personId: number): Promise<boolean> {
  const sql = await readDb();
  const [r] = await sql<{ ok: boolean }[]>`select active and 'permit_approve' = any(lists) as ok from people where id = ${personId}`;
  return !!r?.ok;
}
