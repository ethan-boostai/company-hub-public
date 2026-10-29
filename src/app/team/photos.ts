import { createHash } from "node:crypto";
import { readToken, signToken } from "@/lib/files/ticket";

// Team app photos: after a report saves, its reply carries a short-lived photo ticket for that one
// record. Each photo is sent with the ticket and a slot number (1 to 4), so a report can never hold
// more than 4 team app photos and a photo sent twice (double tap, lost reply) is saved once.

export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const PHOTO_ROLE = "team_photo";
const TICKET_MINUTES = 30;

// Records a team app report can create, and the words used in photo file names.
export const PHOTO_TABLES: Record<string, string> = {
  vehicle_checks: "Vehicle check",
  vehicle_accidents: "Accident",
  requests: "Request",
  tool_reports: "Tool report",
};

export type PhotoTicket = { table: string; id: number; by: string; key: string };

export function photoTicket(t: PhotoTicket): string {
  return signToken(t, TICKET_MINUTES);
}

export function readPhotoTicket(token: string): PhotoTicket | null {
  const t = readToken<PhotoTicket>(token);
  if (!t || !(t.table in PHOTO_TABLES) || !Number.isInteger(t.id) || t.id <= 0 || typeof t.by !== "string") return null;
  return t;
}

// The one-time key for one photo slot of one report, in the shape the double-save guard expects.
export function slotKey(reportKey: string, slot: number): string {
  const h = createHash("sha256").update(`team-photo:${reportKey.toLowerCase()}:${slot}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// What kind of image the bytes really are (from the first bytes, not the name), or null.
export function sniffImage(b: Uint8Array): { mime: string; ext: string } | null {
  const at = (i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 8 && b[0] === 0x89 && at(1, "PNG")) return { mime: "image/png", ext: "png" };
  if (b.length >= 6 && at(0, "GIF8")) return { mime: "image/gif", ext: "gif" };
  if (b.length >= 12 && at(0, "RIFF") && at(8, "WEBP")) return { mime: "image/webp", ext: "webp" };
  if (b.length >= 12 && at(4, "ftyp")) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (["heic", "heix", "hevc", "heim", "heis"].includes(brand)) return { mime: "image/heic", ext: "heic" };
    if (["mif1", "msf1", "heif"].includes(brand)) return { mime: "image/heif", ext: "heif" };
  }
  return null;
}
