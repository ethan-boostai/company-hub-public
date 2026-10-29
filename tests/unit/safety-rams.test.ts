import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  changedSinceIssue, CLOSE_STEPS, emptyContent, fromTemplate, missingForIssue, normalise, OPEN_STEPS, ramsFileName, toTemplate,
} from "@/lib/rams/content";
import jobTypes from "../../scripts/seed/rams-job-types.json";

const lib = [
  { ramsKey: "dust", hazard: "Dust", harm: "Lungs", controls: "RPE", likelihood: 4, consequence: 3, residualLikelihood: 2, residualConsequence: 2, controlCodes: ["G", "P"], updatedAt: "2026-10-01T00:00:00.000Z" },
  { ramsKey: "noise", hazard: "Noise", harm: "Hearing", controls: "Ear defenders", likelihood: null, consequence: null, residualLikelihood: null, residualConsequence: null, controlCodes: ["X"], updatedAt: "2026-10-20T00:00:00.000Z" },
];

describe("RAMS content", () => {
  it("starts from a job type: opening steps, its steps, closing steps, library hazards", () => {
    const { title, content } = fromTemplate({ activity: "Grind floor", steps: [{ task: "Grind", hazards: "Dust", controls: "Vac", il: 4, ic: 3, rl: 2, rc: 2, who: "Ops", codes: ["G"] }], hazards: ["dust", "gone"], ppe: ["Gloves"], permits: ["hot_works", "nonsense"] }, lib, "1 High St");
    expect(title).toBe("Grind floor");
    expect(content.meta.site).toBe("1 High St");
    expect(content.steps.map((s) => s.group)).toEqual([...OPEN_STEPS.map(() => "open"), "task", ...CLOSE_STEPS.map(() => "close")]);
    expect(content.register.map((h) => h.key)).toEqual(["dust"]);
    expect(content.ppe).toEqual(["Gloves"]);
    expect(content.permits.every((p) => p !== "nonsense")).toBe(true);
  });

  it("uses the job type's choice of opening steps", () => {
    const { content } = fromTemplate({ openSteps: [0] }, lib);
    expect(content.steps.filter((s) => s.group === "open")).toHaveLength(1);
  });

  it("library hazards with no ratings get the defaults and only real control codes", () => {
    const { content } = fromTemplate({ hazards: ["noise"] }, lib);
    expect(content.register[0]).toMatchObject({ il: 3, ic: 3, rl: 1, rc: 2, codes: [] });
  });

  it("every seeded job type builds", () => {
    for (const t of jobTypes) {
      const { content } = fromTemplate(t.template as never, []);
      expect(content.steps.filter((s) => s.group === "task")).toHaveLength(t.template.steps.length);
    }
  });

  it("normalise keeps only what a RAMS holds", () => {
    const c = normalise({ meta: { site: "x".repeat(500), evil: "y" }, steps: [{ id: "bad id!", task: "T", il: 9, ic: "2", codes: ["E", "Z"] }, null], register: [{ name: "" }, { name: "Dust", key: "dust" }], coshh: [1, "2", -3, "x"], permits: ["hot_works", "made_up"], std: {} });
    expect(c.meta.site).toHaveLength(300);
    expect("evil" in c.meta).toBe(false);
    expect(c.steps[0]).toMatchObject({ task: "T", il: 3, ic: 2, codes: ["E"], group: "task" });
    expect(c.steps[0].id).not.toBe("bad id!");
    expect(c.steps).toHaveLength(2);
    expect(c.register.map((h) => h.name)).toEqual(["Dust"]);
    expect(c.coshh).toEqual([1, 2]);
    expect(c.permits).toEqual(c.permits.filter((p) => p !== "made_up"));
    expect(c.std.hospital).toBe(emptyContent().std.hospital);
  });

  it("lists what's missing before issue", () => {
    const c = emptyContent();
    expect(missingForIssue({ title: "", preparedById: null, approvedById: null, content: c })).toHaveLength(6);
    const full = fromTemplate({ steps: [{ task: "Do it", hazards: "", controls: "", il: 1, ic: 1, rl: 1, rc: 1, who: "", codes: [] }], hazards: ["dust"] }, lib).content;
    full.scope = "Works";
    expect(missingForIssue({ title: "A", preparedById: 1, approvedById: 2, content: full })).toEqual([]);
  });

  it("names each revision as its own file", () => {
    expect(ramsFileName("12", 1, 2, 'Roof: "repairs"/ #3')).toBe("Job 12 - RAMS 12-1 rev 2 - Roof repairs 3.pdf");
  });

  it("flags library hazards changed since issue", () => {
    const { content } = fromTemplate({ hazards: ["dust", "noise"] }, lib);
    expect(changedSinceIssue(content.register, lib, "2026-10-10T00:00:00.000Z")).toEqual(["Noise"]);
    expect(changedSinceIssue(content.register, lib, null)).toEqual([]);
  });

  it("saves back to a job type without the standard steps or unkeyed hazards", () => {
    const { content } = fromTemplate({ steps: [{ task: "Grind", hazards: "", controls: "", il: 1, ic: 1, rl: 1, rc: 1, who: "", codes: [] }], hazards: ["dust"] }, lib);
    content.register.push({ key: "", name: "One-off", harm: "", controls: "", il: 1, ic: 1, rl: 1, rc: 1, who: "", codes: [] });
    const t = toTemplate("Grind floor", content);
    expect(t.steps.map((s) => s.task)).toEqual(["Grind"]);
    expect(t.hazards).toEqual(["dust"]);
    expect(fromTemplate(t, lib).content.steps).toHaveLength(content.steps.length);
  });
});

describe("RAMS PDF", async () => {
  const { buildRamsPdf } = await import("@/lib/rams/pdf");
  it("builds in the house format", async () => {
    const t = jobTypes.find((x) => x.key === "resin")!;
    const { title, content } = fromTemplate(t.template as never, lib, "Unit 4, Test Estate");
    content.scope = "ZZ test scope";
    const bytes = await buildRamsPdf({
      id: 1, jobId: 1, jobNo: "12", kind: "cbs", seq: 1, revision: 1, status: "issued", title, templateKey: "resin", content,
      preparedById: 1, preparedBy: "ZZ Tester", approvedById: 2, approvedBy: "ZZ Approver", approverRole: "Director", dated: "2026-10-30",
      subcontractorId: null, subcontractor: "", reviewStatus: null, reviewNote: "", fileId: null, fileName: "", signedFileId: null,
      issuedAt: "2026-10-30T09:00:00.000Z", issuedBy: "ZZ Tester", notes: "", signedCount: 0,
    }, { site: "", client: "ZZ Client", substances: [{ name: "ZZ Resin", supplier: "ZZ Supplies" }] });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
