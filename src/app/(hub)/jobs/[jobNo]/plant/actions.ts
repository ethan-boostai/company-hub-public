"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { forLog, FormValues } from "../../../_registers/form-values";
import { parseLocKey } from "../../../equipment/rules";
import { bookPlant, PlantRefused, returnPlant } from "../../../_site/plant";
import { loadJobPlant, type PlantData } from "./data";

const GONE = { ok: false as const, message: "That booking no longer exists. Refresh the page." };
const LOCKED = { ok: false as const, message: "Plant unlocks after approval. This job is still at Estimate." };

async function jobOpen(jobId: number): Promise<"ok" | "gone" | "estimate"> {
  const [j] = await db()<{ stage: string }[]>`select stage from jobs where id = ${jobId}`;
  if (!j) return "gone";
  return j.stage === "estimate" ? "estimate" : "ok";
}

function refused(e: unknown): ActionResult<PlantData> {
  if (e instanceof PlantRefused) return { ok: false, message: e.message };
  if ((e as { code?: string }).code === "23505") return { ok: false, message: "Some of that equipment has just been booked out by someone else. Refresh and try again." };
  throw e;
}

// Book one or more items out to this job, with whoever takes them.
export async function bookJobPlant(form: FormData): Promise<ActionResult<PlantData>> {
  const f = new FormValues(form);
  const jobId = f.id("job_id");
  const to = parseLocKey(f.text("out_with", 100));
  if (!to || to.place) f.errors.out_with = "Choose who has it: a van or a person.";
  const dueBack = f.date("due_back");
  const notes = f.text("notes", 2000);
  const ids = form.getAll("asset_id").map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 200);
  if (!jobId) return { ok: false, message: "Unknown job." };
  if (!ids.length) return { ok: false, message: "Tick at least one item to book out.", fieldErrors: f.errors };
  if (!f.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: f.errors };
  return guarded<PlantData>(form.get(REQUEST_KEY_FIELD), async (person) => {
    const state = await jobOpen(jobId);
    if (state === "gone") return { ok: false, message: "That job no longer exists." };
    if (state === "estimate") return LOCKED;
    try {
      await db().begin((tx) => bookPlant(tx, { jobId, assetIds: ids, to: to!, dueBack, notes, by: person.name, source: "job" }));
      return { ok: true, message: ids.length === 1 ? "Booked out." : `${ids.length} items booked out.`, data: await loadJobPlant(jobId, db()) };
    } catch (e) {
      return refused(e);
    }
  });
}

// Return a booked item (to the yard by default).
export async function returnJobPlant(form: FormData): Promise<ActionResult<PlantData>> {
  const f = new FormValues(form);
  const jobId = f.id("job_id");
  const bookingId = f.id("id");
  const to = parseLocKey(f.text("return_to", 100));
  if (!to) f.errors.return_to = "Choose where it's going back to.";
  if (!jobId || !bookingId) return GONE;
  if (!f.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: f.errors };
  return guarded<PlantData>(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      await db().begin((tx) => returnPlant(tx, { bookingId, to: to!, by: person.name, jobId }));
      return { ok: true, message: "Returned.", data: await loadJobPlant(jobId, db()) };
    } catch (e) {
      return refused(e);
    }
  });
}

// Change a booking's due back date or notes.
export async function saveJobPlant(form: FormData): Promise<ActionResult<PlantData>> {
  const f = new FormValues(form);
  const jobId = f.id("job_id");
  const id = f.id("id");
  const v = { due_back: f.date("due_back"), notes: f.text("notes", 2000) };
  if (!jobId || !id) return GONE;
  if (!f.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: f.errors };
  return guarded<PlantData>(form.get(REQUEST_KEY_FIELD), async (person) => {
    const found = await db().begin(async (tx) => {
      const [before] = await tx`select due_back, notes from job_plant where id = ${id} and job_id = ${jobId} for update`;
      if (!before) return false;
      await tx`update job_plant set ${tx(v)}, updated_by = ${person.name} where id = ${id}`;
      const changes = diff(forLog(before), v, ["due_back", "notes"]);
      if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "job_plant", rowId: id, action: "update", changes });
      return true;
    });
    if (!found) return GONE;
    return { ok: true, message: "Saved.", data: await loadJobPlant(jobId, db()) };
  });
}

// Removes a booking made by mistake. The item stays where it is now.
export async function deleteJobPlant(jobId: number, id: number, requestKey: string): Promise<ActionResult<PlantData>> {
  if (!Number.isInteger(jobId) || !Number.isInteger(id) || id <= 0) return GONE;
  return guarded<PlantData>(requestKey, async (person) => {
    const found = await db().begin(async (tx) => {
      const [before] = await tx`select asset_name, asset_tag, out_with_label, booked_at, returned_at from job_plant where id = ${id} and job_id = ${jobId} for update`;
      if (!before) return false;
      await tx`delete from job_plant where id = ${id}`;
      const snapshot = Object.fromEntries(Object.entries(forLog(before)).map(([k, val]) => [k, [val, null] as [unknown, unknown]]));
      await logActivity(tx, { person: person.name, table: "job_plant", rowId: id, action: "delete", changes: snapshot });
      return true;
    });
    if (!found) return GONE;
    return { ok: true, message: "Booking removed.", data: await loadJobPlant(jobId, db()) };
  });
}
