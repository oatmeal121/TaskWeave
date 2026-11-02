import { isTauri } from "@tauri-apps/api/core";
import type {
  DeletedTask,
  MissingDatePolicy,
  ProjectSummary,
  RecurringDueRule,
  RecurringFrequency,
  RecurringMonthDay,
  RecurringTaskTemplate,
  RecurringTaskTemplateDraft,
  RecurringYearDay,
  TagSummary,
  Task,
  TaskDraft,
  TaskStatus,
} from "../domain/task";
import {
  completionDateForStatus,
  isTaskOverdue,
  todayIsoDate,
} from "../domain/task";
import { getDatabase } from "./database";
import { listReminders, importReminders } from "./reminderRepository";
import {
  mergeTaskWeaveBackups,
  type TaskWeaveBackup,
  type TaskWeaveBackupRecurringTemplate,
  type TaskWeaveBackupTask,
  type TaskWeaveImportCounts,
} from "./taskBackup";

const STORAGE_KEY = "taskweave.browser.tasks";
const PROJECT_STORAGE_KEY = "taskweave.browser.projects";
const TAG_STORAGE_KEY = "taskweave.browser.tags";
const RECURRING_STORAGE_KEY = "taskweave.browser.recurringTemplates";

export type ProjectDeleteMode = "trash_tasks" | "unfile_tasks";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  is_important: number;
  is_urgent: number;
  start_date: string;
  start_time: string | null;
  due_time: string | null;
  due_date: string | null;
  completion_date: string | null;
  parent_task_id: string | null;
  parent_title: string | null;
  child_category: string | null;
  child_count: number | null;
  sort_order: number | null;
  project_name: string | null;
  tag_names: string | null;
  activity_dates: string | null;
  worked_today: number | null;
  deleted_at: string | null;
  recurring_template_id: string | null;
  recurrence_occurrence_date: string | null;
};

type RecurringTemplateRow = {
  id: string;
  title: string;
  description: string | null;
  frequency: RecurringFrequency;
  is_important: number;
  is_urgent: number;
  project_name: string | null;
  start_on: string;
  start_time: string | null;
  due_time: string | null;
  missing_date_policy: MissingDatePolicy | null;
  custom_due_rule: string | null;
  tag_names: string | null;
  weekdays: string | null;
  month_days: string | null;
  year_days: string | null;
  generated_task_count: number | null;
};

type StoredTask = Task & {
  activityDates: string[];
  deletedAt: string | null;
  recurringTemplateId?: string | null;
  recurrenceOccurrenceDate?: string | null;
};

type StoredProject = {
  name: string;
  parentName: string | null;
};

type RecurringGeneratedTaskCleanupMode = "future" | "all_unfinished";

export type TaskRepository = {
  listTasks(): Promise<Task[]>;
  listDeletedTasks(): Promise<DeletedTask[]>;
  listRecurringTemplates(): Promise<RecurringTaskTemplate[]>;
  listProjects(): Promise<ProjectSummary[]>;
  listTags(): Promise<TagSummary[]>;
  createProject(name: string, parentName: string | null): Promise<void>;
  renameProject(oldName: string, newName: string): Promise<void>;
  moveProject(name: string, parentName: string | null): Promise<void>;
  deleteProject(name: string, mode: ProjectDeleteMode): Promise<void>;
  createTag(name: string): Promise<void>;
  renameTag(oldName: string, newName: string): Promise<void>;
  deleteTag(name: string): Promise<void>;
  createTask(draft: TaskDraft): Promise<void>;
  createRecurringTemplate(draft: RecurringTaskTemplateDraft): Promise<void>;
  updateRecurringTemplate(id: string, draft: RecurringTaskTemplateDraft): Promise<void>;
  deleteRecurringTemplate(id: string): Promise<void>;
  createChildTask(parentId: string, draft: TaskDraft): Promise<void>;
  updateTask(id: string, draft: TaskDraft): Promise<void>;
  deleteTask(id: string): Promise<void>;
  restoreTask(id: string): Promise<void>;
  permanentlyDeleteTask(id: string): Promise<void>;
  setTaskStatus(id: string, status: TaskStatus): Promise<void>;
  toggleActivity(id: string, activityDate: string): Promise<void>;
  reorderTasks(orderedIds: string[]): Promise<void>;
  moveTask(id: string, parentTaskId: string | null, orderedSiblingIds: string[]): Promise<void>;
  exportData(): Promise<TaskWeaveBackup>;
  importData(backup: TaskWeaveBackup): Promise<TaskWeaveImportCounts>;
};

export function createTaskRepository(): TaskRepository {
  const repository = isTauri() ? createSqliteTaskRepository() : createBrowserTaskRepository();
  return {
    ...repository,
    async exportData() {
      return { ...await repository.exportData(), version: 2, reminders: await listReminders() };
    },
    async importData(backup) {
      const counts = await repository.importData(backup);
      return { ...counts, reminders: await importReminders(backup.reminders ?? []) };
    },
  };
}

function createSqliteTaskRepository(): TaskRepository {
  return {
    async listTasks() {
      await ensureOrderingSchema();
      await generateRecurringTasksForActiveTemplates();
      return selectTasks(false);
    },

    async listDeletedTasks() {
      await ensureOrderingSchema();
      const rows = await selectTasks(true);
      return rows.map((task) => ({
        ...task,
        deletedAt: task.deletedAt ?? new Date().toISOString(),
      }));
    },

    async listRecurringTemplates() {
      await ensureOrderingSchema();
      await generateRecurringTasksForActiveTemplates();
      return selectRecurringTemplates();
    },

    async listProjects() {
      await ensureOrderingSchema();
      return selectProjectSummaries();
    },

    async listTags() {
      await ensureOrderingSchema();
      return selectTagSummaries();
    },

    async exportData() {
      return exportSqliteData();
    },

    async importData(backup) {
      return importSqliteData(backup);
    },

    async createProject(name, parentName) {
      await ensureOrderingSchema();
      await getOrCreateProjectId(name, parentName);
    },

    async renameProject(oldName, newName) {
      await ensureOrderingSchema();
      await renameSqliteProject(oldName, newName);
    },

    async moveProject(name, parentName) {
      await ensureOrderingSchema();
      await moveSqliteProject(name, parentName);
    },

    async deleteProject(name, mode) {
      await ensureOrderingSchema();
      await deleteSqliteProject(name, mode);
    },

    async createTag(name) {
      await ensureOrderingSchema();
      await getOrCreateTagId(name);
    },

    async renameTag(oldName, newName) {
      await ensureOrderingSchema();
      await renameSqliteTag(oldName, newName);
    },

    async deleteTag(name) {
      await ensureOrderingSchema();
      await deleteSqliteTag(name);
    },

    async createTask(draft) {
      await ensureOrderingSchema();
      await insertTask(draft, null);
    },

    async createRecurringTemplate(draft) {
      await ensureOrderingSchema();
      const templateId = await insertRecurringTemplate(draft);
      await generateRecurringTasksForTemplate(templateId);
    },

    async updateRecurringTemplate(id, draft) {
      await ensureOrderingSchema();
      await updateSqliteRecurringTemplate(id, draft);
      await generateRecurringTasksForTemplate(id, undefined, "all_unfinished");
    },

    async deleteRecurringTemplate(id) {
      await ensureOrderingSchema();
      await deleteSqliteRecurringTemplate(id);
    },

    async createChildTask(parentId, draft) {
      await ensureOrderingSchema();
      const childDraft = await inheritChildDraftFromParent(parentId, draft);
      await insertTask(childDraft, parentId);
      await syncParentAfterChildStatus(parentId, draft.status);
    },

    async updateTask(id, draft) {
      await ensureOrderingSchema();
      const db = await getDatabase();
      const projectId = await getOrCreateProjectId(draft.projectName);

      await db.execute(
        `
          update tasks
          set
            title = $1,
            description = $2,
            status = $3,
            is_important = $4,
            is_urgent = $5,
            start_date = $6,
            due_date = $7,
            completion_date = $8,
            project_id = $9,
            child_category = $10,
            updated_at = $11
          where id = $12
        `,
        [
          draft.title,
          draft.description,
          draft.status,
          boolToInt(draft.isImportant),
          boolToInt(draft.isUrgent),
          draft.startDate,
          draft.dueDate,
          completionDateForStatus(draft.status, draft.completionDate),
          projectId,
          normalizeOptionalText(draft.childCategory),
          new Date().toISOString(),
          id,
        ],
      );

      await replaceTaskTags(id, draft.tags);
      await saveClockFields("tasks", id, draft);
      await syncChildrenInheritedFields(id, draft);
      await syncAfterTaskStatusChange(id, draft.status);
    },

    async deleteTask(id) {
      await ensureOrderingSchema();
      const db = await getDatabase();
      const deletedAt = new Date().toISOString();

      await db.execute(
        `
          update tasks
          set is_deleted = 1, deleted_at = $1, updated_at = $2
          where id = $3
        `,
        [deletedAt, deletedAt, id],
      );

      await db.execute(
        `
          insert into trash_entries (id, entity_type, entity_id, deleted_at)
          values ($1, 'task', $2, $3)
        `,
        [crypto.randomUUID(), id, deletedAt],
      );
    },

    async restoreTask(id) {
      await ensureOrderingSchema();
      const db = await getDatabase();
      await db.execute(
        `
          update tasks
          set is_deleted = 0, deleted_at = null, updated_at = $1
          where id = $2
        `,
        [new Date().toISOString(), id],
      );
      await db.execute(
        "delete from trash_entries where entity_type = 'task' and entity_id = $1",
        [id],
      );
    },

    async permanentlyDeleteTask(id) {
      await ensureOrderingSchema();
      const db = await getDatabase();
      await db.execute("delete from activity_records where task_id = $1", [id]);
      await db.execute("delete from task_tags where task_id = $1", [id]);
      await db.execute(
        "delete from trash_entries where entity_type = 'task' and entity_id = $1",
        [id],
      );
      await db.execute("delete from tasks where id = $1 and is_deleted = 1", [id]);
    },

    async setTaskStatus(id, status) {
      await ensureOrderingSchema();
      const db = await getDatabase();
      await db.execute(
        `
          update tasks
          set status = $1, completion_date = $2, updated_at = $3
          where id = $4
        `,
        [status, completionDateForStatus(status), new Date().toISOString(), id],
      );
      await syncAfterTaskStatusChange(id, status);
    },

    async toggleActivity(id, activityDate) {
      await ensureOrderingSchema();
      const db = await getDatabase();
      const existing = await db.select<Array<{ id: string }>>(
        "select id from activity_records where task_id = $1 and activity_date = $2",
        [id, activityDate],
      );

      if (existing.length > 0) {
        await db.execute(
          "delete from activity_records where task_id = $1 and activity_date = $2",
          [id, activityDate],
        );
        return;
      }

      await db.execute(
        `
          insert into activity_records (id, task_id, activity_date, created_at)
          values ($1, $2, $3, $4)
        `,
        [crypto.randomUUID(), id, activityDate, new Date().toISOString()],
      );
    },

    async reorderTasks(orderedIds) {
      await ensureOrderingSchema();
      const db = await getDatabase();
      const now = new Date().toISOString();

      for (const [index, id] of orderedIds.entries()) {
        await db.execute(
          "update tasks set sort_order = $1, updated_at = $2 where id = $3",
          [index, now, id],
        );
      }
    },

    async moveTask(id, parentTaskId, orderedSiblingIds) {
      await ensureOrderingSchema();
      if (parentTaskId === id || (parentTaskId && (await isSqliteDescendant(parentTaskId, id)))) {
        return;
      }

      const db = await getDatabase();
      const now = new Date().toISOString();
      await db.execute(
        "update tasks set parent_task_id = $1, updated_at = $2 where id = $3",
        [parentTaskId, now, id],
      );

      if (parentTaskId) {
        await inheritSqliteMovedTaskFields(id, parentTaskId);
      }

      for (const [index, siblingId] of orderedSiblingIds.entries()) {
        await db.execute(
          "update tasks set sort_order = $1, updated_at = $2 where id = $3",
          [index, now, siblingId],
        );
      }
    },
  };
}

function createBrowserTaskRepository(): TaskRepository {
  return {
    async listTasks() {
      return toPublicTasks(readStoredTasks().filter((task) => !task.deletedAt));
    },

    async listDeletedTasks() {
      const deleted = readStoredTasks().filter((task) => task.deletedAt);
      return toPublicTasks(deleted).map((task) => ({
        ...task,
        deletedAt:
          deleted.find((deletedTask) => deletedTask.id === task.id)?.deletedAt ??
          new Date().toISOString(),
      }));
    },

    async listRecurringTemplates() {
      const templates = readStoredRecurringTemplates();
      writeStoredTasks(generateBrowserRecurringTasks(readStoredTasks(), templates));
      return withBrowserGeneratedCounts(templates, readStoredTasks());
    },

    async listProjects() {
      return browserProjectSummaries();
    },

    async listTags() {
      return browserTagSummaries();
    },

    async exportData() {
      return exportBrowserData();
    },

    async importData(backup) {
      const merged = mergeTaskWeaveBackups(exportBrowserData(), backup);
      writeStoredTasks(merged.tasks.map(backupTaskToStoredTask));
      writeStoredProjects(merged.projects);
      writeStoredNames(TAG_STORAGE_KEY, merged.tags);
      writeStoredRecurringTemplates(
        merged.recurringTemplates.map((template) => ({
          ...template,
          generatedTaskCount: 0,
        })),
      );
      return merged.imported;
    },

    async createProject(name, parentName) {
      const normalized = normalizeOptionalText(name);
      if (!normalized) {
        return;
      }
      const projects = readStoredProjects();
      if (projects.some((project) => project.name === normalized)) {
        return;
      }
      const normalizedParent = normalizeOptionalText(parentName);
      writeStoredProjects([
        ...projects,
        {
          name: normalized,
          parentName: projects.some((project) => project.name === normalizedParent)
            ? normalizedParent
            : null,
        },
      ]);
    },

    async renameProject(oldName, newName) {
      const oldProjectName = normalizeOptionalText(oldName);
      const newProjectName = normalizeOptionalText(newName);
      if (!oldProjectName || !newProjectName || oldProjectName === newProjectName) {
        return;
      }

      const projects = readStoredProjects();
      if (projects.some((project) => project.name === newProjectName)) {
        return;
      }

      writeStoredProjects(
        projects.map((project) => ({
          name: project.name === oldProjectName ? newProjectName : project.name,
          parentName:
            project.parentName === oldProjectName ? newProjectName : project.parentName,
        })),
      );
      writeStoredTasks(
        readStoredTasks().map((task) =>
          task.projectName === oldProjectName ? { ...task, projectName: newProjectName } : task,
        ),
      );
      writeStoredRecurringTemplates(
        readStoredRecurringTemplates().map((template) =>
          template.projectName === oldProjectName
            ? { ...template, projectName: newProjectName }
            : template,
        ),
      );
    },

    async moveProject(name, parentName) {
      const projectName = normalizeOptionalText(name);
      const nextParentName = normalizeOptionalText(parentName);
      const projects = readStoredProjects();
      const parentExists = nextParentName
        ? projects.some((project) => project.name === nextParentName)
        : true;
      if (
        !projectName ||
        !projects.some((project) => project.name === projectName) ||
        !parentExists ||
        nextParentName === projectName ||
        (nextParentName && isBrowserProjectDescendant(projects, nextParentName, projectName))
      ) {
        return;
      }

      writeStoredProjects(
        projects.map((project) =>
          project.name === projectName
            ? {
                ...project,
                parentName: nextParentName,
              }
            : project,
        ),
      );
    },

    async deleteProject(name, mode) {
      const projectName = normalizeOptionalText(name);
      if (!projectName) {
        return;
      }

      const projects = readStoredProjects();
      const deletedProject = projects.find((project) => project.name === projectName);
      writeStoredProjects(
        projects
          .filter((project) => project.name !== projectName)
          .map((project) =>
            project.parentName === projectName
              ? { ...project, parentName: deletedProject?.parentName ?? null }
              : project,
          ),
      );
      writeStoredTasks(
        readStoredTasks().map((task) => {
          if (task.projectName !== projectName) {
            return task;
          }

          return mode === "trash_tasks"
            ? { ...task, deletedAt: new Date().toISOString() }
            : { ...task, projectName: null };
        }),
      );
      writeStoredRecurringTemplates(
        readStoredRecurringTemplates().map((template) =>
          template.projectName === projectName ? { ...template, projectName: null } : template,
        ),
      );
    },

    async createTag(name) {
      const normalized = normalizeOptionalText(name);
      if (!normalized) {
        return;
      }
      writeStoredNames(TAG_STORAGE_KEY, [...readStoredNames(TAG_STORAGE_KEY), normalized]);
    },

    async renameTag(oldName, newName) {
      const oldTagName = normalizeOptionalText(oldName);
      const newTagName = normalizeOptionalText(newName);
      if (!oldTagName || !newTagName || oldTagName === newTagName) {
        return;
      }

      writeStoredNames(
        TAG_STORAGE_KEY,
        readStoredNames(TAG_STORAGE_KEY).map((name) =>
          name === oldTagName ? newTagName : name,
        ),
      );
      writeStoredTasks(
        readStoredTasks().map((task) => ({
          ...task,
          tags: normalizeTags(
            task.tags.map((tag) => (tag === oldTagName ? newTagName : tag)),
          ),
        })),
      );
    },

    async deleteTag(name) {
      const tagName = normalizeOptionalText(name);
      if (!tagName) {
        return;
      }

      writeStoredNames(
        TAG_STORAGE_KEY,
        readStoredNames(TAG_STORAGE_KEY).filter((storedName) => storedName !== tagName),
      );
      writeStoredTasks(
        readStoredTasks().map((task) => ({
          ...task,
          tags: task.tags.filter((tag) => tag !== tagName),
        })),
      );
    },

    async createTask(draft) {
      const tasks = readStoredTasks();
      const task = draftToStoredTask(
        crypto.randomUUID(),
        draft,
        null,
        nextBrowserSortOrder(tasks, null, draft.status),
      );
      writeStoredTasks([...tasks, task]);
    },

    async createRecurringTemplate(_draft) {
      const template: RecurringTaskTemplate = {
        ..._draft,
        id: crypto.randomUUID(),
        tags: normalizeTags(_draft.tags),
        weekdays: normalizeWeekdays(_draft.weekdays),
        monthDays: normalizeMonthDays(_draft.monthDays),
        yearDays: normalizeYearDays(_draft.yearDays),
        projectName: normalizeOptionalText(_draft.projectName),
        dueRule: _draft.dueRule,
        generatedTaskCount: 0,
      };
      const templates = [...readStoredRecurringTemplates(), template];
      writeStoredRecurringTemplates(templates);
      writeStoredTasks(generateBrowserRecurringTasks(readStoredTasks(), templates));
    },

    async updateRecurringTemplate(id, draft) {
      const templates = readStoredRecurringTemplates().map((template) =>
        template.id === id
          ? {
              ...draft,
              id,
              tags: normalizeTags(draft.tags),
              weekdays: normalizeWeekdays(draft.weekdays),
              monthDays: normalizeMonthDays(draft.monthDays),
              yearDays: normalizeYearDays(draft.yearDays),
              projectName: normalizeOptionalText(draft.projectName),
              generatedTaskCount: template.generatedTaskCount,
            }
          : template,
      );
      writeStoredRecurringTemplates(templates);
      writeStoredTasks(
        generateBrowserRecurringTasks(readStoredTasks(), templates, new Set([id])),
      );
    },

    async deleteRecurringTemplate(id) {
      writeStoredRecurringTemplates(
        readStoredRecurringTemplates().filter((template) => template.id !== id),
      );
      writeStoredTasks(
        readStoredTasks().filter(
          (task) =>
            task.recurringTemplateId !== id ||
            task.status === "done" ||
            task.startDate < todayIsoDate(),
        ),
      );
    },

    async createChildTask(parentId, draft) {
      const tasks = readStoredTasks();
      const childDraft = inheritBrowserChildDraftFromParent(tasks, parentId, draft);
      const task = draftToStoredTask(
        crypto.randomUUID(),
        childDraft,
        parentId,
        nextBrowserSortOrder(tasks, parentId, childDraft.status),
      );
      writeStoredTasks(syncBrowserParentAfterChildStatus([...tasks, task], parentId, draft.status));
    },

    async updateTask(id, draft) {
      const tasks = readStoredTasks().map((task) =>
        task.id === id
          ? {
              ...draftToStoredTask(id, draft, task.parentTaskId, task.sortOrder, task.recurringTemplateId, task.recurrenceOccurrenceDate),
              activityDates: task.activityDates,
              deletedAt: task.deletedAt,
            }
          : task,
      );

      writeStoredTasks(
        syncBrowserAfterTaskStatusChange(
          syncBrowserChildrenInheritedFields(tasks, id, draft),
          id,
          draft.status,
        ),
      );
    },

    async deleteTask(id) {
      writeStoredTasks(
        readStoredTasks().map((task) =>
          task.id === id ? { ...task, deletedAt: new Date().toISOString() } : task,
        ),
      );
    },

    async restoreTask(id) {
      writeStoredTasks(
        readStoredTasks().map((task) =>
          task.id === id ? { ...task, deletedAt: null } : task,
        ),
      );
    },

    async permanentlyDeleteTask(id) {
      writeStoredTasks(readStoredTasks().filter((task) => task.id !== id));
    },

    async setTaskStatus(id, status) {
      const tasks = readStoredTasks().map((task) =>
        task.id === id
          ? {
              ...task,
              status,
              completionDate: completionDateForStatus(status),
              isOverdue: isTaskOverdue({ ...task, status }),
            }
          : task,
      );

      writeStoredTasks(syncBrowserAfterTaskStatusChange(tasks, id, status));
    },

    async toggleActivity(id, activityDate) {
      writeStoredTasks(
        readStoredTasks().map((task) => {
          if (task.id !== id) {
            return task;
          }

          const hasActivity = task.activityDates.includes(activityDate);
          const activityDates = hasActivity
            ? task.activityDates.filter((date) => date !== activityDate)
            : [...task.activityDates, activityDate];

          return {
            ...task,
            activityDates,
            workedToday: activityDates.includes(todayIsoDate()),
          };
        }),
      );
    },

    async reorderTasks(orderedIds) {
      const positionById = new Map(orderedIds.map((id, index) => [id, index]));
      writeStoredTasks(
        readStoredTasks().map((task) =>
          positionById.has(task.id)
            ? { ...task, sortOrder: positionById.get(task.id) ?? task.sortOrder }
            : task,
        ),
      );
    },

    async moveTask(id, parentTaskId, orderedSiblingIds) {
      const tasks = readStoredTasks();
      if (
        parentTaskId === id ||
        (parentTaskId && isBrowserDescendant(tasks, parentTaskId, id))
      ) {
        return;
      }

      const positionById = new Map(orderedSiblingIds.map((taskId, index) => [taskId, index]));
      const parent = parentTaskId
        ? tasks.find((task) => task.id === parentTaskId)
        : null;
      const movedDraft = parent
        ? inheritBrowserChildDraftFromParent(
            tasks,
            parent.id,
            taskToDraft(tasks.find((task) => task.id === id)),
          )
        : null;

      const movedTasks = tasks.map((task) => {
        if (task.id !== id) {
          return positionById.has(task.id)
            ? { ...task, sortOrder: positionById.get(task.id) ?? task.sortOrder }
            : task;
        }

        return {
          ...task,
          parentTaskId,
          sortOrder: positionById.get(task.id) ?? task.sortOrder,
          projectName: movedDraft?.projectName ?? task.projectName,
          tags: movedDraft?.tags ?? task.tags,
          isImportant: movedDraft?.isImportant ?? task.isImportant,
          isUrgent: movedDraft?.isUrgent ?? task.isUrgent,
        };
      });

      writeStoredTasks(
        parent && movedDraft
          ? syncBrowserChildrenInheritedFields(movedTasks, id, movedDraft)
          : movedTasks,
      );
    },
  };
}

async function exportSqliteData(): Promise<TaskWeaveBackup> {
  await ensureOrderingSchema();
  await generateRecurringTasksForActiveTemplates();
  const [activeTasks, deletedTasks, projects, tags, recurringTemplates] = await Promise.all([
    selectTasks(false),
    selectTasks(true),
    selectProjectSummaries(),
    selectTagSummaries(),
    selectRecurringTemplates(),
  ]);

  return {
    format: "taskweave-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: [...activeTasks, ...deletedTasks].map(publicTaskToBackupTask),
    projects: projects.map(({ name, parentName }) => ({ name, parentName })),
    tags: tags.map((tag) => tag.name),
    recurringTemplates: recurringTemplates.map(publicTemplateToBackupTemplate),
  };
}

function exportBrowserData(): TaskWeaveBackup {
  const tasks = readStoredTasks();
  const recurringTemplates = readStoredRecurringTemplates();
  return {
    format: "taskweave-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: tasks.map(storedTaskToBackupTask),
    projects: readStoredProjects(),
    tags: normalizeTags([
      ...readStoredNames(TAG_STORAGE_KEY),
      ...tasks.flatMap((task) => task.tags),
      ...recurringTemplates.flatMap((template) => template.tags),
    ]),
    recurringTemplates: recurringTemplates.map(publicTemplateToBackupTemplate),
  };
}

async function importSqliteData(backup: TaskWeaveBackup): Promise<TaskWeaveImportCounts> {
  await ensureOrderingSchema();
  const current = await exportSqliteData();
  const merged = mergeTaskWeaveBackups(current, backup);
  const currentProjectNames = new Set(current.projects.map((project) => project.name));
  const importedProjects = backup.projects.filter(
    (project) => !currentProjectNames.has(project.name),
  );

  for (const project of importedProjects) {
    await getOrCreateProjectId(project.name);
  }
  for (const project of importedProjects) {
    await moveSqliteProject(project.name, project.parentName);
  }
  for (const tag of backup.tags) {
    await getOrCreateTagId(tag);
  }

  const db = await getDatabase();
  const currentTemplateIds = new Set(
    current.recurringTemplates.map((template) => template.id),
  );
  const importedTemplates = backup.recurringTemplates.filter(
    (template) => !currentTemplateIds.has(template.id),
  );
  const now = new Date().toISOString();
  for (const template of importedTemplates) {
    const projectId = await getOrCreateProjectId(template.projectName);
    await db.execute(
      `
        insert or ignore into recurring_task_templates (
          id, title, description, frequency, is_important, is_urgent, project_id, start_on,
          missing_date_policy, custom_due_rule, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        template.id,
        template.title,
        template.description,
        template.frequency,
        boolToInt(template.isImportant),
        boolToInt(template.isUrgent),
        projectId,
        template.startOn,
        template.missingDatePolicy,
        serializeDueRule(template.dueRule),
        now,
        now,
      ],
    );
    await saveClockFields("recurring_task_templates", template.id, template);
    await replaceRecurringTemplateTags(template.id, template.tags);
    await replaceRecurringTemplateRules(template.id, {
      ...template,
      generatedTaskCount: undefined,
    } as RecurringTaskTemplateDraft);
  }

  const currentTaskIds = new Set(current.tasks.map((task) => task.id));
  const availableTemplateIds = new Set([
    ...current.recurringTemplates.map((template) => template.id),
    ...importedTemplates.map((template) => template.id),
  ]);
  const pendingTasks = backup.tasks.filter((task) => !currentTaskIds.has(task.id));
  const availableTaskIds = new Set(currentTaskIds);
  const insertedTasks: TaskWeaveBackupTask[] = [];

  while (pendingTasks.length > 0) {
    const readyIndex = pendingTasks.findIndex(
      (task) => !task.parentTaskId || availableTaskIds.has(task.parentTaskId),
    );
    const task = pendingTasks.splice(readyIndex >= 0 ? readyIndex : 0, 1)[0];
    const parentTaskId =
      task.parentTaskId && availableTaskIds.has(task.parentTaskId)
        ? task.parentTaskId
        : null;
    let recurringTemplateId =
      task.recurringTemplateId && availableTemplateIds.has(task.recurringTemplateId)
        ? task.recurringTemplateId
        : null;
    let recurrenceOccurrenceDate = recurringTemplateId
      ? task.recurrenceOccurrenceDate
      : null;

    if (recurringTemplateId && recurrenceOccurrenceDate) {
      const duplicateOccurrences = await db.select<Array<{ id: string }>>(
        `
          select id from tasks
          where recurring_template_id = $1 and recurrence_occurrence_date = $2
          limit 1
        `,
        [recurringTemplateId, recurrenceOccurrenceDate],
      );
      if (duplicateOccurrences.length > 0) {
        recurringTemplateId = null;
        recurrenceOccurrenceDate = null;
      }
    }

    const projectId = await getOrCreateProjectId(task.projectName);
    const completionDate = completionDateForStatus(task.status, task.completionDate);
    await db.execute(
      `
        insert or ignore into tasks (
          id, title, description, status, is_important, is_urgent, start_date, due_date,
          completion_date, project_id, parent_task_id, child_category, sort_order,
          recurring_template_id, recurrence_occurrence_date, is_deleted, deleted_at,
          created_at, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19
        )
      `,
      [
        task.id,
        task.title,
        task.description,
        task.status,
        boolToInt(task.isImportant),
        boolToInt(task.isUrgent),
        task.startDate,
        task.dueDate,
        completionDate,
        projectId,
        parentTaskId,
        normalizeOptionalText(task.childCategory),
        task.sortOrder,
        recurringTemplateId,
        recurrenceOccurrenceDate,
        boolToInt(Boolean(task.deletedAt)),
        task.deletedAt,
        now,
        now,
      ],
    );
    await replaceTaskTags(task.id, task.tags);
    await saveClockFields("tasks", task.id, task);
    for (const activityDate of task.activityDates) {
      await db.execute(
        `
          insert or ignore into activity_records (id, task_id, activity_date, created_at)
          values ($1, $2, $3, $4)
        `,
        [crypto.randomUUID(), task.id, activityDate, now],
      );
    }
    if (task.deletedAt) {
      await db.execute(
        `
          insert into trash_entries (id, entity_type, entity_id, deleted_at)
          values ($1, 'task', $2, $3)
        `,
        [crypto.randomUUID(), task.id, task.deletedAt],
      );
    }
    availableTaskIds.add(task.id);
    insertedTasks.push(task);
  }

  for (const task of insertedTasks) {
    if (task.parentTaskId && availableTaskIds.has(task.parentTaskId)) {
      await db.execute("update tasks set parent_task_id = $1 where id = $2", [
        task.parentTaskId,
        task.id,
      ]);
    }
  }

  return merged.imported;
}

function publicTaskToBackupTask(
  task: Task & { deletedAt?: string | null },
): TaskWeaveBackupTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    projectName: task.projectName,
    childCategory: task.childCategory,
    tags: [...task.tags],
    startDate: task.startDate,
    startTime: task.startTime ?? null,
    dueTime: task.dueTime ?? null,
    dueDate: task.dueDate,
    completionDate: task.completionDate,
    parentTaskId: task.parentTaskId,
    sortOrder: task.sortOrder,
    isImportant: task.isImportant,
    isUrgent: task.isUrgent,
    activityDates: [...task.activityDates],
    deletedAt: task.deletedAt ?? null,
    recurringTemplateId: task.recurringTemplateId,
    recurrenceOccurrenceDate: task.recurrenceOccurrenceDate,
  };
}

function storedTaskToBackupTask(task: StoredTask): TaskWeaveBackupTask {
  return publicTaskToBackupTask(task);
}

function backupTaskToStoredTask(task: TaskWeaveBackupTask): StoredTask {
  return {
    ...task,
    parentTitle: null,
    childCount: 0,
    isOverdue: isTaskOverdue(task),
    workedToday: task.activityDates.includes(todayIsoDate()),
  };
}

function publicTemplateToBackupTemplate(
  template: RecurringTaskTemplate,
): TaskWeaveBackupRecurringTemplate {
  const { generatedTaskCount: _generatedTaskCount, ...backupTemplate } = template;
  return backupTemplate;
}

async function selectTasks(deleted: boolean): Promise<Array<Task & { deletedAt: string | null }>> {
  const db = await getDatabase();
  const today = todayIsoDate();
  const rows = await db.select<TaskRow[]>(
    `
      select
        tasks.id,
        tasks.title,
        tasks.description,
        tasks.status,
        tasks.is_important,
        tasks.is_urgent,
        tasks.start_date,
        tasks.start_time,
        tasks.due_time,
        tasks.due_date,
        tasks.completion_date,
        tasks.parent_task_id,
        parent_tasks.title as parent_title,
        tasks.child_category,
        coalesce(child_counts.child_count, 0) as child_count,
        tasks.sort_order,
        tasks.deleted_at,
        tasks.recurring_template_id,
        tasks.recurrence_occurrence_date,
        projects.name as project_name,
        group_concat(distinct tags.name) as tag_names,
        activity_lists.activity_dates,
        case when activity_records.id is null then 0 else 1 end as worked_today
      from tasks
      left join tasks parent_tasks on parent_tasks.id = tasks.parent_task_id
      left join (
        select parent_task_id, count(*) as child_count
        from tasks
        where is_deleted = 0 and parent_task_id is not null
        group by parent_task_id
      ) child_counts on child_counts.parent_task_id = tasks.id
      left join projects on projects.id = tasks.project_id
      left join task_tags on task_tags.task_id = tasks.id
      left join tags on tags.id = task_tags.tag_id and tags.is_deleted = 0
      left join (
        select task_id, group_concat(activity_date) as activity_dates
        from activity_records
        group by task_id
      ) activity_lists on activity_lists.task_id = tasks.id
      left join activity_records
        on activity_records.task_id = tasks.id
        and activity_records.activity_date = $1
      where tasks.is_deleted = $2
      group by tasks.id
      order by
        case tasks.status
          when 'todo' then 1
          when 'doing' then 2
          when 'done' then 3
        end,
        tasks.sort_order asc,
        tasks.created_at desc
    `,
    [today, boolToInt(deleted)],
  );

  return rows.map(rowToTaskWithDeletedAt);
}

async function insertTask(
  draft: TaskDraft,
  parentTaskId: string | null,
  recurringTemplateId: string | null = null,
  recurrenceOccurrenceDate: string | null = null,
): Promise<string> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const projectId = await getOrCreateProjectId(draft.projectName);
  const sortOrder = await nextSqliteSortOrder(parentTaskId, draft.status);

  await db.execute(
    `
      insert into tasks (
        id, title, description, status, is_important, is_urgent, start_date, due_date,
        completion_date, project_id, parent_task_id, child_category, sort_order,
        recurring_template_id, recurrence_occurrence_date, created_at, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `,
    [
      id,
      draft.title,
      draft.description,
      draft.status,
      boolToInt(draft.isImportant),
      boolToInt(draft.isUrgent),
      draft.startDate,
      draft.dueDate,
      completionDateForStatus(draft.status, draft.completionDate),
      projectId,
      parentTaskId,
      normalizeOptionalText(draft.childCategory),
      sortOrder,
      recurringTemplateId,
      recurrenceOccurrenceDate,
      now,
      now,
    ],
  );

  await replaceTaskTags(id, draft.tags);
  await saveClockFields("tasks", id, draft);
  return id;
}

async function ensureOrderingSchema(): Promise<void> {
  const db = await getDatabase();
  const columns = await db.select<Array<{ name: string }>>("pragma table_info(tasks)");
  const projectColumns = await db.select<Array<{ name: string }>>("pragma table_info(projects)");
  const hasSortOrder = columns.some((column) => column.name === "sort_order");
  const hasDescription = columns.some((column) => column.name === "description");
  const hasChildCategory = columns.some((column) => column.name === "child_category");
  const hasRecurringTemplateId = columns.some((column) => column.name === "recurring_template_id");
  const hasRecurrenceOccurrenceDate = columns.some(
    (column) => column.name === "recurrence_occurrence_date",
  );

  if (!hasDescription) {
    await db.execute("alter table tasks add column description text not null default ''");
  }

  if (!hasSortOrder) {
    await db.execute("alter table tasks add column sort_order integer not null default 0");
  }

  if (!hasChildCategory) {
    await db.execute("alter table tasks add column child_category text");
  }

  if (!hasRecurringTemplateId) {
    await db.execute("alter table tasks add column recurring_template_id text");
  }

  if (!hasRecurrenceOccurrenceDate) {
    await db.execute("alter table tasks add column recurrence_occurrence_date text");
  }

  await db.execute(
    "create index if not exists idx_tasks_parent_status_order on tasks(parent_task_id, status, sort_order)",
  );
  await db.execute(
    "create index if not exists idx_tasks_recurring_template_id on tasks(recurring_template_id)",
  );
  await db.execute(
    `create unique index if not exists idx_tasks_template_occurrence
     on tasks(recurring_template_id, recurrence_occurrence_date)
     where recurring_template_id is not null and recurrence_occurrence_date is not null`,
  );
  if (!projectColumns.some((column) => column.name === "parent_project_id")) {
    await db.execute(
      "alter table projects add column parent_project_id text references projects(id) on delete set null",
    );
  }
  await db.execute(
    "create index if not exists idx_projects_parent_project_id on projects(parent_project_id)",
  );
  await ensureRecurringTables();
}

async function ensureRecurringTables(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`
    create table if not exists recurring_task_templates (
      id text primary key,
      title text not null,
      description text not null default '',
      frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
      is_important integer not null default 0,
      is_urgent integer not null default 0,
      project_id text references projects(id) on delete set null,
      start_on text not null,
      missing_date_policy text check (missing_date_policy in ('skip_period', 'use_last_day')),
      custom_due_rule text,
      is_deleted integer not null default 0,
      deleted_at text,
      created_at text not null,
      updated_at text not null
    )
  `);
  const templateColumns = await db.select<Array<{ name: string }>>(
    "pragma table_info(recurring_task_templates)",
  );
  if (!templateColumns.some((column) => column.name === "description")) {
    await db.execute(
      "alter table recurring_task_templates add column description text not null default ''",
    );
  }
  await db.execute(`
    create table if not exists recurring_template_tags (
      template_id text not null references recurring_task_templates(id) on delete cascade,
      tag_id text not null references tags(id) on delete cascade,
      primary key (template_id, tag_id)
    )
  `);
  await db.execute(`
    create table if not exists recurring_template_weekdays (
      template_id text not null references recurring_task_templates(id) on delete cascade,
      weekday integer not null check (weekday between 1 and 7),
      primary key (template_id, weekday)
    )
  `);
  await db.execute(`
    create table if not exists recurring_template_month_days (
      template_id text not null references recurring_task_templates(id) on delete cascade,
      day_of_month integer check (day_of_month between 1 and 31),
      is_last_day integer not null default 0,
      check (
        (is_last_day = 1 and day_of_month is null)
        or (is_last_day = 0 and day_of_month is not null)
      )
    )
  `);
  await db.execute(`
    create table if not exists recurring_template_year_days (
      template_id text not null references recurring_task_templates(id) on delete cascade,
      month integer not null check (month between 1 and 12),
      day_of_month integer check (day_of_month between 1 and 31),
      is_last_day integer not null default 0,
      check (
        (is_last_day = 1 and day_of_month is null)
        or (is_last_day = 0 and day_of_month is not null)
      )
    )
  `);
}

async function selectRecurringTemplates(): Promise<RecurringTaskTemplate[]> {
  const db = await getDatabase();
  const rows = await db.select<RecurringTemplateRow[]>(`
    select
      templates.id,
      templates.title,
      templates.description,
      templates.frequency,
      templates.is_important,
      templates.is_urgent,
      projects.name as project_name,
      templates.start_on,
      templates.start_time,
      templates.due_time,
      templates.missing_date_policy,
      templates.custom_due_rule,
      tag_lists.tag_names,
      weekday_lists.weekdays,
      month_day_lists.month_days,
      year_day_lists.year_days,
      coalesce(generated_counts.generated_task_count, 0) as generated_task_count
    from recurring_task_templates templates
    left join projects on projects.id = templates.project_id
    left join (
      select recurring_template_tags.template_id, group_concat(tags.name) as tag_names
      from recurring_template_tags
      join tags on tags.id = recurring_template_tags.tag_id and tags.is_deleted = 0
      group by recurring_template_tags.template_id
    ) tag_lists on tag_lists.template_id = templates.id
    left join (
      select template_id, group_concat(weekday) as weekdays
      from recurring_template_weekdays
      group by template_id
    ) weekday_lists on weekday_lists.template_id = templates.id
    left join (
      select
        template_id,
        group_concat(case when is_last_day = 1 then 'last' else cast(day_of_month as text) end) as month_days
      from recurring_template_month_days
      group by template_id
    ) month_day_lists on month_day_lists.template_id = templates.id
    left join (
      select
        template_id,
        group_concat(
          cast(month as text) || ':' ||
          case when is_last_day = 1 then 'last' else cast(day_of_month as text) end
        ) as year_days
      from recurring_template_year_days
      group by template_id
    ) year_day_lists on year_day_lists.template_id = templates.id
    left join (
      select recurring_template_id, count(*) as generated_task_count
      from tasks
      where is_deleted = 0 and recurring_template_id is not null
      group by recurring_template_id
    ) generated_counts on generated_counts.recurring_template_id = templates.id
    where templates.is_deleted = 0
    order by templates.created_at desc
  `);

  return rows.map(rowToRecurringTemplate);
}

async function insertRecurringTemplate(draft: RecurringTaskTemplateDraft): Promise<string> {
  const db = await getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const projectId = await getOrCreateProjectId(draft.projectName);

  await db.execute(
    `
      insert into recurring_task_templates (
        id, title, description, frequency, is_important, is_urgent, project_id, start_on,
        missing_date_policy, custom_due_rule, created_at, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
    [
      id,
      draft.title,
      draft.description,
      draft.frequency,
      boolToInt(draft.isImportant),
      boolToInt(draft.isUrgent),
      projectId,
      draft.startOn,
      draft.missingDatePolicy,
      serializeDueRule(draft.dueRule),
      now,
      now,
    ],
  );

  await replaceRecurringTemplateTags(id, draft.tags);
  await replaceRecurringTemplateRules(id, draft);
  await saveClockFields("recurring_task_templates", id, draft);
  return id;
}

async function updateSqliteRecurringTemplate(
  id: string,
  draft: RecurringTaskTemplateDraft,
): Promise<void> {
  const db = await getDatabase();
  const projectId = await getOrCreateProjectId(draft.projectName);
  await db.execute(
    `
      update recurring_task_templates
      set
        title = $1,
        description = $2,
        frequency = $3,
        is_important = $4,
        is_urgent = $5,
        project_id = $6,
        start_on = $7,
        missing_date_policy = $8,
        custom_due_rule = $9,
        updated_at = $10
      where id = $11
    `,
    [
      draft.title,
      draft.description,
      draft.frequency,
      boolToInt(draft.isImportant),
      boolToInt(draft.isUrgent),
      projectId,
      draft.startOn,
      draft.missingDatePolicy,
      serializeDueRule(draft.dueRule),
      new Date().toISOString(),
      id,
    ],
  );
  await replaceRecurringTemplateTags(id, draft.tags);
  await replaceRecurringTemplateRules(id, draft);
  await saveClockFields("recurring_task_templates", id, draft);
}

async function replaceRecurringTemplateTags(templateId: string, tags: string[]): Promise<void> {
  const db = await getDatabase();
  await db.execute("delete from recurring_template_tags where template_id = $1", [templateId]);

  for (const tagName of normalizeTags(tags)) {
    const tagId = await getOrCreateTagId(tagName);
    await db.execute(
      "insert into recurring_template_tags (template_id, tag_id) values ($1, $2)",
      [templateId, tagId],
    );
  }
}

async function replaceRecurringTemplateRules(
  templateId: string,
  draft: RecurringTaskTemplateDraft,
): Promise<void> {
  const db = await getDatabase();
  await db.execute("delete from recurring_template_weekdays where template_id = $1", [templateId]);
  await db.execute("delete from recurring_template_month_days where template_id = $1", [templateId]);
  await db.execute("delete from recurring_template_year_days where template_id = $1", [templateId]);

  for (const weekday of normalizeWeekdays(draft.weekdays)) {
    await db.execute(
      "insert into recurring_template_weekdays (template_id, weekday) values ($1, $2)",
      [templateId, weekday],
    );
  }

  for (const day of normalizeMonthDays(draft.monthDays)) {
    await db.execute(
      `
        insert into recurring_template_month_days (template_id, day_of_month, is_last_day)
        values ($1, $2, $3)
      `,
      [templateId, day.isLastDay ? null : day.dayOfMonth, boolToInt(day.isLastDay)],
    );
  }

  for (const day of normalizeYearDays(draft.yearDays)) {
    await db.execute(
      `
        insert into recurring_template_year_days (template_id, month, day_of_month, is_last_day)
        values ($1, $2, $3, $4)
      `,
      [templateId, day.month, day.isLastDay ? null : day.dayOfMonth, boolToInt(day.isLastDay)],
    );
  }
}

async function generateRecurringTasksForActiveTemplates(): Promise<void> {
  const templates = await selectRecurringTemplates();

  for (const template of templates) {
    await generateRecurringTasksForTemplate(template.id, template);
  }
}

async function generateRecurringTasksForTemplate(
  templateId: string,
  knownTemplate?: RecurringTaskTemplate,
  cleanupMode: RecurringGeneratedTaskCleanupMode = "future",
): Promise<void> {
  const template =
    knownTemplate ?? (await selectRecurringTemplates()).find((candidate) => candidate.id === templateId);
  if (!template) {
    return;
  }

  const today = todayIsoDate();
  const occurrenceDates = currentAndNextOccurrenceDates(template, today);
  await cleanupExtraRecurringInstances(template.id, occurrenceDates, today, cleanupMode);

  for (const occurrenceDate of occurrenceDates) {
    await insertRecurringTaskIfMissing(
      template,
      occurrenceDate,
      dueDateForOccurrence(template, occurrenceDate),
      cleanupMode !== "future",
    );
  }
}

async function insertRecurringTaskIfMissing(
  template: RecurringTaskTemplate,
  occurrenceDate: string,
  dueDate: string,
  refreshClockFields = false,
): Promise<void> {
  const db = await getDatabase();
  const existing = await db.select<Array<{ id: string; status: TaskStatus }>>(
    `
      select id, status
      from tasks
      where recurring_template_id = $1 and recurrence_occurrence_date = $2
      limit 1
    `,
    [template.id, occurrenceDate],
  );
  if (existing.length > 0) {
    if (existing[0].status !== "done") {
      await updateRecurringGeneratedTask(existing[0].id, template, occurrenceDate, dueDate, refreshClockFields);
    }
    return;
  }

  await insertTask(
    {
      title: template.title,
      description: template.description,
      startTime: template.startTime ?? null,
      dueTime: template.dueTime ?? null,
      status: "todo",
      projectName: template.projectName,
      childCategory: null,
      tags: template.tags,
      startDate: occurrenceDate,
      dueDate,
      completionDate: null,
      isImportant: template.isImportant,
      isUrgent: template.isUrgent,
    },
    null,
    template.id,
    occurrenceDate,
  );
}

async function updateRecurringGeneratedTask(
  taskId: string,
  template: RecurringTaskTemplate,
  occurrenceDate: string,
  dueDate: string,
  refreshClockFields: boolean,
): Promise<void> {
  const db = await getDatabase();
  const projectId = await getOrCreateProjectId(template.projectName);
  await db.execute(
    `
      update tasks
      set
        title = $1,
        description = $2,
        is_important = $3,
        is_urgent = $4,
        start_date = $5,
        due_date = $6,
        project_id = $7,
        updated_at = $8
      where id = $9 and status <> 'done'
    `,
    [
      template.title,
      template.description,
      boolToInt(template.isImportant),
      boolToInt(template.isUrgent),
      occurrenceDate,
      dueDate,
      projectId,
      new Date().toISOString(),
      taskId,
    ],
  );
  await replaceTaskTags(taskId, template.tags);
  if (refreshClockFields) await saveClockFields("tasks", taskId, template);
}

async function cleanupExtraRecurringInstances(
  templateId: string,
  allowedOccurrenceDates: string[],
  today: string,
  mode: RecurringGeneratedTaskCleanupMode = "future",
): Promise<void> {
  const db = await getDatabase();
  const allowedPlaceholders = allowedOccurrenceDates
    .map((_, index) => `$${index + 3}`)
    .join(",");
  const staleDateCondition = mode === "all_unfinished" ? "and ($2 = $2)" : "and start_date > $2";
  const extraTasks = await db.select<Array<{ id: string }>>(
    `
      select id
      from tasks
      where recurring_template_id = $1
        and is_deleted = 0
        and status <> 'done'
        ${staleDateCondition}
        and recurrence_occurrence_date not in (${allowedPlaceholders})
    `,
    [templateId, today, ...allowedOccurrenceDates],
  );

  for (const task of extraTasks) {
    await db.execute("delete from task_tags where task_id = $1", [task.id]);
    await db.execute("delete from activity_records where task_id = $1", [task.id]);
    await db.execute("delete from tasks where id = $1", [task.id]);
  }
}

async function deleteSqliteRecurringTemplate(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.execute(
    "update recurring_task_templates set is_deleted = 1, deleted_at = $1, updated_at = $1 where id = $2",
    [now, id],
  );
  await db.execute(
    `
      insert into trash_entries (id, entity_type, entity_id, deleted_at)
      values ($1, 'recurring_template', $2, $3)
    `,
    [crypto.randomUUID(), id, now],
  );

  const futureTasks = await db.select<Array<{ id: string }>>(
    `
      select id
      from tasks
      where recurring_template_id = $1
        and is_deleted = 0
        and status <> 'done'
        and start_date >= $2
    `,
    [id, todayIsoDate()],
  );

  for (const task of futureTasks) {
    await db.execute("delete from task_tags where task_id = $1", [task.id]);
    await db.execute("delete from activity_records where task_id = $1", [task.id]);
    await db.execute("delete from tasks where id = $1", [task.id]);
  }
}

async function selectProjectSummaries(): Promise<ProjectSummary[]> {
  const db = await getDatabase();
  const rows = await db.select<
    Array<{ name: string; parent_name: string | null; direct_task_count: number }>
  >(
    `
      select
        projects.name,
        parent_projects.name as parent_name,
        count(tasks.id) as direct_task_count
      from projects
      left join projects as parent_projects on parent_projects.id = projects.parent_project_id
      left join tasks on tasks.project_id = projects.id
        and tasks.is_deleted = 0
        and tasks.parent_task_id is null
      where projects.is_deleted = 0
      group by projects.id
      order by projects.name
    `,
  );

  return withProjectTaskTotals(rows.map((row) => ({
    name: row.name,
    parentName: row.parent_name,
    directTaskCount: row.direct_task_count,
  })));
}

async function selectTagSummaries(): Promise<TagSummary[]> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ name: string; task_count: number }>>(
    `
      select tags.name, count(distinct tasks.id) as task_count
      from tags
      left join task_tags on task_tags.tag_id = tags.id
      left join tasks on tasks.id = task_tags.task_id
        and tasks.is_deleted = 0
        and tasks.parent_task_id is null
      where tags.is_deleted = 0
      group by tags.id
      order by tags.name
    `,
  );

  return rows.map((row) => ({
    name: row.name,
    taskCount: row.task_count,
  }));
}

async function renameSqliteProject(oldName: string, newName: string): Promise<void> {
  const oldProjectName = normalizeOptionalText(oldName);
  const newProjectName = normalizeOptionalText(newName);
  if (!oldProjectName || !newProjectName || oldProjectName === newProjectName) {
    return;
  }

  const db = await getDatabase();
  const oldProject = await db.select<Array<{ id: string }>>(
    "select id from projects where name = $1 and is_deleted = 0 limit 1",
    [oldProjectName],
  );
  if (oldProject.length === 0) {
    return;
  }

  const targetProject = await db.select<Array<{ id: string }>>(
    "select id from projects where name = $1 and is_deleted = 0 limit 1",
    [newProjectName],
  );
  if (targetProject.length === 0) {
    await db.execute("update projects set name = $1, updated_at = $2 where id = $3", [
      newProjectName,
      new Date().toISOString(),
      oldProject[0].id,
    ]);
    return;
  }
}

async function moveSqliteProject(name: string, parentName: string | null): Promise<void> {
  const projectName = normalizeOptionalText(name);
  const normalizedParentName = normalizeOptionalText(parentName);
  if (!projectName || projectName === normalizedParentName) {
    return;
  }

  const db = await getDatabase();
  const projectRows = await db.select<Array<{ id: string }>>(
    "select id from projects where name = $1 and is_deleted = 0 limit 1",
    [projectName],
  );
  const projectId = projectRows[0]?.id;
  if (!projectId) {
    return;
  }

  let parentId: string | null = null;
  if (normalizedParentName) {
    const parentRows = await db.select<Array<{ id: string }>>(
      "select id from projects where name = $1 and is_deleted = 0 limit 1",
      [normalizedParentName],
    );
    parentId = parentRows[0]?.id ?? null;
    if (!parentId) {
      return;
    }
  }
  if (parentId && (parentId === projectId || (await isSqliteProjectDescendant(parentId, projectId)))) {
    return;
  }

  await db.execute(
    "update projects set parent_project_id = $1, updated_at = $2 where id = $3",
    [parentId, new Date().toISOString(), projectId],
  );
}

async function deleteSqliteProject(name: string, mode: ProjectDeleteMode): Promise<void> {
  const projectName = normalizeOptionalText(name);
  if (!projectName) {
    return;
  }

  const db = await getDatabase();
  const rows = await db.select<Array<{ id: string; parent_project_id: string | null }>>(
    "select id, parent_project_id from projects where name = $1 and is_deleted = 0 limit 1",
    [projectName],
  );
  const projectId = rows[0]?.id;
  if (!projectId) {
    return;
  }

  const now = new Date().toISOString();
  await db.execute(
    "update projects set parent_project_id = $1, updated_at = $2 where parent_project_id = $3 and is_deleted = 0",
    [rows[0].parent_project_id, now, projectId],
  );
  await db.execute(
    "update recurring_task_templates set project_id = null, updated_at = $1 where project_id = $2 and is_deleted = 0",
    [now, projectId],
  );
  await db.execute(
    "update projects set is_deleted = 1, deleted_at = $1, updated_at = $1 where id = $2",
    [now, projectId],
  );
  await db.execute(
    `
      insert into trash_entries (id, entity_type, entity_id, deleted_at)
      values ($1, 'project', $2, $3)
    `,
    [crypto.randomUUID(), projectId, now],
  );

  if (mode === "unfile_tasks") {
    await db.execute(
      "update tasks set project_id = null, updated_at = $1 where project_id = $2 and is_deleted = 0",
      [now, projectId],
    );
    return;
  }

  const projectTasks = await db.select<Array<{ id: string }>>(
    "select id from tasks where project_id = $1 and is_deleted = 0",
    [projectId],
  );
  await db.execute(
    "update tasks set is_deleted = 1, deleted_at = $1, updated_at = $1 where project_id = $2 and is_deleted = 0",
    [now, projectId],
  );

  for (const task of projectTasks) {
    await db.execute(
      `
        insert into trash_entries (id, entity_type, entity_id, deleted_at)
        values ($1, 'task', $2, $3)
      `,
      [crypto.randomUUID(), task.id, now],
    );
  }
}

async function renameSqliteTag(oldName: string, newName: string): Promise<void> {
  const oldTagName = normalizeOptionalText(oldName);
  const newTagName = normalizeOptionalText(newName);
  if (!oldTagName || !newTagName || oldTagName === newTagName) {
    return;
  }

  const db = await getDatabase();
  const oldTag = await db.select<Array<{ id: string }>>(
    "select id from tags where name = $1 and is_deleted = 0 limit 1",
    [oldTagName],
  );
  if (oldTag.length === 0) {
    return;
  }

  const targetTagId = await getOrCreateTagId(newTagName);
  if (targetTagId === oldTag[0].id) {
    await db.execute("update tags set name = $1, updated_at = $2 where id = $3", [
      newTagName,
      new Date().toISOString(),
      oldTag[0].id,
    ]);
    return;
  }

  await db.execute(
    `
      insert or ignore into task_tags (task_id, tag_id)
      select task_id, $1
      from task_tags
      where tag_id = $2
    `,
    [targetTagId, oldTag[0].id],
  );
  await db.execute("delete from task_tags where tag_id = $1", [oldTag[0].id]);
  await db.execute(
    "update tags set is_deleted = 1, deleted_at = $1, updated_at = $1 where id = $2",
    [new Date().toISOString(), oldTag[0].id],
  );
}

async function deleteSqliteTag(name: string): Promise<void> {
  const tagName = normalizeOptionalText(name);
  if (!tagName) {
    return;
  }

  const db = await getDatabase();
  const rows = await db.select<Array<{ id: string }>>(
    "select id from tags where name = $1 and is_deleted = 0 limit 1",
    [tagName],
  );
  const tagId = rows[0]?.id;
  if (!tagId) {
    return;
  }

  const now = new Date().toISOString();
  await db.execute("delete from task_tags where tag_id = $1", [tagId]);
  await db.execute(
    "update tags set is_deleted = 1, deleted_at = $1, updated_at = $1 where id = $2",
    [now, tagId],
  );
  await db.execute(
    `
      insert into trash_entries (id, entity_type, entity_id, deleted_at)
      values ($1, 'tag', $2, $3)
    `,
    [crypto.randomUUID(), tagId, now],
  );
}

async function nextSqliteSortOrder(
  parentTaskId: string | null,
  status: TaskStatus,
): Promise<number> {
  const db = await getDatabase();

  if (parentTaskId) {
    const childRows = await db.select<Array<{ next_order: number | null }>>(
      `
        select coalesce(max(sort_order), -1) + 1 as next_order
        from tasks
        where is_deleted = 0 and parent_task_id = $1
      `,
      [parentTaskId],
    );

    return childRows[0]?.next_order ?? 0;
  }

  const rows = await db.select<Array<{ next_order: number | null }>>(
    `
      select coalesce(max(sort_order), -1) + 1 as next_order
      from tasks
      where is_deleted = 0
        and status = $1
        and parent_task_id is null
    `,
    [status],
  );

  return rows[0]?.next_order ?? 0;
}

async function inheritChildDraftFromParent(
  parentId: string,
  draft: TaskDraft,
): Promise<TaskDraft> {
  const db = await getDatabase();
  const rows = await db.select<
    Array<{
      project_name: string | null;
      is_important: number;
      is_urgent: number;
      tag_names: string | null;
    }>
  >(
    `
      select
        projects.name as project_name,
        tasks.is_important,
        tasks.is_urgent,
        group_concat(distinct tags.name) as tag_names
      from tasks
      left join projects on projects.id = tasks.project_id
      left join task_tags on task_tags.task_id = tasks.id
      left join tags on tags.id = task_tags.tag_id and tags.is_deleted = 0
      where tasks.id = $1
      group by tasks.id
    `,
    [parentId],
  );

  const parent = rows[0];
  if (!parent) {
    return draft;
  }

  return {
    ...draft,
    projectName: parent.project_name,
    tags: parent.tag_names ? parent.tag_names.split(",").filter(Boolean) : [],
    isImportant: Boolean(parent.is_important),
    isUrgent: Boolean(parent.is_urgent),
  };
}

async function syncChildrenInheritedFields(
  parentId: string,
  parentDraft: TaskDraft,
): Promise<void> {
  const db = await getDatabase();
  const projectId = await getOrCreateProjectId(parentDraft.projectName);
  const now = new Date().toISOString();
  const children = await db.select<Array<{ id: string }>>(
    "select id from tasks where parent_task_id = $1 and is_deleted = 0",
    [parentId],
  );

  for (const child of children) {
    await db.execute(
      `
        update tasks
        set project_id = $1, is_important = $2, is_urgent = $3, updated_at = $4
        where id = $5
      `,
      [
        projectId,
        boolToInt(parentDraft.isImportant),
        boolToInt(parentDraft.isUrgent),
        now,
        child.id,
      ],
    );
    await replaceTaskTags(child.id, parentDraft.tags);
    await syncChildrenInheritedFields(child.id, parentDraft);
  }
}

async function syncAfterTaskStatusChange(
  taskId: string,
  status: TaskStatus,
): Promise<void> {
  if (status === "done") {
    await markChildrenDone(taskId);
  }

  const parentId = await getParentTaskId(taskId);
  if (parentId) {
    await syncParentAfterChildStatus(parentId, status);
  }
}

async function syncParentAfterChildStatus(
  parentId: string,
  childStatus: TaskStatus,
): Promise<void> {
  const db = await getDatabase();

  if (childStatus !== "done") {
    await db.execute(
      `
        update tasks
        set status = 'doing', completion_date = null, updated_at = $1
        where id = $2 and status = 'done'
      `,
      [new Date().toISOString(), parentId],
    );
    const grandParentId = await getParentTaskId(parentId);
    if (grandParentId) {
      await syncParentAfterChildStatus(grandParentId, "doing");
    }
    return;
  }

  const [{ unfinished_count }] = await db.select<Array<{ unfinished_count: number }>>(
    `
      select count(*) as unfinished_count
      from tasks
      where parent_task_id = $1 and is_deleted = 0 and status <> 'done'
    `,
    [parentId],
  );

  if (unfinished_count === 0) {
    await db.execute(
      `
        update tasks
        set status = 'done', completion_date = $1, updated_at = $2
        where id = $3
      `,
      [todayIsoDate(), new Date().toISOString(), parentId],
    );
    const grandParentId = await getParentTaskId(parentId);
    if (grandParentId) {
      await syncParentAfterChildStatus(grandParentId, "done");
    }
  }
}

async function markChildrenDone(parentId: string): Promise<void> {
  const db = await getDatabase();
  const children = await db.select<Array<{ id: string }>>(
    "select id from tasks where parent_task_id = $1 and is_deleted = 0",
    [parentId],
  );

  await db.execute(
    `
      update tasks
      set status = 'done', completion_date = $1, updated_at = $2
      where parent_task_id = $3 and is_deleted = 0
    `,
    [todayIsoDate(), new Date().toISOString(), parentId],
  );

  for (const child of children) {
    await markChildrenDone(child.id);
  }
}

async function getParentTaskId(taskId: string): Promise<string | null> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ parent_task_id: string | null }>>(
    "select parent_task_id from tasks where id = $1",
    [taskId],
  );

  return rows[0]?.parent_task_id ?? null;
}

async function isSqliteDescendant(candidateId: string, ancestorId: string): Promise<boolean> {
  let currentParentId = await getParentTaskId(candidateId);

  while (currentParentId) {
    if (currentParentId === ancestorId) {
      return true;
    }
    currentParentId = await getParentTaskId(currentParentId);
  }

  return false;
}

async function inheritSqliteMovedTaskFields(
  taskId: string,
  parentId: string,
): Promise<void> {
  const inheritedDraft = await inheritChildDraftFromParent(parentId, {
    title: "",
    description: "",
    status: "todo",
    projectName: null,
    childCategory: null,
    tags: [],
    startDate: todayIsoDate(),
    dueDate: null,
    completionDate: null,
    isImportant: false,
    isUrgent: false,
  });
  const db = await getDatabase();
  const projectId = await getOrCreateProjectId(inheritedDraft.projectName);

  await db.execute(
    `
      update tasks
      set project_id = $1, is_important = $2, is_urgent = $3, updated_at = $4
      where id = $5
    `,
    [
      projectId,
      boolToInt(inheritedDraft.isImportant),
      boolToInt(inheritedDraft.isUrgent),
      new Date().toISOString(),
      taskId,
    ],
  );
  await replaceTaskTags(taskId, inheritedDraft.tags);
  await syncChildrenInheritedFields(taskId, inheritedDraft);
}

async function getOrCreateProjectId(
  projectName: string | null,
  parentProjectName: string | null = null,
): Promise<string | null> {
  const normalized = normalizeOptionalText(projectName);
  if (!normalized) {
    return null;
  }

  const db = await getDatabase();
  const rows = await db.select<Array<{ id: string }>>(
    "select id from projects where name = $1 and is_deleted = 0 limit 1",
    [normalized],
  );

  if (rows.length > 0) {
    return rows[0].id;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const normalizedParentName = normalizeOptionalText(parentProjectName);
  let parentProjectId: string | null = null;
  if (normalizedParentName && normalizedParentName !== normalized) {
    const parentRows = await db.select<Array<{ id: string }>>(
      "select id from projects where name = $1 and is_deleted = 0 limit 1",
      [normalizedParentName],
    );
    parentProjectId = parentRows[0]?.id ?? null;
  }
  await db.execute(
    `
      insert into projects (id, name, parent_project_id, created_at, updated_at)
      values ($1, $2, $3, $4, $5)
    `,
    [id, normalized, parentProjectId, now, now],
  );

  return id;
}

async function isSqliteProjectDescendant(
  candidateId: string,
  ancestorId: string,
): Promise<boolean> {
  const db = await getDatabase();
  let currentId: string | null = candidateId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    if (currentId === ancestorId) {
      return true;
    }
    visited.add(currentId);
    const parentRows: Array<{ parent_project_id: string | null }> = await db.select(
      "select parent_project_id from projects where id = $1 and is_deleted = 0 limit 1",
      [currentId],
    );
    currentId = parentRows[0]?.parent_project_id ?? null;
  }

  return false;
}

async function replaceTaskTags(taskId: string, tags: string[]): Promise<void> {
  const db = await getDatabase();
  await db.execute("delete from task_tags where task_id = $1", [taskId]);

  for (const tagName of normalizeTags(tags)) {
    const tagId = await getOrCreateTagId(tagName);
    await db.execute(
      "insert into task_tags (task_id, tag_id) values ($1, $2)",
      [taskId, tagId],
    );
  }
}

async function getOrCreateTagId(tagName: string): Promise<string> {
  const db = await getDatabase();
  const rows = await db.select<Array<{ id: string }>>(
    "select id from tags where name = $1 and is_deleted = 0 limit 1",
    [tagName],
  );

  if (rows.length > 0) {
    return rows[0].id;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    "insert into tags (id, name, created_at, updated_at) values ($1, $2, $3, $4)",
    [id, tagName, now, now],
  );

  return id;
}

function rowToTaskWithDeletedAt(row: TaskRow): Task & { deletedAt: string | null } {
  const task = {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    projectName: row.project_name,
    tags: row.tag_names ? row.tag_names.split(",").filter(Boolean) : [],
    startDate: row.start_date,
    startTime: row.start_time,
    dueTime: row.due_time,
    dueDate: row.due_date,
    completionDate: row.completion_date,
    parentTaskId: row.parent_task_id,
    parentTitle: row.parent_title,
    childCategory: row.child_category,
    childCount: row.child_count ?? 0,
    sortOrder: row.sort_order ?? 0,
    isImportant: Boolean(row.is_important),
    isUrgent: Boolean(row.is_urgent),
    workedToday: Boolean(row.worked_today),
    activityDates: row.activity_dates ? row.activity_dates.split(",").filter(Boolean) : [],
    recurringTemplateId: row.recurring_template_id,
    recurrenceOccurrenceDate: row.recurrence_occurrence_date,
    deletedAt: row.deleted_at,
  };

  return {
    ...task,
    isOverdue: isTaskOverdue(task),
  };
}

function rowToRecurringTemplate(row: RecurringTemplateRow): RecurringTaskTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    frequency: row.frequency,
    isImportant: Boolean(row.is_important),
    isUrgent: Boolean(row.is_urgent),
    projectName: row.project_name,
    tags: row.tag_names ? row.tag_names.split(",").filter(Boolean) : [],
    startOn: row.start_on,
    startTime: row.start_time,
    dueTime: row.due_time,
    missingDatePolicy: row.missing_date_policy ?? "skip_period",
    dueRule: parseDueRule(row.custom_due_rule, row.frequency),
    weekdays: parseWeekdays(row.weekdays),
    monthDays: parseMonthDays(row.month_days),
    yearDays: parseYearDays(row.year_days),
    generatedTaskCount: row.generated_task_count ?? 0,
  };
}

function parseWeekdays(value: string | null): number[] {
  return normalizeWeekdays(
    value
      ? value
          .split(",")
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item))
      : [],
  );
}

function parseMonthDays(value: string | null): RecurringMonthDay[] {
  if (!value) {
    return [];
  }

  return normalizeMonthDays(
    value.split(",").map((item) =>
      item === "last"
        ? { dayOfMonth: null, isLastDay: true }
        : { dayOfMonth: Number(item), isLastDay: false },
    ),
  );
}

function parseYearDays(value: string | null): RecurringYearDay[] {
  if (!value) {
    return [];
  }

  return normalizeYearDays(
    value.split(",").map((item) => {
      const [monthValue, dayValue] = item.split(":");
      return {
        month: Number(monthValue),
        dayOfMonth: dayValue === "last" ? null : Number(dayValue),
        isLastDay: dayValue === "last",
      };
    }),
  );
}

function parseDueRule(
  value: string | null,
  frequency: RecurringFrequency,
): RecurringDueRule {
  if (!value) {
    return defaultDueRuleForFrequency(frequency);
  }

  try {
    const parsed = JSON.parse(value) as Partial<RecurringDueRule>;
    if (parsed.type === "same_day" || parsed.type === "next_occurrence_minus_one") {
      return { type: parsed.type };
    }
    if (parsed.type === "weekday" && typeof parsed.weekday === "number") {
      return { type: "weekday", weekday: parsed.weekday };
    }
    if (parsed.type === "month_day") {
      return {
        type: "month_day",
        dayOfMonth: parsed.dayOfMonth ?? null,
        isLastDay: Boolean(parsed.isLastDay),
      };
    }
    if (parsed.type === "year_day" && typeof parsed.month === "number") {
      return {
        type: "year_day",
        month: parsed.month,
        dayOfMonth: parsed.dayOfMonth ?? null,
        isLastDay: Boolean(parsed.isLastDay),
      };
    }
  } catch {
    // Fall through to a safe default.
  }

  return defaultDueRuleForFrequency(frequency);
}

function serializeDueRule(rule: RecurringDueRule): string {
  return JSON.stringify(rule);
}

function defaultDueRuleForFrequency(frequency: RecurringFrequency): RecurringDueRule {
  return frequency === "daily"
    ? { type: "same_day" }
    : { type: "next_occurrence_minus_one" };
}

function normalizeWeekdays(weekdays: number[]): number[] {
  return [...new Set(weekdays.filter((weekday) => weekday >= 1 && weekday <= 7))].sort(
    (a, b) => a - b,
  );
}

function normalizeMonthDays(days: RecurringMonthDay[]): RecurringMonthDay[] {
  const keyed = new Map<string, RecurringMonthDay>();
  for (const day of days) {
    if (day.isLastDay) {
      keyed.set("last", { dayOfMonth: null, isLastDay: true });
      continue;
    }

    if (day.dayOfMonth && day.dayOfMonth >= 1 && day.dayOfMonth <= 31) {
      keyed.set(String(day.dayOfMonth), { dayOfMonth: day.dayOfMonth, isLastDay: false });
    }
  }

  return [...keyed.values()].sort((a, b) => {
    if (a.isLastDay) return 1;
    if (b.isLastDay) return -1;
    return (a.dayOfMonth ?? 0) - (b.dayOfMonth ?? 0);
  });
}

function normalizeYearDays(days: RecurringYearDay[]): RecurringYearDay[] {
  const keyed = new Map<string, RecurringYearDay>();
  for (const day of days) {
    if (day.month < 1 || day.month > 12) {
      continue;
    }

    if (day.isLastDay) {
      keyed.set(`${day.month}:last`, {
        month: day.month,
        dayOfMonth: null,
        isLastDay: true,
      });
      continue;
    }

    if (day.dayOfMonth && day.dayOfMonth >= 1 && day.dayOfMonth <= 31) {
      keyed.set(`${day.month}:${day.dayOfMonth}`, {
        month: day.month,
        dayOfMonth: day.dayOfMonth,
        isLastDay: false,
      });
    }
  }

  return [...keyed.values()].sort(
    (a, b) =>
      a.month - b.month ||
      Number(a.isLastDay) - Number(b.isLastDay) ||
      (a.dayOfMonth ?? 32) - (b.dayOfMonth ?? 32),
  );
}

function occurrenceDatesForTemplate(
  template: RecurringTaskTemplate,
  fromIsoDate: string,
  toIsoDate: string,
): string[] {
  const dates: string[] = [];
  let current = fromIsoDate;

  while (current <= toIsoDate) {
    if (dateMatchesTemplate(template, current)) {
      dates.push(current);
    }
    current = addDaysIsoDate(current, 1);
  }

  return dates;
}

function weeklyCycleStartDate(today: string, startWeekday: number): string {
  const todayWeekday = isoWeekday(parseIsoDate(today));
  const daysSinceStart = (todayWeekday - startWeekday + 7) % 7;
  return addDaysIsoDate(today, -daysSinceStart);
}

function weeklyCycleDueDate(
  occurrenceDate: string,
  startWeekday: number,
  dueWeekday: number,
): string {
  const daysUntilDue = (dueWeekday - startWeekday + 7) % 7;
  return addDaysIsoDate(occurrenceDate, daysUntilDue);
}

function monthlyCycleStartDate(
  today: string,
  startRule: RecurringMonthDay,
  missingDatePolicy: MissingDatePolicy,
): string {
  const date = parseIsoDate(today);
  for (let monthOffset = 0; monthOffset >= -2; monthOffset -= 1) {
    const probe = new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
    const occurrence = dateFromMonthDay(
      probe.getFullYear(),
      probe.getMonth() + 1,
      startRule,
      missingDatePolicy,
    );
    if (occurrence && occurrence <= today) {
      return occurrence;
    }
  }

  return today;
}

function nextMonthlyCycleStartDate(
  currentOccurrence: string,
  startRule: RecurringMonthDay,
  missingDatePolicy: MissingDatePolicy,
): string | null {
  const date = parseIsoDate(currentOccurrence);
  for (let monthOffset = 1; monthOffset <= 2; monthOffset += 1) {
    const probe = new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
    const occurrence = dateFromMonthDay(
      probe.getFullYear(),
      probe.getMonth() + 1,
      startRule,
      missingDatePolicy,
    );
    if (occurrence && occurrence > currentOccurrence) {
      return occurrence;
    }
  }

  return null;
}

function monthlyCycleDueDate(
  occurrenceDate: string,
  startRule: RecurringMonthDay,
  dueRule: RecurringMonthDay,
  missingDatePolicy: MissingDatePolicy,
): string {
  const occurrence = parseIsoDate(occurrenceDate);
  const startDay = startRule.isLastDay ? 32 : startRule.dayOfMonth ?? occurrence.getDate();
  const dueDay = dueRule.isLastDay ? 32 : dueRule.dayOfMonth ?? startDay;
  const monthOffset = dueDay < startDay ? 1 : 0;
  const probe = new Date(occurrence.getFullYear(), occurrence.getMonth() + monthOffset, 1);
  return (
    dateFromMonthDay(
      probe.getFullYear(),
      probe.getMonth() + 1,
      dueRule,
      missingDatePolicy,
    ) ?? occurrenceDate
  );
}

function currentAndNextOccurrenceDates(
  template: RecurringTaskTemplate,
  today: string,
): string[] {
  if (template.frequency === "daily") {
    return [today, addDaysIsoDate(today, 1)];
  }

  if (template.frequency === "weekly") {
    let current = weeklyCycleStartDate(today, template.weekdays[0] ?? isoWeekday(parseIsoDate(today)));
    if (dueDateForOccurrence(template, current) < today) {
      current = addDaysIsoDate(current, 7);
    }
    return [current, addDaysIsoDate(current, 7)];
  }

  if (template.frequency === "monthly") {
    const startRule = template.monthDays[0] ?? {
      dayOfMonth: parseIsoDate(today).getDate(),
      isLastDay: false,
    };
    let current = monthlyCycleStartDate(today, startRule, template.missingDatePolicy);
    if (dueDateForOccurrence(template, current) < today) {
      current =
        nextMonthlyCycleStartDate(current, startRule, template.missingDatePolicy) ??
        current;
    }
    const next = nextMonthlyCycleStartDate(current, startRule, template.missingDatePolicy);
    return next ? [current, next] : [current];
  }

  const dates: string[] = [];
  const searchStart = template.startOn > addDaysIsoDate(today, -400)
    ? template.startOn
    : addDaysIsoDate(today, -400);
  const searchEnd = addDaysIsoDate(today, 400);
  const allDates = occurrenceDatesForTemplate(template, searchStart, searchEnd);
  const current = [...allDates].reverse().find((date) => date <= today) ?? allDates[0];
  const next = allDates.find((date) => current && date > current);

  if (current) {
    dates.push(current);
  }
  if (next) {
    dates.push(next);
  }

  return [...new Set(dates)];
}

function nextOccurrenceDate(template: RecurringTaskTemplate, afterIsoDate: string): string | null {
  let current = addDaysIsoDate(afterIsoDate, 1);
  const limit = addDaysIsoDate(afterIsoDate, 400);

  while (current <= limit) {
    if (dateMatchesTemplate(template, current)) {
      return current;
    }
    current = addDaysIsoDate(current, 1);
  }

  return null;
}

function dueDateForOccurrence(template: RecurringTaskTemplate, occurrenceDate: string): string {
  if (template.frequency === "daily") {
    return occurrenceDate;
  }

  if (template.frequency === "weekly") {
    const startWeekday = template.weekdays[0] ?? isoWeekday(parseIsoDate(occurrenceDate));
    const dueWeekday =
      template.dueRule.type === "weekday" ? template.dueRule.weekday : startWeekday;
    return weeklyCycleDueDate(occurrenceDate, startWeekday, dueWeekday);
  }

  if (template.frequency === "monthly" && template.dueRule.type === "month_day") {
    const startRule = template.monthDays[0] ?? {
      dayOfMonth: parseIsoDate(occurrenceDate).getDate(),
      isLastDay: false,
    };
    return monthlyCycleDueDate(
      occurrenceDate,
      startRule,
      template.dueRule,
      template.missingDatePolicy,
    );
  }

  const nextOccurrence = nextOccurrenceDate(template, occurrenceDate);
  const nextPeriodEnd = nextOccurrence ? addDaysIsoDate(nextOccurrence, -1) : occurrenceDate;

  if (template.dueRule.type === "same_day") {
    return occurrenceDate;
  }

  if (template.dueRule.type === "next_occurrence_minus_one") {
    return nextPeriodEnd;
  }

  const candidate = dueRuleCandidateDate(template, occurrenceDate);
  return candidate ?? nextPeriodEnd;
}

function dueRuleCandidateDate(
  template: RecurringTaskTemplate,
  occurrenceDate: string,
): string | null {
  const occurrence = parseIsoDate(occurrenceDate);

  if (template.dueRule.type === "weekday") {
    let current = occurrenceDate;
    for (let offset = 0; offset < 14; offset += 1) {
      if (isoWeekday(parseIsoDate(current)) === template.dueRule.weekday) {
        return current;
      }
      current = addDaysIsoDate(current, 1);
    }
    return null;
  }

  if (template.dueRule.type === "month_day") {
    return firstMatchingMonthDayOnOrAfter(
      occurrenceDate,
      template.dueRule,
      template.missingDatePolicy,
    );
  }

  if (template.dueRule.type === "year_day") {
    for (let yearOffset = 0; yearOffset <= 1; yearOffset += 1) {
      const date = dateFromMonthDay(
        occurrence.getFullYear() + yearOffset,
        template.dueRule.month,
        template.dueRule,
        template.missingDatePolicy,
      );
      if (date && date >= occurrenceDate) {
        return date;
      }
    }
  }

  return null;
}

function firstMatchingMonthDayOnOrAfter(
  occurrenceDate: string,
  rule: RecurringMonthDay,
  missingDatePolicy: MissingDatePolicy,
): string | null {
  const occurrence = parseIsoDate(occurrenceDate);
  for (let monthOffset = 0; monthOffset <= 1; monthOffset += 1) {
    const probe = new Date(occurrence.getFullYear(), occurrence.getMonth() + monthOffset, 1);
    const date = dateFromMonthDay(
      probe.getFullYear(),
      probe.getMonth() + 1,
      rule,
      missingDatePolicy,
    );
    if (date && date >= occurrenceDate) {
      return date;
    }
  }
  return null;
}

function dateFromMonthDay(
  year: number,
  month: number,
  rule: RecurringMonthDay,
  missingDatePolicy: MissingDatePolicy,
): string | null {
  const lastDay = daysInMonth(year, month);
  const day = rule.isLastDay
    ? lastDay
    : rule.dayOfMonth && rule.dayOfMonth <= lastDay
      ? rule.dayOfMonth
      : missingDatePolicy === "use_last_day"
        ? lastDay
        : null;

  if (!day) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateMatchesTemplate(template: RecurringTaskTemplate, isoDate: string): boolean {
  if (template.frequency !== "daily" && template.frequency !== "weekly" && isoDate < template.startOn) {
    return false;
  }

  const date = parseIsoDate(isoDate);
  if (template.frequency === "daily") {
    return true;
  }

  if (template.frequency === "weekly") {
    const selectedWeekday = template.weekdays[0] ?? isoWeekday(date);
    return selectedWeekday === isoWeekday(date);
  }

  if (template.frequency === "monthly") {
    const selectedDays =
      template.monthDays.length > 0
        ? template.monthDays
        : [{ dayOfMonth: date.getDate(), isLastDay: false }];
    return selectedDays.some((day) =>
      dateMatchesMonthDay(date, day, template.missingDatePolicy),
    );
  }

  const selectedYearDays =
    template.yearDays.length > 0
      ? template.yearDays
      : [{ month: date.getMonth() + 1, dayOfMonth: date.getDate(), isLastDay: false }];
  return selectedYearDays.some(
    (day) =>
      day.month === date.getMonth() + 1 &&
      dateMatchesMonthDay(date, day, template.missingDatePolicy),
  );
}

function dateMatchesMonthDay(
  date: Date,
  day: RecurringMonthDay,
  missingDatePolicy: MissingDatePolicy,
): boolean {
  const dateDay = date.getDate();
  const lastDay = daysInMonth(date.getFullYear(), date.getMonth() + 1);

  if (day.isLastDay) {
    return dateDay === lastDay;
  }

  if (!day.dayOfMonth) {
    return false;
  }

  if (day.dayOfMonth <= lastDay) {
    return dateDay === day.dayOfMonth;
  }

  return missingDatePolicy === "use_last_day" && dateDay === lastDay;
}

function isoWeekday(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDaysIsoDate(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function draftToStoredTask(
  id: string,
  draft: TaskDraft,
  parentTaskId: string | null,
  sortOrder: number,
  recurringTemplateId: string | null = null,
  recurrenceOccurrenceDate: string | null = null,
): StoredTask {
  const task = {
    id,
    title: draft.title,
    description: draft.description,
    status: draft.status,
    projectName: normalizeOptionalText(draft.projectName),
    childCategory: normalizeOptionalText(draft.childCategory),
    tags: normalizeTags(draft.tags),
    startDate: draft.startDate,
    startTime: draft.startTime ?? null,
    dueTime: draft.dueTime ?? null,
    dueDate: draft.dueDate,
    completionDate: completionDateForStatus(draft.status, draft.completionDate),
    parentTaskId,
    parentTitle: null,
    childCount: 0,
    sortOrder,
    isImportant: draft.isImportant,
    isUrgent: draft.isUrgent,
    workedToday: false,
    activityDates: [],
    deletedAt: null,
    recurringTemplateId,
    recurrenceOccurrenceDate,
  };

  return {
    ...task,
    isOverdue: isTaskOverdue(task),
  };
}

function toPublicTasks(tasks: StoredTask[]): Task[] {
  return tasks.map((task) => stripStoredTask(task, tasks));
}

function stripStoredTask(task: StoredTask, tasks: StoredTask[]): Task {
  const publicTask = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    projectName: task.projectName,
    childCategory: task.childCategory,
    tags: task.tags,
    startDate: task.startDate,
    startTime: task.startTime ?? null,
    dueTime: task.dueTime ?? null,
    dueDate: task.dueDate,
    completionDate: task.completionDate,
    parentTaskId: task.parentTaskId,
    parentTitle: tasks.find((candidate) => candidate.id === task.parentTaskId)?.title ?? null,
    childCount: tasks.filter((candidate) => candidate.parentTaskId === task.id).length,
    sortOrder: task.sortOrder,
    isImportant: task.isImportant,
    isUrgent: task.isUrgent,
    workedToday: task.activityDates.includes(todayIsoDate()),
    activityDates: task.activityDates,
    recurringTemplateId: task.recurringTemplateId ?? null,
    recurrenceOccurrenceDate: task.recurrenceOccurrenceDate ?? null,
  };

  return {
    ...publicTask,
    isOverdue: isTaskOverdue(publicTask),
  };
}

function inheritBrowserChildDraftFromParent(
  tasks: StoredTask[],
  parentId: string,
  draft: TaskDraft,
): TaskDraft {
  const parent = tasks.find((task) => task.id === parentId);

  if (!parent) {
    return draft;
  }

  return {
    ...draft,
    projectName: parent.projectName,
    tags: parent.tags,
    isImportant: parent.isImportant,
    isUrgent: parent.isUrgent,
  };
}

function taskToDraft(task: StoredTask | undefined): TaskDraft {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "todo",
    projectName: task?.projectName ?? null,
    childCategory: task?.childCategory ?? null,
    tags: task?.tags ?? [],
    startDate: task?.startDate ?? todayIsoDate(),
    startTime: task?.startTime ?? null,
    dueTime: task?.dueTime ?? null,
    dueDate: task?.dueDate ?? null,
    completionDate: task?.completionDate ?? null,
    isImportant: Boolean(task?.isImportant),
    isUrgent: Boolean(task?.isUrgent),
  };
}

function isBrowserDescendant(
  tasks: StoredTask[],
  candidateId: string,
  ancestorId: string,
): boolean {
  let currentParentId = tasks.find((task) => task.id === candidateId)?.parentTaskId ?? null;

  while (currentParentId) {
    if (currentParentId === ancestorId) {
      return true;
    }
    currentParentId = tasks.find((task) => task.id === currentParentId)?.parentTaskId ?? null;
  }

  return false;
}

function syncBrowserChildrenInheritedFields(
  tasks: StoredTask[],
  parentId: string,
  parentDraft: TaskDraft,
): StoredTask[] {
  const nextTasks = tasks.map((task) =>
    task.parentTaskId === parentId
      ? {
          ...task,
          projectName: normalizeOptionalText(parentDraft.projectName),
          tags: normalizeTags(parentDraft.tags),
          isImportant: parentDraft.isImportant,
          isUrgent: parentDraft.isUrgent,
        }
      : task,
  );

  return nextTasks
    .filter((task) => task.parentTaskId === parentId)
    .reduce(
      (currentTasks, child) =>
        syncBrowserChildrenInheritedFields(currentTasks, child.id, parentDraft),
      nextTasks,
    );
}

function nextBrowserSortOrder(
  tasks: StoredTask[],
  parentTaskId: string | null,
  status: TaskStatus,
): number {
  const siblings = tasks.filter(
    (task) =>
      !task.deletedAt &&
      task.parentTaskId === parentTaskId &&
      (parentTaskId !== null || task.status === status),
  );

  return siblings.length === 0
    ? 0
    : Math.max(...siblings.map((task) => task.sortOrder)) + 1;
}

function syncBrowserAfterTaskStatusChange(
  tasks: StoredTask[],
  taskId: string,
  status: TaskStatus,
): StoredTask[] {
  let nextTasks = tasks;

  if (status === "done") {
    nextTasks = markBrowserDescendantsDone(nextTasks, taskId);
  }

  const parentId = nextTasks.find((task) => task.id === taskId)?.parentTaskId;
  return parentId ? syncBrowserParentAfterChildStatus(nextTasks, parentId, status) : nextTasks;
}

function syncBrowserParentAfterChildStatus(
  tasks: StoredTask[],
  parentId: string,
  childStatus: TaskStatus,
): StoredTask[] {
  if (childStatus !== "done") {
    const nextTasks = tasks.map((task) =>
      task.id === parentId && task.status === "done"
        ? { ...task, status: "doing" as const, completionDate: null }
        : task,
    );
    const grandParentId = nextTasks.find((task) => task.id === parentId)?.parentTaskId;
    return grandParentId
      ? syncBrowserParentAfterChildStatus(nextTasks, grandParentId, "doing")
      : nextTasks;
  }

  const children = tasks.filter(
    (task) => task.parentTaskId === parentId && !task.deletedAt,
  );
  const allDone = children.length > 0 && children.every((task) => task.status === "done");

  if (!allDone) {
    return tasks;
  }

  const nextTasks = tasks.map((task) =>
    task.id === parentId
      ? { ...task, status: "done" as const, completionDate: todayIsoDate() }
      : task,
  );
  const grandParentId = nextTasks.find((task) => task.id === parentId)?.parentTaskId;
  return grandParentId
    ? syncBrowserParentAfterChildStatus(nextTasks, grandParentId, "done")
    : nextTasks;
}

function markBrowserDescendantsDone(
  tasks: StoredTask[],
  parentId: string,
): StoredTask[] {
  const childIds = tasks
    .filter((task) => task.parentTaskId === parentId && !task.deletedAt)
    .map((task) => task.id);

  let nextTasks = tasks.map((task) =>
    childIds.includes(task.id)
      ? { ...task, status: "done" as const, completionDate: todayIsoDate() }
      : task,
  );

  for (const childId of childIds) {
    nextTasks = markBrowserDescendantsDone(nextTasks, childId);
  }

  return nextTasks;
}

function readStoredTasks(): StoredTask[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedTasks();
    writeStoredTasks(seeded);
    return seeded;
  }

  try {
    return (JSON.parse(raw) as Array<Partial<StoredTask>>).map((task, index) => ({
      id: task.id ?? crypto.randomUUID(),
      title: task.title ?? "Untitled",
      description: task.description ?? "",
      status: task.status ?? "todo",
      projectName: task.projectName ?? null,
      childCategory: task.childCategory ?? null,
      tags: task.tags ?? [],
      startDate: task.startDate ?? todayIsoDate(),
      startTime: task.startTime ?? null,
      dueTime: task.dueTime ?? null,
      dueDate: task.dueDate ?? null,
      completionDate: task.completionDate ?? null,
      parentTaskId: task.parentTaskId ?? null,
      parentTitle: null,
      childCount: 0,
      sortOrder: typeof task.sortOrder === "number" ? task.sortOrder : index,
      isImportant: Boolean(task.isImportant),
      isUrgent: Boolean(task.isUrgent),
      isOverdue: Boolean(task.isOverdue),
      workedToday: Boolean(task.workedToday),
      activityDates: task.activityDates ?? [],
      deletedAt: task.deletedAt ?? null,
      recurringTemplateId: task.recurringTemplateId ?? null,
      recurrenceOccurrenceDate: task.recurrenceOccurrenceDate ?? null,
    }));
  } catch {
    return [];
  }
}

function writeStoredTasks(tasks: StoredTask[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function readStoredProjects(): StoredProject[] {
  const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<string | Partial<StoredProject>>;
    const projects = parsed
      .map((project) =>
        typeof project === "string"
          ? { name: project.trim(), parentName: null }
          : {
              name: project.name?.trim() ?? "",
              parentName: normalizeOptionalText(project.parentName ?? null),
            },
      )
      .filter((project) => project.name);
    const names = new Set(projects.map((project) => project.name));
    return projects
      .filter(
        (project, index) =>
          projects.findIndex((candidate) => candidate.name === project.name) === index,
      )
      .map((project) => ({
        ...project,
        parentName:
          project.parentName !== project.name && names.has(project.parentName ?? "")
            ? project.parentName
            : null,
      }));
  } catch {
    return [];
  }
}

function writeStoredProjects(projects: StoredProject[]): void {
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
}

function readStoredNames(storageKey: string): string[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return [];
  }

  try {
    return normalizeTags(JSON.parse(raw) as string[]);
  } catch {
    return [];
  }
}

function writeStoredNames(storageKey: string, names: string[]): void {
  localStorage.setItem(storageKey, JSON.stringify(normalizeTags(names)));
}

function readStoredRecurringTemplates(): RecurringTaskTemplate[] {
  const raw = localStorage.getItem(RECURRING_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return (JSON.parse(raw) as Array<Partial<RecurringTaskTemplate>>).map((template) => ({
      id: template.id ?? crypto.randomUUID(),
      title: template.title ?? "Untitled",
      description: template.description ?? "",
      frequency: template.frequency ?? "daily",
      isImportant: Boolean(template.isImportant),
      isUrgent: Boolean(template.isUrgent),
      projectName: normalizeOptionalText(template.projectName ?? null),
      tags: normalizeTags(template.tags ?? []),
      startOn: template.startOn ?? todayIsoDate(),
      startTime: template.startTime ?? null,
      dueTime: template.dueTime ?? null,
      missingDatePolicy: template.missingDatePolicy ?? "skip_period",
      dueRule: template.dueRule ?? defaultDueRuleForFrequency(template.frequency ?? "daily"),
      weekdays: normalizeWeekdays(template.weekdays ?? []),
      monthDays: normalizeMonthDays(template.monthDays ?? []),
      yearDays: normalizeYearDays(template.yearDays ?? []),
      generatedTaskCount: 0,
    }));
  } catch {
    return [];
  }
}

function writeStoredRecurringTemplates(templates: RecurringTaskTemplate[]): void {
  localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(templates));
}

function generateBrowserRecurringTasks(
  tasks: StoredTask[],
  templates: RecurringTaskTemplate[],
  cleanupAllUnfinishedTemplateIds = new Set<string>(),
): StoredTask[] {
  let nextTasks = tasks;
  const today = todayIsoDate();

  for (const template of templates) {
    const occurrenceDates = currentAndNextOccurrenceDates(template, today);
    const cleanupAllUnfinished = cleanupAllUnfinishedTemplateIds.has(template.id);
    nextTasks = nextTasks.filter(
      (task) =>
        task.recurringTemplateId !== template.id ||
        task.status === "done" ||
        (!cleanupAllUnfinished && task.startDate <= today) ||
        occurrenceDates.includes(task.recurrenceOccurrenceDate ?? ""),
    );

    for (const occurrenceDate of occurrenceDates) {
      const draft: TaskDraft = {
        title: template.title,
        description: template.description,
        startTime: template.startTime ?? null,
        dueTime: template.dueTime ?? null,
        status: "todo",
        projectName: template.projectName,
        childCategory: null,
        tags: template.tags,
        startDate: occurrenceDate,
        dueDate: dueDateForOccurrence(template, occurrenceDate),
        completionDate: null,
        isImportant: template.isImportant,
        isUrgent: template.isUrgent,
      };
      const existingTask = nextTasks.find(
        (task) =>
          task.recurringTemplateId === template.id &&
          task.recurrenceOccurrenceDate === occurrenceDate,
      );
      if (existingTask) {
        nextTasks = nextTasks.map((task) =>
          task.id === existingTask.id && task.status !== "done"
            ? {
                ...task,
                title: draft.title,
                description: draft.description,
                projectName: draft.projectName,
                tags: draft.tags,
                startDate: draft.startDate,
                startTime: cleanupAllUnfinished ? draft.startTime ?? null : task.startTime,
                dueTime: cleanupAllUnfinished ? draft.dueTime ?? null : task.dueTime,
                dueDate: draft.dueDate,
                isImportant: draft.isImportant,
                isUrgent: draft.isUrgent,
              }
            : task,
        );
        continue;
      }

      nextTasks = [
        ...nextTasks,
        draftToStoredTask(
          crypto.randomUUID(),
          draft,
          null,
          nextBrowserSortOrder(nextTasks, null, "todo"),
          template.id,
          occurrenceDate,
        ),
      ];
    }
  }

  return nextTasks;
}

function withBrowserGeneratedCounts(
  templates: RecurringTaskTemplate[],
  tasks: StoredTask[],
): RecurringTaskTemplate[] {
  return templates.map((template) => ({
    ...template,
    generatedTaskCount: tasks.filter(
      (task) => !task.deletedAt && task.recurringTemplateId === template.id,
    ).length,
  }));
}

function browserProjectSummaries(): ProjectSummary[] {
  const activeTasks = readStoredTasks().filter(
    (task) => !task.deletedAt && task.parentTaskId === null,
  );
  const projects = readStoredProjects();
  const names = new Set(projects.map((project) => project.name));
  for (const projectName of [
    ...activeTasks.map((task) => task.projectName),
    ...readStoredRecurringTemplates().map((template) => template.projectName),
  ]) {
    if (projectName && !names.has(projectName)) {
      projects.push({ name: projectName, parentName: null });
      names.add(projectName);
    }
  }
  writeStoredProjects(projects);

  return withProjectTaskTotals(
    projects.map((project) => ({
      ...project,
      directTaskCount: activeTasks.filter((task) => task.projectName === project.name).length,
    })),
  );
}

function withProjectTaskTotals(
  projects: Array<Omit<ProjectSummary, "taskCount">>,
): ProjectSummary[] {
  const childrenByParent = new Map<string, string[]>();
  for (const project of projects) {
    if (project.parentName) {
      childrenByParent.set(project.parentName, [
        ...(childrenByParent.get(project.parentName) ?? []),
        project.name,
      ]);
    }
  }
  const byName = new Map(projects.map((project) => [project.name, project]));

  function totalFor(name: string, visiting = new Set<string>()): number {
    const project = byName.get(name);
    if (!project || visiting.has(name)) {
      return 0;
    }
    const nextVisiting = new Set(visiting).add(name);
    return (
      project.directTaskCount +
      (childrenByParent.get(name) ?? []).reduce(
        (total, childName) => total + totalFor(childName, nextVisiting),
        0,
      )
    );
  }

  return projects.map((project) => ({
    ...project,
    taskCount: totalFor(project.name),
  }));
}

function isBrowserProjectDescendant(
  projects: StoredProject[],
  candidateName: string,
  ancestorName: string,
): boolean {
  const byName = new Map(projects.map((project) => [project.name, project]));
  const visited = new Set<string>();
  let currentName: string | null = candidateName;

  while (currentName && !visited.has(currentName)) {
    if (currentName === ancestorName) {
      return true;
    }
    visited.add(currentName);
    currentName = byName.get(currentName)?.parentName ?? null;
  }

  return false;
}

function browserTagSummaries(): TagSummary[] {
  const activeTasks = readStoredTasks().filter(
    (task) => !task.deletedAt && task.parentTaskId === null,
  );
  const names = new Set([...readStoredNames(TAG_STORAGE_KEY), ...activeTasks.flatMap((task) => task.tags)]);

  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      taskCount: activeTasks.filter((task) => task.tags.includes(name)).length,
    }));
}

function seedTasks(): StoredTask[] {
  return [
    draftToStoredTask(
      "seed-1",
      {
        title: "Draft first local task model",
        description: "",
        status: "todo",
        projectName: "TaskWeave",
        childCategory: null,
        tags: ["design", "model"],
        startDate: todayIsoDate(),
        dueDate: null,
        completionDate: null,
        isImportant: true,
        isUrgent: true,
      },
      null,
      0,
    ),
    {
      ...draftToStoredTask(
        "seed-2",
        {
          title: "Check recurring template rules",
          description: "",
          status: "doing",
          projectName: "TaskWeave",
          childCategory: null,
          tags: ["recurring"],
          startDate: todayIsoDate(),
          dueDate: null,
          completionDate: null,
          isImportant: true,
          isUrgent: false,
        },
        null,
        1,
      ),
      activityDates: [todayIsoDate()],
      workedToday: true,
    },
  ];
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function normalizeOptionalText(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

async function saveClockFields(
  table: "tasks" | "recurring_task_templates",
  id: string,
  source: { startTime?: string | null; dueTime?: string | null },
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `update ${table} set start_time=$1,due_time=$2 where id=$3`,
    [source.startTime ?? null, source.dueTime ?? null, id],
  );
}
