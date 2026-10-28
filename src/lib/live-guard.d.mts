export const LIVE_PROJECT_REF: string;
export const SWITCH_OVER_FLAG: string;
export const SWITCH_OVER_VALUE: string;
type Options = { env?: Record<string, string | undefined>; neverLive?: boolean };
export function pointsAtLive(url: string | undefined | null): boolean;
export function liveAllowed(env?: Record<string, string | undefined>): boolean;
export function liveRefusal(url: string | undefined | null, what: string, options?: Options): string | null;
export function assertNotLive(url: string | undefined | null, what: string, options?: Options): void;
