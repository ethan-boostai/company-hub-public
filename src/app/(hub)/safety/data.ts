import "server-only";
import { createHash } from "node:crypto";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { getOptions } from "@/lib/select-options";
import { isoDate } from "../_registers/form-values";
import { mergeOptions } from "../subcontractors/rules";
import { ASSET_CATEGORY_LIST } from "../equipment/rules";
import { ACTIVITY_LIST, contentKey, type AssessmentContent, DEFAULT_ACTIVITIES, readExposure, type Exposure, type HazardStatus, type HazardType, type SubstanceStatus } from "./rules";

export type Pick = { id: number; name: string };

export type HazardRow = {
  id: number;
  hazard: string;
  hazardType: HazardType;
  activity: string;
  harm: string;
  likelihood: number | null;
  consequence: number | null;
  riskRating: string | null;
  controls: string;
  controlCodes: string[];
  residualLikelihood: number | null;
  residualConsequence: number | null;
  residualRisk: string | null;
  ownerId: number | null;
  ownerName: string;
  plantCategories: string[];
  ramsKey: string;
  source: string;
  status: HazardStatus;
  lastReviewedOn: string | null;
  reviewOn: string | null;
  notes: string;
};

export type HazardData = { hazards: HazardRow[]; people: Pick[]; activities: string[]; categories: string[] };

type Sql = postgres.Sql | postgres.TransactionSql;

// Fingerprint of the assessment content a pack was made from (see contentKey in rules.ts).
export function contentHash(c: AssessmentContent): string {
  return createHash("sha256").update(contentKey(c)).digest("hex");
}

const n = (v: unknown) => (v == null ? null : Number(v));

export async function hazardQuery(sql: Sql, id: number | null): Promise<HazardRow[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select h.*, p.name as owner_name from hazards h left join people p on p.id = h.owner_id
    where ${id === null ? sql`true` : sql`h.id = ${id}`}
    order by lower(h.hazard)`;
  return rows.map((r) => ({
    id: Number(r.id),
    hazard: String(r.hazard),
    hazardType: r.hazard_type === "workplace" ? "workplace" : "task",
    activity: (r.activity as string) ?? "",
    harm: (r.harm as string) ?? "",
    likelihood: n(r.likelihood),
    consequence: n(r.consequence),
    riskRating: (r.risk_rating as string) ?? null,
    controls: (r.controls as string) ?? "",
    controlCodes: (r.control_codes as string[]) ?? [],
    residualLikelihood: n(r.residual_likelihood),
    residualConsequence: n(r.residual_consequence),
    residualRisk: (r.residual_risk as string) ?? null,
    ownerId: n(r.owner_id),
    ownerName: (r.owner_name as string) ?? "",
    plantCategories: (r.plant_categories as string[]) ?? [],
    ramsKey: String(r.rams_key),
    source: (r.source as string) ?? "",
    status: r.status as HazardStatus,
    lastReviewedOn: isoDate(r.last_reviewed_on),
    reviewOn: isoDate(r.review_on),
    notes: (r.notes as string) ?? "",
  }));
}

async function people(sql: Sql): Promise<Pick[]> {
  const rows = await sql<{ id: string; name: string }[]>`select id, name from people where active order by lower(name)`;
  return rows.map((r) => ({ id: Number(r.id), name: r.name }));
}

export async function loadHazards(sql?: Sql): Promise<HazardData> {
  const s = sql ?? (await readDb());
  const [hazards, ppl, activities, categories] = await Promise.all([hazardQuery(s, null), people(s), getOptions(ACTIVITY_LIST), getOptions(ASSET_CATEGORY_LIST)]);
  return { hazards, people: ppl, activities: mergeOptions(DEFAULT_ACTIVITIES, activities), categories };
}

export type SubstanceRow = {
  id: number;
  product: string;
  supplierId: number | null;
  supplierName: string;
  useFor: string;
  location: string;
  quantity: string;
  ghs: string[];
  ingredients: string;
  exposure: Exposure;
  whoExposed: string[];
  frequency: string;
  duration: string;
  controls: string;
  storage: string;
  spillsDisposal: string;
  ppe: string[];
  ppeOther: string;
  assessedById: number | null;
  assessedByName: string;
  assessedOn: string | null;
  reviewOn: string | null;
  sdsDate: string | null;
  sdsFileId: number | null;
  sdsFileName: string;
  status: SubstanceStatus;
  version: number;
  packFileId: number | null;
  packFileName: string;
  packMadeOn: string | null;
  // The pack matches the assessment content as it now is.
  packCurrent: boolean;
  notes: string;
};

export type SubstanceData = { substances: SubstanceRow[]; people: Pick[]; suppliers: Pick[] };

export async function substanceQuery(sql: Sql, id: number | null): Promise<SubstanceRow[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select s.*, sp.name as supplier_name, p.name as assessed_by_name, sf.name as sds_name, pf.name as pack_name
    from substances s
    left join suppliers sp on sp.id = s.supplier_id
    left join people p on p.id = s.assessed_by_id
    left join files sf on sf.id = s.sds_file_id
    left join files pf on pf.id = s.pack_file_id
    where ${id === null ? sql`true` : sql`s.id = ${id}`}
    order by lower(s.product)`;
  return rows.map((r) => {
    const row: SubstanceRow = {
      id: Number(r.id),
      product: String(r.product),
      supplierId: n(r.supplier_id),
      supplierName: (r.supplier_name as string) ?? "",
      useFor: (r.use_for as string) ?? "",
      location: (r.location as string) ?? "",
      quantity: (r.quantity as string) ?? "",
      ghs: (r.ghs as string[]) ?? [],
      ingredients: (r.ingredients as string) ?? "",
      exposure: readExposure(r.exposure),
      whoExposed: (r.who_exposed as string[]) ?? [],
      frequency: (r.frequency as string) ?? "",
      duration: (r.duration as string) ?? "",
      controls: (r.controls as string) ?? "",
      storage: (r.storage as string) ?? "",
      spillsDisposal: (r.spills_disposal as string) ?? "",
      ppe: (r.ppe as string[]) ?? [],
      ppeOther: (r.ppe_other as string) ?? "",
      assessedById: n(r.assessed_by_id),
      assessedByName: (r.assessed_by_name as string) ?? "",
      assessedOn: isoDate(r.assessed_on),
      reviewOn: isoDate(r.review_on),
      sdsDate: isoDate(r.sds_date),
      sdsFileId: n(r.sds_file_id),
      sdsFileName: (r.sds_name as string) ?? "",
      status: r.status as SubstanceStatus,
      version: Number(r.version),
      packFileId: n(r.pack_file_id),
      packFileName: (r.pack_name as string) ?? "",
      packMadeOn: isoDate(r.pack_made_on),
      packCurrent: false,
      notes: (r.notes as string) ?? "",
    };
    row.packCurrent = !!row.packFileId && r.pack_content_hash === contentHash(row);
    return row;
  });
}

export async function loadSubstances(sql?: Sql): Promise<SubstanceData> {
  const s = sql ?? (await readDb());
  const [substances, ppl, suppliers] = await Promise.all([
    substanceQuery(s, null),
    people(s),
    s<{ id: string; name: string }[]>`select id, name from suppliers order by lower(name)`,
  ]);
  return { substances, people: ppl, suppliers: suppliers.map((r) => ({ id: Number(r.id), name: r.name })) };
}
