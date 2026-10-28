import { describe, expect, it } from "vitest";
import { docDueItems, docLabel, docState, mergeOptions } from "@/app/(hub)/subcontractors/rules";

describe("subcontractors and suppliers rules", () => {
  it("merges the starting list with options the office added, without repeats", () => {
    expect(mergeOptions(["Roofing", "Scaffolding"], ["scaffolding", "Glazing ", ""])).toEqual(["Roofing", "Scaffolding", "Glazing"]);
  });

  it("colours documents by expiry: expired, 30 days, 60 days", () => {
    const today = "2026-10-28";
    expect(docState(null, today)).toBe("none");
    expect(docState("2026-10-27", today)).toBe("overdue");
    expect(docState("2026-11-20", today)).toBe("soon");
    expect(docState("2026-12-20", today)).toBe("up");
    expect(docState("2027-08-18", today)).toBe("ok");
    expect(docLabel("2026-11-17", today)).toBe("20 days left");
    expect(docLabel("2026-10-27", today)).toBe("Expired 27 Oct 2026");
    expect(docLabel(null, today)).toBe("No expiry date");
  });

  it("lists documents expired or expiring within 60 days, soonest first", () => {
    const today = "2026-10-28";
    const items = docDueItems(
      [
        { id: 1, kind: "subcontractor", companyId: 1, company: "B Co", item: "Public liability insurance", expiresOn: "2026-12-01" },
        { id: 2, kind: "supplier", companyId: 4, company: "A Co", item: "Goods in transit insurance", expiresOn: "2026-10-01" },
        { id: 3, kind: "subcontractor", companyId: 1, company: "B Co", item: "CSCS cards", expiresOn: "2027-06-01" },
        { id: 4, kind: "subcontractor", companyId: 2, company: "C Co", item: "Trade qualification", expiresOn: null },
      ],
      today,
    );
    expect(items.map((i) => i.id)).toEqual([2, 1]);
  });
});
