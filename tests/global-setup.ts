import { liveTestRefusal } from "./test-database";

// Runs once before any test file: the whole run stops if the database address is the live one.
export default function refuseLive() {
  const refused = liveTestRefusal(process.env);
  if (!refused) return;
  console.error(`\n${refused}\n`);
  process.exit(1);
}
