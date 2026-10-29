import { describe, expect, it } from "vitest";
import { builtIn, lockReason } from "@/lib/requirements";

// Ethan's decisions (docs/plan.md 3.6, items 11 and 12).
describe("built-in requirements", () => {
  const project = { stage: "approved", jobType: "project" };
  const cdm = { stage: "approved", jobType: "cdm" };
  const req = (k: string) => builtIn(k)!;

  it("locks only the CDM-only types on Project jobs", () => {
    for (const k of ["permits", "site_inspection", "inductions", "visitors", "diary"]) {
      expect(lockReason(req(k), project), k).toMatch(/CDM/);
      expect(lockReason(req(k), cdm), k).toBeNull();
    }
    expect(lockReason(req("cphsp"), project)).toBeNull();
    expect(req("cphsp").cdmPrompt).toBe(true);
  });

  it("puts each type on the right side", () => {
    expect(req("inspections").side).toBe("office");
    for (const k of ["prestart", "toolbox", "site_inspection"]) expect(req(k).side, k).toBe("site");
  });
});
