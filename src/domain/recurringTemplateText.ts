import type {
  RecurringFrequency,
  RecurringMonthDay,
  RecurringTaskTemplate,
  RecurringYearDay,
} from "./task";
import type { RecurringTemplateFormState } from "./recurringTemplateForm";
import {
  monthlyCycleDue,
  monthlyCycleStart,
  weeklyCycleDue,
  weeklyCycleStart,
} from "./recurringTemplateForm";

export type RecurringTextLanguage = "en" | "zh";
export type RecurringTextOption = {
  value: number;
  label: string;
};
export type RecurringTextContext = {
  language: RecurringTextLanguage;
  weekdayOptions: RecurringTextOption[];
  frequencyLabel: (frequency: RecurringFrequency) => string;
};

export function formatWeeklyCycleText(
  source: RecurringTemplateFormState,
  context: RecurringTextContext,
): string {
  const start = weeklyCycleStart(source);
  const due = weeklyCycleDue(source);

  if (!start) {
    return context.language === "zh"
      ? "\u5148\u9009\u62e9\u6bcf\u4e2a\u5468\u671f\u7684\u5f00\u59cb\u65f6\u95f4"
      : "Choose the start day for each cycle";
  }

  if (!due) {
    return context.language === "zh"
      ? "\u518d\u9009\u62e9\u6bcf\u4e2a\u5468\u671f\u7684\u622a\u6b62\u65f6\u95f4"
      : "Now choose the due day for each cycle";
  }

  const startLabel = weekdayLabel(start, context.weekdayOptions);
  const dueLabel = weekdayLabel(due, context.weekdayOptions);
  const wraps = due < start;
  return context.language === "zh"
    ? `\u4ece ${startLabel} \u5f00\u59cb\uff0c${wraps ? "\u6b21\u5468" : ""}${dueLabel} \u622a\u6b62`
    : `Starts ${startLabel}, due ${wraps ? "next " : ""}${dueLabel}`;
}

export function formatMonthlyCycleText(
  source: RecurringTemplateFormState,
  language: RecurringTextLanguage,
): string {
  const start = monthlyCycleStart(source);
  const due = monthlyCycleDue(source);

  if (!start) {
    return language === "zh"
      ? "\u5148\u9009\u62e9\u6bcf\u4e2a\u6708\u5468\u671f\u7684\u5f00\u59cb\u65e5"
      : "Choose the start day for each monthly cycle";
  }

  if (!due) {
    return language === "zh"
      ? "\u518d\u9009\u62e9\u6bcf\u4e2a\u6708\u5468\u671f\u7684\u622a\u6b62\u65e5"
      : "Now choose the due day for each monthly cycle";
  }

  const wraps = due < start;
  return language === "zh"
    ? `\u4ece\u6bcf\u6708 ${start}\u53f7 \u5f00\u59cb\uff0c${wraps ? "\u6b21\u6708" : "\u5f53\u6708"} ${due}\u53f7 \u622a\u6b62`
    : `Starts on day ${start}, due on ${wraps ? "next month " : "the same month "}day ${due}`;
}

export function formatMonthlyLastDayNotice(
  source: RecurringTemplateFormState,
  language: RecurringTextLanguage,
): string {
  const fragileSelections = [
    {
      role: language === "zh" ? "\u5f00\u59cb\u65e5" : "start day",
      day: monthlyCycleStart(source),
    },
    {
      role: language === "zh" ? "\u622a\u6b62\u65e5" : "due day",
      day: monthlyCycleDue(source),
    },
  ].filter((selection): selection is { role: string; day: number } =>
    Boolean(selection.day && selection.day >= 29),
  );

  if (fragileSelections.length === 0) {
    return "";
  }

  const selectedText = fragileSelections
    .map((selection) =>
      language === "zh"
        ? `${selection.role}\u9009\u4e86 ${selection.day}\u53f7`
        : `${selection.role} is day ${selection.day}`,
    )
    .join(language === "zh" ? "\uff0c" : "; ");

  return language === "zh"
    ? `${selectedText}\u3002\u5982\u679c\u67d0\u4e9b\u6708\u4efd\u6ca1\u6709\u8fd9\u4e2a\u65e5\u671f\uff0c\u4f1a\u81ea\u52a8\u6539\u4e3a\u5f53\u6708\u6700\u540e\u4e00\u5929\u3002`
    : `${selectedText}. If a month does not include that date, TaskWeave will use that month's last day.`;
}

export function formatRecurringTemplateSummary(
  template: RecurringTaskTemplate,
  context: RecurringTextContext,
): string {
  if (template.frequency === "daily") {
    return context.language === "zh"
      ? `${context.frequencyLabel(template.frequency)} \u00b7 \u5f53\u5929\u5f00\u59cb \u00b7 \u5f53\u5929\u622a\u6b62`
      : `${context.frequencyLabel(template.frequency)} \u00b7 starts same day \u00b7 due same day`;
  }

  if (template.frequency === "weekly") {
    const start = template.weekdays[0] ?? 1;
    const due = template.dueRule.type === "weekday" ? template.dueRule.weekday : start;
    const startLabel = weekdayLabel(start, context.weekdayOptions);
    const dueLabel = weekdayLabel(due, context.weekdayOptions);
    const wraps = due < start;
    return context.language === "zh"
      ? `${context.frequencyLabel(template.frequency)} \u00b7 ${startLabel} \u5f00\u59cb \u00b7 ${wraps ? "\u6b21\u5468" : ""}${dueLabel} \u622a\u6b62`
      : `${context.frequencyLabel(template.frequency)} \u00b7 starts ${startLabel} \u00b7 due ${wraps ? "next " : ""}${dueLabel}`;
  }

  if (template.frequency === "monthly") {
    const start = template.monthDays[0]?.dayOfMonth ?? 1;
    const due =
      template.dueRule.type === "month_day" && template.dueRule.dayOfMonth
        ? template.dueRule.dayOfMonth
        : start;
    const wraps = due < start;
    const fragileNotice =
      start >= 29 || due >= 29
        ? context.language === "zh"
          ? " \u00b7 \u7f3a\u5931\u65e5\u671f\u8f6c\u6708\u672b"
          : " \u00b7 missing dates use month end"
        : "";
    return context.language === "zh"
      ? `${context.frequencyLabel(template.frequency)} \u00b7 ${start}\u53f7\u5f00\u59cb \u00b7 ${wraps ? "\u6b21\u6708" : "\u5f53\u6708"}${due}\u53f7\u622a\u6b62${fragileNotice}`
      : `${context.frequencyLabel(template.frequency)} \u00b7 starts day ${start} \u00b7 due ${wraps ? "next month " : "same month "}day ${due}${fragileNotice}`;
  }

  return `${context.frequencyLabel(template.frequency)} \u00b7 ${formatYearDays(template.yearDays, context.language)} \u00b7 ${formatRecurringDueRuleLabel(template, context)}`;
}

export function formatRecurringDueRuleLabel(
  template: RecurringTaskTemplate,
  context: RecurringTextContext,
): string {
  const prefix = context.language === "zh" ? "\u622a\u6b62" : "due";
  if (template.dueRule.type === "same_day") {
    return context.language === "zh" ? "\u5f53\u5929\u622a\u6b62" : "due same day";
  }
  if (template.dueRule.type === "next_occurrence_minus_one") {
    return context.language === "zh" ? "\u4e0b\u6b21\u5f00\u59cb\u524d\u4e00\u5929\u622a\u6b62" : "due before next occurrence";
  }
  if (template.dueRule.type === "weekday") {
    const weekday = template.dueRule.weekday;
    return `${prefix} ${weekdayLabel(weekday, context.weekdayOptions)}`;
  }
  if (template.dueRule.type === "month_day") {
    return `${prefix} ${formatMonthDays([template.dueRule], context.language)}`;
  }
  return `${prefix} ${formatYearDays([template.dueRule], context.language)}`;
}

export function formatMonthDays(
  days: RecurringMonthDay[],
  language: RecurringTextLanguage,
): string {
  if (days.length === 0) {
    return "-";
  }

  return days
    .map((day) =>
      day.isLastDay
        ? (language === "zh" ? "\u6708\u672b" : "last day")
        : String(day.dayOfMonth),
    )
    .join(", ");
}

export function formatYearDays(
  days: RecurringYearDay[],
  language: RecurringTextLanguage,
): string {
  if (days.length === 0) {
    return "-";
  }

  return days
    .map((day) =>
      day.isLastDay
        ? `${day.month}-${language === "zh" ? "\u6708\u672b" : "last"}`
        : `${day.month}-${day.dayOfMonth}`,
    )
    .join(", ");
}

function weekdayLabel(value: number, options: RecurringTextOption[]) {
  return options.find((option) => option.value === value)?.label ?? String(value);
}
