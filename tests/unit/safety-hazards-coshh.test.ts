import { describe, expect, it } from "vitest";
import {
  contentKey, emptyExposure, hazardDueItems, missingForAssessed, packFileName, ramsKey, readExposure, riskRating, substanceDueItems,
  type AssessmentContent,
} from "@/app/(hub)/safety/rules";

describe("hazard risk rating (likelihood x consequence, as the old hub)", () => {
  it("bands the score", () => {
    expect(riskRating(1, 4)).toBe("Low");
    expect(riskRating(1, 5)).toBe("Medium");
    expect(riskRating(3, 3)).toBe("Medium");
    expect(riskRating(2, 5)).toBe("High");
    expect(riskRating(4, 5)).toBe("Extreme");
    expect(riskRating(5, 5)).toBe("Extreme");
  });
  it("is empty until both are chosen", () => {
    expect(riskRating(null, 3)).toBeNull();
    expect(riskRating(3, null)).toBeNull();
  });
});

describe("RAMS keys", () => {
  it("are lower case words joined by _", () => {
    expect(ramsKey("Working at Height (ladders)")).toBe("working_at_height_ladders");
    expect(ramsKey("Silica dust – cutting")).toBe("silica_dust_cutting");
    expect(ramsKey("!!!")).toBe("hazard");
  });
});

const base = (): AssessmentContent => ({
  ghs: ["flammable", "harmful"], ingredients: "Xylene 10%", exposure: emptyExposure(), whoExposed: ["employees"], frequency: "Daily", duration: "1 hour",
  controls: "Ventilate", storage: "Flammables cabinet", spillsDisposal: "Absorb with sand", ppe: ["gloves", "eye"], ppeOther: "", sdsFileId: 7,
});

describe("CoSHH pack version: only assessment content counts (Ethan, 29/10/2026)", () => {
  it("doesn't change with tick order or spacing", () => {
    const a = base();
    const b = { ...base(), ghs: ["harmful", "flammable"], ppe: ["eye", "gloves"], controls: "  Ventilate " };
    expect(contentKey(a)).toBe(contentKey(b));
  });
  it.each([
    ["hazard classes", { ghs: ["flammable"] }],
    ["ingredients", { ingredients: "Xylene 20%" }],
    ["controls", { controls: "Ventilate and LEV" }],
    ["storage", { storage: "Locked store" }],
    ["spills", { spillsDisposal: "Call the supplier" }],
    ["PPE", { ppe: ["gloves"] }],
    ["the SDS", { sdsFileId: 8 }],
  ])("changes with %s", (_, change) => {
    expect(contentKey({ ...base(), ...change } as AssessmentContent)).not.toBe(contentKey(base()));
  });
  it("changes with exposure", () => {
    const b = base();
    b.exposure.skin.firstAid = "Wash with soap and water";
    expect(contentKey(b)).not.toBe(contentKey(base()));
  });
  it("reads stored exposure safely", () => {
    const e = readExposure({ skin: { effect: "Dermatitis", firstAid: 3 }, nonsense: {} });
    expect(e.skin).toEqual({ effect: "Dermatitis", control: "", firstAid: "" });
    expect(e.eyes).toEqual({ effect: "", control: "", firstAid: "" });
  });
  it("names the pack with its version and date", () => {
    expect(packFileName("Thinners", 3, "2026-10-30")).toBe("Thinners - COSHH Assessment v3 - 2026-10-30.pdf");
  });
});

describe("Assessed needs the essentials", () => {
  it("lists what's missing", () => {
    expect(missingForAssessed({ supplierId: null, useFor: "", controls: " ", assessedById: null, assessedOn: null, reviewOn: null, sdsFileId: null }))
      .toEqual(["supplier", "what it's used for", "controls", "assessed by", "assessed on", "review due", "the safety data sheet"]);
    expect(missingForAssessed({ supplierId: 1, useFor: "Painting", controls: "Ventilate", assessedById: 2, assessedOn: "2026-10-30", reviewOn: "2027-10-30", sdsFileId: 3 })).toEqual([]);
  });
});

describe("Needs attention", () => {
  const today = "2026-10-30";
  it("hazards: review overdue and due within 30 days, active only", () => {
    const items = hazardDueItems([
      { id: 1, hazard: "Old", status: "active", reviewOn: "2026-10-01" },
      { id: 2, hazard: "Soon", status: "active", reviewOn: "2026-11-20" },
      { id: 3, hazard: "Later", status: "active", reviewOn: "2027-03-01" },
      { id: 4, hazard: "Archived", status: "archived", reviewOn: "2026-10-01" },
    ], today);
    expect(items.map((i) => [i.id, i.level])).toEqual([[1, "overdue"], [2, "soon"]]);
  });
  it("CoSHH: review, still Draft, and a pack that wasn't made", () => {
    const items = substanceDueItems([
      { id: 1, product: "A", status: "assessed", reviewOn: "2026-10-01", packCurrent: true },
      { id: 2, product: "B", status: "draft", reviewOn: null, packCurrent: false },
      { id: 3, product: "C", status: "assessed", reviewOn: "2027-10-01", packCurrent: false },
      { id: 4, product: "D", status: "assessed", reviewOn: "2027-10-01", packCurrent: true },
    ], today);
    expect(items.map((i) => [i.id, i.tag, i.level])).toEqual([[1, "Review", "overdue"], [3, "Pack", "overdue"], [2, "Draft", "soon"]]);
  });
});
