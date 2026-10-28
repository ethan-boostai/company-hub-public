import { liveRefusal } from "./lib/live-guard.mjs";

// Runs once when the server starts (next dev, next start, and each Vercel server instance).
// The app refuses to start on the live database, except as the live site or at switch-over.
export function register() {
  const refused = liveRefusal(process.env.DATABASE_URL, "Starting the app");
  if (!refused) return;
  console.error(refused);
  if (process.env.NEXT_RUNTIME === "nodejs") process.exit(1);
  throw new Error(refused);
}
