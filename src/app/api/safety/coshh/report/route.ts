import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth/session";
import { HousePdf, type Column } from "@/lib/pdf/house";
import { loadSubstances } from "@/app/(hub)/safety/data";
import { GHS, PPE, substanceDueItems } from "@/app/(hub)/safety/rules";
import { niceDate, ukToday } from "@/app/(hub)/_registers/dates";

// CoSHH register in the house PDF format. The office chooses which substances and which columns.
const COLS: Record<string, { label: string; width: number }> = {
  supplier: { label: "Supplier", width: 0.14 },
  use: { label: "Used for", width: 0.15 },
  location: { label: "Where it's kept", width: 0.11 },
  ghs: { label: "Hazard pictograms", width: 0.16 },
  ppe: { label: "PPE", width: 0.14 },
  assessed: { label: "Assessed", width: 0.13 },
  review: { label: "Review due", width: 0.1 },
  version: { label: "Pack", width: 0.06 },
  status: { label: "Status", width: 0.08 },
};
const WHICH: Record<string, string> = { all: "All substances", assessed: "Assessed", draft: "Draft", review: "Review due or overdue" };
const names = (list: readonly { value: string; label: string }[], v: string[]) => v.map((x) => list.find((o) => o.value === x)?.label ?? x).join(", ");

export async function GET(req: Request) {
  if (!(await getCurrentPerson())) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const url = new URL(req.url);
  const which = WHICH[url.searchParams.get("which") || ""] ? url.searchParams.get("which")! : "all";
  const cols = (url.searchParams.get("cols") || "").split(",").filter((c) => c in COLS);

  const { substances } = await loadSubstances();
  const review = new Set(substanceDueItems(substances, ukToday()).filter((d) => d.tag === "Review").map((d) => d.id));
  const rows = substances.filter((s) => (which === "all" ? true : which === "review" ? review.has(s.id) : s.status === which));

  const pdf = await HousePdf.create({ title: "CoSHH register", subtitle: `${WHICH[which]} | ${rows.length} ${rows.length === 1 ? "substance" : "substances"}`, landscape: cols.length > 4 });
  const used = cols.reduce((n, c) => n + COLS[c].width, 0);
  const columns: Column[] = [{ label: "Product", width: Math.max(0.14, 1 - used) }, ...cols.map((c) => COLS[c])];
  const total = columns.reduce((n, c) => n + c.width, 0);
  pdf.table(
    columns.map((c) => ({ ...c, width: c.width / total })),
    rows.map((s) => [
      s.product,
      ...cols.map((c) =>
        c === "supplier" ? s.supplierName :
        c === "use" ? s.useFor :
        c === "location" ? s.location :
        c === "ghs" ? names(GHS, s.ghs) :
        c === "ppe" ? [names(PPE, s.ppe), s.ppeOther].filter(Boolean).join(", ") :
        c === "assessed" ? [s.assessedByName, niceDate(s.assessedOn)].filter(Boolean).join(", ") :
        c === "review" ? niceDate(s.reviewOn) :
        c === "version" ? (s.packFileId ? `v${s.version}` : "") :
        s.status === "assessed" ? "Assessed" : "Draft",
      ),
    ]),
  );
  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="CoSHH register.pdf"', "Cache-Control": "private, no-store" },
  });
}
