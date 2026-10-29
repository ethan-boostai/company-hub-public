// H&S policy statement and manual: fixed lists and rules (pure, shared by screens, server and tests).
import { daysBetween, dueState, niceDate } from "../_registers/dates";

export type DocKind = "policy" | "manual";
export type DocStatus = "draft" | "issued" | "superseded";

export const KIND_LABEL: Record<DocKind, string> = { policy: "H&S policy statement", manual: "H&S manual" };
export const STATUS_LABEL: Record<DocStatus, string> = { draft: "Draft", issued: "Issued", superseded: "Superseded" };

// The General Statement wording every new policy starts with (the old hub's default, cbs-hs.html).
export const DEFAULT_PARAGRAPHS = [
  "CHELMSFORD BUILDING SERVICES LTD (the Company) is committed to ensuring the health, safety, and welfare of its employees in accordance with the Health and Safety at Work etc. Act 1974 and all relevant regulations, so far as is reasonably practicable.",
  "Our Directors, represented by Mr. Arran Flanders, who is also our named competent person working in conjunction with Citation, our Health & Safety advisors, are ultimately responsible for fulfilling this commitment.",
  "We also fully accept our responsibility for other persons who may be affected by our activities.",
  "We will take appropriate steps to ensure that our statutory duties are met at all times. It is the duty of management to ensure that adequate resources are made available to fulfil these obligations and that all processes and systems of work are designed with due consideration for health and safety and are properly supervised at all times.",
  "Each employee and any person engaged by the Company will be provided with the necessary information, instruction, and training. We will consult with all such individuals and encourage feedback to support the safe performance of all work activities.",
  "Adequate facilities and arrangements will be maintained to enable employees and their representatives to raise health and safety concerns.",
  "Competent persons will be appointed to assist in meeting our statutory duties, including, where appropriate, the engagement of external specialists.",
  "All employees and persons engaged by the Company must support and fully co-operate with the Company, including following the standards, procedures, and guidance set out in Company documentation, to ensure compliance with all statutory duties.",
  "The successful implementation of this policy requires total commitment from every level of employee and all contracted persons working for the Company. Our clients and other relevant parties also have a responsibility to ensure that our Company, our staff, and our representatives are aware of and understand all site-specific health, safety, and welfare policies, arrangements, and procedures with which we are required to comply.",
  "Each individual at work has a legal duty to take reasonable care of their own health and safety, and that of others who may be affected by their acts or omissions.",
  "Full details of the organisation and arrangements for health and safety are set out in our Health, Safety & Welfare Manual and, where necessary, in additional supporting documents.",
  "This policy, and the systems supporting its implementation, will be periodically monitored to ensure that our commitments are met and our objectives achieved. The policy will be reviewed annually, or sooner if required, in response to legislative, organisational, or working practice changes.",
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The issue name a new document starts with, e.g. "October 2026" (as the old hub).
export function issueName(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function policyFileName(kind: DocKind, version: string): string {
  return kind === "policy" ? `CBS H&S Policy General Statement - ${version}.pdf` : `CBS H&S Manual - ${version}.pdf`;
}

// What an issue needs before it can go out.
export function missingForIssue(d: { kind: DocKind; version: string; effectiveOn: string | null; reviewDue: string | null; paragraphs: string[]; signatoryId: number | null; fileId: number | null }): string[] {
  const out: string[] = [];
  if (!d.version.trim()) out.push("the issue name");
  if (!d.effectiveOn) out.push("the effective date");
  if (!d.reviewDue) out.push("the review date");
  if (d.kind === "policy") {
    if (!d.paragraphs.some((p) => p.trim())) out.push("the wording");
    if (!d.signatoryId) out.push("who signs it");
  } else if (!d.fileId) out.push("the manual PDF");
  return out;
}

export type PolicyDueItem = { key: string; id: number | null; kind: DocKind; level: "overdue" | "soon"; tag: string; name: string; detail: string };

// Needs attention: no issued policy or manual; an issued one whose review is overdue or due within 30 days.
export function policyDueItems(docs: { id: number; kind: DocKind; status: DocStatus; version: string; reviewDue: string | null }[], today: string): PolicyDueItem[] {
  const out: PolicyDueItem[] = [];
  for (const kind of ["policy", "manual"] as DocKind[]) {
    const issued = docs.find((d) => d.kind === kind && d.status === "issued");
    if (!issued) {
      out.push({ key: `none-${kind}`, id: null, kind, level: "overdue", tag: "Not issued", name: KIND_LABEL[kind], detail: `No ${kind === "policy" ? "policy statement" : "manual"} has been issued.` });
      continue;
    }
    const d = dueState(issued.reviewDue, today, 30, 30);
    if (d === "overdue" || d === "soon") {
      const n = daysBetween(today, issued.reviewDue!);
      out.push({ key: `review-${issued.id}`, id: issued.id, kind, level: d, tag: "Review", name: `${KIND_LABEL[kind]} ${issued.version}`,
        detail: n < 0 ? `Review was due ${niceDate(issued.reviewDue)}` : `Review due ${niceDate(issued.reviewDue)}` });
    }
  }
  return out;
}
