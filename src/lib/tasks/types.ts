// Shared by the server and the task panel / board.
export type TaskStatus = "todo" | "in_progress" | "done";
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", done: "Done" };

export type TaskView = {
  id: number;
  jobId: number | null;
  jobNo: string | null;
  jobTitle: string | null;
  client: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  inHandNote: string;
  inHandBy: string | null;
  inHandAt: string | null;
  assigneeId: number | null;
  assignee: string | null;
  dueOn: string | null;           // yyyy-mm-dd
  doneAt: string | null;
  doneBy: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  side: "office" | "site";
  submittedAt: string | null;     // marker, not a status
  submittedBy: string | null;
  sentBackNote: string | null;    // marker, not a status
  sentBackAt: string | null;
  sentBackBy: string | null;
  reqKey: string | null;
  stage: string | null;
  category: string;
  repeatNo: number | null;
  isRepeat: boolean;
  page: string | null;            // job page the requirement opens, when built
  createdAt: string;
  createdBy: string | null;
};

export type TileState = "available" | "on" | "done";
export type PickerTile = {
  key: string;
  label: string;
  stage: string;
  side: "office" | "site";
  sides: ("office" | "site")[];  // the + New task tabs that offer it
  repeatable: boolean;
  state: TileState;
  taskId: number | null;         // the existing task (non-repeatable)
  open: number;                  // open tasks (repeatable)
  done: number;
  lock: string | null;           // why it can't be added yet
  cdm: boolean;
};

export type NewTaskDraft = {
  jobId: number | null;
  jobNo: string | null;
  reqKey: string | null;
  title: string;
  side: "office" | "site";
  linkJob?: boolean; // header + New task: a one-off task, linked to a job or to nothing
};
