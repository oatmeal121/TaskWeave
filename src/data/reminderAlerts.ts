import { isTauri, invoke } from "@tauri-apps/api/core";
import type { ReminderAlert } from "../domain/reminderAlert";
import { coalesceReminderAlerts, localSecond, snoozeAlert, snoozeUntil } from "../domain/reminderAlert";
import type { Reminder } from "../domain/reminder";
import { getDatabase } from "./database";

const KEY = "taskweave.browser.reminderAlerts";
export const ALERT_CHANGE = "taskweave-reminder-alerts-changed";
export function readBrowserAlerts(): ReminderAlert[] {
  const all: ReminderAlert[] = JSON.parse(localStorage.getItem(KEY) || "[]");
  const merged = coalesceReminderAlerts(all);
  if (merged.length !== all.length) localStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
}
export function writeBrowserAlerts(alerts: ReminderAlert[]) {
  localStorage.setItem(KEY, JSON.stringify(coalesceReminderAlerts(alerts)));
  window.dispatchEvent(new Event(ALERT_CHANGE));
}

export function queueBrowserReminder(item: Reminder) {
  const all = readBrowserAlerts();
  const scheduledAt = item.lastScheduledAt ?? item.anchorAt;
  // A pending/snoozed reminder must not accumulate another alert each cycle.
  if (all.some(a => a.reminderId === item.id)) return;
  writeBrowserAlerts([...all, {
    id: crypto.randomUUID(), reminderId: item.id, taskId: item.taskId,
    title: item.title, description: item.description, scheduledAt,
    availableAt: localSecond(), isTest: false,
  }]);
}

export async function listReminderAlerts(): Promise<ReminderAlert[]> {
  if (isTauri()) return invoke("list_reminder_alerts");
  const all = readBrowserAlerts();
  const tasks = JSON.parse(localStorage.getItem("taskweave.browser.tasks") || "[]") as Array<{id:string;status:string;deletedAt?:string|null}>;
  const valid = all.filter(a => !a.taskId || tasks.some(t => t.id === a.taskId && t.status !== "done" && !t.deletedAt));
  if (valid.length !== all.length) writeBrowserAlerts(valid);
  return valid.filter(a => a.availableAt <= localSecond()).sort((a,b) => a.availableAt.localeCompare(b.availableAt));
}

export async function dismissReminderAlerts(ids: string[]) {
  if (isTauri()) return invoke<void>("dismiss_reminder_alerts", { ids });
  writeBrowserAlerts(readBrowserAlerts().filter(a => !ids.includes(a.id)));
}

export async function snoozeReminderAlert(id: string, minutes = 5) {
  snoozeUntil(minutes);
  if (isTauri()) return invoke<void>("snooze_reminder_alert", { id, minutes });
  writeBrowserAlerts(readBrowserAlerts().map(a => a.id === id ? snoozeAlert(a, minutes) : a));
}

export async function testReminderPopup(language: "zh" | "en") {
  if (isTauri()) return invoke<void>("test_reminder_popup", { language });
  const zh = language === "zh";
  writeBrowserAlerts([...readBrowserAlerts(), {
    id: crypto.randomUUID(), reminderId: null, taskId: null, isTest: true,
    title: zh ? "这是一条测试提醒" : "This is a test reminder",
    description: zh ? "提醒会保留到手动处理。您可以确认，或自定义多少分钟、小时或天后再提醒。" : "This reminder stays until handled. Acknowledge it or snooze for a custom number of minutes, hours, or days.",
    scheduledAt: localSecond().slice(0,16), availableAt: localSecond(),
  }]);
}

/** Editing, pausing or deleting a reminder cancels deliveries from its previous schedule. */
export async function clearReminderAlerts(reminderId: string) {
  if (!isTauri()) { writeBrowserAlerts(readBrowserAlerts().filter(a => a.reminderId !== reminderId)); return; }
  await (await getDatabase()).execute("delete from reminder_alerts where reminder_id=$1", [reminderId]);
}
