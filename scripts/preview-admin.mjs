// Preview builds only: creates (or updates) the test office user "Preview Admin" on the dev
// database, with PREVIEW_ADMIN_PIN as the sign-in PIN, so Ethan can sign in to any preview.
// Runs after the migrations in "vercel-build". Never runs on production or against the live database.
// Usage (Vercel build): node scripts/preview-admin.mjs --on-build
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { liveRefusal } from "../src/lib/live-guard.mjs";

export const PREVIEW_ADMIN_NAME = "Preview Admin";

// What to do in this environment: "skip" (with the reason) or "run".
export function previewAdminPlan(env) {
  if (env.VERCEL_ENV !== "preview") return { action: "skip", reason: `not a preview build (VERCEL_ENV=${env.VERCEL_ENV || "unset"})` };
  if (!env.PREVIEW_ADMIN_PIN) return { action: "skip", reason: "PREVIEW_ADMIN_PIN is not set" };
  if (!/^\d{4}$/.test(env.PREVIEW_ADMIN_PIN)) return { action: "fail", reason: "PREVIEW_ADMIN_PIN must be exactly 4 digits" };
  if (!env.DATABASE_URL) return { action: "fail", reason: "DATABASE_URL is not set" };
  const refused = liveRefusal(env.DATABASE_URL, "Preview Admin", { env, neverLive: true });
  if (refused) return { action: "fail", reason: refused };
  return { action: "run" };
}

async function main() {
  const plan = previewAdminPlan(process.env);
  if (plan.action === "skip") {
    console.log(`Preview Admin: skipped (${plan.reason}).`);
    return;
  }
  if (plan.action === "fail") {
    console.error(`Preview Admin: ${plan.reason}.`);
    process.exitCode = 1;
    return;
  }
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const hash = await bcrypt.hash(process.env.PREVIEW_ADMIN_PIN, 10);
    // Each preview build resets the PIN, so changing PREVIEW_ADMIN_PIN takes effect on the next build.
    await sql`
      insert into people (name, role, can_sign_in, pin_hash, pin_set_at, lists, active, notes, created_by)
      values (${PREVIEW_ADMIN_NAME}, 'Office', true, ${hash}, now(), ${["crew"]}, true,
              'Test office user for preview builds (dev database only).', 'preview build')
      on conflict ((lower(name))) do update set
        can_sign_in = true, active = true, pin_hash = excluded.pin_hash, pin_set_at = now(),
        legacy_pin_hash = null, failed_pin_count = 0, locked_until = null, updated_by = 'preview build'`;
    console.log(`Preview Admin: ready (sign in as "${PREVIEW_ADMIN_NAME}" with PREVIEW_ADMIN_PIN).`);
  } catch (e) {
    console.error("Preview Admin failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

if (process.argv.includes("--on-build")) await main();
