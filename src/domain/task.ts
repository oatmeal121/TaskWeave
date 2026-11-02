export type TaskStatus = "todo" | "doing" | "done";
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type MissingDatePolicy = "skip_period" | "use_last_day";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  projectName: string | null;
  tags: string[];
  startDate: string;
  startTime?: string | null;
  dueDate: string | null;
  dueTime?: string | null;
  completionDate: string | null;
  parentTaskId: string | null;
  parentTitle: string | null;
  childCategory: string | null;
  childCount: number;
  sortOrder: number;
  isImportant: boolean;
  isUrgent: boolean;
  isOverdue: boolean;
  workedToday: boolean;
  activityDates: string[];
  recurringTemplateId: string | null;
  recurrenceOccurrenceDate: string | null;
};

export type DeletedTask = Task & {
  deletedAt: string;
};

export type RecurringMonthDay = {
  dayOfMonth: number | null;
  isLastDay: boolean;
};

export type RecurringYearDay = RecurringMonthDay & {
  month: number;
};

export type RecurringDueRule =
  | { type: "same_day" }
  | { type: "next_occurrence_minus_one" }
  | { type: "weekday"; weekday: number }
  | { type: "month_day"; dayOfMonth: number | null; isLastDay: boolean }
  | { type: "year_day"; month: number; dayOfMonth: number | null; isLastDay: boolean };

export type RecurringTaskTemplate = {
  id: string;
  title: string;
  description: string;
  frequency: RecurringFrequency;
  isImportant: boolean;
  isUrgent: boolean;
  projectName: string | null;
  tags: string[];
  startOn: string;
  startTime?: string | null;
  dueTime?: string | null;
  missingDatePolicy: MissingDatePolicy;
  dueRule: RecurringDueRule;
  weekdays: number[];
  monthDays: RecurringMonthDay[];
  yearDays: RecurringYearDay[];
  generatedTaskCount: number;
};

export type RecurringTaskTemplateDraft = Omit<
  RecurringTaskTemplate,
  "id" | "generatedTaskCount"
>;

export type ProjectSummary = {
  name: string;
  parentName: string | null;
  directTaskCount: number;
  taskCount: number;
};

export type TagSummary = {
  name: string;
  taskCount: number;
};

export type TaskDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  projectName: string | null;
  childCategory: string | null;
  tags: string[];
  startDate: string;
  startTime?: string | null;
  dueDate: string | null;
  dueTime?: string | null;
  completionDate: string | null;
  isImportant: boolean;
  isUrgent: boolean;
};

export const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "done"];

export function todayIsoDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function completionDateForStatus(
  status: TaskStatus,
  requestedDate: string | null = null,
): string | null {
  return status === "done" ? requestedDate || todayIsoDate() : null;
}

export function isTaskOverdue(task: Pick<Task, "status" | "dueDate" | "dueTime">): boolean {
  if (!task.dueDate || task.status === "done") return false;
  return task.dueTime
    ? new Date(`${task.dueDate}T${task.dueTime}`).getTime() < Date.now()
    : task.dueDate < todayIsoDate();
}
