"use client";

import { useTasks } from "@/components/tasks/task-provider";

// A task in the search results opens in the task panel.
export function OpenTask({ id, title }: { id: number; title: string }) {
  const { openTask } = useTasks();
  return (
    <button type="button" onClick={() => openTask(id)} className="font-medium underline text-left">
      {title}
    </button>
  );
}
