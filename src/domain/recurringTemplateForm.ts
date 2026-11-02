import type {
  MissingDatePolicy,
  RecurringDueRule,
  RecurringFrequency,
  RecurringMonthDay,
  RecurringTaskTemplate,
  RecurringTaskTemplateDraft,
  RecurringYearDay,
} from "./task";
import { todayIsoDate } from "./task";

export type RecurringTemplateFormState = {
  title: string;
  description: string;
  frequency: RecurringFrequency;
  projectSelection: string;
  newProjectName: string;
  tags: string;
  startOn: string;
  startTime: string;
  dueTime: string;
  isImportant: boolean;
  isUrgent: boolean;
  missingDatePolicy: MissingDatePolicy;
  dueRuleType: "default" | "weekday" | "month_day" | "year_day";
  dueWeekday: number;
  dueMonthDay: string;
  dueYearDay: string;
  weekdays: number[];
  weeklySelectionStep: "start" | "due";
  monthDays: string;
  monthlySelectionStep: "start" | "due";
  yearDays: string;
};

export type RecurringTemplateFormValidationError =
  | "title_required"
  | "weekly_start_required"
  | "weekly_due_required"
  | "monthly_start_required"
  | "monthly_due_required";

export type RecurringTemplateDraftOptions = {
  today?: string;
  newProjectValue: string;
};

export function createRecurringTemplateFormState(
  today = todayIsoDate(),
): RecurringTemplateFormState {
  return {
    title: "",
    description: "",
    frequency: "daily",
    projectSelection: "",
    newProjectName: "",
    tags: "",
    startOn: today,
    startTime: "",
    dueTime: "",
    isImportant: false,
    isUrgent: false,
    missingDatePolicy: "skip_period",
    dueRuleType: "default",
    dueWeekday: 0,
    dueMonthDay: "",
    dueYearDay: "12-last",
    weekdays: [],
    weeklySelectionStep: "start",
    monthDays: "",
    monthlySelectionStep: "start",
    yearDays: "1-1",
  };
}

export function resetRecurringTemplateFormState(
  source: RecurringTemplateFormState,
  today = todayIsoDate(),
) {
  Object.assign(source, createRecurringTemplateFormState(today));
}

export function recurringTemplateFormToDraft(
  source: RecurringTemplateFormState,
  options: RecurringTemplateDraftOptions,
): RecurringTaskTemplateDraft {
  const weeklyStart = weeklyCycleStart(source) ?? 1;
  const monthlyStart = monthlyCycleStart(source) ?? 1;

  return {
    title: source.title.trim(),
    description: source.description,
    frequency: source.frequency,
    projectName: selectedRecurringProjectName(source, options.newProjectValue),
    tags: parseTagInput(source.tags),
    startOn: options.today ?? todayIsoDate(),
    startTime: source.startTime || null,
    dueTime: source.dueTime || null,
    isImportant: source.isImportant,
    isUrgent: source.isUrgent,
    missingDatePolicy: source.frequency === "monthly" ? "use_last_day" : source.missingDatePolicy,
    dueRule: recurringDueRuleFromForm(source),
    weekdays: source.frequency === "weekly" ? [weeklyStart] : [],
    monthDays:
      source.frequency === "monthly"
        ? [{ dayOfMonth: monthlyStart, isLastDay: false }]
        : [],
    yearDays:
      source.frequency === "yearly"
        ? parseRecurringYearDaysInput(source.yearDays)
        : [],
  };
}

export function validateRecurringTemplateForm(
  source: RecurringTemplateFormState,
): RecurringTemplateFormValidationError | null {
  if (!source.title.trim()) {
    return "title_required";
  }

  if (source.frequency === "weekly" && !weeklyCycleStart(source)) {
    return "weekly_start_required";
  }

  if (source.frequency === "weekly" && !weeklyCycleDue(source)) {
    return "weekly_due_required";
  }

  if (source.frequency === "monthly" && !monthlyCycleStart(source)) {
    return "monthly_start_required";
  }

  if (source.frequency === "monthly" && !monthlyCycleDue(source)) {
    return "monthly_due_required";
  }

  return null;
}

export function fillRecurringFormFromTemplate(
  source: RecurringTemplateFormState,
  template: RecurringTaskTemplate,
) {
  source.title = template.title;
  source.description = template.description;
  source.frequency = template.frequency;
  source.projectSelection = template.projectName ?? "";
  source.newProjectName = "";
  source.tags = template.tags.join(", ");
  source.startOn = template.startOn;
  source.startTime = template.startTime ?? "";
  source.dueTime = template.dueTime ?? "";
  source.isImportant = template.isImportant;
  source.isUrgent = template.isUrgent;
  source.missingDatePolicy = template.missingDatePolicy;
  source.weekdays =
    template.frequency === "weekly" ? [template.weekdays[0] ?? 1] : [...template.weekdays];
  source.weeklySelectionStep = "start";
  source.monthDays =
    template.frequency === "monthly" && template.monthDays[0]?.dayOfMonth
      ? String(template.monthDays[0].dayOfMonth)
      : formatMonthDaysForInput(template.monthDays);
  source.yearDays = formatYearDaysForInput(template.yearDays);
  applyDueRuleToRecurringForm(source, template.dueRule);

  if (template.frequency === "weekly" && template.dueRule.type !== "weekday") {
    source.dueWeekday = source.weekdays[0] ?? 1;
  }

  if (template.frequency === "monthly") {
    source.monthlySelectionStep = "start";
    if (template.dueRule.type !== "month_day") {
      source.dueMonthDay = source.monthDays;
    }
  }
}

export function weeklyCycleStart(source: RecurringTemplateFormState): number | null {
  return source.frequency === "weekly" ? source.weekdays[0] ?? null : null;
}

export function weeklyCycleDue(source: RecurringTemplateFormState): number | null {
  if (source.frequency !== "weekly") {
    return null;
  }

  return source.dueWeekday >= 1 && source.dueWeekday <= 7 ? source.dueWeekday : null;
}

export function chooseWeeklyCycleDay(source: RecurringTemplateFormState, weekday: number) {
  if (source.weeklySelectionStep === "start") {
    source.weekdays = [weekday];
    source.dueWeekday = 0;
    source.weeklySelectionStep = "due";
    return;
  }

  source.dueWeekday = weekday;
  source.weeklySelectionStep = "start";
}

export function weeklyPlacementStep(source: RecurringTemplateFormState): "start" | "due" {
  return source.weeklySelectionStep;
}

export function monthlyCycleStart(source: RecurringTemplateFormState): number | null {
  return source.frequency === "monthly" ? parseMonthlyCycleDay(source.monthDays) : null;
}

export function monthlyCycleDue(source: RecurringTemplateFormState): number | null {
  return source.frequency === "monthly" ? parseMonthlyCycleDay(source.dueMonthDay) : null;
}

export function chooseMonthlyCycleDay(source: RecurringTemplateFormState, day: number) {
  if (source.monthlySelectionStep === "start") {
    source.monthDays = String(day);
    source.dueMonthDay = "";
    source.monthlySelectionStep = "due";
    return;
  }

  source.dueMonthDay = String(day);
  source.monthlySelectionStep = "start";
}

export function monthlyPlacementStep(source: RecurringTemplateFormState): "start" | "due" {
  return source.monthlySelectionStep;
}

export function parseMonthlyCycleDay(value: string): number | null {
  const [firstValue] = value.split(new RegExp(`[,\\uFF0C\\s]+`));
  if (firstValue === "last" || firstValue === "\u6708\u672b") {
    return 31;
  }

  const day = Number(firstValue);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function recurringDueRuleFromForm(source: RecurringTemplateFormState): RecurringDueRule {
  if (source.frequency === "daily") {
    return { type: "same_day" };
  }

  if (source.frequency === "weekly") {
    const weeklyStart = weeklyCycleStart(source) ?? 1;
    return { type: "weekday", weekday: weeklyCycleDue(source) ?? weeklyStart };
  }

  if (source.frequency === "monthly") {
    const monthlyStart = monthlyCycleStart(source) ?? 1;
    return {
      type: "month_day",
      dayOfMonth: monthlyCycleDue(source) ?? monthlyStart,
      isLastDay: false,
    };
  }

  if (source.dueRuleType === "weekday") {
    return { type: "weekday", weekday: source.dueWeekday };
  }

  if (source.dueRuleType === "month_day") {
    const [day] = parseRecurringMonthDaysInput(source.dueMonthDay);
    return {
      type: "month_day",
      dayOfMonth: day?.dayOfMonth ?? null,
      isLastDay: day?.isLastDay ?? true,
    };
  }

  if (source.dueRuleType === "year_day") {
    const [day] = parseRecurringYearDaysInput(source.dueYearDay);
    return {
      type: "year_day",
      month: day?.month ?? 12,
      dayOfMonth: day?.dayOfMonth ?? null,
      isLastDay: day?.isLastDay ?? true,
    };
  }

  return { type: "next_occurrence_minus_one" };
}

function selectedRecurringProjectName(
  source: RecurringTemplateFormState,
  newProjectValue: string,
): string | null {
  if (source.projectSelection === newProjectValue) {
    return source.newProjectName.trim() || null;
  }

  return source.projectSelection.trim() || null;
}

function parseTagInput(value: string): string[] {
  return value
    .split(new RegExp(`[,\\uFF0C]`))
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseRecurringMonthDaysInput(value: string): RecurringMonthDay[] {
  return value
    .split(new RegExp(`[,\\uFF0C\\s]+`))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) =>
      item === "last" || item === "\u6708\u672b"
        ? { dayOfMonth: null, isLastDay: true }
        : { dayOfMonth: Number(item), isLastDay: false },
    )
    .filter((day) => day.isLastDay || Boolean(day.dayOfMonth));
}

function parseRecurringYearDaysInput(value: string): RecurringYearDay[] {
  return value
    .split(new RegExp(`[,\\uFF0C\\s]+`))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => {
      const [monthValue, dayValue] = item.split("-");
      return {
        month: Number(monthValue),
        dayOfMonth:
          dayValue === "last" || dayValue === "\u6708\u672b" ? null : Number(dayValue),
        isLastDay: dayValue === "last" || dayValue === "\u6708\u672b",
      };
    })
    .filter((day) => day.month && (day.isLastDay || Boolean(day.dayOfMonth)));
}

function formatMonthDaysForInput(days: RecurringMonthDay[]): string {
  return days
    .map((day) => (day.isLastDay ? "last" : String(day.dayOfMonth)))
    .join(",");
}

function formatYearDaysForInput(days: RecurringYearDay[]): string {
  return days
    .map((day) => `${day.month}-${day.isLastDay ? "last" : day.dayOfMonth}`)
    .join(",");
}

function applyDueRuleToRecurringForm(
  source: RecurringTemplateFormState,
  rule: RecurringDueRule,
) {
  source.dueRuleType = "default";
  source.dueWeekday = 7;
  source.dueMonthDay = "last";
  source.dueYearDay = "12-last";

  if (rule.type === "weekday") {
    source.dueRuleType = "weekday";
    source.dueWeekday = rule.weekday;
  } else if (rule.type === "month_day") {
    source.dueRuleType = "month_day";
    source.dueMonthDay = formatMonthDaysForInput([rule]);
  } else if (rule.type === "year_day") {
    source.dueRuleType = "year_day";
    source.dueYearDay = formatYearDaysForInput([rule]);
  }
}
