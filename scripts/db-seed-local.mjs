// Local development only: adds fake test people (PIN 1234) and a few dropdown options.
// Refuses to run against anything that is not a local database.
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { liveRefusal } from "../src/lib/live-guard.mjs";

const url = process.env.DATABASE_URL || "";
const refused = liveRefusal(url, "db-seed-local", { neverLive: true });
if (refused) {
  console.error(refused);
  process.exit(1);
}
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("db-seed-local only runs against a local database (127.0.0.1 or localhost).");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const pin = await bcrypt.hash("1234", 10);
const people = [
  { name: "Test Office One", role: "Office", can_sign_in: true },
  { name: "Test Office Two", role: "Office", can_sign_in: true },
  { name: "Test Site Lead", role: "Supervisor", can_sign_in: false },
];

try {
  for (const p of people) {
    await sql`
      insert into people (name, role, can_sign_in, pin_hash, pin_set_at, lists, created_by)
      values (${p.name}, ${p.role}, ${p.can_sign_in}, ${p.can_sign_in ? pin : null},
              ${p.can_sign_in ? sql`now()` : null}, ${["crew"]}, 'seed')
      on conflict ((lower(name))) do nothing`;
  }
  for (const v of ["Office", "Supervisor", "Site Operative", "Labourer"]) {
    await sql`insert into select_options (list, value, created_by) values ('people.role', ${v}, 'seed')
              on conflict (list, lower(value)) do nothing`;
  }
  console.log("seeded local test people (PIN 1234) and role options");
} finally {
  await sql.end();
}
