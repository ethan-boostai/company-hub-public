import "server-only";
import { HousePdf } from "@/lib/pdf/house";
import { niceDate } from "@/app/(hub)/_registers/dates";
import { riskRating } from "@/app/(hub)/safety/rules";
import { PERMIT_LIST, ramsNo, STANDARD_KEYS, STANDARD_LABELS } from "./content";
import type { RamsRow } from "./data";

const risk = (l: number, c: number) => `${l}x${c} ${riskRating(l, c) ?? ""}`.trim();
const CODE_NAMES: Record<string, string> = { E: "Eliminate", S: "Substitute", I: "Isolate", G: "Engineering", A: "Administrative", P: "PPE" };

// The RAMS in the house PDF format, the old builder's 12 sections. Section 12 (worker sign-on) is
// added to the signed copy as people sign.
export async function buildRamsPdf(r: RamsRow, extra: { site: string; client: string; substances: { name: string; supplier: string }[] }): Promise<Uint8Array> {
  const c = r.content;
  const pdf = await HousePdf.create({
    title: `RAMS ${ramsNo(r.jobNo, r.seq)} rev ${r.revision}: ${r.title}`,
    jobNo: r.jobNo,
    subtitle: [c.meta.site || extra.site, c.meta.client || extra.client, `Dated ${niceDate(r.dated) || niceDate(r.issuedAt?.slice(0, 10) ?? null)}`].filter(Boolean).join(" | "),
  });

  pdf.heading("1. General details");
  pdf.keyValues([
    ["Activity", r.title], ["Task", c.meta.taskShort], ["Site", c.meta.site || extra.site], ["Client", [c.meta.client || extra.client, c.meta.clientContact].filter(Boolean).join(", ")],
    ["RAMS number", `${ramsNo(r.jobNo, r.seq)} revision ${r.revision}`], ["Start date", c.meta.startDate], ["Duration", c.meta.duration],
    ["Supervisor", c.meta.supervisor], ["Responsible person", c.meta.responsible], ["Prepared by", r.preparedBy], ["Approved by", [r.approvedBy, r.approverRole].filter(Boolean).join(", ")],
  ]);

  pdf.heading("2. Description of works");
  pdf.paragraph(c.scope || "-");

  pdf.heading("3. Risk rating");
  pdf.paragraph("Risk = likelihood (1 Rare to 5 Almost certain) x consequence (1 Insignificant to 5 Catastrophic): 1-4 Low, 5-9 Medium, 10-19 High, 20-25 Extreme. Each step and hazard is rated before and after its controls. Control types: E Eliminate, S Substitute, I Isolate, G Engineering, A Administrative, P PPE.", 9);

  pdf.heading("4. Method statement");
  pdf.table(
    [
      { label: "#", width: 0.04 }, { label: "Task", width: 0.21 }, { label: "Hazards", width: 0.15 }, { label: "Controls", width: 0.26 },
      { label: "Risk", width: 0.08 }, { label: "After", width: 0.08 }, { label: "Who", width: 0.12 }, { label: "Type", width: 0.06 },
    ],
    c.steps.map((s, i) => [String(i + 1), s.task, s.hazards, s.controls, risk(s.il, s.ic), risk(s.rl, s.rc), s.who, s.codes.join("")]),
  );

  pdf.heading("5. Hazard register");
  pdf.table(
    [
      { label: "Hazard", width: 0.16 }, { label: "Harm", width: 0.18 }, { label: "Controls", width: 0.31 },
      { label: "Risk", width: 0.09 }, { label: "After", width: 0.09 }, { label: "Who", width: 0.1 }, { label: "Type", width: 0.07 },
    ],
    c.register.map((h) => [h.name, h.harm, h.controls, risk(h.il, h.ic), risk(h.rl, h.rc), h.who, h.codes.join("")]),
  );

  pdf.heading("6. Resources and plant");
  pdf.keyValues([
    ["Workers", c.res.workers], ["Subcontractors", c.res.subcontractors], ["Plant and tools", [c.res.plant, c.plantCategories.join(", ")].filter(Boolean).join("\n")], ["Materials", c.res.materials],
  ]);
  if (extra.substances.length) {
    pdf.paragraph("CoSHH assessments (on site with their safety data sheets):", 9);
    pdf.table([{ label: "Product", width: 0.6 }, { label: "Supplier", width: 0.4 }], extra.substances.map((s) => [s.name, s.supplier]));
  }

  pdf.heading("7. PPE");
  pdf.paragraph([c.ppe.join(", "), c.ppeExtra].filter(Boolean).join("\n") || "-");

  pdf.heading("8. Permits, licences and competencies");
  pdf.paragraph([c.permits.map((k) => PERMIT_LIST.find((p) => p.key === k)?.label ?? k).map((l) => `- ${l}`).join("\n"), c.permitExtra].filter(Boolean).join("\n") || "-");

  pdf.heading("9. Emergency and welfare");
  pdf.keyValues((["hospital", "assembly", "emergency", "firstAid", "fire", "welfare"] as const).map((k) => [STANDARD_LABELS[k], c.std[k]]));

  pdf.heading("10. Consultation, monitoring and review");
  pdf.keyValues(STANDARD_KEYS.filter((k) => ["notifiable", "consultation", "overlap", "monitoring", "review"].includes(k)).map((k) => [STANDARD_LABELS[k], c.std[k]]));

  pdf.heading("11. Sign-off");
  pdf.keyValues([
    ["Prepared by", `${r.preparedBy}${r.dated ? `, ${niceDate(r.dated)}` : ""}`],
    ["Approved by", `${[r.approvedBy, r.approverRole].filter(Boolean).join(", ")}${r.issuedAt ? `, issued ${niceDate(r.issuedAt.slice(0, 10))} by ${r.issuedBy}` : ""}`],
  ]);

  pdf.heading("12. Worker sign-on");
  pdf.paragraph("Everyone working to this RAMS signs on to this revision in the CBS Operations Hub or on the job's crew page. The signed copy lists each person, their company, when they signed and their signature. A new revision needs everyone to sign again.", 9);
  pdf.paragraph(`Control types used: ${Array.from(new Set(c.steps.flatMap((s) => s.codes))).map((x) => `${x} ${CODE_NAMES[x]}`).join(", ") || "-"}`, 8.5);
  return pdf.finish();
}
