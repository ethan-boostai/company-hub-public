"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formText } from "@/lib/actions";
import { checkLegacyPin, checkPin, hashPin, isValidPin, LOCK_MINUTES, MAX_WRONG_PINS } from "@/lib/auth/pin";
import { endSession, startSession } from "@/lib/auth/session";

export type SignInState = { message?: string };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/sign-in") ? next : "/";
}

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const name = formText(form, "name");
  const pin = formText(form, "pin");
  if (!name) return { message: "Pick your name first." };
  if (!isValidPin(pin)) return { message: "Enter your 4-digit PIN." };

  const sql = db();
  const [p] = await sql<
    { id: string; name: string; pin_hash: string | null; legacy_pin_hash: string | null; failed_pin_count: number; locked_until: Date | null }[]
  >`select id, name, pin_hash, legacy_pin_hash, failed_pin_count, locked_until
    from people where lower(name) = lower(${name}) and active and can_sign_in`;
  if (!p) {
    await wait(400);
    return { message: "That name can't sign in to the hub. Ask the office." };
  }
  if (p.locked_until && new Date(p.locked_until) > new Date()) {
    const until = new Date(p.locked_until).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    return { message: `Too many wrong PINs. Try again after ${until}.` };
  }

  let ok = false;
  let upgrade = false;
  if (p.pin_hash) {
    ok = await checkPin(pin, p.pin_hash);
  } else if (p.legacy_pin_hash) {
    ok = checkLegacyPin(p.name, pin, p.legacy_pin_hash, process.env.LEGACY_PIN_SALT || "");
    upgrade = ok;
  } else {
    return { message: "No PIN set yet. Ask the office to set one for you." };
  }

  if (!ok) {
    const count = p.failed_pin_count + 1;
    if (count >= MAX_WRONG_PINS) {
      await sql`update people set failed_pin_count = 0, locked_until = now() + ${LOCK_MINUTES + " minutes"}::interval where id = ${p.id}`;
      await wait(400);
      return { message: `Wrong PIN. Sign-in is locked for ${LOCK_MINUTES} minutes.` };
    }
    await sql`update people set failed_pin_count = ${count} where id = ${p.id}`;
    await wait(400);
    const left = MAX_WRONG_PINS - count;
    return { message: `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left before sign-in is locked.` };
  }

  if (upgrade) {
    // First sign-in after moving from the old hub: re-store the same PIN securely.
    await sql`update people set pin_hash = ${await hashPin(pin)}, legacy_pin_hash = null, pin_set_at = now(),
              failed_pin_count = 0, locked_until = null where id = ${p.id}`;
  } else {
    await sql`update people set failed_pin_count = 0, locked_until = null where id = ${p.id}`;
  }
  await startSession(Number(p.id));
  redirect(safeNext(formText(form, "next")));
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/sign-in");
}
