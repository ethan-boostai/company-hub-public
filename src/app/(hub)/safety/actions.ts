"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { uploadBytes } from "@/lib/files/server-upload";
import { readFileBytes } from "@/lib/files/read-bytes";
import { SharePointError, UNREACHABLE } from "@/lib/files/sharepoint";
import { ukToday } from "../_registers/dates";
import { forLog, FormValues } from "../_registers/form-values";
import { contentHash, hazardQuery, loadHazards, loadSubstances, substanceQuery, type HazardData, type SubstanceData } from "./data";
import { buildPack } from "./pack";
import {
  CONTROL_CODES, GHS, HAZARD_STATUSES, missingForAssessed, packFileName, PPE, ramsKey, ROUTES, SUBSTANCE_STATUSES, WHO,
  type HazardStatus, type SubstanceStatus,
} from "./rules";

const GONE = { ok: false as const, message: "That record no longer exists. Refresh the page." };
class Missing extends Error {}
const invalid = (fieldErrors: Record<string, string>, message = "Check the highlighted fields."): ActionResult<never> => ({ ok: false, message, fieldErrors });
const values = <T extends { value: string }>(list: readonly T[]) => list.map((o) => o.value);

// Ticked boxes: only known values, each once.
function ticks(form: FormData, name: string, allowed: readonly string[]): string[] {
  const set = new Set(form.getAll(name).map(String));
  return allowed.filter((v) => set.has(v));
}

function scale(f: FormValues, name: string): number | null {
  return f.int(name, { min: 1, max: 5 });
}

/* ---------- Hazards ---------- */

export type HazardSaved = { all: HazardData; id: number | null };
const hazardsDone = async (id: number | null): Promise<ActionResult<HazardSaved>> => ({ ok: true, message: "Saved.", data: { all: await loadHazards(db()), id } });

const HAZARD_FIELDS = ["hazard", "activity", "harm", "likelihood", "consequence", "controls", "control_codes", "residual_likelihood", "residual_consequence",
  "owner_id", "plant_categories", "source", "status", "last_reviewed_on", "review_on", "notes"];

export async function saveHazard(form: FormData): Promise<ActionResult<HazardSaved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const v = {
    hazard: f.required("hazard", "Enter the hazard.", 200),
    activity: f.text("activity", 120),
    harm: f.text("harm", 2000),
    likelihood: scale(f, "likelihood"),
    consequence: scale(f, "consequence"),
    controls: f.text("controls", 6000),
    control_codes: ticks(form, "control_codes", values(CONTROL_CODES)),
    residual_likelihood: scale(f, "residual_likelihood"),
    residual_consequence: scale(f, "residual_consequence"),
    owner_id: f.id("owner_id"),
    plant_categories: Array.from(new Set(form.getAll("plant_categories").map((x) => String(x).trim()).filter(Boolean))).slice(0, 40),
    source: f.text("source", 120),
    status: f.oneOf<HazardStatus>("status", values(HAZARD_STATUSES) as HazardStatus[], "active"),
    last_reviewed_on: f.date("last_reviewed_on"),
    review_on: f.date("review_on"),
    notes: f.text("notes", 4000),
  };
  if (!f.ok) return invalid(f.errors);

  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const rowId = await db().begin(async (tx) => {
        if (id) {
          const [before] = await tx`select ${tx(HAZARD_FIELDS)} from hazards where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update hazards set ${tx(v as Record<string, unknown>)}, updated_at = now(), updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v, HAZARD_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "hazards", rowId: id, action: "update", changes });
          return id;
        }
        // A RAMS key no other hazard uses (the name, then _2, _3 ...).
        const base = ramsKey(v.hazard);
        const taken = new Set((await tx<{ k: string }[]>`select rams_key as k from hazards where rams_key like ${base + "%"}`).map((r) => r.k));
        let key = base;
        for (let i = 2; taken.has(key); i++) key = `${base.slice(0, 55)}_${i}`;
        const [r] = await tx<{ id: string }[]>`insert into hazards ${tx({ ...v, rams_key: key, source: v.source ?? "Library", created_by: person.name } as Record<string, unknown>)} returning id`;
        const newId = Number(r.id);
        await logActivity(tx, { person: person.name, table: "hazards", rowId: newId, action: "create", changes: diff(null, v, HAZARD_FIELDS) });
        return newId;
      });
      return hazardsDone(rowId);
    } catch (e) {
      if (e instanceof Missing) return GONE;
      const code = (e as { code?: string }).code;
      if (code === "23505") return invalid({ hazard: "There's already a hazard with that name." });
      if (code === "23503") return invalid({ owner_id: "That person is no longer on the team. Choose another." });
      throw e;
    }
  });
}

export async function setHazardStatus(id: number, status: HazardStatus, requestKey: string): Promise<ActionResult<HazardSaved>> {
  if (!values(HAZARD_STATUSES).includes(status)) return { ok: false, message: "Unknown status." };
  return guarded(requestKey, async (person) => {
    const found = await db().begin(async (tx) => {
      const [before] = await tx<{ status: string }[]>`select status from hazards where id = ${id} for update`;
      if (!before) return false;
      if (before.status !== status) {
        await tx`update hazards set status = ${status}, updated_at = now(), updated_by = ${person.name} where id = ${id}`;
        await logActivity(tx, { person: person.name, table: "hazards", rowId: id, action: "update", changes: { status: [before.status, status] } });
      }
      return true;
    });
    return found ? hazardsDone(id) : GONE;
  });
}

export async function deleteHazard(id: number, requestKey: string): Promise<ActionResult<HazardSaved>> {
  return guarded(requestKey, async (person) => {
    const found = await db().begin(async (tx) => {
      const [h] = await hazardQuery(tx, id);
      if (!h) return false;
      await tx`delete from hazards where id = ${id}`;
      await logActivity(tx, { person: person.name, table: "hazards", rowId: id, action: "delete", changes: { hazard: [h.hazard, null], rams_key: [h.ramsKey, null] } });
      return true;
    });
    return found ? hazardsDone(null) : GONE;
  });
}

/* ---------- CoSHH ---------- */

export type SubstanceSaved = { all: SubstanceData; id: number | null; note?: string };
const substancesDone = async (id: number | null, note?: string, message = "Saved."): Promise<ActionResult<SubstanceSaved>> =>
  ({ ok: true, message, data: { all: await loadSubstances(db()), id, note } });

const SUBSTANCE_FIELDS = ["product", "supplier_id", "use_for", "location", "quantity", "ghs", "ingredients", "exposure", "who_exposed", "frequency", "duration",
  "controls", "storage", "spills_disposal", "ppe", "ppe_other", "assessed_by_id", "assessed_on", "review_on", "sds_date", "status", "notes"];

// Makes a new CoSHH pack when the substance is Assessed and its assessment content has changed since
// the last pack (or there isn't one). The version goes up only when a pack is made. Returns a note
// for the office when it couldn't be made (the record itself is already saved).
async function makePackIfNeeded(id: number, by: string): Promise<string | undefined> {
  const sql = db();
  const [s] = await substanceQuery(sql, id);
  if (!s || s.status !== "assessed" || s.packCurrent) return undefined;
  const version = s.version + 1;
  const today = ukToday();
  try {
    const sds = s.sdsFileId ? await readFileBytes(sql, s.sdsFileId) : null;
    const bytes = await buildPack(s, version, today, sds);
    const [{ folder }] = await sql<{ folder: string | null }[]>`select coshh_pack_folder(${id}) as folder`;
    if (!folder) return "The CoSHH pack wasn't made: the substance no longer exists.";
    const saved = await uploadBytes({
      folder, name: packFileName(s.product, version, today), bytes, mime: "application/pdf",
      entityTable: "substances", entityId: id, role: "coshh-pack", createdBy: by,
    });
    // Only if nobody else made a pack in the meantime (then theirs is the current one).
    await sql.begin(async (tx) => {
      const r = await tx`update substances set version = ${version}, pack_file_id = ${saved.id}, pack_content_hash = ${contentHash(s)}, pack_made_on = ${today}
                         where id = ${id} and version = ${s.version} returning id`;
      if (!r.length) return false;
      if (s.packFileId) await tx`update files set superseded_by = ${saved.id} where id = ${s.packFileId}`;
      await logActivity(tx, { person: by, table: "substances", rowId: id, action: "update", changes: { version: [s.version, version], pack: [s.packFileName || null, saved.name] } });
      return true;
    });
    return undefined;
  } catch (e) {
    const msg = e instanceof SharePointError ? e.message : UNREACHABLE;
    if (!(e instanceof SharePointError)) console.error("CoSHH pack failed", e);
    return `Saved, but the CoSHH pack wasn't made (${msg}). Save again to try once more.`;
  }
}

export async function saveSubstance(form: FormData): Promise<ActionResult<SubstanceSaved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const exposure = Object.fromEntries(
    ROUTES.map((r) => [r.value, { effect: f.text(`exp_${r.value}_effect`, 1000) ?? "", control: f.text(`exp_${r.value}_control`, 1000) ?? "", firstAid: f.text(`exp_${r.value}_first_aid`, 1000) ?? "" }]),
  );
  const asked = f.oneOf<SubstanceStatus>("status", values(SUBSTANCE_STATUSES) as SubstanceStatus[], "draft");
  const v = {
    product: f.required("product", "Enter the product name.", 200),
    supplier_id: f.id("supplier_id"),
    use_for: f.text("use_for", 500),
    location: f.text("location", 200),
    quantity: f.text("quantity", 100),
    ghs: ticks(form, "ghs", values(GHS)),
    ingredients: f.text("ingredients", 4000),
    exposure,
    who_exposed: ticks(form, "who_exposed", values(WHO)),
    frequency: f.text("frequency", 200),
    duration: f.text("duration", 200),
    controls: f.text("controls", 6000),
    storage: f.text("storage", 4000),
    spills_disposal: f.text("spills_disposal", 4000),
    ppe: ticks(form, "ppe", values(PPE)),
    ppe_other: f.text("ppe_other", 500),
    assessed_by_id: f.id("assessed_by_id"),
    assessed_on: f.date("assessed_on"),
    review_on: f.date("review_on"),
    sds_date: f.date("sds_date"),
    status: asked,
    notes: f.text("notes", 4000),
  };
  if (!f.ok) return invalid(f.errors);

  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    let note: string | undefined;
    try {
      const rowId = await db().begin(async (tx) => {
        let before: Record<string, unknown> | undefined;
        if (id) {
          [before] = await tx`select ${tx(SUBSTANCE_FIELDS)}, sds_file_id from substances where id = ${id} for update`;
          if (!before) throw new Missing();
        }
        const sdsFileId = before?.sds_file_id == null ? null : Number(before.sds_file_id);
        // Assessed needs everything listed in missingForAssessed; otherwise it stays a Draft.
        if (v.status === "assessed") {
          const missing = missingForAssessed({ supplierId: v.supplier_id, useFor: v.use_for ?? "", controls: v.controls ?? "", assessedById: v.assessed_by_id, assessedOn: v.assessed_on, reviewOn: v.review_on, sdsFileId });
          if (missing.length) {
            v.status = "draft";
            note = `Saved as a Draft. To mark it Assessed it still needs: ${missing.join(", ")}.`;
          }
        }
        const row = { ...v, exposure: tx.json(v.exposure) };
        if (id && before) {
          delete before.sds_file_id;
          await tx`update substances set ${tx(row as Record<string, unknown>)}, updated_at = now(), updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v as Record<string, unknown>, SUBSTANCE_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "substances", rowId: id, action: "update", changes });
          return id;
        }
        const [r] = await tx<{ id: string }[]>`insert into substances ${tx({ ...row, created_by: person.name } as Record<string, unknown>)} returning id`;
        const newId = Number(r.id);
        await logActivity(tx, { person: person.name, table: "substances", rowId: newId, action: "create", changes: diff(null, v as Record<string, unknown>, SUBSTANCE_FIELDS) });
        return newId;
      });
      const packNote = await makePackIfNeeded(rowId, person.name);
      return substancesDone(rowId, packNote ?? note, packNote ?? note ?? "Saved.");
    } catch (e) {
      if (e instanceof Missing) return GONE;
      const code = (e as { code?: string }).code;
      if (code === "23505") return invalid({ product: "That product from that supplier is already in the CoSHH register." });
      if (code === "23503") return { ok: false, message: "A person or supplier you chose no longer exists. Refresh the page." };
      throw e;
    }
  });
}

// A new safety data sheet was uploaded to the substance: it becomes the SDS (the old one stays in
// SharePoint, marked replaced). A new SDS is an assessment change, so an Assessed substance gets a new pack.
export async function setSdsFile(substanceId: number, fileId: number, requestKey: string): Promise<ActionResult<SubstanceSaved>> {
  return guarded(requestKey, async (person) => {
    const ok = await db().begin(async (tx) => {
      const [s] = await tx<{ sds_file_id: string | null }[]>`select sds_file_id from substances where id = ${substanceId} for update`;
      if (!s) return false;
      const [file] = await tx<{ name: string }[]>`select name from files where id = ${fileId} and entity_table = 'substances' and entity_id = ${substanceId}`;
      if (!file) return false;
      await tx`update substances set sds_file_id = ${fileId}, updated_at = now(), updated_by = ${person.name} where id = ${substanceId}`;
      if (s.sds_file_id && Number(s.sds_file_id) !== fileId) await tx`update files set superseded_by = ${fileId} where id = ${s.sds_file_id}`;
      await logActivity(tx, { person: person.name, table: "substances", rowId: substanceId, action: "update", changes: { sds: [s.sds_file_id ? Number(s.sds_file_id) : null, file.name] } });
      return true;
    });
    if (!ok) return GONE;
    const note = await makePackIfNeeded(substanceId, person.name);
    return substancesDone(substanceId, note, note ?? "Safety data sheet added.");
  });
}

export async function deleteSubstance(id: number, requestKey: string): Promise<ActionResult<SubstanceSaved>> {
  return guarded(requestKey, async (person) => {
    const found = await db().begin(async (tx) => {
      const [s] = await tx<{ product: string }[]>`select product from substances where id = ${id} for update`;
      if (!s) return false;
      await tx`delete from substances where id = ${id}`;
      await logActivity(tx, { person: person.name, table: "substances", rowId: id, action: "delete", changes: { product: [s.product, null] } });
      return true;
    });
    return found ? substancesDone(null) : GONE;
  });
}

// "+ Add new…" on the supplier dropdown: a supplier with just a name (the rest is filled in on
// Subcontractors and suppliers).
export async function addSupplier(name: string, requestKey: string): Promise<ActionResult<{ id: number; name: string }>> {
  const n = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!n) return { ok: false, message: "Enter the supplier's name." };
  if (n.length > 200) return { ok: false, message: "Keep the name under 200 characters." };
  return guarded(requestKey, async (person) => {
    const sql = db();
    const [found] = await sql<{ id: string; name: string }[]>`select id, name from suppliers where lower(name) = lower(${n})`;
    if (found) return { ok: true, data: { id: Number(found.id), name: found.name } };
    return sql.begin(async (tx) => {
      const [r] = await tx<{ id: string }[]>`insert into suppliers (name, created_by) values (${n}, ${person.name}) returning id`;
      await logActivity(tx, { person: person.name, table: "suppliers", rowId: Number(r.id), action: "create", changes: { name: [null, n] } });
      return { ok: true, data: { id: Number(r.id), name: n } };
    });
  });
}
