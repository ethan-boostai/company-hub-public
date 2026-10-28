import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type UploadTicket = {
  name: string;
  size: number;
  mime: string;
  path: string; // folder + file name, chosen by the server
  entityTable: string | null;
  entityId: number | null;
  jobId: number | null;
  role: string | null;
  personId: number;
  requestKey: string;
  exp: number; // ms since epoch
};

function secret(): string {
  const s = process.env.APP_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET must be set (32+ characters)");
  return "dev-only-secret-not-for-production-use-0000";
}

export function signTicket(t: UploadTicket): string {
  const body = Buffer.from(JSON.stringify(t)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readTicket(token: string): UploadTicket | null {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UploadTicket;
    return t.exp > Date.now() ? t : null;
  } catch {
    return null;
  }
}

// General signed tokens with an expiry (e.g. the team app's 15-minute photo ticket). Signed with a
// different prefix from upload tickets, so neither can be used as the other.
export function signToken<T extends object>(payload: T, minutes: number): string {
  const body = Buffer.from(JSON.stringify({ p: payload, exp: Date.now() + minutes * 60_000 })).toString("base64url");
  const mac = createHmac("sha256", secret()).update(`token:${body}`).digest("base64url");
  return `${body}.${mac}`;
}

export function readToken<T>(token: string): T | null {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", secret()).update(`token:${body}`).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { p: T; exp: number };
    return t.exp > Date.now() ? t.p : null;
  } catch {
    return null;
  }
}
