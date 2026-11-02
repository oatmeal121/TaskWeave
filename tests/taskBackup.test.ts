import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeTaskWeaveBackups,
  parseTaskWeaveBackup,
  type TaskWeaveBackup,
} from "../src/data/taskBackup.ts";

const browserBackup: TaskWeaveBackup = {
  format: "taskweave-backup",
  version: 1,
  exportedAt: "2026-10-19T12:00:00.000Z",
  tasks: [
    {
      id: "browser-parent",
      title: "Browser parent",
      description: "Created while testing in a browser",
      status: "doing",
      projectName: "Website",
      childCategory: null,
      tags: ["migration"],
      startDate: "2026-10-19",
      dueDate: null,
      completionDate: null,
      parentTaskId: null,
      sortOrder: 0,
      isImportant: true,
      isUrgent: false,
      activityDates: ["2026-10-19"],
      deletedAt: null,
      recurringTemplateId: null,
      recurrenceOccurrenceDate: null,
    },
    {
      id: "browser-child",
      title: "Browser child",
      description: "",
      status: "todo",
      projectName: "Website",
      childCategory: "Implementation",
      tags: ["migration"],
      startDate: "2026-10-19",
      dueDate: "2026-10-21",
      completionDate: null,
      parentTaskId: "browser-parent",
      sortOrder: 0,
      isImportant: true,
      isUrgent: false,
      activityDates: [],
      deletedAt: null,
      recurringTemplateId: null,
      recurrenceOccurrenceDate: null,
    },
  ],
  projects: [
    { name: "Work", parentName: null },
    { name: "Website", parentName: "Work" },
  ],
  tags: ["migration"],
  recurringTemplates: [],
};

test("a browser backup can be parsed for desktop import", () => {
  const parsed = parseTaskWeaveBackup(JSON.stringify(browserBackup));

  assert.equal(parsed.tasks.length, 2);
  assert.equal(parsed.tasks[1].parentTaskId, "browser-parent");
  assert.equal(parsed.projects[1].parentName, "Work");
  assert.deepEqual(parsed.tasks[0].activityDates, ["2026-10-19"]);
});

test("desktop import merges browser records without overwriting existing task ids", () => {
  const current: TaskWeaveBackup = {
    ...browserBackup,
    tasks: [{ ...browserBackup.tasks[0], title: "Desktop version" }],
    projects: [],
    tags: [],
  };

  const merged = mergeTaskWeaveBackups(current, browserBackup);

  assert.equal(merged.tasks.length, 2);
  assert.equal(merged.tasks.find((task) => task.id === "browser-parent")?.title, "Desktop version");
  assert.equal(merged.imported.tasks, 1);
  assert.equal(merged.imported.projects, 2);
  assert.equal(merged.imported.tags, 1);
});

const reminder = {
  id: "meeting", title: "Project meeting", description: "\tRoom 3\n  Bring notes\n",
  taskId: null, anchorAt: "2026-10-22T14:00", frequency: "weekly" as const,
  nextAt: "2026-10-29T14:00", enabled: true, lastFiredAt: "2026-10-22T14:00",
  lastScheduledAt: "2026-10-22T14:00", error: null,
};

test("version 2 preserves task times, reminder history, and description whitespace", () => {
  const task = { ...browserBackup.tasks[0], startTime: "09:30", dueTime: "17:00", description: "\tIndented\n  text\n" };
  const backup = { ...browserBackup, version: 2, tasks: [task], reminders: [reminder] };
  const parsed = parseTaskWeaveBackup(JSON.stringify(backup));
  assert.equal(parsed.version, 2);
  assert.deepEqual(parsed.tasks[0], task);
  assert.deepEqual(parsed.reminders, [reminder]);
  const current = { ...parsed, reminders: [{ ...reminder, title: "Locally edited" }] };
  const merged = mergeTaskWeaveBackups(current, parsed);
  assert.equal(merged.reminders?.[0].title, "Locally edited");
  assert.equal(merged.imported.reminders, 0);
});

test("old backups remain readable and invalid reminder dates are rejected", () => {
  const old = parseTaskWeaveBackup(browserBackup);
  assert.equal(old.tasks[0].startTime, null);
  assert.deepEqual(old.reminders, []);
  assert.throws(() => parseTaskWeaveBackup({ ...browserBackup, version: 2, reminders: [{ ...reminder, anchorAt: "2026-02-30T14:00" }] }));
  assert.throws(() => parseTaskWeaveBackup({ ...browserBackup, tasks: [{ ...browserBackup.tasks[0], startTime: "25:00" }] }));
});

test("hourly reminder rules and history survive backup parsing and merging", () => {
  const hourly = {...reminder,frequency:"hourly" as const,nextAt:"2026-10-22T15:00"};
  const parsed = parseTaskWeaveBackup(JSON.stringify({...browserBackup,version:2,reminders:[hourly]}));
  assert.deepEqual(parsed.reminders,[hourly]);
  const merged = mergeTaskWeaveBackups({...parsed,reminders:[]},parsed);
  assert.deepEqual(merged.reminders,[hourly]);
  assert.equal(merged.imported.reminders,1);
});
