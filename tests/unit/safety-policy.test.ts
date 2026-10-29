import { describe, expect, it } from "vitest";
import { DEFAULT_PARAGRAPHS, issueName, missingForIssue, policyDueItems, policyFileName } from "@/app/(hub)/safety/policy-rules";

describe("H&S policy and manual rules", () => {
  it("starts with the old hub's 12-paragraph General Statement", () => {
    expect(DEFAULT_PARAGRAPHS).toHaveLength(12);
    expect(DEFAULT_PARAGRAPHS[0]).toMatch(/^CHELMSFORD BUILDING SERVICES LTD/);
  });

  it("names issues by month and year, and files as live", () => {
    expect(issueName("2026-10-30")).toBe("October 2026");
    expect(policyFileName("policy", "October 2026")).toBe("CBS H&S Policy General Statement - October 2026.pdf");
    expect(policyFileName("manual", "January 2026")).toBe("CBS H&S Manual - January 2026.pdf");
  });

  it("lists what an issue still needs", () => {
    const base = { version: "October 2026", effectiveOn: "2026-10-30", reviewDue: "2027-10-30", paragraphs: ["Wording"], signatoryId: 1, fileId: null };
    expect(missingForIssue({ kind: "policy", ...base })).toEqual([]);
    expect(missingForIssue({ kind: "policy", ...base, paragraphs: [" "], signatoryId: null })).toEqual(["the wording", "who signs it"]);
    expect(missingForIssue({ kind: "manual", ...base })).toEqual(["the manual PDF"]);
    expect(missingForIssue({ kind: "manual", ...base, fileId: 5, effectiveOn: null })).toEqual(["the effective date"]);
  });

  it("Needs attention: nothing issued, or the issued one's review is due", () => {
    const today = "2026-10-30";
    expect(policyDueItems([], today).map((i) => i.key)).toEqual(["none-policy", "none-manual"]);
    const items = policyDueItems([
      { id: 1, kind: "policy", status: "issued", version: "October 2025", reviewDue: "2026-10-20" },
      { id: 2, kind: "policy", status: "draft", version: "October 2026", reviewDue: null },
      { id: 3, kind: "manual", status: "issued", version: "January 2026", reviewDue: "2027-01-10" },
    ], today);
    expect(items.map((i) => [i.key, i.level])).toEqual([["review-1", "overdue"]]);
    expect(policyDueItems([{ id: 3, kind: "manual", status: "issued", version: "x", reviewDue: "2026-11-15" }], today).find((i) => i.kind === "manual")?.level).toBe("soon");
  });
});
