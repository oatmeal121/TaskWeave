import type { Reminder } from "../domain/reminder";

export type BackupTaskStatus = "todo" | "doing" | "done";
export type BackupRecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type BackupMissingDatePolicy = "skip_period" | "use_last_day";

export type BackupRecurringMonthDay = {
  dayOfMonth: number | null;
  isLastDay: boolean;
};

export type BackupRecurringYearDay = BackupRecurringMonthDay & {
  month: number;
};

export type BackupRecurringDueRule =
  | { type: "same_day" }
  | { type: "next_occurrence_minus_one" }
  | { type: "weekday"; weekday: number }
  | { type: "month_day"; dayOfMonth: number | null; isLastDay: boolean }
  | { type: "year_day"; month: number; dayOfMonth: number | null; isLastDay: boolean };

export type TaskWeaveBackupTask = {
  id: string;
  title: string;
  description: string;
  status: BackupTaskStatus;
  projectName: string | null;
  childCategory: string | null;
  tags: string[];
  startDate: string;
  startTime?: string | null;
  dueTime?: string | null;
  dueDate: string | null;
  completionDate: string | null;
  parentTaskId: string | null;
  sortOrder: number;
  isImportant: boolean;
  isUrgent: boolean;
  activityDates: string[];
  deletedAt: string | null;
  recurringTemplateId: string | null;
  recurrenceOccurrenceDate: string | null;
};

export type TaskWeaveBackupProject = {
  name: string;
  parentName: string | null;
};

export type TaskWeaveBackupRecurringTemplate = {
  id: string;
  title: string;
  description: string;
  frequency: BackupRecurringFrequency;
  isImportant: boolean;
  isUrgent: boolean;
  projectName: string | null;
  tags: string[];
  startOn: string;
  startTime?: string | null;
  dueTime?: string | null;
  missingDatePolicy: BackupMissingDatePolicy;
  dueRule: BackupRecurringDueRule;
  weekdays: number[];
  monthDays: BackupRecurringMonthDay[];
  yearDays: BackupRecurringYearDay[];
};

export type TaskWeaveBackup = {
  format: "taskweave-backup";
  version: 1 | 2;
  exportedAt: string;
  tasks: TaskWeaveBackupTask[];
  projects: TaskWeaveBackupProject[];
  tags: string[];
  recurringTemplates: TaskWeaveBackupRecurringTemplate[];
  reminders?: Reminder[];
};

export type TaskWeaveImportCounts = {
  tasks: number;
  projects: number;
  tags: number;
  recurringTemplates: number;
  reminders?: number;
};

export type TaskWeaveMergedBackup = TaskWeaveBackup & {
  imported: TaskWeaveImportCounts;
};

export function parseTaskWeaveBackup(source: string | unknown): TaskWeaveBackup {
  const value = typeof source === "string" ? JSON.parse(source) : source;
  if (!isRecord(value) || value.format !== "taskweave-backup" || (value.version !== 1 && value.version !== 2)) {
    throw new Error("unsupported_backup");
  }
  if (
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.projects) ||
    !Array.isArray(value.tags) ||
    !Array.isArray(value.recurringTemplates)
  ) {
    throw new Error("invalid_backup");
  }

  return {
    format: "taskweave-backup",
    version: 2,
    exportedAt: stringValue(value.exportedAt) ?? new Date().toISOString(),
    tasks: uniqueBy(value.tasks.map(parseTask), (task) => task.id),
    projects: uniqueBy(value.projects.map(parseProject), (project) => project.name),
    tags: uniqueStrings(value.tags),
    recurringTemplates: uniqueBy(
      value.recurringTemplates.map(parseRecurringTemplate),
      (template) => template.id,
    ),
    reminders: value.reminders === undefined ? [] : Array.isArray(value.reminders)
      ? uniqueBy(value.reminders.map(parseReminder), item => item.id)
      : (() => { throw new Error("invalid_reminders"); })(),
  };
}

export function mergeTaskWeaveBackups(
  current: TaskWeaveBackup,
  incoming: TaskWeaveBackup,
): TaskWeaveMergedBackup {
  const currentTaskIds = new Set(current.tasks.map((task) => task.id));
  const currentProjectNames = new Set(current.projects.map((project) => project.name));
  const currentTags = new Set(current.tags);
  const currentTemplateIds = new Set(
    current.recurringTemplates.map((template) => template.id),
  );
  const importedTasks = incoming.tasks.filter((task) => !currentTaskIds.has(task.id));
  const importedProjects = incoming.projects.filter(
    (project) => !currentProjectNames.has(project.name),
  );
  const importedTags = incoming.tags.filter((tag) => !currentTags.has(tag));
  const importedTemplates = incoming.recurringTemplates.filter(
    (template) => !currentTemplateIds.has(template.id),
  );
  const reminderIds = new Set((current.reminders ?? []).map(item => item.id));
  const importedReminders = (incoming.reminders ?? []).filter(item => !reminderIds.has(item.id));

  return {
    format: "taskweave-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    tasks: [...current.tasks, ...importedTasks],
    projects: [...current.projects, ...importedProjects],
    tags: [...current.tags, ...importedTags],
    recurringTemplates: [...current.recurringTemplates, ...importedTemplates],
    reminders: [...(current.reminders ?? []), ...importedReminders],
    imported: {
      tasks: importedTasks.length,
      projects: importedProjects.length,
      tags: importedTags.length,
      recurringTemplates: importedTemplates.length,
      reminders: importedReminders.length,
    },
  };
}

function optionalClock(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("invalid_clock");
  return value;
}

function parseReminder(value: unknown, index: number): Reminder {
  if (!isRecord(value)) throw new Error(`invalid_reminder_${index}`);
  const anchorAt = requiredString(value.anchorAt, "invalid_reminder_time");
  const validDate = (v: unknown) => {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) || !optionalClock(v.slice(11))) return false;
    const date = new Date(v);
    const pad = (n: number) => String(n).padStart(2, "0");
    return !Number.isNaN(date.getTime()) && `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}` === v;
  };
  if (!validDate(anchorAt) || !["once", "hourly", "daily", "weekly", "monthly"].includes(String(value.frequency))) throw new Error("invalid_reminder");
  const nextAt=optionalString(value.nextAt);
  if (nextAt && !validDate(nextAt)) throw new Error("invalid_reminder_time");
  return {
    id:requiredString(value.id,"invalid_reminder_id"),title:requiredString(value.title,"invalid_reminder_title"),description:typeof value.description === "string" ? value.description : "",taskId:optionalString(value.taskId),
    anchorAt,frequency:value.frequency as Reminder["frequency"],nextAt,enabled:Boolean(value.enabled)&&Boolean(nextAt),lastFiredAt:optionalString(value.lastFiredAt),lastScheduledAt:optionalString(value.lastScheduledAt),error:optionalString(value.error),
  };
}

function parseTask(value: unknown, index: number): TaskWeaveBackupTask {
  if (!isRecord(value)) {
    throw new Error(`invalid_task_${index}`);
  }
  const id = requiredString(value.id, `invalid_task_id_${index}`);
  const title = requiredString(value.title, `invalid_task_title_${index}`);
  const status = value.status;
  if (status !== "todo" && status !== "doing" && status !== "done") {
    throw new Error(`invalid_task_status_${index}`);
  }

  return {
    id,
    title,
    description: typeof value.description === "string" ? value.description : "",
    status,
    projectName: optionalString(value.projectName),
    childCategory: optionalString(value.childCategory),
    tags: uniqueStrings(value.tags),
    startDate: requiredString(value.startDate, `invalid_task_start_date_${index}`),
    startTime: optionalClock(value.startTime),
    dueTime: optionalClock(value.dueTime),
    dueDate: optionalString(value.dueDate),
    completionDate: optionalString(value.completionDate),
    parentTaskId: optionalString(value.parentTaskId),
    sortOrder: finiteNumber(value.sortOrder, index),
    isImportant: Boolean(value.isImportant),
    isUrgent: Boolean(value.isUrgent),
    activityDates: uniqueStrings(value.activityDates),
    deletedAt: optionalString(value.deletedAt),
    recurringTemplateId: optionalString(value.recurringTemplateId),
    recurrenceOccurrenceDate: optionalString(value.recurrenceOccurrenceDate),
  };
}

function parseProject(value: unknown, index: number): TaskWeaveBackupProject {
  if (!isRecord(value)) {
    throw new Error(`invalid_project_${index}`);
  }
  return {
    name: requiredString(value.name, `invalid_project_name_${index}`),
    parentName: optionalString(value.parentName),
  };
}

function parseRecurringTemplate(
  value: unknown,
  index: number,
): TaskWeaveBackupRecurringTemplate {
  if (!isRecord(value)) {
    throw new Error(`invalid_recurring_template_${index}`);
  }
  const frequency = value.frequency;
  if (
    frequency !== "daily" &&
    frequency !== "weekly" &&
    frequency !== "monthly" &&
    frequency !== "yearly"
  ) {
    throw new Error(`invalid_recurring_frequency_${index}`);
  }
  const missingDatePolicy =
    value.missingDatePolicy === "use_last_day" ? "use_last_day" : "skip_period";

  return {
    id: requiredString(value.id, `invalid_recurring_template_id_${index}`),
    title: requiredString(value.title, `invalid_recurring_template_title_${index}`),
    description: typeof value.description === "string" ? value.description : "",
    frequency,
    isImportant: Boolean(value.isImportant),
    isUrgent: Boolean(value.isUrgent),
    projectName: optionalString(value.projectName),
    tags: uniqueStrings(value.tags),
    startOn: requiredString(value.startOn, `invalid_recurring_start_${index}`),
    startTime: optionalClock(value.startTime),
    dueTime: optionalClock(value.dueTime),
    missingDatePolicy,
    dueRule: parseDueRule(value.dueRule),
    weekdays: numberArray(value.weekdays),
    monthDays: Array.isArray(value.monthDays)
      ? value.monthDays.map(parseMonthDay)
      : [],
    yearDays: Array.isArray(value.yearDays)
      ? value.yearDays.map(parseYearDay)
      : [],
  };
}

function parseDueRule(value: unknown): BackupRecurringDueRule {
  if (!isRecord(value)) {
    return { type: "same_day" };
  }
  if (value.type === "next_occurrence_minus_one") {
    return { type: "next_occurrence_minus_one" };
  }
  if (value.type === "weekday") {
    return { type: "weekday", weekday: finiteNumber(value.weekday, 1) };
  }
  if (value.type === "month_day") {
    return {
      type: "month_day",
      dayOfMonth: nullableNumber(value.dayOfMonth),
      isLastDay: Boolean(value.isLastDay),
    };
  }
  if (value.type === "year_day") {
    return {
      type: "year_day",
      month: finiteNumber(value.month, 1),
      dayOfMonth: nullableNumber(value.dayOfMonth),
      isLastDay: Boolean(value.isLastDay),
    };
  }
  return { type: "same_day" };
}

function parseMonthDay(value: unknown): BackupRecurringMonthDay {
  return isRecord(value)
    ? { dayOfMonth: nullableNumber(value.dayOfMonth), isLastDay: Boolean(value.isLastDay) }
    : { dayOfMonth: null, isLastDay: true };
}

function parseYearDay(value: unknown): BackupRecurringYearDay {
  return isRecord(value)
    ? {
        month: finiteNumber(value.month, 1),
        dayOfMonth: nullableNumber(value.dayOfMonth),
        isLastDay: Boolean(value.isLastDay),
      }
    : { month: 1, dayOfMonth: null, isLastDay: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, error: string): string {
  const parsed = stringValue(value);
  if (!parsed) {
    throw new Error(error);
  }
  return parsed;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalString(value: unknown): string | null {
  return stringValue(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)))]
    : [];
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const valueKey = key(value);
    if (seen.has(valueKey)) {
      return false;
    }
    seen.add(valueKey);
    return true;
  });
}
