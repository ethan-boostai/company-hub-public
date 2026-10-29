import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth/session";
import { readDb } from "@/lib/db";
import { docQuery } from "@/app/(hub)/safety/policy-data";
import { buildPolicyPdf } from "@/app/(hub)/safety/policy-pdf";

// Preview of a draft policy statement (marked DRAFT, not signed, not saved anywhere).
export async function GET(_req: Request, ctx: RouteContext<"/api/safety/policy/[id]/preview">) {
  if (!(await getCurrentPerson())) return NextResponse.json({ ok: false, message: "Sign in again." }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  const [d] = await docQuery(await readDb(), Number(id));
  if (!d || d.kind !== "policy") return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  const bytes = await buildPolicyPdf(d, { signature: null, draft: d.status === "draft", issuedOn: d.issuedOn, issuedBy: d.issuedBy });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Policy statement ${d.version} (preview).pdf"`, "Cache-Control": "private, no-store" },
  });
}
