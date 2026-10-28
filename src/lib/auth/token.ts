import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "cbs_session";
export const SESSION_DAYS = 30;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
