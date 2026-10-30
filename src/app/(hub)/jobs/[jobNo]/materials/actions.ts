"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { FormValues } from "../../../_registers/form-values";
import { parseLocKey, round3 } from "../../../equipment/rules";
import { changeStock, locationExists, NotEnough } from "../../../equipment/stock";
import { loadJobMaterials, type JobMaterialsData } from "./data";

// Takes stock for this job (it comes off stock, used on the job) or puts stock back from it.
export async function recordJobMaterial(form: FormData): Promise<ActionResult<JobMaterialsData>> {
  const f = new FormValues(form);
  const jobId = f.id("job_id");
  const materialId = f.id("material_id");
  if (!materialId) f.errors.material_id = "Choose the material.";
  const dir = f.oneOf<"take" | "return">("direction", ["take", "return"], "take");
  const loc = parseLocKey(f.text("location", 100), false);
  if (!loc) f.errors.location = dir === "take" ? "Choose where it comes from." : "Choose where it goes back to.";
  const raw = (f.text("qty", 20) ?? "").replace(/[,\s]/g, "");
  const amount = /^\d{1,9}(\.\d{1,3})?$/.test(raw) && Number(raw) > 0 ? round3(Number(raw)) : null;
  if (!amount) f.errors.qty = "Enter a quantity above 0.";
  const notes = f.text("notes", 1000);
  if (!jobId) return { ok: false, message: "Unknown job." };
  if (!f.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: f.errors };
  return guarded<JobMaterialsData>(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const err = await db().begin(async (tx) => {
        const [job] = await tx<{ job_no: string; stage: string }[]>`select job_no, stage from jobs where id = ${jobId}`;
        if (!job) return "That job no longer exists.";
        if (job.stage === "estimate") return "Materials unlock after approval. This job is still at Estimate.";
        const [m] = await tx<{ name: string; unit: string }[]>`select name, unit from materials where id = ${materialId} for update`;
        if (!m) return "That material is no longer on the register. Refresh the page.";
        if (!(await locationExists(tx, loc!))) return "That location no longer exists. Choose another.";
        await changeStock(tx, { id: materialId!, ...m }, loc!, dir === "take" ? -amount! : amount!, {
          by: person.name, reason: dir === "take" ? "Used on job" : "Returned from job", jobId, jobRef: job.job_no, notes,
        });
        return null;
      });
      if (err) return { ok: false, message: err };
      return { ok: true, message: "Saved.", data: await loadJobMaterials(jobId, db()) };
    } catch (e) {
      if (e instanceof NotEnough) return { ok: false, message: e.message };
      throw e;
    }
  });
}
