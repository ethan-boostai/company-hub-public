import { readDb } from "@/lib/db";
import { getCurrentPerson } from "@/lib/auth/session";
import { HousePdf } from "@/lib/pdf/house";
import { niceDate, ukToday } from "../../_registers/dates";
import { loadInsurance } from "../data";
import { CLAIM_STATUSES, DIRECTIONS, expiryLabel, isClosed, labelOf, money, policyTitle } from "../rules";

// The insurance and accreditations report in the house PDF format, with what the office chose.
export async function GET(req: Request) {
  const person = await getCurrentPerson();
  if (!person) return Response.json({ ok: false, message: "Sign in again." }, { status: 401 });
  await readDb();
  const q = new URL(req.url).searchParams;
  const policiesMode = q.get("policies") === "all" ? "all" : q.get("policies") === "current" ? "current" : "none";
  const withCovers = q.get("covers") === "1";
  const claimsMode = q.get("claims") === "all" ? "all" : q.get("claims") === "open" ? "open" : "none";
  const withAmounts = q.get("amounts") === "1";
  const withCerts = q.get("certs") === "1";
  const withCosts = q.get("costs") === "1";
  const today = ukToday();
  const data = await loadInsurance();

  const pdf = await HousePdf.create({ title: "Insurance and accreditations", subtitle: `${niceDate(today)} | ${person.name}` });
  pdf.keyValues([["Created", `${niceDate(today)} by ${person.name}`]]);

  if (policiesMode !== "none") {
    const policies = data.policies.filter((p) => policiesMode === "all" || !p.renewedById);
    pdf.heading(policiesMode === "all" ? "Policies (all periods)" : "Policies");
    if (policies.length === 0) pdf.paragraph("No policies to show.");
    else {
      pdf.table(
        [{ label: "Policy", width: 0.26 }, { label: "Insurer", width: 0.18 }, { label: "Policy number", width: 0.16 }, { label: "Period", width: 0.22 }, { label: "Status", width: 0.18 }],
        policies.map((p) => [
          policyTitle(p), p.insurer, p.policyNo,
          `${p.startsOn ? niceDate(p.startsOn) : "?"} to ${p.expiresOn ? niceDate(p.expiresOn) : "?"}`,
          p.renewedById ? "Renewed (earlier period)" : expiryLabel(p.expiresOn, today),
        ]),
      );
      if (withCovers) {
        const rows = policies.flatMap((p) => p.covers.map((c) => [policyTitle(p), c.cover, money(c.limit), money(c.excess)]));
        pdf.heading("Covers");
        if (rows.length === 0) pdf.paragraph("No covers recorded.");
        else pdf.table([{ label: "Policy", width: 0.32 }, { label: "Cover", width: 0.32 }, { label: "Limit", width: 0.18 }, { label: "Excess", width: 0.18 }], rows);
      }
    }
  }

  if (claimsMode !== "none") {
    const claims = data.claims.filter((c) => claimsMode === "all" || !isClosed(c.status));
    pdf.heading(claimsMode === "open" ? "Open claims" : "Claims");
    if (claims.length === 0) pdf.paragraph("No claims to show.");
    else {
      const linked = (c: (typeof claims)[number]) => {
        const v = data.vehicles.find((x) => x.id === c.vehicleId)?.reg;
        const a = data.assets.find((x) => x.id === c.assetId);
        return [v, a?.name, c.jobNo && `Job ${c.jobNo}`, c.site].filter(Boolean).join(", ");
      };
      const cols = [
        { label: "Claim", width: 0.2 }, { label: "Status", width: 0.13 }, { label: "Incident", width: 0.12 }, { label: "Linked to", width: 0.17 },
        { label: "Next action", width: withAmounts ? 0.18 : 0.38 },
        ...(withAmounts ? [{ label: "Claimed / excess / settled", width: 0.2 }] : []),
      ];
      pdf.table(cols, claims.map((c) => [
        `${c.claimNo} ${c.claimType} (${labelOf(DIRECTIONS, c.direction).toLowerCase()})`,
        labelOf(CLAIM_STATUSES, c.status) + (c.closedOn ? `, ${niceDate(c.closedOn)}` : ""),
        c.incidentDate ? niceDate(c.incidentDate) : "",
        linked(c),
        isClosed(c.status) ? "" : [c.nextAction, c.nextActionDue ? `by ${niceDate(c.nextActionDue)}` : ""].filter(Boolean).join(" "),
        ...(withAmounts ? [[money(c.amountClaimed) || "-", money(c.excess) || "-", money(c.amountSettled) || "-"].join(" / ")] : []),
      ]));
    }
  }

  if (withCerts) {
    pdf.heading("Accreditations");
    if (data.certs.length === 0) pdf.paragraph("No accreditations recorded.");
    else {
      pdf.table(
        [
          { label: "Accreditation", width: withCosts ? 0.24 : 0.28 }, { label: "Organisation", width: 0.2 }, { label: "Number / level", width: withCosts ? 0.18 : 0.22 },
          { label: "Expires", width: 0.15 }, { label: "Status", width: 0.15 }, ...(withCosts ? [{ label: "Annual cost", width: 0.08 }] : []),
        ],
        data.certs.map((c) => [
          c.name, c.issuer, [c.reference, c.level].filter(Boolean).join(", "), c.expiresOn ? niceDate(c.expiresOn) : "No expiry",
          expiryLabel(c.expiresOn, today), ...(withCosts ? [money(c.annualCost)] : []),
        ]),
      );
    }
  }

  const bytes = await pdf.finish();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Insurance and accreditations - ${today}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
