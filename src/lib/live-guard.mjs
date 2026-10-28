// Hard block on the live database (Ethan, 28/10/2026). Plain JavaScript so the scripts, the
// Next.js config, the app and the tests all share this one rule.
//
// Anything that connects to a database refuses an address that contains the live project ref,
// unless one of these is true:
// - it is the live site itself: Vercel's production deployment (VERCEL=1, VERCEL_ENV=production);
// - the switch-over flag is set: CBS_LIVE_DATABASE=switch-over (only with Ethan's approval).
// Tests and the local seed never use live, even with the flag.

export const LIVE_PROJECT_REF = "chvyskcfjmxxprxoczon";
export const SWITCH_OVER_FLAG = "CBS_LIVE_DATABASE";
export const SWITCH_OVER_VALUE = "switch-over";

export function pointsAtLive(url) {
  if (!url) return false;
  let text = String(url);
  try {
    text = decodeURIComponent(text);
  } catch {
    // keep the raw text
  }
  return text.toLowerCase().includes(LIVE_PROJECT_REF);
}

export function liveAllowed(env = process.env) {
  return (env.VERCEL === "1" && env.VERCEL_ENV === "production") || env[SWITCH_OVER_FLAG] === SWITCH_OVER_VALUE;
}

// Returns a refusal message, or null when the address may be used.
export function liveRefusal(url, what, { env = process.env, neverLive = false } = {}) {
  if (!pointsAtLive(url)) return null;
  if (!neverLive && liveAllowed(env)) return null;
  return neverLive
    ? `${what} refused: the database address is the live CBS database. ${what} never runs against live. Use the local or dev database.`
    : `${what} refused: the database address is the live CBS database. Use the local or dev database. ` +
        `Only at switch-over, with Ethan's approval, set ${SWITCH_OVER_FLAG}=${SWITCH_OVER_VALUE}.`;
}

export function assertNotLive(url, what, options) {
  const message = liveRefusal(url, what, options);
  if (message) throw new Error(message);
}
