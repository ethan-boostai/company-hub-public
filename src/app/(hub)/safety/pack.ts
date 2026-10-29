import "server-only";
import { PDFDocument } from "pdf-lib";
import { HousePdf } from "@/lib/pdf/house";
import { niceDate } from "../_registers/dates";
import type { SubstanceRow } from "./data";
import { GHS, PPE, ROUTES, WHO } from "./rules";

const label = (list: readonly { value: string; label: string }[], values: string[]) =>
  values.map((v) => list.find((o) => o.value === v)?.label ?? v).join(", ");

// The CoSHH pack in the house PDF format. Part 1: the assessment. Part 2: the manufacturer's safety
// data sheet appended (its PDF pages, or a photo on its own page). Anything else is named, not merged.
export async function buildPack(
  s: SubstanceRow,
  version: number,
  madeOn: string,
  sds: { name: string; mime: string; bytes: Uint8Array } | null,
): Promise<Uint8Array> {
  const pdf = await HousePdf.create({
    title: `CoSHH Assessment - ${s.product}`,
    subtitle: [s.supplierName, `Version ${version}`, `Made ${niceDate(madeOn)}`].filter(Boolean).join(" | "),
  });

  pdf.heading("Part 1: Assessment");
  pdf.keyValues([
    ["Product", s.product],
    ["Supplier", s.supplierName],
    ["Used for", s.useFor],
    ["Where it's kept", s.location],
    ["Quantity", s.quantity],
    ["Safety data sheet dated", niceDate(s.sdsDate)],
  ]);

  pdf.heading("Hazards");
  pdf.keyValues([
    ["Hazard pictograms", label(GHS, s.ghs) || "None"],
    ["Ingredients", s.ingredients],
  ]);

  pdf.heading("Exposure");
  pdf.table(
    [
      { label: "Route", width: 0.16 },
      { label: "Effect", width: 0.28 },
      { label: "Control", width: 0.28 },
      { label: "First aid", width: 0.28 },
    ],
    ROUTES.map((r) => [r.label, s.exposure[r.value].effect, s.exposure[r.value].control, s.exposure[r.value].firstAid]),
  );
  pdf.keyValues([
    ["Who could be exposed", label(WHO, s.whoExposed)],
    ["How often", s.frequency],
    ["For how long", s.duration],
  ]);

  pdf.heading("Controls");
  pdf.keyValues([
    ["Controls", s.controls],
    ["Storage", s.storage],
    ["Spills and disposal", s.spillsDisposal],
    ["PPE", [label(PPE, s.ppe), s.ppeOther].filter(Boolean).join(", ")],
  ]);

  pdf.heading("Assessment");
  pdf.keyValues([
    ["Assessed by", s.assessedByName],
    ["Assessed on", niceDate(s.assessedOn)],
    ["Review due", niceDate(s.reviewOn)],
  ]);

  pdf.heading("Part 2: Safety data sheet");
  const isPdf = !!sds && (sds.mime === "application/pdf" || /\.pdf$/i.test(sds.name)) && isPdfBytes(sds.bytes);
  const isImage = !!sds && /^image\/(png|jpe?g)$/.test(sds.mime);
  pdf.paragraph(
    !sds
      ? "No safety data sheet has been added."
      : isPdf || isImage
        ? `The manufacturer's safety data sheet (${sds.name}) follows.`
        : `The safety data sheet (${sds.name}) can't be added to this PDF. Open it from the CoSHH register.`,
  );

  const doc = await PDFDocument.load(await pdf.finish());
  if (sds && isPdf) {
    try {
      const src = await PDFDocument.load(sds.bytes, { ignoreEncryption: true });
      for (const p of await doc.copyPages(src, src.getPageIndices())) doc.addPage(p);
    } catch {
      // A damaged or locked PDF: the pack still says which file it is (Part 2 note above).
    }
  } else if (sds && isImage) {
    const img = sds.mime === "image/png" ? await doc.embedPng(sds.bytes) : await doc.embedJpg(sds.bytes);
    const page = doc.addPage([595.28, 841.89]);
    const m = 40;
    const scale = Math.min((595.28 - m * 2) / img.width, (841.89 - m * 2) / img.height, 1);
    page.drawImage(img, { x: (595.28 - img.width * scale) / 2, y: (841.89 - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
  }
  return doc.save();
}

function isPdfBytes(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
}
