import { z } from "zod";
import { db } from "@/lib/db";
import { claimRequestKey } from "@/lib/actions";
import { logActivity } from "@/lib/activity";
import { teamKeyOk } from "@/app/team/key";
import { parseLocKey, round3 } from "@/app/(hub)/equipment/rules";
import { changeStock, createStocktake, createToolReport, labelFor, locationExists, NotEnough } from "@/app/(hub)/equipment/stock";
import { LoadUpRefused, markLoaded, reportLoadUpProblem, saveLoadUpPdf } from "@/app/(hub)/_site/load-up";
import { extendPlant, foundPlant, movePlant, PlantRefused, returnPlant } from "@/app/(hub)/_site/plant";
import { niceDate, ukToday } from "@/app/(hub)/_registers/dates";

// The yard tablet's saves. No sign-in: the team-app link key (X-Team-Key header) lets the device in
// (Ethan, 30/10/2026), the name is picked for each action and checked against the crew list, and a
// one-time request key stops a double save.

const name = z.string().trim().min(1).max(120);
const note = z.string().trim().max(2000).optional().default("");
const qty = z.number().positive().max(1e9);
const Load = z.object({
  type: z.literal("load"), name, sheetId: z.number().int().positive(), extra: note,
  results: z.array(z.object({
    lineId: z.number().int().positive(), ticked: z.boolean(), loadedQty: z.number().min(0).max(1e9).nullable(),
    reason: z.enum(["out_of_stock", "faulty", "cant_find", "not_needed", "couldnt_buy"]).nullable(), note: z.string().trim().max(500).nullable(),
  })).max(300),
});
const Problem = z.object({ type: z.literal("problem"), name, sheetId: z.number().int().positive(), text: z.string().trim().min(1).max(2000) });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PlantBack = z.object({ type: z.literal("plant_back"), name, bookingId: z.number().int().positive(), to: z.string().max(100) });
const PlantExtend = z.object({ type: z.literal("plant_extend"), name, bookingId: z.number().int().positive(), dueBack: date });
const PlantMove = z.object({ type: z.literal("plant_move"), name, bookingId: z.number().int().positive(), jobId: z.number().int().positive(), dueBack: date.nullable() });
const ReportPlant = z.object({
  type: z.literal("report_plant"), name, assetId: z.number().int().positive(), kind: z.enum(["faulty", "missing", "found"]), note,
  location: z.string().max(100).optional().default(""), // found: where it is now
});
const ReturnMaterial = z.object({
  type: z.literal("return_material"), name, materialId: z.number().int().positive().nullable(), otherName: z.string().trim().max(200).optional().default(""),
  otherUnit: z.string().trim().max(30).optional().default(""), qty, jobId: z.number().int().positive().nullable(), to: z.string().max(100), note,
});
const Count = z.object({
  type: z.literal("stocktake"), name, location: z.string().max(100), note,
  counts: z.array(z.object({ materialId: z.number().int().positive(), counted: z.number().min(0).max(1e9) })).min(1).max(500),
});
const Body = z.object({ requestKey: z.string(), action: z.discriminatedUnion("type", [Load, Problem, PlantBack, PlantExtend, PlantMove, ReportPlant, ReturnMaterial, Count]) });

const fail = (message: string, status = 400) => Response.json({ ok: false, message }, { status });
class Refused extends Error {}

export async function POST(req: Request) {
  if (!teamKeyOk(req.headers.get("x-team-key"))) return fail("This link has expired. Ask the office for the yard link.", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Something in the form wasn't right. Check it and try again.");
  const { requestKey, action: a } = parsed.data;

  const sql = db();
  const [person] = await sql<{ id: string; name: string }[]>`
    select id, name from people where active and 'crew' = any(lists) and lower(name) = lower(${a.name})`;
  if (!person) return fail("Choose your name first.");
  const by = `${person.name} (yard)`;

  // Checks before the one-time key is used up.
  if (a.type === "report_plant" && a.kind !== "found" && !a.note) return fail(a.kind === "faulty" ? "Say what's wrong with it." : "Say where it was last seen.");
  if (a.type === "return_material" && !a.materialId && !a.otherName) return fail("Choose the material, or type what it is.");
  if ((a.type === "plant_back" || a.type === "return_material") && !parseLocKey(a.to, false)) return fail("Choose where it's going.");
  if (a.type === "report_plant" && a.kind === "found" && !parseLocKey(a.location, false)) return fail("Choose where it is now.");
  if ((a.type === "plant_extend" || a.type === "plant_move") && a.dueBack && a.dueBack < ukToday()) return fail("The due back date is in the past.");
  if (a.type === "stocktake" && !parseLocKey(a.location, false)) return fail("Choose where you counted.");
  if (a.type === "stocktake" && new Set(a.counts.map((c) => c.materialId)).size !== a.counts.length) return fail("Each material can only be counted once.");
  if (!(await claimRequestKey(requestKey, null))) return Response.json({ ok: false, duplicate: true, message: "This was already sent." }, { status: 409 });

  try {
    const message = await sql.begin(async (tx) => {
      if (a.type === "load") {
        const r = await markLoaded(tx, a.sheetId, a.results.map((x) => ({ ...x, loadedQty: x.loadedQty == null ? null : round3(x.loadedQty) })), a.extra || null, by);
        return r.problems ? `Loaded. ${r.problems} problem${r.problems === 1 ? "" : "s"} sent to the office.` : "Loaded. Thanks.";
      }
      if (a.type === "problem") {
        await reportLoadUpProblem(tx, a.sheetId, a.text, by);
        return "Problem sent to the office.";
      }
      if (a.type === "plant_back") {
        await returnPlant(tx, { bookingId: a.bookingId, to: parseLocKey(a.to, false)!, by });
        return "Back in. The job's booking is closed.";
      }
      if (a.type === "plant_extend") {
        await extendPlant(tx, { bookingId: a.bookingId, dueBack: a.dueBack, by });
        return `Due back ${niceDate(a.dueBack)}.`;
      }
      if (a.type === "plant_move") {
        await movePlant(tx, { bookingId: a.bookingId, toJobId: a.jobId, to: null, dueBack: a.dueBack, by });
        return "Moved to the other job.";
      }
      if (a.type === "report_plant") {
        const [asset] = await tx<{ status: string }[]>`select status from assets where id = ${a.assetId}`;
        if (!asset) throw new Refused("That equipment isn't on the register any more.");
        if (a.kind === "found") {
          // Found closes any job booking and moves the item now; a status change (lost or needing
          // repair back to in service) waits for the office to confirm the report.
          const f = await foundPlant(tx, { assetId: a.assetId, to: parseLocKey(a.location, false)!, by });
          const needsOffice = asset.status === "lost" || asset.status === "needs_repair";
          if (needsOffice) {
            await createToolReport(tx, {
              kind: "found", assetId: a.assetId, toolName: "", occurredAt: null, location: f.label, policeRef: null, details: a.note || null,
              wants: "none", urgency: null, repairNotes: null, replaceNotes: null, reportedBy: person.name, reportedById: Number(person.id),
              source: "yard", confirmFirst: true, foundAtPlace: null,
            }, by);
          }
          return `Now at ${f.label}.${f.closedJobNo ? ` Job ${f.closedJobNo}'s booking is closed.` : ""}${needsOffice ? " The office will confirm it's back in service." : ""}`;
        }
        const kind = a.kind === "faulty" ? "damaged" : "lost";
        await createToolReport(tx, {
          kind, assetId: a.assetId, toolName: "", occurredAt: null, location: a.kind === "missing" ? a.note : null, policeRef: null,
          details: a.note || null, wants: "none", urgency: null, repairNotes: null, replaceNotes: null, reportedBy: person.name,
          reportedById: Number(person.id), source: "yard", confirmFirst: true,
        }, by);
        return "Sent to the office to confirm.";
      }
      if (a.type === "return_material") {
        const to = parseLocKey(a.to, false)!;
        if (!(await locationExists(tx, to))) throw new Refused("That location no longer exists.");
        let jobNo: string | null = null;
        if (a.jobId) {
          const [j] = await tx<{ job_no: string }[]>`select job_no from jobs where id = ${a.jobId}`;
          if (!j) throw new Refused("That job isn't in the hub.");
          jobNo = j.job_no;
        }
        if (a.materialId) {
          const [m] = await tx<{ name: string; unit: string }[]>`select name, unit from materials where id = ${a.materialId} for update`;
          if (!m) throw new Refused("That material isn't on the register any more.");
          await changeStock(tx, { id: a.materialId, ...m }, to, round3(a.qty), { by, reason: "Returned from job", jobId: a.jobId, jobRef: jobNo, notes: a.note || null });
          return "Back on stock.";
        }
        const label = await labelFor(tx, to);
        const [r] = await tx<{ id: string }[]>`
          insert into yard_returns (name, unit, qty, job_id, location_label, returned_by, notes)
          values (${a.otherName}, ${a.otherUnit || null}, ${round3(a.qty)}, ${a.jobId}, ${label}, ${by}, ${a.note || null}) returning id`;
        await logActivity(tx, { person: by, table: "yard_returns", rowId: Number(r.id), action: "create", changes: { name: [null, a.otherName] } });
        return "Sent to the office to add to the register.";
      }
      const loc = parseLocKey(a.location, false)!;
      if (!(await locationExists(tx, loc))) throw new Refused("That location no longer exists.");
      const sid = await createStocktake(tx, loc, a.counts.map((c) => ({ materialId: c.materialId, counted: round3(c.counted) })), person.name, a.note || null, by);
      if (!sid) throw new Refused("A material is no longer on the register. Refresh and count again.");
      return "Count sent to the office to approve.";
    });
    // A loaded sheet's PDF is made again with what was loaded (best effort: the load is saved either way).
    if (a.type === "load") await saveLoadUpPdf(sql, a.sheetId, by).catch((e) => console.error("Load-up PDF failed", e));
    return Response.json({ ok: true, message });
  } catch (e) {
    if (e instanceof Refused || e instanceof LoadUpRefused || e instanceof PlantRefused) return fail(e.message);
    if (e instanceof NotEnough) return fail(e.message);
    throw e;
  }
}
