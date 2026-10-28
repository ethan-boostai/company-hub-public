import { afterEach, describe, expect, it } from "vitest";
import { closedChange } from "@/app/(hub)/requests/rules";
import { teamKeyOk } from "@/app/team/key";

describe("team link key", () => {
  const before = process.env.TEAM_LINK_KEY;
  afterEach(() => {
    process.env.TEAM_LINK_KEY = before;
  });

  it("lets in only the exact key", () => {
    process.env.TEAM_LINK_KEY = "a-long-random-team-key-1234";
    expect(teamKeyOk("a-long-random-team-key-1234")).toBe(true);
    expect(teamKeyOk("a-long-random-team-key-123")).toBe(false);
    expect(teamKeyOk("")).toBe(false);
    expect(teamKeyOk(null)).toBe(false);
  });

  it("refuses everything when no key (or a short one) is set", () => {
    process.env.TEAM_LINK_KEY = "";
    expect(teamKeyOk("")).toBe(false);
    expect(teamKeyOk("anything")).toBe(false);
    process.env.TEAM_LINK_KEY = "short";
    expect(teamKeyOk("short")).toBe(false);
  });
});

describe("team requests", () => {
  it("closes when done or declined and reopens when set back", () => {
    expect(closedChange(null, "new")).toBe(null);
    expect(closedChange(null, "done")).toBe("close");
    expect(closedChange("in_progress", "declined")).toBe("close");
    expect(closedChange("done", "declined")).toBe(null);
    expect(closedChange("done", "in_progress")).toBe("reopen");
  });
});
