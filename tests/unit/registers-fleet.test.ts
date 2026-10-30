import { describe, expect, it } from "vitest";
import { addMonths, dueState, isIsoDate, ukLocalInput, ukToday } from "@/app/(hub)/_registers/dates";
import { fleetDueItems, milesState, nextInspectionAfterCheck, normaliseReg, vehicleLocationLabel } from "@/app/(hub)/fleet/rules";

describe("register dates", () => {
  it("checks real calendar dates", () => {
    expect(isIsoDate("2027-02-28")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("28/02/2027")).toBe(false);
  });

  it("adds months without running into the next month", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2027-02-01", 3)).toBe("2027-05-01");
  });

  it("works out due states", () => {
    expect(dueState(null, "2026-10-28")).toBe("none");
    expect(dueState("2026-10-27", "2026-10-28")).toBe("overdue");
    expect(dueState("2026-11-27", "2026-10-28")).toBe("soon");
    expect(dueState("2026-12-20", "2026-10-28")).toBe("up");
    expect(dueState("2027-03-01", "2026-10-28")).toBe("ok");
  });

  it("uses UK dates and times", () => {
    expect(ukToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01"); // BST
    expect(ukToday(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31"); // GMT
    expect(ukLocalInput("2026-10-20T15:25:00Z")).toBe("2026-10-20T16:25");
  });
});

describe("fleet rules", () => {
  it("stores regs in capitals with no spaces", () => {
    expect(normaliseReg(" zz11 zzz ")).toBe("ZZ11ZZZ");
    expect(normaliseReg("ZZ22-ZZZ")).toBe("ZZ22ZZZ");
  });

  it("names a van as a stock location", () => {
    expect(vehicleLocationLabel({ reg: "ZZ33ZZZ", makeModel: "Ford Transit", driver: "ZZ Driver" })).toBe("Ford Transit - ZZ Driver (ZZ33ZZZ)");
    expect(vehicleLocationLabel({ reg: "ZZ33ZZZ", makeModel: "", driver: "" })).toBe("ZZ33ZZZ");
  });

  it("rolls the next inspection on when a check counts for it", () => {
    // Quarterly, due 1 Feb 2027: a check from 11 Jan (21 days before) counts.
    expect(nextInspectionAfterCheck("2027-02-01", "2027-01-11", "quarterly")).toBe("2027-05-01");
    // Too early to count: left alone.
    expect(nextInspectionAfterCheck("2027-02-01", "2027-01-05", "quarterly")).toBe("2027-02-01");
    // A late check moves it past the check date.
    expect(nextInspectionAfterCheck("2027-02-01", "2027-06-10", "quarterly")).toBe("2027-08-01");
    // Monthly: 10 days' lead. Weekly: 3 days.
    expect(nextInspectionAfterCheck("2026-11-02", "2026-10-25", "monthly")).toBe("2026-12-02");
    expect(nextInspectionAfterCheck("2026-11-02", "2026-10-30", "weekly")).toBe("2026-11-09");
    // No date yet: set from the check. Not required: never changes.
    expect(nextInspectionAfterCheck(null, "2026-10-28", "monthly")).toBe("2026-11-28");
    expect(nextInspectionAfterCheck("2026-11-02", "2026-11-02", "not_required")).toBe("2026-11-02");
  });

  it("works out service by miles", () => {
    expect(milesState(50000, 49500)).toBe("soon");
    expect(milesState(50000, 47500)).toBe("up");
    expect(milesState(50000, 50100)).toBe("overdue");
    expect(milesState(null, 50100)).toBe("none");
  });

  it("lists what is due without creating or closing anything", () => {
    const today = "2026-10-28";
    const items = fleetDueItems(
      [{ id: 1, reg: "ZZ33ZZZ", vehicleTaxDue: "2026-11-05", motExpiry: "2027-10-31", serviceDue: "2026-10-01", serviceDueMiles: 50000,
        latestMiles: 49500, inspectionFrequency: "quarterly", nextInspectionOn: "2027-02-01" }],
      [{ id: 7, vehicleId: 1, checkedOn: "2026-10-27", status: "off_road", reviewed: false }],
      [{ id: 3, vehicleId: 1, occurredAt: null, status: "closed" }],
      today,
    );
    expect(items.map((i) => i.what).sort()).toEqual(["Check to review", "Service", "Service (miles)", "Vehicle Tax"]);
    expect(items.find((i) => i.what === "Service")?.tone).toBe("overdue");
  });
});
