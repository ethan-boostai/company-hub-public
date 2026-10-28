import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth/session";
import { HousePdf } from "@/lib/pdf/house";

// A sample in the house PDF format, so the layout can be checked. Uses test job 12.
export async function GET() {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const pdf = await HousePdf.create({ title: "Sample document", jobNo: "12", subtitle: "Test site | Test client" });
  pdf.heading("About this sample");
  pdf.paragraph(
    "Every builder PDF in the hub uses this one house format: A4, the orange bar and logo at the top, section headings with an orange rule, orange table headers and the footer with page numbers.",
  );
  pdf.keyValues([
    ["Prepared by", person.name],
    ["Date", new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London" })],
    ["Job", "12 (test job)"],
  ]);
  pdf.heading("Example table");
  pdf.table(
    [
      { label: "Item", width: 0.08 },
      { label: "Description", width: 0.62 },
      { label: "Qty", width: 0.1 },
      { label: "Status", width: 0.2 },
    ],
    Array.from({ length: 60 }, (_, i) => [String(i + 1), `Test line ${i + 1}: a long description that wraps onto a second line to show how rows grow.`, String((i % 5) + 1), i % 3 ? "Done" : "To do"]),
  );
  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Job 12 - Sample document.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
