import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_DAYS, hashToken, newToken } from "./token";

export type Person = { id: number; name: string; role: string | null };

const TOUCH_AFTER_MS = 10 * 60 * 1000;

// The signed-in office user for this request, or null. Cached per request.
export const getCurrentPerson = cache(async (): Promise<Person | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sql = db();
  const rows = await sql<{ id: string; name: string; role: string | null; session_id: string; last_seen_at: Date }[]>`
    select p.id, p.name, p.role, s.id as session_id, s.last_seen_at
    from sessions s join people p on p.id = s.person_id
    where s.token_hash = ${hashToken(token)}
      and s.revoked_at is null and s.expires_at > now()
      and p.active and p.can_sign_in`;
  const r = rows[0];
  if (!r) return null;
  if (Date.now() - new Date(r.last_seen_at).getTime() > TOUCH_AFTER_MS) {
    await sql`update sessions set last_seen_at = now() where id = ${r.session_id}`;
  }
  return { id: Number(r.id), name: r.name, role: r.role };
});

export async function requirePerson(): Promise<Person> {
  const person = await getCurrentPerson();
  if (!person) redirect("/sign-in");
  return person;
}

// Only call from a Server Action or Route Handler (sets a cookie).
export async function startSession(personId: number): Promise<void> {
  const token = newToken();
  const device = ((await headers()).get("user-agent") || "").slice(0, 200);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db()`
    insert into sessions (person_id, token_hash, device, expires_at)
    values (${personId}, ${hashToken(token)}, ${device}, ${expires})`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db()`update sessions set revoked_at = now() where token_hash = ${hashToken(token)} and revoked_at is null`;
  }
  store.delete(SESSION_COOKIE);
}
