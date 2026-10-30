"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { SharePointError, UNREACHABLE } from "@/lib/files/sharepoint";
import { forLog, FormValues } from "../../../_registers/form-values";
import { parseLocKey, round3 } from "../../../equipment/rules";
import { vehicleLocationLabel } from "../../../fleet/rules";
import { LoadUpRefused, markLoaded, reportLoadUpProblem, saveLoadUpPdf, type LoadResult } from "../../../_site/load-up";
import { PPE, type LineKind, type Reason, type SheetStatus } from "../../../_site/load-up-rules";
import { UNBOOKABLE_STATUSES } from "../../../_site/rules";
import { loadLoadUp, type LoadUpData } from "./data";

export type Saved = { all: LoadUpData; id: number | null };
const GONE = { ok: false as const, message: "That load-up sheet no longer exists. Refresh the page." };
const KINDS: LineKind[] = ["equipment", "material", "custom_equipment", "custom_material", "buy"];

type LineIn = { kind: LineKind; assetId?: number; materialId?: number; name?: string; unit?: string; qty?: number | string | null; from?: string; buyFrom?: string; buyNote?: string };
type LineRow = {
  kind: LineKind; asset_id: number | null; material_id: number | null; name: string; category: string | null; unit: string | null; qty: number | null;
  from_place: string | null; from_vehicle_id: number | null; buy_from: string | null; buy_note: string | null;
};

const clip = (v: unknown, max: number) => {
  const t = String(v ?? "").trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
};
function qtyOf(v: unknown): number | null | "bad" {
  const t = String(v ?? "").replace(/[,\s]/g, "");
  if (!t) return null;
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(t) || Number(t) <= 0) return "bad";
  return round3(Number(t));
}

async function jobState(jobId: number): Promise<string | null> {
  const [j] = await db()<{ stage: string }[]>`select stage from jobs where id = ${jobId}`;
  if (!j) return "That job no longer exists.";
  return j.stage === "estimate" ? "Load-up sheets unlock after approval. This job is still at Estimate." : null;
}

function failed(e: unknown): ActionResult<Saved> {
  if (e instanceof LoadUpRefused) return { ok: false, message: e.message };
  throw e;
}

// Saves a sheet (new sheets start as Draft). A Ready to load sheet gets a fresh PDF in the job's
// Load-up sheets folder.
export async function saveLoadUp(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const jobId = f.id("job_id");
  const id = f.id("id");
  const sheetDate = f.date("sheet_date");
  if (!sheetDate && !f.errors.sheet_date) f.errors.sheet_date = "Enter the date.";
  const vehicleId = f.id("vehicle_id");
  const dueBack = f.date("due_back");
  if (dueBack && sheetDate && dueBack < sheetDate) f.errors.due_back = "Due back is before the sheet's date.";
  const preparedById = f.id("prepared_by_id");
  const crewIds = [...new Set(form.getAll("crew_id").map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 50);
  const ppe = [...new Set(form.getAll("ppe").map(String).filter((x) => PPE.includes(x)))];
  const notes = f.text("notes", 4000);

  let raw: LineIn[] = [];
  try {
    const parsed = JSON.parse(String(form.get("lines") ?? "[]"));
    if (Array.isArray(parsed)) raw = parsed.filter((l) => l && KINDS.includes(l.kind)).slice(0, 300);
  } catch {
    return { ok: false, message: "The lines couldn't be read. Refresh and try again." };
  }
  const lineErrors: string[] = [];
  for (const l of raw) {
    const q = qtyOf(l.qty);
    if (q === "bad") lineErrors.push(`Check the quantity for ${l.name || "a line"}.`);
    if (l.kind === "material" && !(typeof q === "number")) lineErrors.push(`Enter a quantity for ${l.name || "a material"}.`);
    if (l.kind === "material" && !parseLocKey(l.from, false)) lineErrors.push(`Choose where ${l.name || "a material"} comes from.`);
    if ((l.kind === "custom_equipment" || l.kind === "custom_material" || l.kind === "buy") && !clip(l.name, 200)) lineErrors.push("Every added line needs a name.");
    if (l.kind === "custom_material" && !(typeof q === "number")) lineErrors.push(`Enter a quantity for ${l.name || "a material"}.`);
  }
  if (!jobId) return { ok: false, message: "Unknown job." };
  if (!f.ok || lineErrors.length) return { ok: false, message: lineErrors[0] ?? "Check the highlighted fields.", fieldErrors: f.errors };

  return guarded<Saved>(form.get(REQUEST_KEY_FIELD), async (person) => {
    const locked = await jobState(jobId);
    if (locked) return { ok: false, message: locked };
    let rowId: number;
    let status: SheetStatus;
    try {
      ({ rowId, status } = await db().begin(async (tx) => {
        // Lines, checked against the registers.
        const rows: LineRow[] = [];
        for (const l of raw) {
          const q = qtyOf(l.qty) as number | null;
          if (l.kind === "equipment") {
            const [a] = await tx<{ name: string; asset_tag: string | null; category: string | null; status: string }[]>`
              select name, asset_tag, category, status from assets where id = ${Number(l.assetId) || 0}`;
            if (!a) throw new LoadUpRefused("Some equipment is no longer on the register. Refresh and try again.");
            if (UNBOOKABLE_STATUSES.includes(a.status)) throw new LoadUpRefused(`${a.name} is ${a.status === "lost" ? "lost" : "retired"}. Take it off the sheet.`);
            rows.push({ kind: "equipment", asset_id: Number(l.assetId), material_id: null, name: a.asset_tag ? `${a.asset_tag} ${a.name}` : a.name, category: a.category,
              unit: null, qty: null, from_place: null, from_vehicle_id: null, buy_from: null, buy_note: null });
          } else if (l.kind === "material") {
            const [m] = await tx<{ name: string; unit: string; category: string | null }[]>`select name, unit, category from materials where id = ${Number(l.materialId) || 0}`;
            if (!m) throw new LoadUpRefused("Some material is no longer on the register. Refresh and try again.");
            const from = parseLocKey(l.from, false)!;
            if (from.vehicleId && !(await tx`select 1 from vehicles where id = ${from.vehicleId}`).length) throw new LoadUpRefused(`Where ${m.name} comes from no longer exists.`);
            rows.push({ kind: "material", asset_id: null, material_id: Number(l.materialId), name: m.name, category: m.category, unit: m.unit, qty: q,
              from_place: from.place, from_vehicle_id: from.vehicleId, buy_from: null, buy_note: null });
          } else {
            rows.push({ kind: l.kind, asset_id: null, material_id: null, name: clip(l.name, 200)!, category: null, unit: clip(l.unit, 30), qty: q,
              from_place: null, from_vehicle_id: null, buy_from: l.kind === "buy" ? clip(l.buyFrom, 200) : null, buy_note: l.kind === "buy" ? clip(l.buyNote, 500) : null });
          }
        }
        let vehicleLabel: string | null = null;
        if (vehicleId) {
          const [v] = await tx<{ reg: string; make_model: string | null; driver: string | null }[]>`
            select v.reg, v.make_model, p.name as driver from vehicles v left join people p on p.id = v.assigned_to_id where v.id = ${vehicleId}`;
          if (!v) throw new LoadUpRefused("That van is no longer on the fleet. Choose another.");
          vehicleLabel = vehicleLocationLabel({ reg: v.reg, makeModel: v.make_model ?? "", driver: v.driver ?? "" });
        }
        const v = { sheet_date: sheetDate, vehicle_id: vehicleId, vehicle_label: vehicleLabel, crew_ids: crewIds, prepared_by_id: preparedById, due_back: dueBack, ppe, notes };
        const FIELDS = ["sheet_date", "vehicle_id", "crew_ids", "prepared_by_id", "due_back", "ppe", "notes", "status"];
        let sheetId: number;
        let next: SheetStatus;
        if (id) {
          const [before] = await tx`select ${tx(FIELDS)}, job_id from load_up_sheets where id = ${id} for update`;
          if (!before || Number(before.job_id) !== jobId) throw new LoadUpRefused(GONE.message);
          if (before.status === "loaded") throw new LoadUpRefused("This sheet has been loaded, so it can't be changed.");
          next = before.status;
          if (next === "ready" && !vehicleId) throw new LoadUpRefused("A sheet that's ready to load needs a van.");
          if (next === "ready" && !rows.length) throw new LoadUpRefused("A sheet that's ready to load needs at least one line.");
          await tx`update load_up_sheets set ${tx({ ...v, status: next } as Record<string, unknown>)}, updated_by = ${person.name} where id = ${id}`;
          await tx`delete from load_up_lines where sheet_id = ${id}`;
          const changes = diff(forLog(before), { ...v, status: next }, FIELDS);
          changes.lines = [null, `${rows.length} lines`];
          await logActivity(tx, { person: person.name, table: "load_up_sheets", rowId: id, jobId, action: "update", changes });
          sheetId = id;
        } else {
          next = "draft";
          const [r] = await tx<{ id: string }[]>`insert into load_up_sheets ${tx({ ...v, job_id: jobId, status: next, created_by: person.name } as Record<string, unknown>)} returning id`;
          sheetId = Number(r.id);
          await logActivity(tx, { person: person.name, table: "load_up_sheets", rowId: sheetId, jobId, action: "create", changes: { ...diff(null, { ...v, status: next }, FIELDS), lines: [null, `${rows.length} lines`] } });
        }
        if (rows.length) await tx`insert into load_up_lines ${tx(rows.map((r, i) => ({ ...r, sheet_id: sheetId, sort: i })) as Record<string, unknown>[])}`;
        return { rowId: sheetId, status: next };
      }));
    } catch (e) {
      return failed(e);
    }
    let message = "Saved.";
    if (status === "ready") {
      try {
        await saveLoadUpPdf(db(), rowId, person.name);
      } catch (e) {
        if (!(e instanceof SharePointError)) console.error("Load-up PDF failed", e);
        message += ` The PDF wasn't saved: ${e instanceof SharePointError ? e.message : UNREACHABLE} Use Create PDF to try again.`;
      }
    }
    return { ok: true, message, data: { all: await loadLoadUp(jobId, db()), id: rowId } };
  });
}

// Send to crew (Ready to load: needs a van and at least one line, and makes the PDF) or Back to draft.
export async function setLoadUpStatus(jobId: number, id: number, to: "ready" | "draft", requestKey: string): Promise<ActionResult<Saved>> {
  if (to !== "ready" && to !== "draft") return { ok: false, message: "Unknown status." };
  return guarded<Saved>(requestKey, async (person) => {
    const locked = await jobState(jobId);
    if (locked) return { ok: false, message: locked };
    try {
      await db().begin(async (tx) => {
        const [sh] = await tx<{ job_id: string; status: SheetStatus; vehicle_id: string | null }[]>`
          select job_id, status, vehicle_id from load_up_sheets where id = ${id} for update`;
        if (!sh || Number(sh.job_id) !== jobId) throw new LoadUpRefused(GONE.message);
        if (sh.status === "loaded") throw new LoadUpRefused("This sheet has already been loaded.");
        if (sh.status === to) return;
        if (to === "ready") {
          if (!sh.vehicle_id) throw new LoadUpRefused("Choose the van and save before sending it to the crew.");
          const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from load_up_lines where sheet_id = ${id}`;
          if (!n) throw new LoadUpRefused("Add at least one thing to load and save before sending it to the crew.");
        }
        await tx`update load_up_sheets set status = ${to}, updated_by = ${person.name} where id = ${id}`;
        await logActivity(tx, { person: person.name, table: "load_up_sheets", rowId: id, jobId, action: "update", changes: { status: [sh.status, to] } });
      });
    } catch (e) {
      return failed(e);
    }
    let message = to === "ready" ? "Sent to the crew: ready to load." : "Back to draft. The crew no longer see it.";
    if (to === "ready") {
      try {
        await saveLoadUpPdf(db(), id, person.name);
      } catch (e) {
        if (!(e instanceof SharePointError)) console.error("Load-up PDF failed", e);
        message += ` The PDF wasn't saved: ${e instanceof SharePointError ? e.message : UNREACHABLE} Use Create PDF to try again.`;
      }
    }
    return { ok: true, message, data: { all: await loadLoadUp(jobId, db()), id } };
  });
}

// Makes the sheet's PDF again (e.g. after SharePoint was down).
export async function createLoadUpPdf(jobId: number, id: number, requestKey: string): Promise<ActionResult<Saved>> {
  return guarded<Saved>(requestKey, async (person) => {
    const [sh] = await db()<{ job_id: string }[]>`select job_id from load_up_sheets where id = ${id}`;
    if (!sh || Number(sh.job_id) !== jobId) return GONE;
    try {
      await saveLoadUpPdf(db(), id, person.name);
    } catch (e) {
      if (e instanceof LoadUpRefused) return { ok: false, message: e.message };
      if (!(e instanceof SharePointError)) console.error("Load-up PDF failed", e);
      return { ok: false, message: `The PDF wasn't saved: ${e instanceof SharePointError ? e.message : UNREACHABLE}` };
    }
    return { ok: true, message: "PDF saved.", data: { all: await loadLoadUp(jobId, db()), id } };
  });
}

// The office marks a sheet as loaded (the crew do the same from the yard app).
export async function loadSheetAction(jobId: number, id: number, results: LoadResult[], extra: string, requestKey: string): Promise<ActionResult<Saved>> {
  const clean = (Array.isArray(results) ? results : []).slice(0, 300).map((r) => ({
    lineId: Number(r.lineId), ticked: r.ticked === true, loadedQty: r.loadedQty == null || r.loadedQty === ("" as unknown) ? null : Number(r.loadedQty),
    reason: (r.reason || null) as Reason | null, note: clip(r.note, 500),
  }));
  if (clean.some((r) => r.loadedQty != null && !Number.isFinite(r.loadedQty))) return { ok: false, message: "Check the quantities." };
  return guarded<Saved>(requestKey, async (person) => {
    let problems = 0;
    try {
      ({ problems } = await db().begin(async (tx) => {
        const [sh] = await tx<{ job_id: string }[]>`select job_id from load_up_sheets where id = ${id}`;
        if (!sh || Number(sh.job_id) !== jobId) throw new LoadUpRefused(GONE.message);
        return markLoaded(tx, id, clean, clip(extra, 2000), person.name);
      }));
    } catch (e) {
      return failed(e);
    }
    let message = problems ? `Marked as loaded. ${problems} problem${problems === 1 ? "" : "s"} sent to the office.` : "Marked as loaded.";
    try {
      await saveLoadUpPdf(db(), id, person.name);
    } catch (e) {
      if (!(e instanceof SharePointError)) console.error("Load-up PDF failed", e);
      message += " The PDF wasn't updated; use Create PDF to try again.";
    }
    return { ok: true, message, data: { all: await loadLoadUp(jobId, db()), id } };
  });
}

export async function reportProblemAction(jobId: number, id: number, text: string, requestKey: string): Promise<ActionResult<Saved>> {
  const t = clip(text, 2000);
  if (!t) return { ok: false, message: "Say what the problem is." };
  return guarded<Saved>(requestKey, async (person) => {
    try {
      await db().begin(async (tx) => {
        const [sh] = await tx<{ job_id: string }[]>`select job_id from load_up_sheets where id = ${id}`;
        if (!sh || Number(sh.job_id) !== jobId) throw new LoadUpRefused(GONE.message);
        await reportLoadUpProblem(tx, id, t, person.name);
      });
    } catch (e) {
      return failed(e);
    }
    return { ok: true, message: "Problem sent to the office.", data: { all: await loadLoadUp(jobId, db()), id } };
  });
}

// The office has dealt with the problems: they leave Needs attention (the text stays on the sheet).
export async function markProblemsSorted(jobId: number, id: number, requestKey: string): Promise<ActionResult<Saved>> {
  return guarded<Saved>(requestKey, async (person) => {
    const done = await db().begin(async (tx) => {
      const [sh] = await tx<{ job_id: string }[]>`select job_id from load_up_sheets where id = ${id} for update`;
      if (!sh || Number(sh.job_id) !== jobId) return false;
      await tx`update load_up_sheets set problems_open = false, problems_sorted_by = ${person.name}, problems_sorted_at = now(), updated_by = ${person.name} where id = ${id}`;
      await logActivity(tx, { person: person.name, table: "load_up_sheets", rowId: id, jobId, action: "update", changes: { problems: ["open", "sorted"] } });
      return true;
    });
    if (!done) return GONE;
    return { ok: true, message: "Problems marked as sorted.", data: { all: await loadLoadUp(jobId, db()), id } };
  });
}

// Deletes a sheet that hasn't been loaded. A loaded sheet stays: its stock and plant moves point at it.
export async function deleteLoadUp(jobId: number, id: number, requestKey: string): Promise<ActionResult<Saved>> {
  return guarded<Saved>(requestKey, async (person) => {
    try {
      const gone = await db().begin(async (tx) => {
        const [before] = await tx`select job_id, sheet_date, status, vehicle_label from load_up_sheets where id = ${id} for update`;
        if (!before || Number(before.job_id) !== jobId) return true;
        if (before.status === "loaded") throw new LoadUpRefused("A loaded sheet can't be deleted: its stock and plant moves point at it.");
        await tx`delete from load_up_sheets where id = ${id}`;
        const snapshot = Object.fromEntries(Object.entries(forLog(before)).map(([k, val]) => [k, [val, null] as [unknown, unknown]]));
        await logActivity(tx, { person: person.name, table: "load_up_sheets", rowId: id, jobId, action: "delete", changes: snapshot });
        return false;
      });
      if (gone) return GONE;
    } catch (e) {
      return failed(e);
    }
    return { ok: true, message: "Deleted.", data: { all: await loadLoadUp(jobId, db()), id: null } };
  });
}
