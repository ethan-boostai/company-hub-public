import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth/session";
import { HousePdf, type Column } from "@/lib/pdf/house";
import { loadHazards } from "@/app/(hub)/safety/data";
import { hazardDueItems } from "@/app/(hub)/safety/rules";
import { niceDate, ukToday } from "@/app/(hub)/_registers/dates";

// Hazard register in the house PDF format. The office chooses which hazards and which columns.
const COLS: Record<string, { label: string; width: number }> = {
  type: { label: "Type", width: 0.08 },
  activity: { label: "Activity", width: 0.12 },
  harm: { label: "Harm", width: 0.17 },
  risk: { label: "Risk", width: 0.08 },
  controls: { label: "Controls", width: 0.25 },
  residual: { label: "After controls", width: 0.09 },
  owner: { label: "Owner", width: 0.1 },
  review: { label: "Review due", width: 0.1 },
  status: { label: "Status", width: 0.08 },
};
const WHICH: Record<string, string> = { active: "Active hazards", task: "Active Task hazards", workplace: "Active Workplace hazards", review: "Review due or overdue", archived: "Archived hazards", all: "All hazards" };

export async function GET(req: Request) {
  if (!(await getCurrentPerson())) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const url = new URL(req.url);
  const which = WHICH[url.searchParams.get("which") || ""] ? url.searchParams.get("which")! : "active";
  const cols = (url.searchParams.get("cols") || "").split(",").filter((c) => c in COLS);

  const { hazards } = await loadHazards();
  const review = new Set(hazardDueItems(hazards, ukToday()).map((d) => d.id));
  const rows = hazards.filter((h) =>
    which === "all" ? true : which === "review" ? review.has(h.id) :
    which === "task" || which === "workplace" ? h.status === "active" && h.hazardType === which : h.status === which);

  const pdf = await HousePdf.create({ title: "Hazard register", subtitle: `${WHICH[which]} | ${rows.length} ${rows.length === 1 ? "hazard" : "hazards"}`, landscape: cols.length > 4 });
  const used = cols.reduce((n, c) => n + COLS[c].width, 0);
  const columns: Column[] = [{ label: "Hazard", width: Math.max(0.14, 1 - used) }, ...cols.map((c) => COLS[c])];
  const total = columns.reduce((n, c) => n + c.width, 0);
  pdf.table(
    columns.map((c) => ({ ...c, width: c.width / total })),
    rows.map((h) => [
      h.hazard,
      ...cols.map((c) =>
        c === "type" ? (h.hazardType === "workplace" ? "Workplace" : "Task") :
        c === "activity" ? h.activity :
        c === "harm" ? h.harm :
        c === "risk" ? (h.riskRating ? `${h.riskRating} (${h.likelihood}x${h.consequence})` : "") :
        c === "controls" ? h.controls :
        c === "residual" ? (h.residualRisk ? `${h.residualRisk} (${h.residualLikelihood}x${h.residualConsequence})` : "") :
        c === "owner" ? h.ownerName :
        c === "review" ? niceDate(h.reviewOn) :
        h.status === "active" ? "Active" : "Archived",
      ),
    ]),
  );
  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="Hazard register.pdf"', "Cache-Control": "private, no-store" },
  });
}
