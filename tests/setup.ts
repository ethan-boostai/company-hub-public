import { chooseTestDatabase } from "./test-database";

// Runs before every test file. DATABASE_URL is replaced by a safe test database or removed.
const safe = chooseTestDatabase(process.env);
if (safe) {
  process.env.DATABASE_URL = safe;
} else {
  if (process.env.DATABASE_URL || process.env.TEST_DATABASE_URL) {
    console.warn("Database tests skipped: DATABASE_URL is not a local or dev database (tests never use the live one).");
  }
  delete process.env.DATABASE_URL;
}
