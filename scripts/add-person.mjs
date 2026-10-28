// Creates (or updates) one person who can sign in, with a 4-digit PIN. Used to get the first
// office user into a new database; after that, people are managed on the People page.
// Usage: DATABASE_URL=postgres://... node scripts/add-person.mjs "Full Name" 1234 [role]
import bcrypt from "bcryptjs";
import postgres from "postgres";

const [name, pin, role] = process.argv.slice(2);
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
if (!name || !/^\d{4}$/.test(pin || "")) {
  console.error('Usage: node scripts/add-person.mjs "Full Name" 1234 [role]');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} });
try {
  const hash = await bcrypt.hash(pin, 10);
  const [row] = await sql`
    insert into people (name, role, can_sign_in, pin_hash, pin_set_at, created_by)
    values (${name.trim()}, ${role || null}, true, ${hash}, now(), 'setup script')
    on conflict ((lower(name))) do update set can_sign_in = true, active = true, pin_hash = excluded.pin_hash,
      pin_set_at = now(), legacy_pin_hash = null, failed_pin_count = 0, locked_until = null, updated_by = 'setup script'
    returning id, name`;
  await sql`insert into activity_log (person_name, table_name, row_id, action, changes)
            values ('setup script', 'people', ${row.id}, 'update', ${sql.json({ pin: ["(hidden)", "(changed)"] })})`;
  console.log(`${row.name} can now sign in.`);
} finally {
  await sql.end();
}
