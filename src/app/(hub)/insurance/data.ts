import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { jobTitle } from "@/lib/jobs/stages";
import { isoDate, isoTime } from "../_registers/form-values";
import { mergeOptions } from "../subcontractors/rules";
import {
  CERT_LIST, CLAIM_TYPE_LIST, COVER_LIST, DEFAULT_CERTS, DEFAULT_CLAIM_TYPES, DEFAULT_COVERS, DEFAULT_POLICY_TYPES, POLICY_TYPE_LIST,
  type ClaimStatus, type Direction,
} from "./rules";

export type CoverRow = { cover: string; limit: number | null; excess: number | null };

export type PolicyRow = {
  id: number;
  policyType: string;
  name: string;
  insurer: string;
  policyNo: string;
  startsOn: string | null;
  expiresOn: string | null;
  renewedFromId: number | null;
  renewedById: number | null;   // the next period, once renewed
  covers: CoverRow[];
  notes: string;
};

export type ClaimRow = {
  id: number;
  claimNo: string;
  claimType: string;
  direction: Direction;
  status: ClaimStatus;
  incidentDate: string | null;
  lodgedOn: string | null;
  closedOn: string | null;
  policyId: number | null;
  insurer: string;
  insurerClaimNo: string;
  otherParty: string;
  otherContact: string;
  description: string;
  amountClaimed: number | null;
  excess: number | null;
  amountSettled: number | null;
  vehicleId: number | null;
  accidentId: number | null;
  assetId: number | null;
  incidentRef: string;
  jobNo: string;
  jobId: number | null;   // the job in the hub, when the number matches one
  jobTitle: string;
  site: string;
  client: string;
  nextAction: string;
  nextActionDue: string | null;
  notes: string;
  createdAt: string;
};

export type CertRow = {
  id: number;
  name: string;
  issuer: string;
  reference: string;
  level: string;
  issuedOn: string | null;
  expiresOn: string | null;
  annualCost: number | null;
  contactNotes: string;
  notes: string;
};

// Records a claim can link to, for the pickers.
export type LinkVehicle = { id: number; reg: string; makeModel: string };
export type LinkAccident = { id: number; vehicleId: number; reg: string; occurredAt: string | null };
export type LinkAsset = { id: number; name: string; assetTag: string };

export type InsuranceData = {
  policies: PolicyRow[];
  claims: ClaimRow[];
  certs: CertRow[];
  vehicles: LinkVehicle[];
  accidents: LinkAccident[];
  assets: LinkAsset[];
  policyTypes: string[];
  covers: string[];
  claimTypes: string[];
  certNames: string[];
};

type Sql = postgres.Sql | postgres.TransactionSql;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));
const idOrNull = (v: unknown) => (v == null ? null : Number(v));

/* eslint-disable @typescript-eslint/no-explicit-any */
function toClaim(r: any): ClaimRow {
  return {
    id: Number(r.id), claimNo: r.claim_no, claimType: r.claim_type, direction: r.direction, status: r.status,
    incidentDate: isoDate(r.incident_date), lodgedOn: isoDate(r.lodged_on), closedOn: isoDate(r.closed_on), policyId: idOrNull(r.policy_id),
    insurer: s(r.insurer), insurerClaimNo: s(r.insurer_claim_no), otherParty: s(r.other_party), otherContact: s(r.other_contact),
    description: s(r.description), amountClaimed: n(r.amount_claimed), excess: n(r.excess), amountSettled: n(r.amount_settled),
    vehicleId: idOrNull(r.vehicle_id), accidentId: idOrNull(r.accident_id), assetId: idOrNull(r.asset_id), incidentRef: s(r.incident_ref),
    jobNo: s(r.job_no), jobId: idOrNull(r.job_id), jobTitle: r.job_description ? jobTitle(r.job_description) : "", site: s(r.site), client: s(r.client), nextAction: s(r.next_action), nextActionDue: isoDate(r.next_action_due),
    notes: s(r.notes), createdAt: isoTime(r.created_at) ?? "",
  };
}
function toCert(r: any): CertRow {
  return {
    id: Number(r.id), name: r.name, issuer: s(r.issuer), reference: s(r.reference), level: s(r.level), issuedOn: isoDate(r.issued_on),
    expiresOn: isoDate(r.expires_on), annualCost: n(r.annual_cost), contactNotes: s(r.contact_notes), notes: s(r.notes),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function optionsOf(sql: Sql, list: string): Promise<string[]> {
  const rows = await sql<{ value: string }[]>`select value from select_options where list = ${list} order by sort nulls last, lower(value)`;
  return rows.map((r) => r.value);
}

export async function loadInsurance(given?: Sql): Promise<InsuranceData> {
  const sql = given ?? (await readDb());
  const [policies, covers, claims, certs, vehicles, accidents, assets, types, coverOpts, claimTypes, certNames] = await Promise.all([
    sql`select * from insurance_policies order by lower(policy_type), lower(coalesce(name, '')), starts_on desc nulls last, id desc`,
    sql`select * from insurance_covers order by policy_id, sort, id`,
    sql`select c.*, j.sm8_description as job_description from claims c left join jobs j on j.id = c.job_id order by c.id desc`,
    sql`select * from company_certs order by lower(name), expires_on desc nulls last`,
    sql`select id, reg, make_model from vehicles order by reg`,
    sql`select a.id, a.vehicle_id, a.occurred_at, v.reg from vehicle_accidents a join vehicles v on v.id = a.vehicle_id order by a.occurred_at desc nulls last, a.id desc`,
    sql`select id, name, asset_tag from assets order by lower(name), asset_tag`,
    optionsOf(sql, POLICY_TYPE_LIST),
    optionsOf(sql, COVER_LIST),
    optionsOf(sql, CLAIM_TYPE_LIST),
    optionsOf(sql, CERT_LIST),
  ]);
  const coversBy = new Map<number, CoverRow[]>();
  for (const c of covers) {
    const pid = Number(c.policy_id);
    coversBy.set(pid, [...(coversBy.get(pid) ?? []), { cover: c.cover, limit: n(c.limit_amount), excess: n(c.excess) }]);
  }
  const renewedBy = new Map<number, number>();
  for (const p of policies) if (p.renewed_from_id) renewedBy.set(Number(p.renewed_from_id), Number(p.id));
  return {
    policies: policies.map((p) => ({
      id: Number(p.id), policyType: p.policy_type, name: s(p.name), insurer: s(p.insurer), policyNo: s(p.policy_no),
      startsOn: isoDate(p.starts_on), expiresOn: isoDate(p.expires_on), renewedFromId: idOrNull(p.renewed_from_id),
      renewedById: renewedBy.get(Number(p.id)) ?? null, covers: coversBy.get(Number(p.id)) ?? [], notes: s(p.notes),
    })),
    claims: claims.map(toClaim),
    certs: certs.map(toCert),
    vehicles: vehicles.map((v) => ({ id: Number(v.id), reg: v.reg, makeModel: s(v.make_model) })),
    accidents: accidents.map((a) => ({ id: Number(a.id), vehicleId: Number(a.vehicle_id), reg: a.reg, occurredAt: isoTime(a.occurred_at) })),
    assets: assets.map((a) => ({ id: Number(a.id), name: a.name, assetTag: s(a.asset_tag) })),
    policyTypes: mergeOptions(DEFAULT_POLICY_TYPES, [...types, ...policies.map((p) => p.policy_type)]),
    covers: mergeOptions(DEFAULT_COVERS, [...coverOpts, ...covers.map((c) => c.cover)]),
    claimTypes: mergeOptions(DEFAULT_CLAIM_TYPES, [...claimTypes, ...claims.map((c) => c.claim_type)]),
    certNames: mergeOptions(DEFAULT_CERTS, [...certNames, ...certs.map((c) => c.name)]),
  };
}

// The claims linked to one vehicle, accident or piece of equipment (for the Claims list on
// those registers' drawers).
export type LinkedClaim = { id: number; claimNo: string; claimType: string; status: ClaimStatus; incidentDate: string | null; nextActionDue: string | null };

export async function claimsLinkedTo(sql: Sql, kind: "vehicle" | "accident" | "asset", id: number): Promise<LinkedClaim[]> {
  const col = { vehicle: "vehicle_id", accident: "accident_id", asset: "asset_id" }[kind];
  const rows = await sql`select id, claim_no, claim_type, status, incident_date, next_action_due from claims where ${sql(col)} = ${id} order by id desc`;
  return rows.map((r) => ({
    id: Number(r.id), claimNo: r.claim_no, claimType: r.claim_type, status: r.status, incidentDate: isoDate(r.incident_date), nextActionDue: isoDate(r.next_action_due),
  }));
}
