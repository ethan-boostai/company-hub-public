import "server-only";
import { isIsoDate } from "./dates";

// Reads typed values from a submitted form. Each reader records a field error instead of throwing,
// so the form can show every problem at once.
export class FormValues {
  readonly errors: Record<string, string> = {};
  constructor(private form: FormData) {}

  text(name: string, max = 2000): string | null {
    const v = this.form.get(name);
    const s = typeof v === "string" ? v.trim() : "";
    if (s.length > max) this.errors[name] = `Keep this under ${max} characters.`;
    return s || null;
  }

  required(name: string, message: string, max = 200): string {
    const s = this.text(name, max);
    if (!s) this.errors[name] = message;
    return s ?? "";
  }

  date(name: string): string | null {
    const s = this.text(name, 20);
    if (!s) return null;
    if (!isIsoDate(s)) {
      this.errors[name] = "Enter a valid date.";
      return null;
    }
    return s;
  }

  int(name: string, { min = 0, max = 10_000_000 } = {}): number | null {
    const s = this.text(name, 20)?.replace(/[,\s]/g, "");
    if (!s) return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n < min || n > max) {
      this.errors[name] = "Enter a whole number.";
      return null;
    }
    return n;
  }

  money(name: string): string | null {
    const s = this.text(name, 20)?.replace(/[£,\s]/g, "");
    if (!s) return null;
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) {
      this.errors[name] = "Enter an amount in pounds, e.g. 125.50.";
      return null;
    }
    return Number(s).toFixed(2);
  }

  bool(name: string): boolean {
    const v = this.form.get(name);
    return v === "on" || v === "true" || v === "1";
  }

  oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
    const s = this.text(name, 40);
    if (!s) return fallback;
    if (!(allowed as readonly string[]).includes(s)) {
      this.errors[name] = "Choose one of the options.";
      return fallback;
    }
    return s as T;
  }

  id(name: string): number | null {
    const n = Number(this.text(name, 20));
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  get ok(): boolean {
    return Object.keys(this.errors).length === 0;
  }
}

// Postgres returns numeric as a string and date as a Date (or string, depending on the driver
// settings); these turn row values into what the screens use.
export function isoDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(v);
  return String(v).slice(0, 10);
}

export function isoTime(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}
