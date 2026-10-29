import { readDb } from "@/lib/db";
import { getCurrentPerson } from "@/lib/auth/session";
import { HousePdf } from "@/lib/pdf/house";
import { dueState, niceDate, ukToday } from "../../_registers/dates";
import { loadEquipment } from "../data";
import { EQUIPMENT_COLUMNS, MATERIAL_COLUMNS } from "../report-options";
import { ASSET_STATUSES, isLow, labelOf, locKey, locLabel, parseLocKey, qty } from "../rules";

// The equipment and materials report in the house PDF format, with what the office chose.
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return Response.json({ ok: false, message: "Sign in again." }, { status: 401 });
  await readDb();
  const q = new URL(req.url).searchParams;
  const include = new Set((q.get("include") ?? "").split(","));
  const kitWanted = new Set((q.get("kit") ?? "").split(","));
  const matWanted = new Set((q.get("mat") ?? "").split(","));
  const kitCols = EQUIPMENT_COLUMNS.filter((c) => kitWanted.has(c.key));
  const matCols = MATERIAL_COLUMNS.filter((c) => matWanted.has(c.key));
  const where = parseLocKey(q.get("where"));
  const whereKey = where ? locKey(where).toLowerCase() : "";
  const today = ukToday();

  const data = await loadEquipment();
  const label = (l: { place: string | null; vehicleId: number | null; personId?: number | null }) => locLabel(l, data.vehicles, data.people);
  const soon = (d: string | null) => ["overdue", "soon"].includes(dueState(d, today, 30, 30));

  const assets = data.assets.filter((a) =>
    (q.get("retired") === "1" || a.status !== "retired") && (!whereKey || locKey(a).toLowerCase() === whereKey) &&
    (q.get("attention") !== "1" || a.status === "needs_repair" || a.status === "lost" || soon(a.nextServiceOn) || soon(a.testTagDue)));
  const materials = data.materials.filter((m) =>
    (q.get("retired") === "1" || m.status === "active") && (!whereKey || m.stock.some((s) => locKey(s).toLowerCase() === whereKey && s.qty > 0)) &&
    (q.get("low") !== "1" || isLow(m.total, m.minLevel)));

  const pdf = await HousePdf.create({
    title: "Equipment and materials",
    subtitle: `${where ? label(where) : "All locations"} | ${niceDate(today)} | ${person.name}`,
  });
  pdf.keyValues([
    ["Location", where ? label(where) : "All locations"],
    ...(include.has("equipment") ? [["Equipment", String(assets.length)] as [string, string]] : []),
    ...(include.has("materials") ? [["Materials", String(materials.length)] as [string, string]] : []),
    ["Created", `${niceDate(today)} by ${person.name}`],
  ]);

  const widths = (cols: readonly { width: number }[]) => {
    const used = cols.reduce((n, c) => n + c.width, 0);
    const first = Math.max(0.2, 1 - used);
    return { first, scale: (1 - first) / (used || 1) };
  };

  if (include.has("equipment")) {
    const w = widths(kitCols);
    pdf.heading("Equipment");
    if (!assets.length) pdf.paragraph("No equipment to show.");
    else pdf.table(
      [{ label: "Equipment", width: w.first }, ...kitCols.map((c) => ({ label: c.label, width: c.width * w.scale }))],
      assets.map((a) => {
        const cell: Record<string, string> = {
          tag: a.assetTag, category: a.category, location: label(a), status: labelOf(ASSET_STATUSES, a.status),
          service: a.nextServiceOn ? niceDate(a.nextServiceOn) : "", pat: a.testTagDue ? niceDate(a.testTagDue) : "", serial: a.serialNo,
        };
        return [a.name, ...kitCols.map((c) => cell[c.key] ?? "")];
      }),
    );
  }

  if (include.has("materials")) {
    const w = widths(matCols);
    pdf.heading("Materials");
    if (!materials.length) pdf.paragraph("No materials to show.");
    else pdf.table(
      [{ label: "Material", width: w.first }, ...matCols.map((c) => ({ label: c.label, width: c.width * w.scale }))],
      materials.map((m) => {
        const stock = whereKey ? m.stock.filter((s) => locKey(s).toLowerCase() === whereKey) : m.stock;
        const total = stock.reduce((t, s) => t + s.qty, 0);
        const cell: Record<string, string> = {
          category: m.category, qty: `${qty(total)} ${m.unit}`, locations: stock.map((s) => `${label(s)}: ${qty(s.qty)}`).join("; ") || "None",
          min: m.minLevel != null ? qty(m.minLevel) : "", supplier: m.supplierName,
        };
        return [m.name, ...matCols.map((c) => cell[c.key] ?? "")];
      }),
    );
  }

  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Equipment and materials - ${today}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
