import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

export const PIN_PATTERN = /^\d{4}$/;
export const MAX_WRONG_PINS = 5;
export const LOCK_MINUTES = 15;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export function checkPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

// The old n8n hub stored SHA-256(prefix + "|" + lower-case name + "|" + PIN) as hex.
export function legacyPinHash(name: string, pin: string, prefix: string): string {
  return createHash("sha256").update(`${prefix}|${name.toLowerCase()}|${pin}`, "utf8").digest("hex");
}

export function checkLegacyPin(name: string, pin: string, storedHash: string, prefix: string): boolean {
  if (!prefix || !storedHash) return false;
  return legacyPinHash(name, pin, prefix) === storedHash.toLowerCase();
}
