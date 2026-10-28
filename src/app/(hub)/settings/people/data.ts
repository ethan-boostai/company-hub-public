import "server-only";
import { db } from "@/lib/db";

export type PersonRow = {
  id: number;
  name: string;
  role: string;
  mobile: string;
  email: string;
  active: boolean;
  canSignIn: boolean;
  hasPin: boolean;
};

type Raw = { id: string; name: string; role: string | null; mobile: string | null; email: string | null; active: boolean; can_sign_in: boolean; has_pin: boolean };

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
  };
}

export async function listPeople(): Promise<PersonRow[]> {
  const rows = await db()<Raw[]>`
    select id, name, role, mobile, email, active, can_sign_in, (pin_hash is not null or legacy_pin_hash is not null) as has_pin
    from people order by active desc, lower(name)`;
  return rows.map(toRow);
}

export async function loadPerson(id: number): Promise<PersonRow | null> {
  const [r] = await db()<Raw[]>`
    select id, name, role, mobile, email, active, can_sign_in, (pin_hash is not null or legacy_pin_hash is not null) as has_pin
    from people where id = ${id}`;
  return r ? toRow(r) : null;
}
