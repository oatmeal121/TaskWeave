export type ReminderFrequency = "once" | "hourly" | "daily" | "weekly" | "monthly";
export type Reminder = {
  id: string;
  title: string;
  description: string;
  taskId: string | null;
  anchorAt: string;
  frequency: ReminderFrequency;
  nextAt: string | null;
  enabled: boolean;
  lastFiredAt: string | null;
  lastScheduledAt: string | null;
  error: string | null;
};
export type ReminderDraft = Pick<Reminder, "title" | "description" | "taskId" | "anchorAt" | "frequency">;

export function localMinute(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function validClock(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function validReminderDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
    validClock(value.slice(11)) && !Number.isNaN(new Date(value).getTime()) && localMinute(new Date(value)) === value;
}

/** Next local occurrence, preserving the anchor's minute, weekday, or day of month. */
export function nextReminderOccurrence(anchorAt: string, frequency: ReminderFrequency, after = new Date()): string | null {
  if (frequency === "once" || !validReminderDate(anchorAt)) return null;
  const anchor = new Date(anchorAt);
  if (anchor > after) return anchorAt;
  let next = new Date(after.getFullYear(), after.getMonth(), after.getDate(), anchor.getHours(), anchor.getMinutes());
  if (frequency === "hourly") {
    next = new Date(after.getFullYear(), after.getMonth(), after.getDate(), after.getHours(), anchor.getMinutes());
    if (next <= after) next.setHours(next.getHours() + 1);
  } else if (frequency === "daily") {
    if (next <= after) next.setDate(next.getDate() + 1);
  } else if (frequency === "weekly") {
    next.setDate(next.getDate() + (anchor.getDay() - next.getDay() + 7) % 7);
    if (next <= after) next.setDate(next.getDate() + 7);
  } else {
    const make = (year: number, month: number) => new Date(year, month, Math.min(anchor.getDate(), new Date(year, month + 1, 0).getDate()), anchor.getHours(), anchor.getMinutes());
    next = make(after.getFullYear(), after.getMonth());
    if (next <= after) next = make(after.getFullYear(), after.getMonth() + 1);
  }
  return localMinute(next);
}
