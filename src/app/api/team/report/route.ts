import { z } from "zod";
import { db } from "@/lib/db";
import { claimRequestKey } from "@/lib/actions";
import { logActivity } from "@/lib/activity";
import { teamKeyOk } from "@/app/team/key";
import { photoTicket } from "@/app/team/photos";
import { isIsoDate, LOCAL_DATETIME, ukToday } from "@/app/(hub)/_registers/dates";
import { CHECK_ITEMS, nextInspectionAfterCheck, type Frequency } from "@/app/(hub)/fleet/rules";
import { mergeOptions } from "@/app/(hub)/subcontractors/rules";
import { CATEGORY_LIST, DEFAULT_CATEGORIES } from "@/app/(hub)/requests/rules";
import { createToolReport } from "@/app/(hub)/equipment/stock";

// Saves one report from the team app. No sign-in: the secret team key (X-Team-Key header) lets the
// device in, the name is picked for this report and checked against People, and the one-time
// request key stops a double save. Team reports can only create records, never edit or delete.

const name = z.string().trim().min(1).max(120);
const text = (max: number) => z.string().trim().max(max).optional().default("");

const Check = z.object({
  type: z.literal("check"),
  name,
  vehicleId: z.number().int().positive(),
  odometer: z.string().trim().max(10).optional().default(""),
  items: z.record(z.string(), z.boolean()),
  defects: text(4000),
  safe: z.boolean(),
});
const Accident = z.object({
  type: z.literal("accident"),
  name,
  vehicleId: z.number().int().positive(),
  when: z.string().trim().max(20).optional().default(""),
  location: text(300),
  description: z.string().trim().min(1).max(4000),
  damage: text(4000),
  injuries: text(4000),
  thirdParty: text(300),
  thirdPartyReg: text(20),
  thirdPartyInsurer: text(200),
  policeEventNo: text(60),
});
const Request = z.object({
  type: z.literal("request"),
  name,
  category: z.string().trim().min(1).max(120),
  other: z.boolean().optional().default(false), // "Other": the crew typed their own category
  details: z.string().trim().min(1).max(4000),
  urgency: z.enum(["today", "this_week", "no_rush"]),
});
const Tool = z.object({
  type: z.literal("tool"),
  name,
  kind: z.enum(["lost", "stolen", "damaged"]),
  assetId: z.number().int().positive().nullable().optional().default(null),
  toolName: text(200),
  when: z.string().trim().max(20).optional().default(""),
  location: text(300),
  policeRef: text(60),
  details: text(4000),
  wants: z.enum(["none", "replace", "repair"]),
  urgency: z.enum(["today", "this_week", "no_rush"]).optional().default("this_week"),
  repairNotes: text(2000),
  replaceNotes: text(2000),
});
const Body = z.object({ requestKey: z.string(), report: z.discriminatedUnion("type", [Check, Accident, Request, Tool]) });

const fail = (message: string, status = 400) => Response.json({ ok: false, message }, { status });

export async function POST(req: Request) {
  if (!teamKeyOk(req.headers.get("x-team-key"))) return fail("This link has expired. Ask the office for the team link.", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Something in the form wasn't right. Check it and try again.");
  const { requestKey, report } = parsed.data;

  const sql = db();
  const [person] = await sql<{ id: string; name: string }[]>`
    select id, name from people where active and 'crew' = any(lists) and lower(name) = lower(${report.name})`;
  if (!person) return fail("Pick your name from the list.");
  const by = `${person.name} (team app)`;

  // Checks that need the database, before the one-time key is used up.
  if (report.type === "check") {
    const odo = report.odometer.replace(/[,\s]/g, "");
    if (odo && !/^\d{1,7}$/.test(odo)) return fail("Odometer: enter the miles as a number.");
    if (CHECK_ITEMS.some((i) => report.items[i.key] === false) && !report.defects) return fail("Describe the fault before submitting.");
  }
  if (report.type === "tool") {
    if (!report.assetId && !report.toolName) return fail("Pick the tool, or type its name.");
    if (report.when && !(LOCAL_DATETIME.test(report.when) && isIsoDate(report.when.slice(0, 10)))) return fail("Enter a valid date and time.");
    if (report.assetId) {
      const [a] = await sql`select 1 from assets where id = ${report.assetId} and status not in ('lost', 'retired')`;
      if (!a) return fail("That tool isn't on the list any more. Choose Not on the list and type its name.");
    }
  }
  if (report.type === "accident" && report.when && !(LOCAL_DATETIME.test(report.when) && isIsoDate(report.when.slice(0, 10)))) {
    return fail("Enter a valid date and time.");
  }
  if (report.type === "request" && report.other) {
    if (report.category.length > 60) return fail("Keep what it is for under 60 characters.");
  } else if (report.type === "request") {
    const listed = await sql<{ value: string }[]>`select value from select_options where list = ${CATEGORY_LIST}`;
    const ok = mergeOptions(DEFAULT_CATEGORIES, listed.map((r) => r.value)).some((c) => c.toLowerCase() === report.category.toLowerCase());
    if (!ok) return fail("Choose what it is for from the list.");
  }
  if (report.type === "check" || report.type === "accident") {
    const [v] = await sql`select 1 from vehicles where id = ${report.vehicleId}`;
    if (!v) return fail("Pick a vehicle from the list.");
  }

  if (!(await claimRequestKey(requestKey, null))) {
    // Sent again (the first reply was lost): hand back the photo ticket for the record it created.
    const [ref] = await sql<{ entity_table: string; entity_id: string }[]>`
      select entity_table, entity_id from team_report_refs where request_key = ${requestKey.toLowerCase()}`;
    const ticket = ref ? photoTicket({ table: ref.entity_table, id: Number(ref.entity_id), by, key: requestKey }) : null;
    return Response.json({ ok: false, duplicate: true, photoTicket: ticket, message: "This was already sent." }, { status: 409 });
  }

  const result = await sql.begin(async (tx) => {
    const made = await (async () => {
      if (report.type === "check") {
        const items = Object.fromEntries(CHECK_ITEMS.map((i) => [i.key, report.items[i.key] !== false]));
        const faults = Object.values(items).some((ok) => !ok);
        const status = !report.safe ? "off_road" : faults ? "defects" : "passed";
        const today = ukToday();
        const odo = report.odometer.replace(/[,\s]/g, "");
        const row = {
          vehicle_id: report.vehicleId, checked_on: today, checked_by: person.name, odometer: odo ? Number(odo) : null, ...items,
          defects: report.defects || null, status, reviewed: false, source: "team", created_by: by,
        };
        const [r] = await tx<{ id: string }[]>`insert into vehicle_checks ${tx(row as Record<string, unknown>)} returning id`;
        await logActivity(tx, { person: by, table: "vehicle_checks", rowId: Number(r.id), action: "create", changes: { status: [null, status] } });
        // A logged check moves the vehicle's next inspection date on, as when the office logs one.
        const [veh] = await tx<{ f: Frequency; next: string | null }[]>`
          select inspection_frequency as f, next_inspection_on::text as next from vehicles where id = ${report.vehicleId} for update`;
        const next = nextInspectionAfterCheck(veh.next, today, veh.f);
        if (next !== veh.next) {
          await tx`update vehicles set next_inspection_on = ${next}, updated_by = ${by} where id = ${report.vehicleId}`;
          await logActivity(tx, { person: by, table: "vehicles", rowId: report.vehicleId, action: "update", changes: { next_inspection_on: [veh.next, next] } });
        }
        return { table: "vehicle_checks", id: Number(r.id), faults: faults || !report.safe };
      }
      if (report.type === "accident") {
        const row = {
          vehicle_id: report.vehicleId, driver: person.name, location: report.location || null, description: report.description,
          damage: report.damage || null, injuries: report.injuries || null, third_party: report.thirdParty || null,
          third_party_reg: report.thirdPartyReg || null, third_party_insurer: report.thirdPartyInsurer || null,
          police_event_no: report.policeEventNo || null, status: "reported", source: "team", created_by: by,
        };
        const [r] = await tx<{ id: string }[]>`insert into vehicle_accidents ${tx(row as Record<string, unknown>)} returning id`;
        if (report.when) {
          await tx`update vehicle_accidents set occurred_at = (${report.when}::timestamp at time zone 'Europe/London') where id = ${r.id}`;
        } else {
          await tx`update vehicle_accidents set occurred_at = now() where id = ${r.id}`;
        }
        await logActivity(tx, { person: by, table: "vehicle_accidents", rowId: Number(r.id), action: "create", changes: { status: [null, "reported"] } });
        return { table: "vehicle_accidents", id: Number(r.id), faults: false };
      }
      if (report.type === "tool") {
        const id = await createToolReport(tx, {
          kind: report.kind, assetId: report.assetId, toolName: report.toolName, occurredAt: report.when || null, location: report.location || null,
          policeRef: report.policeRef || null, details: report.details || null, wants: report.wants, urgency: report.urgency,
          repairNotes: report.repairNotes || null, replaceNotes: report.replaceNotes || null, reportedBy: person.name,
          reportedById: Number(person.id), source: "team",
        }, by);
        return { table: "tool_reports", id, faults: false };
      }
      const row = {
        requested_by: person.name, requested_by_id: Number(person.id), category: report.category, urgency: report.urgency,
        details: report.details, status: "new", source: "team", created_by: by,
      };
      const [r] = await tx<{ id: string }[]>`insert into requests ${tx(row as Record<string, unknown>)} returning id`;
      await logActivity(tx, { person: by, table: "requests", rowId: Number(r.id), action: "create", changes: { category: [null, report.category] } });
      return { table: "requests", id: Number(r.id), faults: false };
    })();
    await tx`insert into team_report_refs (request_key, entity_table, entity_id)
             values (${requestKey.toLowerCase()}, ${made.table}, ${made.id}) on conflict do nothing`;
    return made;
  });

  return Response.json({ ok: true, ...result, photoTicket: photoTicket({ table: result.table, id: result.id, by, key: requestKey }) });
}
