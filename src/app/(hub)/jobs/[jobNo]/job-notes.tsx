"use client";

import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { saveJobNotes } from "./actions";

// Hub notes for the job, with ServiceM8's description shown above it (read only; ServiceM8 is the master).
export function JobNotes({ jobNo, notes, description }: { jobNo: string; notes: string; description: string }) {
  return (
    <section className="bg-white border border-line rounded-xl p-4 sm:p-5" aria-label="Notes">
      <h2 className="font-semibold mb-2">Notes</h2>
      {description.trim() && (
        <div className="mb-3 rounded-lg bg-paper px-3 py-2 text-sm whitespace-pre-wrap">
          <p className="text-xs font-semibold text-muted mb-1">From ServiceM8</p>
          {description}
        </div>
      )}
      <GuardedForm action={saveJobNotes}>
        <input type="hidden" name="jobNo" value={jobNo} />
        <label htmlFor="job-notes" className="sr-only">Job notes</label>
        <textarea id="job-notes" name="notes" spellCheck rows={4} defaultValue={notes} placeholder="Notes for the office"
          className="w-full rounded-lg border border-line px-3 py-2 focus:outline-none focus:border-brand" />
        <div className="mt-2"><SaveButton>Save notes</SaveButton></div>
      </GuardedForm>
    </section>
  );
}
