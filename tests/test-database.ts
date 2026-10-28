// Which database the tests may use. Tests must never touch the live database: they only get a
// database if it is local (127.0.0.1 / localhost) or the dev database named in TEST_DEV_DATABASE_REF,
// and never the live project. Anything else is removed from the environment, so database tests skip.
export const LIVE_PROJECT_REF = "chvyskcfjmxxprxoczon";

export function isSafeTestDatabase(url: string | undefined, devRef = process.env.TEST_DEV_DATABASE_REF): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (url.includes(LIVE_PROJECT_REF)) return false;
  if (["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname)) return true;
  return !!devRef && devRef !== LIVE_PROJECT_REF && /^[a-z0-9]{20}$/.test(devRef) && url.includes(devRef);
}

export function chooseTestDatabase(env: Record<string, string | undefined>): string | null {
  const wanted = env.TEST_DATABASE_URL || env.DATABASE_URL;
  return isSafeTestDatabase(wanted, env.TEST_DEV_DATABASE_REF) ? wanted! : null;
}
