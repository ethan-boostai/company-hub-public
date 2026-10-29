import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth/session";
import { HousePdf, type Column } from "@/lib/pdf/house";
import { loadFleet } from "@/app/(hub)/fleet/data";
import { fleetDueItems } from "@/app/(hub)/fleet/rules";
import { niceDate, ukToday } from "@/app/(hub)/_registers/dates";

// Fleet list in the house PDF format. The office chooses which vehicles (all, or only those that need
// attention) and which columns to include.
const COLS: Record<string, { label: string; width: number }> = {
  make: { label: "Make and model", width: 0.2 },
  year: { label: "Year", width: 0.07 },
  driver: { label: "Driver", width: 0.15 },
  tax: { label: "Vehicle Tax", width: 0.11 },
  mot: { label: "MOT", width: 0.11 },
  service: { label: "Service", width: 0.11 },
  inspection: { label: "Next inspection", width: 0.12 },
  miles: { label: "Miles", width: 0.08 },
};

export async function GET(req: Request) {
  const me = await getCurrentPerson();
  if (!me) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const url = new URL(req.url);
  const which = url.searchParams.get("which") === "attention" ? "attention" : "all";
  const cols = (url.searchParams.get("cols") || "").split(",").filter((c) => c in COLS);

  const data = await loadFleet();
  const flagged = new Set(fleetDueItems(data.vehicles, data.checks, data.accidents, ukToday()).map((d) => d.vehicleId));
  const vehicles = which === "attention" ? data.vehicles.filter((v) => flagged.has(v.id)) : data.vehicles;

  const pdf = await HousePdf.create({
    title: "Fleet list",
    subtitle: `${which === "attention" ? "Needs attention" : "All vehicles"} · ${vehicles.length} ${vehicles.length === 1 ? "vehicle" : "vehicles"}`,
  });
  const used = cols.reduce((n, c) => n + COLS[c].width, 0);
  const columns: Column[] = [{ label: "Reg", width: Math.max(0.12, 1 - used) }, ...cols.map((c) => COLS[c])];
  pdf.table(
    columns,
    vehicles.map((v) => [
      v.reg,
      ...cols.map((c) =>
        c === "make" ? v.makeModel :
        c === "year" ? (v.year ? String(v.year) : "") :
        c === "driver" ? v.driver :
        c === "tax" ? niceDate(v.vehicleTaxDue) :
        c === "mot" ? niceDate(v.motExpiry) :
        c === "service" ? niceDate(v.serviceDue) :
        c === "inspection" ? (v.inspectionFrequency === "not_required" ? "Not required" : niceDate(v.nextInspectionOn)) :
        v.latestMiles != null ? v.latestMiles.toLocaleString("en-GB") : "",
      ),
    ]),
  );
  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="Fleet list.pdf"', "Cache-Control": "private, no-store" },
  });
}
