import assert from "node:assert/strict";
import test from "node:test";
import { localMinute, nextReminderOccurrence, validClock, validReminderDate } from "../src/domain/reminder.ts";
import { coalesceReminderAlerts, snoozeAlert, snoozeDurationMinutes, snoozeUntil, type ReminderAlert } from "../src/domain/reminderAlert.ts";

test("snooze delays only this delivery by five minutes across calendar boundaries", () => {
  const alert: ReminderAlert = {
    id: "alert", reminderId: "weekly", taskId: "task", title: "Meeting",
    description: "Room 3", scheduledAt: "2026-10-22T14:00",
    availableAt: "2026-10-22T14:00:00", isTest: false,
  };
  const original = { ...alert };
  for (const [now, expected] of [
    ["2026-10-22T14:03:47", "2026-10-22T14:08:47"],
    ["2026-12-31T23:58:47", "2027-01-01T00:03:47"],
    ["2028-02-29T23:58:47", "2028-03-01T00:03:47"],
  ]) {
    assert.deepEqual(snoozeAlert(alert, 5, new Date(now)), { ...alert, availableAt: expected });
    assert.deepEqual(alert, original, "Snoozing leaves the saved occurrence unchanged");
  }
});

test("custom snooze accepts minutes, hours and days and rejects invalid durations", () => {
  const now = new Date("2026-12-31T23:58:47");
  for (const [amount, unit, expected] of [
    [17, "minutes", "2027-01-01T00:15:47"],
    [2, "hours", "2027-01-01T01:58:47"],
    [3, "days", "2027-01-03T23:58:47"],
  ] as const) {
    assert.equal(snoozeUntil(snoozeDurationMinutes(amount, unit)!, now), expected);
  }
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.equal(snoozeDurationMinutes(value, "days"), null);
    assert.throws(() => snoozeUntil(value, now));
  }
});

test("reminder times reject impossible calendar dates and malformed clocks", () => {
  assert.equal(validReminderDate("2028-02-29T14:30"), true);
  for (const value of ["2026-02-29T14:30", "2026-04-31T14:30", "2026-10-22T24:00", "2026-10-22T9:00", "2026-10-22"]) {
    assert.equal(validReminderDate(value), false, value);
  }
  assert.equal(validClock("00:00"), true);
  assert.equal(validClock("23:59"), true);
  assert.equal(validClock("14:60"), false);
  assert.equal(localMinute(new Date(2026, 9, 22, 9, 5)), "2026-10-22T09:05");
});

test("daily and weekly reminders preserve local clock time and skip missed cycles", () => {
  const after = new Date("2026-12-31T18:00");
  assert.equal(nextReminderOccurrence("2026-10-19T14:00", "daily", after), "2027-01-01T14:00");
  assert.equal(nextReminderOccurrence("2026-10-19T14:00", "weekly", after), "2027-01-04T14:00");
  assert.equal(nextReminderOccurrence("2026-10-19T14:00", "once", after), null);
  assert.equal(nextReminderOccurrence("2027-02-15T14:00", "weekly", after), "2027-02-15T14:00");
  assert.equal(nextReminderOccurrence("2026-10-19T14:00", "daily", new Date("2026-10-22T14:00")), "2026-10-23T14:00");
});

test("hourly reminders keep the chosen minute, skip missed hours, and cross midnight", () => {
  const anchor = "2026-10-22T14:30";
  for (const [after, expected] of [
    ["2026-10-22T13:40", anchor],
    ["2026-10-22T14:30", "2026-10-22T15:30"],
    ["2026-10-22T15:05", "2026-10-22T15:30"],
    ["2026-10-22T15:30:29", "2026-10-22T16:30"],
    ["2026-10-23T08:45", "2026-10-23T09:30"],
    ["2026-12-31T23:45", "2027-01-01T00:30"],
  ]) assert.equal(nextReminderOccurrence(anchor, "hourly", new Date(after)), expected);
});

test("duplicate deliveries collapse per reminder while preserving snoozes and different reminders", () => {
  const base: ReminderAlert = {id:"old",reminderId:"stand-up",taskId:null,title:"Stand up",description:"",scheduledAt:"2026-10-22T14:30",availableAt:"2026-10-22T14:30:00",isTest:false};
  const snoozed = {...base,id:"snoozed",availableAt:"2026-10-23T09:00:00"};
  const nextCycle = {...base,id:"next",scheduledAt:"2026-10-22T15:30",availableAt:"2026-10-22T15:30:00"};
  const other = {...base,id:"other",reminderId:"another-reminder"};
  const testAlert = {...base,id:"test",reminderId:null,isTest:true};
  assert.deepEqual(coalesceReminderAlerts([base,snoozed,nextCycle,other,testAlert]),[snoozed,other,testAlert]);
  assert.deepEqual(coalesceReminderAlerts([base,nextCycle]),[nextCycle]);
});

test("monthly reminders clamp short months then return to the original day", () => {
  const next = (after: string) => nextReminderOccurrence("2026-01-31T14:00", "monthly", new Date(after));
  assert.equal(next("2026-02-01T09:00"), "2026-02-28T14:00");
  assert.equal(next("2026-02-28T15:00"), "2026-03-31T14:00");
  assert.equal(next("2028-02-01T09:00"), "2028-02-29T14:00");
  assert.equal(next("2026-12-31T15:00"), "2027-01-31T14:00");
});
