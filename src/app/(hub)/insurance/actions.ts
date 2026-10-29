"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { getCurrentPerson } from "@/lib/auth/session";
import { ukToday } from "../_registers/dates";
import { forLog, FormValues } from "../_registers/form-values";
import { claimsLinkedTo, loadInsurance, type InsuranceData, type LinkedClaim } from "./data";
import { CLAIM_STATUSES, closedOnFor, DIRECTIONS, type ClaimStatus, type Direction } from "./rules";

// Every save hands back the whole register as it now is and the id of the record to show.
export type Saved = { all: InsuranceData; id: number | null };

type Row = Record<string, unknown>;
const values = <T extends { value: string }>(list: readonly T[]) => list.map((o) => o.value) as T["value"][];
const GONE = { ok: false as const, message: "That record no longer exists. Refresh the page." };
class Missing extends Error {}
class Refused extends Error {}

function invalid(fieldErrors: Record<string, string>, message = "Check the highlighted fields."): ActionResult<never> {
  return { ok: false, message, fieldErrors };
}
const done = async (id: number | null): Promise<ActionResult<Saved>> => ({ ok: true, message: "Saved.", data: { all: await loadInsurance(db()), id } });
function failed(e: unknown): ActionResult<Saved> {
  if (e instanceof Missing) return GONE;
  if (e instanceof Refused) return { ok: false, message: e.message };
  const code = (e as { code?: string }).code;
  if (code === "23503") return { ok: false, message: "A linked record no longer exists. Refresh the page and choose again." };
  throw e;
}

// Pounds: "1,000,000" or "250.50".
function pounds(raw: string): { ok: boolean; value: string | null } {
  const v = raw.replace(/[£,\s]/g, "");
  if (!v) return { ok: true, value: null };
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(v)) return { ok: false, value: null };
  return { ok: true, value: Number(v).toFixed(2) };
}

/* ---------- Policies ---------- */

const POLICY_FIELDS = ["policy_type", "name", "insurer", "policy_no", "starts_on", "expires_on", "notes"];
type Cover = { cover: string; limit_amount: string | null; excess: string | null };
const coversText = (list: Cover[]) => list.map((c) => [c.cover, c.limit_amount && `limit £${c.limit_amount}`, c.excess && `excess £${c.excess}`].filter(Boolean).join(" ")).join("; ");

export async function savePolicy(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const renewedFrom = id ? null : f.id("renewed_from_id");
  const v: Row = {
    policy_type: f.required("policy_type", "Choose the type of policy.", 120),
    name: f.text("name", 120),
    insurer: f.text("insurer", 160),
    policy_no: f.text("policy_no", 80),
    starts_on: f.date("starts_on"),
    expires_on: f.date("expires_on"),
    notes: f.text("notes", 4000),
  };
  if (v.starts_on && v.expires_on && (v.expires_on as string) < (v.starts_on as string)) f.errors.expires_on = "Expires before it starts.";

  // Cover lines: repeated cover / limit / excess fields, blank lines ignored.
  const names = form.getAll("cover_cover").map(String);
  const limits = form.getAll("cover_limit").map(String);
  const excesses = form.getAll("cover_excess").map(String);
  const covers: Cover[] = [];
  names.forEach((name, i) => {
    const cover = name.trim().slice(0, 120);
    const limit = pounds(limits[i] ?? "");
    const excess = pounds(excesses[i] ?? "");
    if (!cover && !limit.value && !excess.value) return;
    if (!cover) f.errors.covers = "Choose the cover on every line that has an amount.";
    if (!limit.ok || !excess.ok) f.errors.covers = "Enter cover amounts in pounds, e.g. 5,000,000 or 250.";
    covers.push({ cover, limit_amount: limit.value, excess: excess.value });
  });
  if (covers.length > 30) f.errors.covers = "Keep it to 30 covers.";
  if (!f.ok) return invalid(f.errors);

  return guarded<Saved>(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const rowId = await db().begin(async (tx) => {
        let pid = id;
        let beforeCovers = "";
        if (id) {
          const [before] = await tx`select ${tx(POLICY_FIELDS)} from insurance_policies where id = ${id} for update`;
          if (!before) throw new Missing();
          const old = await tx<Cover[]>`select cover, limit_amount, excess from insurance_covers where policy_id = ${id} order by sort, id`;
          beforeCovers = coversText(old);
          await tx`update insurance_policies set ${tx(v)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v, POLICY_FIELDS);
          if (coversText(covers) !== beforeCovers) changes.covers = [beforeCovers || null, coversText(covers) || null];
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "insurance_policies", rowId: id, action: "update", changes });
          await tx`delete from insurance_covers where policy_id = ${id}`;
        } else {
          if (renewedFrom) {
            const [prev] = await tx`select id from insurance_policies where id = ${renewedFrom} for update`;
            if (!prev) throw new Missing();
            const [already] = await tx`select id from insurance_policies where renewed_from_id = ${renewedFrom}`;
            if (already) throw new Refused("That policy has already been renewed. Open the latest period to renew it again.");
          }
          const [r] = await tx<{ id: string }[]>`insert into insurance_policies ${tx({ ...v, renewed_from_id: renewedFrom, created_by: person.name })} returning id`;
          pid = Number(r.id);
          const changes = diff(null, v, POLICY_FIELDS);
          if (covers.length) changes.covers = [null, coversText(covers)];
          if (renewedFrom) changes.renewed_from = [null, renewedFrom];
          await logActivity(tx, { person: person.name, table: "insurance_policies", rowId: pid, action: "create", changes });
          if (renewedFrom) {
            await logActivity(tx, { person: person.name, table: "insurance_policies", rowId: renewedFrom, action: "update", changes: { renewed_by: [null, pid] } });
          }
        }
        for (const [i, c] of covers.entries()) {
          await tx`insert into insurance_covers ${tx({ policy_id: pid, cover: c.cover, limit_amount: c.limit_amount, excess: c.excess, sort: i })}`;
        }
        return pid!;
      });
      return done(rowId);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return { ok: false, message: "That policy has already been renewed. Refresh the page." };
      return failed(e);
    }
  });
}

/* ---------- Claims ---------- */

const CLAIM_FIELDS = [
  "claim_type", "direction", "status", "incident_date", "lodged_on", "closed_on", "policy_id", "insurer", "insurer_claim_no", "other_party",
  "other_contact", "description", "amount_claimed", "excess", "amount_settled", "vehicle_id", "accident_id", "asset_id", "incident_ref",
  "job_no", "site", "client", "next_action", "next_action_due", "notes",
];

export async function saveClaim(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const status = f.oneOf<ClaimStatus>("status", values(CLAIM_STATUSES), "open");
  const v: Row = {
    claim_type: f.required("claim_type", "Choose the type of claim.", 120),
    direction: f.oneOf<Direction>("direction", values(DIRECTIONS), "by_us"),
    status,
    incident_date: f.date("incident_date"),
    lodged_on: f.date("lodged_on"),
    closed_on: closedOnFor(status, f.date("closed_on"), ukToday()),
    policy_id: f.id("policy_id"),
    insurer: f.text("insurer", 160),
    insurer_claim_no: f.text("insurer_claim_no", 80),
    other_party: f.text("other_party", 200),
    other_contact: f.text("other_contact", 200),
    description: f.text("description", 4000),
    amount_claimed: f.money("amount_claimed"),
    excess: f.money("excess"),
    amount_settled: f.money("amount_settled"),
    vehicle_id: f.id("vehicle_id"),
    accident_id: f.id("accident_id"),
    asset_id: f.id("asset_id"),
    incident_ref: f.text("incident_ref", 80),
    job_no: f.text("job_no", 40),
    site: f.text("site", 200),
    client: f.text("client", 200),
    next_action: f.text("next_action", 500),
    next_action_due: f.date("next_action_due"),
    notes: f.text("notes", 4000),
  };
  if (v.job_no && !/^[A-Za-z0-9-]{1,40}$/.test(v.job_no as string)) f.errors.job_no = "Enter the ServiceM8 job number, e.g. 12.";
  if (!f.ok) return invalid(f.errors);

  return guarded<Saved>(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const rowId = await db().begin(async (tx) => {
        // An accident belongs to a vehicle: fill the vehicle in, and refuse a different one.
        if (v.accident_id) {
          const [a] = await tx<{ vehicle_id: string }[]>`select vehicle_id from vehicle_accidents where id = ${v.accident_id as number}`;
          if (!a) throw new Missing();
          if (v.vehicle_id && Number(a.vehicle_id) !== v.vehicle_id) throw new Refused("That accident is on a different vehicle. Choose the matching vehicle or accident.");
          v.vehicle_id = Number(a.vehicle_id);
        }
        if (id) {
          const [before] = await tx`select ${tx(CLAIM_FIELDS)} from claims where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update claims set ${tx(v)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v, CLAIM_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "claims", rowId: id, action: "update", changes });
          return id;
        }
        const [r] = await tx<{ id: string; claim_no: string }[]>`insert into claims ${tx({ ...v, created_by: person.name })} returning id, claim_no`;
        await logActivity(tx, { person: person.name, table: "claims", rowId: Number(r.id), action: "create", changes: { claim_no: [null, r.claim_no], ...diff(null, v, CLAIM_FIELDS) } });
        return Number(r.id);
      });
      return done(rowId);
    } catch (e) {
      return failed(e);
    }
  });
}

/* ---------- Accreditations ---------- */

const CERT_FIELDS = ["name", "issuer", "reference", "level", "issued_on", "expires_on", "annual_cost", "contact_notes", "notes"];

export async function saveCert(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const v: Row = {
    name: f.required("name", "Choose the accreditation.", 120),
    issuer: f.text("issuer", 160),
    reference: f.text("reference", 80),
    level: f.text("level", 80),
    issued_on: f.date("issued_on"),
    expires_on: f.date("expires_on"),
    annual_cost: f.money("annual_cost"),
    contact_notes: f.text("contact_notes", 2000),
    notes: f.text("notes", 4000),
  };
  if (v.issued_on && v.expires_on && (v.expires_on as string) < (v.issued_on as string)) f.errors.expires_on = "Expires before it was issued.";
  if (/pass(word)?\s*[:=]|pwd\s*[:=]/i.test(String(v.contact_notes ?? ""))) f.errors.contact_notes = "Don't save passwords here. Keep them in the password manager.";
  if (!f.ok) return invalid(f.errors);

  return guarded<Saved>(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const rowId = await db().begin(async (tx) => {
        if (id) {
          const [before] = await tx`select ${tx(CERT_FIELDS)} from company_certs where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update company_certs set ${tx(v)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v, CERT_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "company_certs", rowId: id, action: "update", changes });
          return id;
        }
        const [r] = await tx<{ id: string }[]>`insert into company_certs ${tx({ ...v, created_by: person.name })} returning id`;
        await logActivity(tx, { person: person.name, table: "company_certs", rowId: Number(r.id), action: "create", changes: diff(null, v, CERT_FIELDS) });
        return Number(r.id);
      });
      return done(rowId);
    } catch (e) {
      return failed(e);
    }
  });
}

/* ---------- Delete ---------- */

const DELETABLE = { insurance_policies: true, claims: true, company_certs: true } as const;
export type Deletable = keyof typeof DELETABLE;

// Deletes a policy period (its covers go with it; claims stay and lose the link), a claim or an
// accreditation. Files stay in SharePoint.
export async function deleteInsuranceRecord(table: Deletable, id: number, requestKey: string): Promise<ActionResult<Saved>> {
  if (!DELETABLE[table] || !Number.isInteger(id) || id <= 0) return { ok: false, message: "Unknown record." };
  return guarded<Saved>(requestKey, async (person) => {
    const gone = await db().begin(async (tx) => {
      const [before] = await tx`select * from ${tx(table)} where id = ${id} for update`;
      if (!before) return true;
      await tx`delete from ${tx(table)} where id = ${id}`;
      const snapshot = Object.fromEntries(
        Object.entries(forLog(before)).filter(([k]) => !["id", "created_at", "updated_at"].includes(k)).map(([k, val]) => [k, [val, null] as [unknown, unknown]]),
      );
      await logActivity(tx, { person: person.name, table, rowId: id, action: "delete", changes: snapshot });
      return false;
    });
    if (gone) return GONE;
    return { ok: true, message: "Deleted.", data: { all: await loadInsurance(db()), id: null } };
  });
}

/* ---------- Claims on other registers ---------- */

// The Claims list on a vehicle, accident or equipment drawer.
export async function listLinkedClaims(kind: "vehicle" | "accident" | "asset", id: number): Promise<ActionResult<LinkedClaim[]>> {
  if (!(await getCurrentPerson())) return { ok: false, message: "You have been signed out. Sign in again." };
  if (!["vehicle", "accident", "asset"].includes(kind) || !Number.isInteger(id) || id <= 0) return { ok: false, message: "Unknown record." };
  return { ok: true, data: await claimsLinkedTo(db(), kind, id) };
}
