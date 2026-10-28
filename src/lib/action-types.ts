// Shared by server actions and client forms.
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; message: string; duplicate?: boolean; fieldErrors?: Record<string, string> };

export const REQUEST_KEY_FIELD = "_rk";
