import { describe, expect, it } from "vitest";
import { readTicket, readToken, signTicket, signToken } from "@/lib/files/ticket";

describe("signed tokens", () => {
  it("round-trips and expires", () => {
    const t = signToken({ table: "vehicle_checks", id: 5, max: 4 }, 15);
    expect(readToken<{ id: number }>(t)).toEqual({ table: "vehicle_checks", id: 5, max: 4 });
    expect(readToken(signToken({ a: 1 }, -1))).toBeNull();
  });
  it("refuses a changed token", () => {
    const t = signToken({ id: 5 }, 15);
    const [, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ p: { id: 6 }, exp: Date.now() + 60_000 })).toString("base64url");
    expect(readToken(`${forged}.${mac}`)).toBeNull();
  });
  it("a token is never accepted as an upload ticket, or the other way round", () => {
    const tok = signToken({ personId: 1, exp: Date.now() + 60_000 }, 15);
    expect(readTicket(tok)).toBeNull();
    const ticket = signTicket({ name: "a", size: 1, mime: "", path: "x/a", entityTable: null, entityId: null, jobId: null, role: null, personId: 1, requestKey: "k", exp: Date.now() + 60_000 });
    expect(readToken(ticket)).toBeNull();
  });
});
