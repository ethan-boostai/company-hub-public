// Pages for testing the build (Settings > Shared parts) exist on previews and local machines only,
// never on the live site.
export function isLiveSite(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL === "1" && env.VERCEL_ENV === "production";
}
