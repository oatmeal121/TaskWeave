export type ReminderAlert = {
  id: string;
  reminderId: string | null;
  taskId: string | null;
  title: string;
  description: string;
  scheduledAt: string;
  availableAt: string;
  isTest: boolean;
};

/** Keep one pending alert per reminder, preferring an existing later snooze. */
export function coalesceReminderAlerts(alerts: ReminderAlert[]): ReminderAlert[] {
  const latest = new Map<string, ReminderAlert>();
  for (const alert of alerts) {
    if (!alert.reminderId) continue;
    const previous = latest.get(alert.reminderId);
    if (!previous || alert.availableAt > previous.availableAt ||
        (alert.availableAt === previous.availableAt && (alert.scheduledAt > previous.scheduledAt ||
          (alert.scheduledAt === previous.scheduledAt && alert.id > previous.id)))) {
      latest.set(alert.reminderId, alert);
    }
  }
  return alerts.filter(alert => !alert.reminderId || latest.get(alert.reminderId) === alert);
}

export function localSecond(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export type SnoozeUnit = "minutes" | "hours" | "days";

export function snoozeUntil(minutes: number, now = new Date()): string {
  const until = new Date(now.getTime() + minutes * 60_000);
  if (!Number.isSafeInteger(minutes) || minutes <= 0 || !Number.isFinite(until.getTime()) || until.getFullYear() > 9999) {
    throw new Error("invalid_snooze_duration");
  }
  return localSecond(until);
}

export function snoozeDurationMinutes(value: number, unit: SnoozeUnit): number | null {
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  const minutes = value * ({ minutes: 1, hours: 60, days: 1440 }[unit]);
  try { snoozeUntil(minutes); return minutes; }
  catch { return null; }
}

export function snoozeAlert(alert: ReminderAlert, minutes = 5, now = new Date()): ReminderAlert {
  return { ...alert, availableAt: snoozeUntil(minutes, now) };
}
