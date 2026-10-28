// Local development only: adds fake test people (PIN 1234), CBS's ServiceM8 folder list (fake ids
// apart from Maintenance) and test job 10278 from its recorded webhook events.
// Refuses to run against anything that is not a local database.
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import postgres from "postgres";

const url = process.env.DATABASE_URL || "";
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
  const folders = ["Enquiry", "Reactive (Call-Out)", "Estimated", "Approved (Work-Order)", "Part Approved", "Works Completed",
    "Part Invoiced", "On Hold", "Awaiting Client", "SS Rsd Inv QB", "Maintenance "];
  const rows = folders.map((name, i) => ({
    uuid: name.startsWith("Maintenance") ? "01a15ea9-6031-79fe-9531-85247ade10bb" : `local-folder-${i + 1}`, name, active: 1,
  }));
  await sql`select sm8_apply_records('folder', ${sql.json(rows)})`;
  const events = JSON.parse(readFileSync(new URL("../tests/fixtures/sm8-events-10278.json", import.meta.url), "utf8"));
  for (const ev of events.slice(0, 6)) await sql`select sm8_apply_event(${sql.json(ev)})`;
  console.log("seeded local test people (PIN 1234), role options, ServiceM8 folders and test job 10278");
} finally {
  await sql.end();
}
