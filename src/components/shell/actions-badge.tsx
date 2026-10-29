import { Suspense } from "react";
import { getCurrentPerson } from "@/lib/auth/session";
import { openActionsCount } from "@/lib/tasks/data";

async function Count() {
  if (!(await getCurrentPerson())) return null;
  const n = await openActionsCount().catch(() => 0);
  if (!n) return null;
  return (
    <span className="rounded-full bg-danger px-2.5 py-0.5 text-[13px] font-bold text-white" aria-label={`${n} open`}>
      {n}
    </span>
  );
}

// The red count on the menu's Actions item (open tasks on the board), streamed in after the menu.
export function ActionsBadge() {
  return (
    <Suspense fallback={null}>
      <Count />
    </Suspense>
  );
}
