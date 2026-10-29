import "server-only";
import { HousePdf } from "@/lib/pdf/house";
import { niceDate } from "../_registers/dates";
import type { HsDocRow } from "./policy-data";

// The H&S policy General Statement in the house PDF format: the wording, the signature, then the
// document control details. Drafts (previews) carry a DRAFT watermark.
export async function buildPolicyPdf(d: HsDocRow, opts: { signature: Uint8Array | null; draft: boolean; issuedOn: string | null; issuedBy: string }): Promise<Uint8Array> {
  const pdf = await HousePdf.create({ title: "Health and Safety Policy Statement", subtitle: `General Statement | Issue ${d.version}` });
  for (const p of d.paragraphs.filter((x) => x.trim())) pdf.paragraph(p, 9.5);

  // One page, as live: the signature, then who signed and the document control details together.
  pdf.heading("Signed and document control");
  if (opts.signature) await pdf.image(opts.signature, { widthMm: 55, heightMm: 18 });
  else if (opts.draft) pdf.paragraph("(signed when issued)", 9);
  pdf.keyValues([
    ["Signed by", [d.signatoryName, d.signatoryRole].filter(Boolean).join(", ")],
    ["Date", niceDate(opts.issuedOn) || "Not issued yet"],
    ["Issue", d.version],
    ["Effective from", niceDate(d.effectiveOn)],
    ["Review due", niceDate(d.reviewDue)],
    ["H&S advisor", d.advisor],
    ["Issued by", opts.issuedBy || "Not issued yet"],
  ], 8.5);
  if (opts.draft) pdf.watermark("DRAFT");
  return pdf.finish();
}
