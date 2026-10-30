import "server-only";
import type postgres from "postgres";
import { logActivity } from "@/lib/activity";
import { uploadBytes } from "@/lib/files/server-upload";
import { HousePdf } from "@/lib/pdf/house";
import { jobTitle } from "@/lib/jobs/stages";
import { niceDate, niceDateTime } from "../_registers/dates";
import { isoDate, isoTime } from "../_registers/form-values";
import { locKey, qty as fmtQty, round3, type Loc } from "../equipment/rules";
import { changeStock, labelFor, stockAt } from "../equipment/stock";
import { vehicleLocationLabel } from "../fleet/rules";
import { bookPlant, PlantRefused } from "./plant";
import {
  loadUpFileName, loadUpFolder, OUTCOME_LABELS, outcomeOf, problemLines, reasonLabel, reasonsFor,
  type LineKind, type Outcome, type Reason, type SheetStatus,
} from "./load-up-rules";

type Sql = postgres.Sql | postgres.TransactionSql;
type Tx = postgres.TransactionSql;
const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (v == null ? null : Number(v));

export class LoadUpRefused extends Error {}

export type SheetLine = {
  id: number;
  kind: LineKind;
  assetId: number | null;
  materialId: number | null;
  name: string;
  category: string;
  unit: string;
  qty: number | null;
  fromKey: string; // materials: where the stock comes from ("p:CBS Warehouse", "v:12")
  fromLabel: string;
  buyFrom: string;
  buyNote: string;
  outcome: Outcome | null;
  loadedQty: number | null;
  reason: Reason | null;
  reasonNote: string;
};

export type Sheet = {
  id: number;
  jobId: number;
  jobNo: string;
  jobTitle: string;
  site: string;
  client: string;
  sheetDate: string;
  vehicleId: number | null;
  vehicleLabel: string;
  crewIds: number[];
  crewNames: string[];
  preparedById: number | null;
  preparedBy: string;
  dueBack: string | null;
  ppe: string[];
  notes: string;
  status: SheetStatus;
  loadedAt: string | null;
  loadedBy: string;
  problems: string;
  problemsOpen: boolean;
  problemsSortedBy: string;
  problemsSortedAt: string | null;
  pdf: { id: number; name: string; mime: string; storage: string } | null;
  createdAt: string;
  createdBy: string;
  lines: SheetLine[];
};

// Sheets for one job, or the given sheets, or (for the yard) every sheet not yet loaded plus today's loaded ones.
export async function loadSheets(sql: Sql, where: { jobId: number } | { ids: number[] } | { yard: string }): Promise<Sheet[]> {
  const filter = "jobId" in where ? sql`s.job_id = ${where.jobId}`
    : "ids" in where ? sql`s.id in ${sql(where.ids.length ? where.ids : [0])}`
      : sql`(s.status = 'ready' or (s.status = 'loaded' and (s.loaded_at at time zone 'Europe/London')::date = ${where.yard}::date))`;
  const rows = await sql`
    select s.*, j.job_no, j.sm8_description, j.site_address, c.name as client, p.name as prepared_by, f.name as pdf_name, f.storage as pdf_storage,
           (select coalesce(array_agg(x.name order by lower(x.name)), '{}') from people x where x.id = any(s.crew_ids)) as crew_names
    from load_up_sheets s join jobs j on j.id = s.job_id left join clients c on c.id = j.client_id left join people p on p.id = s.prepared_by_id
      left join files f on f.id = s.pdf_file_id
    where ${filter}
    order by s.sheet_date desc, s.id desc`;
  const ids = rows.map((r) => Number(r.id));
  const lines = ids.length ? await sql`
    select l.*, v.reg, v.make_model, d.name as driver
    from load_up_lines l left join vehicles v on v.id = l.from_vehicle_id left join people d on d.id = v.assigned_to_id
    where l.sheet_id in ${sql(ids)} order by l.sheet_id, l.sort, l.id` : [];
  const bySheet = new Map<number, SheetLine[]>();
  for (const l of lines) {
    const from = l.from_place ? { place: l.from_place as string, vehicleId: null } : l.from_vehicle_id ? { place: null, vehicleId: Number(l.from_vehicle_id) } : null;
    const line: SheetLine = {
      id: Number(l.id), kind: l.kind, assetId: num(l.asset_id), materialId: num(l.material_id), name: l.name, category: s(l.category), unit: s(l.unit),
      qty: num(l.qty), fromKey: from ? locKey(from) : "",
      fromLabel: l.from_place ? l.from_place : l.from_vehicle_id ? (l.reg ? vehicleLocationLabel({ reg: l.reg, makeModel: s(l.make_model), driver: s(l.driver) }) : "A vehicle no longer on the fleet") : "",
      buyFrom: s(l.buy_from), buyNote: s(l.buy_note), outcome: l.outcome ?? null, loadedQty: num(l.loaded_qty), reason: l.reason ?? null, reasonNote: s(l.reason_note),
    };
    bySheet.set(Number(l.sheet_id), [...(bySheet.get(Number(l.sheet_id)) ?? []), line]);
  }
  return rows.map((r) => ({
    id: Number(r.id), jobId: Number(r.job_id), jobNo: r.job_no, jobTitle: jobTitle(r.sm8_description ?? ""), site: s(r.site_address), client: s(r.client),
    sheetDate: isoDate(r.sheet_date)!, vehicleId: num(r.vehicle_id), vehicleLabel: s(r.vehicle_label), crewIds: (r.crew_ids as string[]).map(Number),
    crewNames: r.crew_names as string[], preparedById: num(r.prepared_by_id), preparedBy: s(r.prepared_by), dueBack: isoDate(r.due_back),
    ppe: r.ppe as string[], notes: s(r.notes), status: r.status, loadedAt: isoTime(r.loaded_at), loadedBy: s(r.loaded_by), problems: s(r.problems),
    problemsOpen: r.problems_open, problemsSortedBy: s(r.problems_sorted_by), problemsSortedAt: isoTime(r.problems_sorted_at),
    pdf: r.pdf_file_id && r.pdf_name ? { id: Number(r.pdf_file_id), name: r.pdf_name, mime: "application/pdf", storage: s(r.pdf_storage) } : null, createdAt: isoTime(r.created_at)!, createdBy: s(r.created_by), lines: bySheet.get(Number(r.id)) ?? [],
  }));
}

// "30/10/2026 14:48" in UK time, for problem lines.
function stampNow(): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}/${g("month")}/${g("year")} ${g("hour")}:${g("minute")}`;
}

async function addProblems(tx: Tx, sheetId: number, lines: string[]) {
  if (!lines.length) return;
  await tx`update load_up_sheets set problems = concat_ws(E'\n', nullif(problems, ''), ${lines.join("\n")}::text), problems_open = true,
             problems_sorted_by = null, problems_sorted_at = null where id = ${sheetId}`;
}

export type LoadResult = { lineId: number; ticked: boolean; loadedQty: number | null; reason: Reason | null; note: string | null };

// The crew mark a Ready to load sheet as loaded. Ticked materials come off stock at their line's
// location ("Loaded for job"); ticked equipment is booked to the job in the sheet's van. Anything not
// loaded, or short, needs a reason, and goes into the sheet's problems for the office.
export async function markLoaded(tx: Tx, sheetId: number, results: LoadResult[], extra: string | null, by: string): Promise<{ problems: number }> {
  const [sheet] = await tx<{ status: SheetStatus; job_id: string; vehicle_id: string | null; due_back: Date | null }[]>`
    select status, job_id, vehicle_id, due_back from load_up_sheets where id = ${sheetId} for update`;
  if (!sheet) throw new LoadUpRefused("That load-up sheet no longer exists.");
  if (sheet.status === "loaded") throw new LoadUpRefused("This sheet has already been marked as loaded.");
  if (sheet.status !== "ready") throw new LoadUpRefused("This sheet hasn't been sent to the crew yet.");
  const jobId = Number(sheet.job_id);
  const [job] = await tx<{ job_no: string }[]>`select job_no from jobs where id = ${jobId}`;
  const lines = await tx<{ id: string; kind: LineKind; asset_id: string | null; material_id: string | null; name: string; unit: string | null; qty: string | null;
    from_place: string | null; from_vehicle_id: string | null }[]>`
    select id, kind, asset_id, material_id, name, unit, qty, from_place, from_vehicle_id from load_up_lines where sheet_id = ${sheetId} order by sort, id`;
  const given = new Map(results.map((r) => [r.lineId, r]));
  const summary: Parameters<typeof problemLines>[0] = [];
  const extraProblems: string[] = [];
  const stamp = stampNow();
  const van: Loc | null = sheet.vehicle_id ? { place: null, vehicleId: Number(sheet.vehicle_id), personId: null } : null;
  const ref = `Load-up sheet ${sheetId}`;

  for (const l of lines) {
    const r = given.get(Number(l.id));
    if (!r) throw new LoadUpRefused("The sheet has changed since it was opened. Refresh and try again.");
    const planned = l.qty == null ? null : Number(l.qty);
    let loadedQty = r.ticked && r.loadedQty != null ? round3(r.loadedQty) : r.ticked ? planned : 0;
    if (loadedQty != null && (loadedQty < 0 || loadedQty > 1e9)) throw new LoadUpRefused("Check the quantities.");
    const outcome = outcomeOf({ kind: l.kind, qty: planned }, r.ticked, loadedQty);
    if (outcome !== "loaded" && !r.reason) throw new LoadUpRefused(`Say why ${l.name} wasn't ${outcome === "part" ? "all " : ""}loaded.`);
    if (r.reason && !reasonsFor(l.kind).some((x) => x.value === r.reason)) throw new LoadUpRefused(`Choose a reason for ${l.name}.`);

    if (l.kind === "material" && l.material_id && loadedQty && loadedQty > 0) {
      const from: Loc = l.from_place ? { place: l.from_place, vehicleId: null, personId: null }
        : l.from_vehicle_id ? { place: null, vehicleId: Number(l.from_vehicle_id), personId: null } : { place: "CBS Warehouse", vehicleId: null, personId: null };
      const [m] = await tx<{ name: string; unit: string }[]>`select name, unit from materials where id = ${l.material_id} for update`;
      if (m) {
        // The crew loaded it, so it left; if the register showed less, take what it showed and flag a count.
        const have = await stockAt(tx, Number(l.material_id), from);
        const take = Math.min(loadedQty, have);
        if (take > 0) await changeStock(tx, { id: Number(l.material_id), ...m }, from, -take, { by, reason: "Loaded for job", jobId, jobRef: job.job_no, notes: ref });
        if (take < loadedQty) {
          extraProblems.push(`${stamp} ${by} (when loading): Stock record showed only ${fmtQty(have)} ${m.unit} of ${m.name} at ${await labelFor(tx, from)}, but ${fmtQty(loadedQty)} were loaded. Count it.`);
        }
      }
    }
    if (l.kind === "equipment" && l.asset_id && r.ticked) {
      if (!van) throw new LoadUpRefused("The sheet has no van. Ask the office to choose one.");
      // A savepoint (in SQL: the app's transactions don't offer savepoint()) so one refused item
      // doesn't undo the rest of the load.
      await tx`savepoint book_item`;
      try {
        await bookPlant(tx, {
          jobId, assetIds: [Number(l.asset_id)], to: van, dueBack: isoDate(sheet.due_back), notes: null, by, source: "load_up", loadUpSheetId: sheetId,
        });
        await tx`release savepoint book_item`;
      } catch (e) {
        if (!(e instanceof PlantRefused)) throw e;
        await tx`rollback to savepoint book_item`;
        extraProblems.push(`${stamp} ${by} (when loading): ${l.name} loaded but not booked to the job: ${e.message}`);
      }
    }
    if (!r.ticked) loadedQty = l.kind === "equipment" || l.kind === "custom_equipment" ? null : 0;
    await tx`update load_up_lines set outcome = ${outcome}, loaded_qty = ${loadedQty}, reason = ${outcome === "loaded" ? null : r.reason},
               reason_note = ${outcome === "loaded" ? null : r.note} where id = ${l.id}`;
    summary.push({ name: l.name, outcome, reason: r.reason, note: r.note, loadedQty, qty: planned, unit: l.unit });
  }

  const problems = [...problemLines(summary, extra, stamp, by, "when loading"), ...extraProblems];
  await tx`update load_up_sheets set status = 'loaded', loaded_at = now(), loaded_by = ${by}, updated_by = ${by} where id = ${sheetId}`;
  await addProblems(tx, sheetId, problems);
  await logActivity(tx, { person: by, table: "load_up_sheets", rowId: sheetId, jobId, action: "update",
    changes: { status: ["ready", "loaded"], ...(problems.length ? { problems: [null, `${problems.length} reported`] } : {}) } });
  return { problems: problems.length };
}

// A problem reported without loading (Report a problem).
export async function reportLoadUpProblem(tx: Tx, sheetId: number, text: string, by: string): Promise<void> {
  const [sheet] = await tx<{ job_id: string }[]>`select job_id from load_up_sheets where id = ${sheetId} for update`;
  if (!sheet) throw new LoadUpRefused("That load-up sheet no longer exists.");
  await addProblems(tx, sheetId, [`${stampNow()} ${by} (reported): ${text}`]);
  await logActivity(tx, { person: by, table: "load_up_sheets", rowId: sheetId, jobId: Number(sheet.job_id), action: "update", changes: { problems: [null, "reported"] } });
}

// The sheet as a house-standard PDF.
export async function buildLoadUpPdf(sh: Sheet): Promise<Uint8Array> {
  const pdf = await HousePdf.create({ title: "Load-up sheet", jobNo: sh.jobNo, subtitle: [sh.site, sh.jobTitle].filter(Boolean).join(" - ") });
  pdf.keyValues([
    ["Sheet", `${sh.id}`],
    ["Date", niceDate(sh.sheetDate)],
    ["Job number", sh.jobNo],
    ["Site", sh.site || "Not set"],
    ["Client", sh.client || "Not set"],
    ["Van", sh.vehicleLabel || "Not set"],
    ["Crew", sh.crewNames.join(", ") || "Not set"],
    ["Prepared by", sh.preparedBy || "Not set"],
    ["Equipment due back", sh.dueBack ? niceDate(sh.dueBack) : "Not set"],
    ...(sh.status === "loaded" ? [["Loaded", `${niceDateTime(sh.loadedAt)} by ${sh.loadedBy}`] as [string, string]] : []),
  ]);
  const loaded = sh.status === "loaded";
  const result = (l: SheetLine) => (l.outcome ? `${OUTCOME_LABELS[l.outcome]}${l.reason ? ` (${reasonLabel(l.reason)})` : ""}` : "");
  const kit = sh.lines.filter((l) => l.kind === "equipment" || l.kind === "custom_equipment");
  if (kit.length) {
    pdf.heading("Equipment");
    pdf.table(
      loaded ? [{ label: "Item", width: 0.5 }, { label: "Category", width: 0.25 }, { label: "Loaded", width: 0.25 }] : [{ label: "Item", width: 0.6 }, { label: "Category", width: 0.4 }],
      kit.map((l) => [l.name, l.kind === "custom_equipment" ? "Not on the register" : l.category || "", ...(loaded ? [result(l)] : [])]),
    );
  }
  const mats = sh.lines.filter((l) => l.kind === "material" || l.kind === "custom_material");
  if (mats.length) {
    pdf.heading("Materials");
    pdf.table(
      [{ label: "Material", width: loaded ? 0.36 : 0.46 }, { label: "Qty", width: 0.14 }, { label: "From", width: loaded ? 0.28 : 0.4 }, ...(loaded ? [{ label: "Loaded", width: 0.22 }] : [])],
      mats.map((l) => [l.name, `${l.qty == null ? "" : fmtQty(l.qty)} ${l.unit}`.trim(), l.kind === "custom_material" ? "Not from stock" : l.fromLabel,
        ...(loaded ? [`${result(l)}${l.loadedQty != null && l.outcome === "part" ? `: ${fmtQty(l.loadedQty)}` : ""}`] : [])]),
    );
  }
  const buy = sh.lines.filter((l) => l.kind === "buy");
  if (buy.length) {
    pdf.heading("Buy on the way");
    pdf.table([{ label: "Item", width: 0.4 }, { label: "Qty", width: 0.15 }, { label: "Where from", width: 0.2 }, { label: "Note", width: 0.25 }],
      buy.map((l) => [l.name, `${l.qty == null ? "" : fmtQty(l.qty)} ${l.unit}`.trim(), l.buyFrom, l.buyNote]));
  }
  if (sh.ppe.length) {
    pdf.heading("PPE");
    pdf.paragraph(sh.ppe.join(", "));
  }
  if (sh.notes) {
    pdf.heading("Notes for the crew");
    pdf.paragraph(sh.notes);
  }
  if (sh.problems) {
    pdf.heading("Problems reported");
    pdf.paragraph(sh.problems);
  }
  return pdf.finish();
}

// Makes the PDF and saves it in the job's Load-up sheets folder, then points the sheet at it.
export async function saveLoadUpPdf(sql: postgres.Sql, sheetId: number, by: string): Promise<number> {
  const [sh] = await loadSheets(sql, { ids: [sheetId] });
  if (!sh) throw new LoadUpRefused("That load-up sheet no longer exists.");
  const bytes = await buildLoadUpPdf(sh);
  const saved = await uploadBytes({
    folder: loadUpFolder(sh.jobNo), name: loadUpFileName(sh), bytes, mime: "application/pdf",
    entityTable: "load_up_sheets", entityId: sheetId, jobId: sh.jobId, role: "load-up-pdf", createdBy: by,
  });
  await sql`update load_up_sheets set pdf_file_id = ${saved.id} where id = ${sheetId}`;
  return saved.id;
}

