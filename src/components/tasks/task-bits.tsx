"use client";

import type { TaskView } from "@/lib/tasks/types";

export const isOverdue = (t: TaskView) => !!t.dueOn && t.status !== "done" && t.dueOn < new Date().toISOString().slice(0, 10);
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// The markers and facts shown on a task card or row (never statuses of their own).
export function TaskMarkers({ t }: { t: TaskView }) {
  return (
    <span className="flex flex-wrap gap-1 text-xs">
      <span className="rounded px-1.5 py-0.5 bg-paper text-ink">{t.category}</span>
      {t.side === "site" && <span className="rounded px-1.5 py-0.5 bg-[#e3edf9] text-[#1f4e8c]">On site</span>}
      {t.dueOn && (
        <span className={`rounded px-1.5 py-0.5 ${isOverdue(t) ? "bg-[#fde7e5] text-[#b3261e] font-semibold" : "bg-paper text-muted"}`}>
          {isOverdue(t) ? "Overdue " : "Due "}{shortDay(t.dueOn)}
        </span>
      )}
      {t.assignee && <span className="rounded px-1.5 py-0.5 bg-paper text-muted">@{t.assignee}</span>}
      {t.status === "in_progress" && t.inHandNote && <span className="rounded px-1.5 py-0.5 bg-[#fff1d6] text-[#8a5300]">In hand: {t.inHandNote}</span>}
      {t.submittedAt && t.status !== "done" && <span className="rounded px-1.5 py-0.5 bg-[#fff1d6] text-[#8a5300] font-semibold">Submitted</span>}
      {t.sentBackAt && t.status !== "done" && <span className="rounded px-1.5 py-0.5 bg-[#fde7e5] text-[#b3261e]">Sent back</span>}
      {t.verifiedAt && <span className="rounded px-1.5 py-0.5 bg-[#e6f4ea] text-[#1a7f37] font-semibold">✓ Verified</span>}
    </span>
  );
}
