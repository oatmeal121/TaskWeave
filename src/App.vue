<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import {
  Archive,
  BookOpen,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Download,
  Filter,
  FolderKanban,
  GanttChart,
  Heart,
  GripVertical,
  Inbox,
  ListPlus,
  Minus,
  Pin,
  PinOff,
  Pencil,
  Plus,
  RotateCcw,
  RefreshCw,
  Save,
  Search,
  Settings,
  Square,
  Tags,
  Trash2,
  X,
} from "@lucide/vue";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { vPageMotion } from "./motion";
import ExpandTransition from "./components/ExpandTransition.vue";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
import GanttPage from "./components/GanttPage.vue";
import DateInput from "./components/DateInput.vue";
import RemindersPage from "./components/RemindersPage.vue";
import { startReminderService } from "./reminders";
import ReminderAlertView from "./components/ReminderAlertView.vue";
import ReminderTaskPreview from "./components/ReminderTaskPreview.vue";
import { ALERT_CHANGE, listReminderAlerts, dismissReminderAlerts, snoozeReminderAlert } from "./data/reminderAlerts";
import type { ReminderAlert } from "./domain/reminderAlert";
import { localMinute } from "./domain/reminder";
import { insertDescriptionTab } from "./descriptionEditing";
import HelpPage from "./components/HelpPage.vue";
import SupportDialog from "./components/SupportDialog.vue";
import RecurringCyclePicker from "./components/RecurringCyclePicker.vue";
import { createTaskRepository } from "./data/taskRepository";
import type { ProjectDeleteMode } from "./data/taskRepository";
import { parseTaskWeaveBackup } from "./data/taskBackup";
import {
  appUpdatesConfigured,
  checkForAppUpdate,
  installAppUpdate,
  type AppUpdate,
} from "./appUpdates";
import {
  readAutostartEnabled,
  setAutostartEnabled,
  syncTrayPreferences,
} from "./desktopPreferences";
import {
  chooseMonthlyCycleDay,
  chooseWeeklyCycleDay,
  createRecurringTemplateFormState,
  fillRecurringFormFromTemplate,
  monthlyCycleDue,
  monthlyCycleStart,
  monthlyPlacementStep,
  recurringTemplateFormToDraft,
  resetRecurringTemplateFormState,
  validateRecurringTemplateForm,
  weeklyCycleDue,
  weeklyCycleStart,
  weeklyPlacementStep,
} from "./domain/recurringTemplateForm";
import type { RecurringTemplateFormValidationError } from "./domain/recurringTemplateForm";
import {
  formatMonthlyCycleText,
  formatMonthlyLastDayNotice,
  formatRecurringTemplateSummary,
  formatWeeklyCycleText,
} from "./domain/recurringTemplateText";
import type { GanttChartRow } from "./gantt/dhtmlxGanttAdapter";
import type {
  DeletedTask,
  ProjectSummary,
  RecurringFrequency,
  RecurringTaskTemplate,
  TagSummary,
  Task,
  TaskDraft,
  TaskStatus,
} from "./domain/task";
import { TASK_STATUSES, todayIsoDate, isTaskOverdue } from "./domain/task";

type ProjectTaskGroup = {
  projectKey: string;
  projectName: string;
  tasks: Task[];
};
type ProjectTreeEntry = ProjectSummary & {
  depth: number;
  path: string[];
};
type ChildCategoryGroup = {
  categoryKey: string;
  categoryName: string;
  entries: Array<{ task: Task; depth: number }>;
};
type GanttTaskEntry = {
  kind: "task";
  task: Task;
  depth: number;
  projectKey: string;
};
type GanttProjectEntry = {
  kind: "project";
  id: string;
  projectKey: string;
  projectName: string;
  taskCount: number;
};
type GanttEntry = GanttProjectEntry | GanttTaskEntry;

type Language = "en" | "zh";
type ThemeMode = "system" | "light" | "dark";
type ToggleFilter = "all" | "yes" | "no";
type OverdueFilter = "all" | "overdue" | "not-overdue";
type SelectOption = {
  value: string;
  label: string;
};
type TaskFormSnapshot = {
  title: string;
  description: string;
  status: TaskStatus;
  projectSelection: string;
  newProjectName: string;
  childCategory: string;
  tags: string;
  startDate: string;
  startTime: string;
  dueTime: string;
  dueDate: string;
  completionDate: string;
  isImportant: boolean;
  isUrgent: boolean;
  showAdvancedSettings: boolean;
};
type PageKey =
  | "kanban"
  | "gantt"
  | "projects"
  | "tags"
  | "recurring"
  | "reminders"
  | "trash"
  | "help"
  | "settings";

const messages = {
  en: {
    localWorkspace: "Local workspace",
    board: "Board",
    kanban: "Kanban",
    gantt: "Gantt",
    projects: "Projects",
    tags: "Tags",
    recurring: "Recurring",
    reminders: "Reminders",
    trash: "Trash",
    settings: "Settings",
    help: "User guide",
    search: "Search",
    newTask: "New Task",
    create: "Create",
    editing: "Editing",
    taskName: "Task name",
    taskPlaceholder: "What needs doing?",
    status: "Status",
    project: "Project",
    unfiled: "Unfiled",
    tagsPlaceholder: "design, writing",
    start: "Start",
    due: "Due",
    important: "Important",
    notImportant: "Not important",
    urgent: "Urgent",
    notUrgent: "Not urgent",
    save: "Save",
    update: "Update",
    allTasks: "All tasks",
    dateRange: "Date range",
    loadingTasks: "Loading tasks...",
    noTasks: "No tasks",
    overdue: "Overdue",
    openEnded: "Open-ended",
    done: "Done",
    today: "Today",
    splitTask: "Split task",
    cancelEditing: "Cancel editing",
    changeStatus: "Change status",
    language: "Language",
    appearance: "Appearance",
    english: "English",
    chinese: "Chinese",
    system: "System",
    light: "Light",
    dark: "Dark",
    unavailable: "This area is not built yet.",
    titleRequired: "Task title is required.",
    loadError: "Unable to load tasks",
    saveError: "Unable to save task",
    todo: "Todo",
    doing: "Doing",
  },
  zh: {
    localWorkspace: "本地工作区",
    board: "看板",
    kanban: "看板",
    gantt: "甘特图",
    projects: "项目",
    tags: "标签",
    recurring: "重复任务",
    reminders: "提醒",
    trash: "回收站",
    settings: "设置",
    help: "使用指南",
    search: "搜索",
    newTask: "新建任务",
    create: "创建",
    editing: "编辑中",
    taskName: "任务名称",
    taskPlaceholder: "要做什么？",
    status: "状态",
    project: "项目",
    unfiled: "未归档",
    tagsPlaceholder: "设计，写作",
    start: "开始",
    due: "截止",
    important: "重要",
    notImportant: "不重要",
    urgent: "紧急",
    notUrgent: "不紧急",
    save: "保存",
    update: "更新",
    allTasks: "全部任务",
    dateRange: "日期范围",
    loadingTasks: "正在加载任务...",
    noTasks: "没有任务",
    overdue: "超时",
    openEnded: "无截止日期",
    done: "完成",
    today: "今天做了",
    splitTask: "拆分任务",
    cancelEditing: "取消编辑",
    changeStatus: "切换状态",
    language: "语言",
    appearance: "外观",
    english: "English",
    chinese: "中文",
    system: "跟随系统",
    light: "白天",
    dark: "黑夜",
    unavailable: "这个区域还没开始做。",
    titleRequired: "任务名称不能为空。",
    loadError: "无法加载任务",
    saveError: "无法保存任务",
    todo: "待办",
    doing: "进行中",
  },
} as const;

const LANGUAGE_KEY = "taskweave.settings.language";
const THEME_KEY = "taskweave.settings.theme";
const ALWAYS_ON_TOP_KEY = "taskweave.settings.alwaysOnTop";
const TRASH_RETENTION_DAYS_KEY = "taskweave.settings.trashRetentionDays";
const PROJECT_ORDER_KEY = "taskweave.settings.projectOrder";
const KANBAN_PROJECT_ORDER_KEY = "taskweave.settings.kanbanProjectOrder";
const GUIDE_HINT_KEY = "taskweave.help.hintDismissed";
const NEW_PROJECT_VALUE = "__taskweave_new_project__";
// Keep the existing subtask model and actions available for a later restoration.
const TASK_SPLITTING_ENABLED = false;
const UNFILED_PROJECT_VALUE = "__taskweave_unfiled_project__";
const UNCATEGORIZED_CHILD_VALUE = "__taskweave_uncategorized_child__";

function messageFromError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

const taskRepository = createTaskRepository();
const runningInTauri = isTauri();
const tasks = ref<Task[]>([]);
const deletedTasks = ref<DeletedTask[]>([]);
const recurringTemplates = ref<RecurringTaskTemplate[]>([]);
const currentIsoDate = ref(todayIsoDate());
const projects = ref<ProjectSummary[]>([]);
const tags = ref<TagSummary[]>([]);
const selectedTrashTaskIds = ref<Set<string>>(new Set());
const pendingPermanentDeleteIds = ref<string[]>([]);
const editingRecurringTemplateId = ref<string | null>(null);
const selectedTaskId = ref<string | null>(null);
const childParentTaskId = ref<string | null>(null);
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
const activePage = ref<PageKey>("kanban");
const reminderTaskId = ref<string | null>(null);
const reminderAlerts = ref<ReminderAlert[]>([]);
const reminderAlertError = ref("");
const reminderAlertBusy = ref(false);
const viewedReminderTaskId = ref<string|null>(null);
const viewedReminderTask = computed(()=>tasks.value.find(task=>task.id===viewedReminderTaskId.value)??null);
let stopReminderNavigation: (()=>void)|undefined;
let reminderNavigationStopped = false;
const currentMinute = ref(localMinute());
let stopReminderService: (() => void) | undefined;
const helpArticleId = ref("overview");
const isSupportOpen = ref(false);
const showGuideHint = ref(localStorage.getItem(GUIDE_HINT_KEY) !== "true");
const language = ref<Language>(readLanguage());
const themeMode = ref<ThemeMode>(readThemeMode());
const alwaysOnTop = ref(readAlwaysOnTop());
const alwaysOnTopError = ref(false);
const autostartEnabled = ref(false);
const autostartBusy = ref(false);
const autostartError = ref("");
const appVersion = ref("1.0.0");
const updateStatus = ref<"idle" | "checking" | "current" | "available" | "downloading" | "error" | "unconfigured">(
  appUpdatesConfigured ? "idle" : "unconfigured",
);
const updateError = ref("");
const availableUpdate = shallowRef<AppUpdate | null>(null);
const updateDownloadedBytes = ref(0);
const updateTotalBytes = ref<number | null>(null);
const isWindowMaximized = ref(false);
const dataTransferInput = ref<HTMLInputElement | null>(null);
const dataTransferMessage = ref<string | null>(null);
const dataTransferFailed = ref(false);
const isTransferringData = ref(false);
const trashRetentionDays = ref(readTrashRetentionDays());
const expandedTaskIds = ref<Set<string>>(new Set());
const collapsedChildTaskIds = ref<Set<string>>(new Set());
const collapsedProjectKeys = ref<Set<string>>(new Set());
const collapsedKanbanProjectKeys = ref<Set<string>>(new Set());
const collapsedProjectTreeNames = ref<Set<string>>(new Set());
const expandedProjectDetailNames = ref<Set<string>>(new Set());
const expandedTagDetailNames = ref<Set<string>>(new Set());
const projectOrderKeys = ref<string[]>(readProjectOrder());
const kanbanProjectOrderKeys = ref<Record<TaskStatus, string[]>>(readKanbanProjectOrder());
let currentDateRefreshTimer: number | null = null;
let stopWindowResizeListener: (() => void) | null = null;
let stopAutostartListener: (() => void) | null = null;
let stopLanguageToggleListener: (() => void) | null = null;
let stopDarkModeToggleListener: (() => void) | null = null;
let stopUpdateCheckListener: (() => void) | null = null;
let desktopListenersStopped = false;
let initialUpdateTimer: number | null = null;
let automaticUpdateTimer: number | null = null;
const draggingTaskId = ref<string | null>(null);
const dragOverTaskId = ref<string | null>(null);
const dragOverColumnStatus = ref<TaskStatus | null>(null);
const draggingKanbanProject = ref<{ status: TaskStatus; projectKey: string } | null>(null);
const dragOverKanbanProject = ref<{ status: TaskStatus; projectKey: string } | null>(null);
const openSelectId = ref<string | null>(null);
const projectCreateFormEl = ref<HTMLFormElement | null>(null);
const isCreateFormOpen = ref(false);
const showAdvancedSettings = ref(false);
const ganttRangeStartDate = ref(addDaysIso(todayIsoDate(), -7));
const ganttRangeEndDate = ref(addDaysIso(todayIsoDate(), 22));
const selectedGanttTaskId = ref<string | null>(null);

const filters = reactive({
  query: "",
  project: "",
  tag: "",
  importance: "all" as ToggleFilter,
  urgency: "all" as ToggleFilter,
  overdue: "all" as OverdueFilter,
});
const doneHistory = reactive({
  enabled: false,
  fromDate: addDaysIso(todayIsoDate(), -30),
  toDate: todayIsoDate(),
});
const recurringForm = reactive(createRecurringTemplateFormState());
const recurringEditForm = reactive(createRecurringTemplateFormState());

const text = computed(() => messages[language.value]);
const updateProgress = computed(() => {
  if (!updateTotalBytes.value || updateTotalBytes.value <= 0) {
    return null;
  }

  return Math.min(100, Math.round((updateDownloadedBytes.value / updateTotalBytes.value) * 100));
});
const updateStatusText = computed(() => {
  if (language.value === "zh") {
    switch (updateStatus.value) {
      case "checking": return "正在检查更新……";
      case "current": return `当前已是最新版本（v${appVersion.value}）`;
      case "available": return `发现新版本 v${availableUpdate.value?.version ?? ""}`;
      case "downloading": return updateProgress.value === null
        ? "正在下载并安装更新……"
        : `正在下载并安装更新……${updateProgress.value}%`;
      case "error": return updateError.value || "检查更新失败";
      case "unconfigured": return "GitHub 发布地址尚未配置；本地功能不受影响。";
      default: return `当前版本 v${appVersion.value}`;
    }
  }

  switch (updateStatus.value) {
    case "checking": return "Checking for updates…";
    case "current": return `You are up to date (v${appVersion.value})`;
    case "available": return `Version ${availableUpdate.value?.version ?? ""} is available`;
    case "downloading": return updateProgress.value === null
      ? "Downloading and installing the update…"
      : `Downloading and installing the update… ${updateProgress.value}%`;
    case "error": return updateError.value || "Unable to check for updates";
    case "unconfigured": return "The GitHub release address is not configured yet. Local features still work.";
    default: return `Current version ${appVersion.value}`;
  }
});
const descriptionKeyboardHint = computed(() => language.value === "zh"
  ? "Tab 插入制表符，Shift+Tab 切换到上一个控件"
  : "Tab inserts a tab; Shift+Tab moves to the previous control");

const columns = computed<Array<{ status: TaskStatus; title: string }>>(() => [
  { status: "todo", title: text.value.todo },
  { status: "doing", title: text.value.doing },
  { status: "done", title: text.value.done },
]);

const navItems = computed(() => [
  { key: "kanban" as const, label: text.value.kanban, icon: FolderKanban },
  { key: "gantt" as const, label: text.value.gantt, icon: GanttChart },
  { key: "projects" as const, label: text.value.projects, icon: Archive },
  { key: "tags" as const, label: text.value.tags, icon: Tags },
  { key: "recurring" as const, label: text.value.recurring, icon: RotateCcw },
  { key: "reminders" as const, label: text.value.reminders, icon: Bell },
  { key: "trash" as const, label: text.value.trash, icon: Trash2 },
  { key: "settings" as const, label: text.value.settings, icon: Settings },
  { key: "help" as const, label: text.value.help, icon: BookOpen },
]);

const form = reactive({
  title: "",
  description: "",
  status: "todo" as TaskStatus,
  projectSelection: "",
  newProjectName: "",
  childCategory: "",
  tags: "",
  startDate: todayIsoDate(),
  startTime: "",
  dueTime: "",
  dueDate: "",
  completionDate: "",
  isImportant: false,
  isUrgent: false,
});
const pausedCreateForm = ref<TaskFormSnapshot | null>(null);
const projectManager = reactive({
  newName: "",
  newParentName: "",
  editingName: "",
  draftName: "",
  parentDraft: "",
  deletingName: "",
});
const tagManager = reactive({
  newName: "",
  editingName: "",
  draftName: "",
});

const isEditing = computed(() => selectedTaskId.value !== null);
const selectedTask = computed(() =>
  tasks.value.find((task) => task.id === selectedTaskId.value),
);
const childParentTask = computed(() =>
  tasks.value.find((task) => task.id === childParentTaskId.value),
);
const isChildForm = computed(() =>
  Boolean(childParentTaskId.value || selectedTask.value?.parentTaskId),
);
const isTaskFormModal = computed(() => isEditing.value || Boolean(childParentTask.value));
const isTaskFormVisible = computed(() => isCreateFormOpen.value || isTaskFormModal.value);
const projectTree = computed<ProjectTreeEntry[]>(() => buildProjectTree(projects.value));
const visibleProjectTree = computed<ProjectTreeEntry[]>(() => {
  const projectsByName = new Map(projects.value.map((project) => [project.name, project]));

  return projectTree.value.filter((project) => {
    const visited = new Set<string>();
    let parentName = project.parentName;
    while (parentName && !visited.has(parentName)) {
      if (collapsedProjectTreeNames.value.has(parentName)) {
        return false;
      }
      visited.add(parentName);
      parentName = projectsByName.get(parentName)?.parentName ?? null;
    }
    return true;
  });
});
const boardTagOptions = computed(() => tags.value.map((tag) => tag.name));
const projectSelectOptions = computed<SelectOption[]>(() => [
  { value: "", label: text.value.unfiled },
  ...projectTree.value.map((project) => ({
    value: project.name,
    label: project.path.join(" / "),
  })),
  {
    value: NEW_PROJECT_VALUE,
    label: language.value === "zh" ? "\u65b0\u589e\u9879\u76ee" : "New project",
  },
]);
const statusSelectOptions = computed<SelectOption[]>(() =>
  TASK_STATUSES.map((status) => ({
    value: status,
    label: statusLabel(status),
  })),
);
const importanceFilterOptions = computed<SelectOption[]>(() => [
  { value: "all", label: `${text.value.important}/${text.value.notImportant}` },
  { value: "yes", label: text.value.important },
  { value: "no", label: text.value.notImportant },
]);
const urgencyFilterOptions = computed<SelectOption[]>(() => [
  { value: "all", label: `${text.value.urgent}/${text.value.notUrgent}` },
  { value: "yes", label: text.value.urgent },
  { value: "no", label: text.value.notUrgent },
]);
const projectFilterOptions = computed<SelectOption[]>(() => [
  { value: "", label: text.value.project },
  { value: UNFILED_PROJECT_VALUE, label: text.value.unfiled },
  ...projectTree.value.map((project) => ({
    value: project.name,
    label: project.path.join(" / "),
  })),
]);
const tagFilterOptions = computed<SelectOption[]>(() => [
  { value: "", label: text.value.tags },
  ...boardTagOptions.value.map((tag) => ({ value: tag, label: `#${tag}` })),
]);
const overdueFilterOptions = computed<SelectOption[]>(() => [
  { value: "all", label: `${text.value.overdue}/${text.value.allTasks}` },
  { value: "overdue", label: text.value.overdue },
  { value: "not-overdue", label: language.value === "zh" ? "\u672a\u8d85\u65f6" : "Not overdue" },
]);
const languageOptions = computed<SelectOption[]>(() => [
  { value: "en", label: text.value.english },
  { value: "zh", label: text.value.chinese },
]);
const themeOptions = computed<SelectOption[]>(() => [
  { value: "system", label: text.value.system },
  { value: "light", label: text.value.light },
  { value: "dark", label: text.value.dark },
]);
const recurringFrequencyOptions = computed<SelectOption[]>(() => [
  { value: "daily", label: language.value === "zh" ? "\u6bcf\u5929" : "Daily" },
  { value: "weekly", label: language.value === "zh" ? "\u6bcf\u5468" : "Weekly" },
  { value: "monthly", label: language.value === "zh" ? "\u6bcf\u6708" : "Monthly" },
]);
const weekdayOptions = computed(() => [
  { value: 1, label: language.value === "zh" ? "\u5468\u4e00" : "Mon" },
  { value: 2, label: language.value === "zh" ? "\u5468\u4e8c" : "Tue" },
  { value: 3, label: language.value === "zh" ? "\u5468\u4e09" : "Wed" },
  { value: 4, label: language.value === "zh" ? "\u5468\u56db" : "Thu" },
  { value: 5, label: language.value === "zh" ? "\u5468\u4e94" : "Fri" },
  { value: 6, label: language.value === "zh" ? "\u5468\u516d" : "Sat" },
  { value: 7, label: language.value === "zh" ? "\u5468\u65e5" : "Sun" },
]);
const monthDayOptions = computed(() =>
  Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    return { value: day, label: language.value === "zh" ? `${day}\u53f7` : String(day) };
  }),
);
const childCategoryOptions = computed(() => {
  const parentId = childParentTaskId.value ?? selectedTask.value?.parentTaskId ?? null;
  if (!parentId) {
    return [];
  }

  return [
    ...new Set(
      childTasksFor(parentId)
        .map((task) => task.childCategory?.trim())
        .filter((category): category is string => Boolean(category)),
    ),
  ].sort((a, b) => a.localeCompare(b));
});
const hasActiveFilters = computed(
  () =>
    Boolean(filters.query.trim()) ||
    Boolean(filters.project) ||
    Boolean(filters.tag) ||
    filters.importance !== "all" ||
    filters.urgency !== "all" ||
    filters.overdue !== "all",
);
const ganttTaskEntries = computed<GanttEntry[]>(() => {
  const groups = groupTasksByProject(
    tasks.value
      .filter((task) => task.parentTaskId === null)
      .filter(taskMatchesBoardFilters)
      .filter(taskOverlapsGanttWindow)
      .sort(sortTasksByOrder),
    projectOrderKeys.value,
  );

  return groups.flatMap((group) => {
    const taskEntries = group.tasks.flatMap((task) => [
      { kind: "task" as const, task, depth: 0, projectKey: group.projectKey },
      ...descendantTaskEntriesFor(task.id)
        .filter((entry) => taskOverlapsGanttWindow(entry.task))
        .map((entry) => ({
          kind: "task" as const,
          ...entry,
          depth: entry.depth + 1,
          projectKey: group.projectKey,
        })),
    ]);

    if (taskEntries.length === 0) {
      return [];
    }

    return [
      {
        kind: "project" as const,
        id: projectGroupId(group.projectKey),
        projectKey: group.projectKey,
        projectName: group.projectName,
        taskCount: taskEntries.length,
      },
      ...taskEntries,
    ];
  });
});
const kanbanTaskCountByStatus = computed(() =>
  Object.fromEntries(
    TASK_STATUSES.map((status) => [status, tasksFor(status).length]),
  ) as Record<TaskStatus, number>,
);
const kanbanProjectGroupsByStatus = computed(() =>
  Object.fromEntries(
    TASK_STATUSES.map((status) => [
      status,
      groupTasksByProject(tasksFor(status), kanbanProjectOrderKeys.value[status] ?? []),
    ]),
  ) as Record<TaskStatus, ProjectTaskGroup[]>,
);
const selectedGanttTask = computed(
  () => tasks.value.find((task) => task.id === selectedGanttTaskId.value) ?? null,
);
const selectedTrashTasks = computed(() =>
  deletedTasks.value.filter((task) => selectedTrashTaskIds.value.has(task.id)),
);
const allTrashTasksSelected = computed(
  () =>
    deletedTasks.value.length > 0 &&
    deletedTasks.value.every((task) => selectedTrashTaskIds.value.has(task.id)),
);
const pendingPermanentDeleteTasks = computed(() =>
  deletedTasks.value.filter((task) => pendingPermanentDeleteIds.value.includes(task.id)),
);

function isDarkThemeActive(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

async function syncNativeTrayPreferences() {
  if (!runningInTauri) {
    return;
  }

  try {
    await syncTrayPreferences(language.value, isDarkThemeActive());
  } catch {
    // The main settings remain usable if Windows temporarily rejects a tray update.
  }
}

async function loadAutostartState() {
  if (!runningInTauri) {
    return;
  }

  try {
    autostartEnabled.value = await readAutostartEnabled();
    autostartError.value = "";
  } catch (error) {
    autostartError.value = messageFromError(
      error,
      language.value === "zh" ? "无法读取开机自启动状态" : "Unable to read startup status",
    );
  }
}

async function changeAutostart(enabled: boolean) {
  if (!runningInTauri || autostartBusy.value) {
    return;
  }

  autostartBusy.value = true;
  autostartError.value = "";
  try {
    autostartEnabled.value = await setAutostartEnabled(enabled);
  } catch (error) {
    autostartError.value = messageFromError(
      error,
      language.value === "zh" ? "无法修改开机自启动" : "Unable to change startup behavior",
    );
    await loadAutostartState();
  } finally {
    autostartBusy.value = false;
  }
}

async function checkForUpdates(manual = false) {
  if (manual) {
    activePage.value = "settings";
  }

  if (!runningInTauri || !appUpdatesConfigured) {
    updateStatus.value = "unconfigured";
    return;
  }
  if (updateStatus.value === "checking" || updateStatus.value === "downloading") {
    return;
  }

  const previousUpdate = availableUpdate.value;
  availableUpdate.value = null;
  updateStatus.value = "checking";
  updateError.value = "";
  try {
    const update = await checkForAppUpdate();
    if (previousUpdate) {
      await previousUpdate.close().catch(() => undefined);
    }
    availableUpdate.value = update;
    updateStatus.value = update ? "available" : "current";
  } catch (error) {
    availableUpdate.value = previousUpdate;
    updateStatus.value = previousUpdate ? "available" : "error";
    updateError.value = messageFromError(
      error,
      language.value === "zh" ? "检查更新失败，请稍后重试" : "Unable to check for updates. Try again later.",
    );
  }
}

async function downloadAndInstallUpdate() {
  const update = availableUpdate.value;
  if (!update || updateStatus.value === "downloading") {
    return;
  }

  updateStatus.value = "downloading";
  updateError.value = "";
  updateDownloadedBytes.value = 0;
  updateTotalBytes.value = null;
  try {
    await installAppUpdate(update, (downloaded, total) => {
      updateDownloadedBytes.value = downloaded;
      updateTotalBytes.value = total;
    });
  } catch (error) {
    updateStatus.value = "available";
    updateError.value = messageFromError(
      error,
      language.value === "zh" ? "更新安装失败，请稍后重试" : "Unable to install the update. Try again later.",
    );
  }
}

function keepDesktopListener(
  registration: Promise<() => void>,
  assign: (remove: () => void) => void,
) {
  void registration.then((remove) => {
    if (desktopListenersStopped) {
      remove();
    } else {
      assign(remove);
    }
  });
}

onMounted(() => {
  currentDateRefreshTimer = window.setInterval(() => {
    currentIsoDate.value = todayIsoDate();
    currentMinute.value = localMinute();
    tasks.value = tasks.value.map(task => ({ ...task, isOverdue: isTaskOverdue(task) }));
  }, 60_000);
  applyTheme(themeMode.value);
  stopReminderService = startReminderService(refreshReminderAlerts);
  if (runningInTauri) {
    void listen("reminder-open-task",()=>void takeReminderTask()).then(remove=>{if(reminderNavigationStopped)remove();else stopReminderNavigation=remove;});
    void takeReminderTask();
    void getVersion().then((version) => {
      appVersion.value = version;
    });
    void loadAutostartState();
    void syncNativeTrayPreferences();
    keepDesktopListener(
      listen<{ enabled: boolean; error?: string }>("desktop-autostart-changed", ({ payload }) => {
        autostartEnabled.value = payload.enabled;
        autostartError.value = payload.error ?? "";
      }),
      (remove) => { stopAutostartListener = remove; },
    );
    keepDesktopListener(
      listen("desktop-toggle-language", () => {
        language.value = language.value === "zh" ? "en" : "zh";
      }),
      (remove) => { stopLanguageToggleListener = remove; },
    );
    keepDesktopListener(
      listen("desktop-toggle-dark-mode", () => {
        themeMode.value = isDarkThemeActive() ? "light" : "dark";
      }),
      (remove) => { stopDarkModeToggleListener = remove; },
    );
    keepDesktopListener(
      listen("desktop-check-for-updates", () => {
        void checkForUpdates(true);
      }),
      (remove) => { stopUpdateCheckListener = remove; },
    );
    if (appUpdatesConfigured) {
      initialUpdateTimer = window.setTimeout(() => void checkForUpdates(), 2_500);
      automaticUpdateTimer = window.setInterval(
        () => void checkForUpdates(),
        6 * 60 * 60 * 1_000,
      );
    }
  } else {
    window.addEventListener(ALERT_CHANGE, refreshReminderAlerts);
    window.addEventListener("storage", refreshReminderAlerts);
    refreshReminderAlerts();
  }
  void applyAlwaysOnTop(alwaysOnTop.value);
  void prepareWindowControls();
  document.addEventListener("pointerdown", closeCustomSelectOnOutsideClick);
  void cleanupExpiredTrash();
  void loadTasks();
  void loadProjectAndTagSummaries();
  void loadRecurringTemplates();
  void loadDeletedTasks();
});

onBeforeUnmount(() => {
  stopReminderService?.();
  reminderNavigationStopped=true;
  stopReminderNavigation?.();
  desktopListenersStopped = true;
  stopAutostartListener?.();
  stopLanguageToggleListener?.();
  stopDarkModeToggleListener?.();
  stopUpdateCheckListener?.();
  if (initialUpdateTimer !== null) {
    window.clearTimeout(initialUpdateTimer);
  }
  if (automaticUpdateTimer !== null) {
    window.clearInterval(automaticUpdateTimer);
  }
  void availableUpdate.value?.close().catch(() => undefined);
  window.removeEventListener(ALERT_CHANGE, refreshReminderAlerts);
  window.removeEventListener("storage", refreshReminderAlerts);
  if (currentDateRefreshTimer !== null) {
    window.clearInterval(currentDateRefreshTimer);
  }
  document.removeEventListener("pointerdown", closeCustomSelectOnOutsideClick);
  stopWindowResizeListener?.();
});

watch(language, (value) => {
  localStorage.setItem(LANGUAGE_KEY, value);
  void syncNativeTrayPreferences();
});

watch(themeMode, (value) => {
  localStorage.setItem(THEME_KEY, value);
  applyTheme(value);
  void syncNativeTrayPreferences();
});

watch(alwaysOnTop, (value) => {
  localStorage.setItem(ALWAYS_ON_TOP_KEY, String(value));
  void applyAlwaysOnTop(value);
});

watch(trashRetentionDays, (value) => {
  localStorage.setItem(TRASH_RETENTION_DAYS_KEY, String(value));
});

watch(activePage, (value) => {
  if (value === "help") {
    dismissGuideHint();
  }

  if (value === "trash") {
    void cleanupExpiredTrash();
    void loadDeletedTasks();
  }

  if (value === "recurring") {
    void loadRecurringTemplates();
  }
});

function dismissGuideHint() {
  showGuideHint.value = false;
  localStorage.setItem(GUIDE_HINT_KEY, "true");
}

function tasksFor(status: TaskStatus) {
  return tasks.value
    .filter((task) => task.status === status && task.parentTaskId === null)
    .filter(shouldShowTaskOnBoard)
    .filter(taskMatchesBoardFilters)
    .sort(sortTasksByOrder);
}

function shouldShowTaskOnBoard(task: Task) {
  if (!hasTaskStarted(task)) {
    return false;
  }

  if (task.status !== "done") {
    return true;
  }

  if (task.completionDate === currentIsoDate.value) {
    return true;
  }

  return doneHistory.enabled && taskCompletedInHistoryRange(task);
}

function hasTaskStarted(task: Task) {
  return task.startTime ? `${task.startDate}T${task.startTime}` <= currentMinute.value : task.startDate <= currentIsoDate.value;
}

function refreshReminderAlerts() {
  if (runningInTauri) return;
  void listReminderAlerts().then(items=>reminderAlerts.value=items).catch(error=>reminderAlertError.value=String(error));
}

async function takeReminderTask() {
  try {
    const id=await invoke<string|null>("take_reminder_task");
    if (id) { await loadTasks(); viewedReminderTaskId.value=id; }
  } catch(error) { errorMessage.value=String(error); }
}

async function handleReminderAlert(action:()=>Promise<void>) {
  reminderAlertBusy.value=true;reminderAlertError.value="";
  try { await action(); refreshReminderAlerts(); }
  catch(error) { reminderAlertError.value=String(error); }
  finally { reminderAlertBusy.value=false; }
}

async function viewReminderTask(alert: ReminderAlert) {
  await handleReminderAlert(async()=>{
    await loadTasks();
    if (!tasks.value.some(task=>task.id===alert.taskId)) throw new Error(language.value==='zh'?'关联任务已删除':'The linked task has been deleted');
    viewedReminderTaskId.value=alert.taskId;
    await dismissReminderAlerts([alert.id]);
  });
}

async function openTaskReminders(task: Task | null) {
  if (!task) return;
  if (!document.querySelector<HTMLFormElement>(".task-form-editing")?.reportValidity()) return;
  // The reminder shortcut also commits the task draft; failed validation keeps it open.
  if (!await saveTask()) return;
  reminderTaskId.value = task.id;
  activePage.value = "reminders";
}

function taskCompletedInHistoryRange(task: Task) {
  if (!task.completionDate) {
    return false;
  }

  if (doneHistory.fromDate && task.completionDate < doneHistory.fromDate) {
    return false;
  }

  if (doneHistory.toDate && task.completionDate > doneHistory.toDate) {
    return false;
  }

  return true;
}

function buildProjectTree(sourceProjects: ProjectSummary[]): ProjectTreeEntry[] {
  const childrenByParent = new Map<string | null, ProjectSummary[]>();
  const names = new Set(sourceProjects.map((project) => project.name));
  for (const project of sourceProjects) {
    const parentName =
      project.parentName && names.has(project.parentName) ? project.parentName : null;
    childrenByParent.set(parentName, [
      ...(childrenByParent.get(parentName) ?? []),
      project,
    ]);
  }
  for (const children of childrenByParent.values()) {
    children.sort((first, second) => first.name.localeCompare(second.name));
  }

  const result: ProjectTreeEntry[] = [];
  const visited = new Set<string>();
  function append(project: ProjectSummary, path: string[]) {
    if (visited.has(project.name)) {
      return;
    }
    visited.add(project.name);
    const nextPath = [...path, project.name];
    result.push({ ...project, depth: path.length, path: nextPath });
    for (const child of childrenByParent.get(project.name) ?? []) {
      append(child, nextPath);
    }
  }

  for (const rootProject of childrenByParent.get(null) ?? []) {
    append(rootProject, []);
  }
  for (const project of sourceProjects) {
    append(project, []);
  }
  return result;
}

function projectDisplayName(projectName: string | null): string {
  if (!projectName) {
    return text.value.unfiled;
  }
  return projectTree.value.find((project) => project.name === projectName)?.path.join(" / ")
    ?? projectName;
}

function descendantProjectNames(projectName: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const project of projects.value) {
    if (project.parentName) {
      childrenByParent.set(project.parentName, [
        ...(childrenByParent.get(project.parentName) ?? []),
        project.name,
      ]);
    }
  }
  const names = new Set<string>();
  const pending = [projectName];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || names.has(current)) {
      continue;
    }
    names.add(current);
    pending.push(...(childrenByParent.get(current) ?? []));
  }
  return names;
}

function projectParentOptions(projectName = ""): SelectOption[] {
  const excludedNames = projectName ? descendantProjectNames(projectName) : new Set<string>();
  return [
    { value: "", label: language.value === "zh" ? "\u9876\u5c42\u9879\u76ee" : "Top-level project" },
    ...projectTree.value
      .filter((project) => !excludedNames.has(project.name))
      .map((project) => ({ value: project.name, label: project.path.join(" / ") })),
  ];
}

function projectKeyForTask(task: Pick<Task, "projectName">) {
  return task.projectName ?? UNFILED_PROJECT_VALUE;
}

function projectGroupId(projectKey: string) {
  return `project:${projectKey}`;
}

function projectNameFromKey(projectKey: string) {
  return projectKey === UNFILED_PROJECT_VALUE
    ? text.value.unfiled
    : projectDisplayName(projectKey);
}

function groupTasksByProject(sourceTasks: Task[], orderedProjectKeys: string[] = []): ProjectTaskGroup[] {
  const groups = new Map<string, Task[]>();

  for (const task of sourceTasks) {
    const projectKey = projectKeyForTask(task);
    groups.set(projectKey, [...(groups.get(projectKey) ?? []), task]);
  }

  const orderByProjectKey = new Map(
    orderedProjectKeys.map((projectKey, index) => [projectKey, index]),
  );

  return [...groups.entries()]
    .map(([projectKey, groupTasks]) => ({
      projectKey,
      projectName: projectNameFromKey(projectKey),
      tasks: groupTasks,
    }))
    .sort((first, second) => {
      const firstIndex = orderByProjectKey.get(first.projectKey);
      const secondIndex = orderByProjectKey.get(second.projectKey);

      if (firstIndex !== undefined || secondIndex !== undefined) {
        return (firstIndex ?? Number.MAX_SAFE_INTEGER) - (secondIndex ?? Number.MAX_SAFE_INTEGER);
      }

      if (first.projectKey === UNFILED_PROJECT_VALUE) {
        return 1;
      }
      if (second.projectKey === UNFILED_PROJECT_VALUE) {
        return -1;
      }
      return first.projectName.localeCompare(second.projectName);
    });
}

function projectGroupsForStatus(status: TaskStatus) {
  return kanbanProjectGroupsByStatus.value[status] ?? [];
}

function taskCountForStatus(status: TaskStatus) {
  return kanbanTaskCountByStatus.value[status] ?? 0;
}

function isProjectGroupCollapsed(projectKey: string) {
  return collapsedProjectKeys.value.has(projectKey);
}

function expandProjectGroup(projectKey: string) {
  const nextKeys = new Set(collapsedProjectKeys.value);
  nextKeys.delete(projectKey);
  collapsedProjectKeys.value = nextKeys;
}

function collapseProjectGroup(projectKey: string) {
  collapsedProjectKeys.value = new Set([...collapsedProjectKeys.value, projectKey]);
}

function kanbanProjectGroupKey(status: TaskStatus, projectKey: string) {
  return `${status}:${projectKey}`;
}

function isKanbanProjectGroupCollapsed(status: TaskStatus, projectKey: string) {
  return collapsedKanbanProjectKeys.value.has(kanbanProjectGroupKey(status, projectKey));
}

function toggleKanbanProjectGroup(status: TaskStatus, projectKey: string) {
  const key = kanbanProjectGroupKey(status, projectKey);
  const nextKeys = new Set(collapsedKanbanProjectKeys.value);

  if (nextKeys.has(key)) {
    nextKeys.delete(key);
  } else {
    nextKeys.add(key);
  }

  collapsedKanbanProjectKeys.value = nextKeys;
}

function isDraggingKanbanProject(status: TaskStatus, projectKey: string) {
  return (
    draggingKanbanProject.value?.status === status &&
    draggingKanbanProject.value.projectKey === projectKey
  );
}

function isDragOverKanbanProject(status: TaskStatus, projectKey: string) {
  return (
    dragOverKanbanProject.value?.status === status &&
    dragOverKanbanProject.value.projectKey === projectKey
  );
}

function dragKanbanProjectStart(event: DragEvent, status: TaskStatus, projectKey: string) {
  draggingKanbanProject.value = { status, projectKey };
  dragOverKanbanProject.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", kanbanProjectGroupKey(status, projectKey));
  }
}

function dragKanbanProjectOver(status: TaskStatus, projectKey: string) {
  const draggingProject = draggingKanbanProject.value;
  if (!draggingProject || draggingProject.status !== status || draggingProject.projectKey === projectKey) {
    return;
  }

  dragOverKanbanProject.value = { status, projectKey };
}

function dragKanbanProjectLeave(status: TaskStatus, projectKey: string) {
  if (isDragOverKanbanProject(status, projectKey)) {
    dragOverKanbanProject.value = null;
  }
}

function dragKanbanProjectEnd() {
  draggingKanbanProject.value = null;
  dragOverKanbanProject.value = null;
}

function dropKanbanProjectOn(status: TaskStatus, targetProjectKey: string) {
  const draggingProject = draggingKanbanProject.value;
  if (!draggingProject || draggingProject.status !== status || draggingProject.projectKey === targetProjectKey) {
    dragKanbanProjectEnd();
    return;
  }

  const orderedKeys = projectGroupsForStatus(status).map((group) => group.projectKey);
  const reorderedKeys = reorderedStringIds(orderedKeys, draggingProject.projectKey, targetProjectKey);
  setKanbanProjectOrder(status, reorderedKeys);
  dragKanbanProjectEnd();
}

function reorderedStringIds(ids: string[], sourceId: string, targetId: string) {
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return ids;
  }

  const nextIds = [...ids];
  const [movedId] = nextIds.splice(sourceIndex, 1);
  const adjustedTargetIndex = nextIds.indexOf(targetId);
  nextIds.splice(adjustedTargetIndex < 0 ? nextIds.length : adjustedTargetIndex + 1, 0, movedId);
  return nextIds;
}

function setProjectOrder(orderedKeys: string[]) {
  projectOrderKeys.value = orderedKeys;
  localStorage.setItem(PROJECT_ORDER_KEY, JSON.stringify(orderedKeys));
}

function setKanbanProjectOrder(status: TaskStatus, orderedKeys: string[]) {
  kanbanProjectOrderKeys.value = {
    ...kanbanProjectOrderKeys.value,
    [status]: orderedKeys,
  };
  localStorage.setItem(KANBAN_PROJECT_ORDER_KEY, JSON.stringify(kanbanProjectOrderKeys.value));
}

function childTasksFor(parentId: string) {
  return tasks.value
    .filter((task) => task.parentTaskId === parentId)
    .sort(sortTasksByOrder);
}

function boardChildTasksFor(parentId: string) {
  return childTasksFor(parentId).filter(hasTaskStarted);
}

function boardChildTaskCount(parentId: string) {
  return boardChildTasksFor(parentId).length;
}

function descendantTaskEntriesFor(
  parentId: string,
  depth = 0,
): Array<{ task: Task; depth: number }> {
  return childTasksFor(parentId).flatMap((task) => [
    { task, depth },
    ...descendantTaskEntriesFor(task.id, depth + 1),
  ]);
}

function visibleDescendantTaskEntriesFor(
  parentId: string,
  depth = 0,
): Array<{ task: Task; depth: number }> {
  if (!isChildListExpanded(parentId)) {
    return [];
  }

  return boardChildTasksFor(parentId).flatMap((task) => [
    { task, depth },
    ...visibleDescendantTaskEntriesFor(task.id, depth + 1),
  ]);
}

function childCategoryKeyForTask(task: Pick<Task, "childCategory">) {
  return task.childCategory?.trim() || UNCATEGORIZED_CHILD_VALUE;
}

function childCategoryNameFromKey(categoryKey: string) {
  if (categoryKey === UNCATEGORIZED_CHILD_VALUE) {
    return language.value === "zh" ? "\u672a\u5206\u7c7b" : "Uncategorized";
  }

  return categoryKey;
}

function visibleChildCategoryGroupsFor(parentId: string): ChildCategoryGroup[] {
  if (!isChildListExpanded(parentId)) {
    return [];
  }

  const groups = new Map<string, Array<{ task: Task; depth: number }>>();

  for (const child of boardChildTasksFor(parentId)) {
    const categoryKey = childCategoryKeyForTask(child);
    groups.set(categoryKey, [
      ...(groups.get(categoryKey) ?? []),
      { task: child, depth: 0 },
      ...visibleDescendantTaskEntriesFor(child.id, 1),
    ]);
  }

  return [...groups.entries()]
    .map(([categoryKey, entries]) => ({
      categoryKey,
      categoryName: childCategoryNameFromKey(categoryKey),
      entries,
    }))
    .sort((first, second) => {
      if (first.categoryKey === UNCATEGORIZED_CHILD_VALUE) {
        return 1;
      }
      if (second.categoryKey === UNCATEGORIZED_CHILD_VALUE) {
        return -1;
      }
      return first.categoryName.localeCompare(second.categoryName);
    });
}

function sortTasksByOrder(a: Task, b: Task) {
  return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
}

function taskMatchesBoardFilters(task: Task) {
  return (
    taskMatchesFilters(task) ||
    boardDescendantTaskEntriesFor(task.id).some((entry) => taskMatchesFilters(entry.task))
  );
}

function boardDescendantTaskEntriesFor(
  parentId: string,
  depth = 0,
): Array<{ task: Task; depth: number }> {
  return boardChildTasksFor(parentId).flatMap((task) => [
    { task, depth },
    ...boardDescendantTaskEntriesFor(task.id, depth + 1),
  ]);
}

function taskMatchesFilters(task: Task) {
  const query = filters.query.trim().toLowerCase();

  if (query) {
    const searchable = [
      task.title,
      task.description,
      task.projectName ? projectDisplayName(task.projectName) : "",
      task.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase();

    if (!searchable.includes(query)) {
      return false;
    }
  }

  if (filters.project === UNFILED_PROJECT_VALUE && task.projectName) {
    return false;
  }

  if (
    filters.project &&
    filters.project !== UNFILED_PROJECT_VALUE &&
    (!task.projectName || !descendantProjectNames(filters.project).has(task.projectName))
  ) {
    return false;
  }

  if (filters.tag && !task.tags.includes(filters.tag)) {
    return false;
  }

  if (filters.importance === "yes" && !task.isImportant) {
    return false;
  }

  if (filters.importance === "no" && task.isImportant) {
    return false;
  }

  if (filters.urgency === "yes" && !task.isUrgent) {
    return false;
  }

  if (filters.urgency === "no" && task.isUrgent) {
    return false;
  }

  if (filters.overdue === "overdue" && !task.isOverdue) {
    return false;
  }

  if (filters.overdue === "not-overdue" && task.isOverdue) {
    return false;
  }

  return true;
}

function clearFilters() {
  filters.query = "";
  filters.project = "";
  filters.tag = "";
  filters.importance = "all";
  filters.urgency = "all";
  filters.overdue = "all";
}

function resetDoneHistoryRange() {
  doneHistory.fromDate = addDaysIso(todayIsoDate(), -30);
  doneHistory.toDate = todayIsoDate();
}

function ganttWindowStart() {
  return ganttRangeStartDate.value || addDaysIso(todayIsoDate(), -7);
}

function ganttWindowEnd() {
  const start = ganttWindowStart();
  const end = ganttRangeEndDate.value || addDaysIso(start, 29);
  return end < start ? start : end;
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function ganttTaskEndDate(task: Task) {
  if (task.status === "done") {
    return task.completionDate ?? task.dueDate ?? task.startDate;
  }

  return task.dueDate ?? ganttWindowEnd();
}

function taskOverlapsGanttWindow(task: Task) {
  return task.startDate <= ganttWindowEnd() && ganttTaskEndDate(task) >= ganttWindowStart();
}

function daysBetweenIso(fromIsoDate: string, toIsoDate: string) {
  const from = new Date(`${fromIsoDate}T00:00:00`);
  const to = new Date(`${toIsoDate}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function dueDateSummary(task: Task) {
  if (!task.dueDate) {
    return text.value.openEnded;
  }

  const due = [task.dueDate, task.dueTime].filter(Boolean).join(" ");
  const days = daysBetweenIso(todayIsoDate(), task.dueDate);
  if (days === 0) {
    return language.value === "zh"
      ? `${due} · ${task.isOverdue ? '已逾期' : '今天截止'}`
      : `${due} · ${task.isOverdue ? 'overdue' : 'due today'}`;
  }

  if (days > 0) {
    return language.value === "zh"
      ? `${due} · \u8fd8\u6709 ${days} \u5929`
      : `${due} · ${days} days left`;
  }

  return language.value === "zh"
    ? `${due} · \u5df2\u8d85 ${Math.abs(days)} \u5929`
    : `${due} · ${Math.abs(days)} days overdue`;
}

function formatGanttWeekday(date: Date) {
  const labels =
    language.value === "zh"
      ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return labels[date.getDay()];
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftGanttWindow(days: number) {
  ganttRangeStartDate.value = addDaysIso(ganttWindowStart(), days);
  ganttRangeEndDate.value = addDaysIso(ganttWindowEnd(), days);
}

function resetGanttWindow() {
  ganttRangeStartDate.value = addDaysIso(todayIsoDate(), -7);
  ganttRangeEndDate.value = addDaysIso(todayIsoDate(), 22);
}

function ganttTaskCountLabel(count: number) {
  return language.value === "zh" ? `${count} \u4e2a\u4efb\u52a1` : `${count} tasks`;
}

function ganttPageLabels() {
  return {
    taskName: text.value.taskName,
    project: text.value.project,
    status: text.value.status,
    start: text.value.start,
    due: text.value.due,
    done: text.value.done,
    openEnded: text.value.openEnded,
    unfiled: text.value.unfiled,
    noTasks: text.value.noTasks,
    panelLabel: text.value.gantt,
    dateRange: language.value === "zh" ? "\u5c55\u793a\u65e5\u671f" : "Date range",
    previous: language.value === "zh" ? "\u4e0a\u4e00\u6bb5" : "Previous",
    today: language.value === "zh" ? "\u4eca\u5929" : "Today",
    next: language.value === "zh" ? "\u4e0b\u4e00\u6bb5" : "Next",
    unableToLoad:
      language.value === "zh" ? "\u7518\u7279\u56fe\u52a0\u8f7d\u5931\u8d25\uff1a" : "Unable to load Gantt chart: ",
    taskDetails: language.value === "zh" ? "\u4efb\u52a1\u8be6\u60c5" : "Task details",
    edit: language.value === "zh" ? "\u7f16\u8f91" : "Edit",
    close: language.value === "zh" ? "\u5173\u95ed" : "Close",
    important: text.value.important,
    notImportant: text.value.notImportant,
    urgent: text.value.urgent,
    notUrgent: text.value.notUrgent,
    overdue: text.value.overdue,
    addActivity: language.value === "zh" ? "标记这天做过" : "Mark activity",
    removeActivity: language.value === "zh" ? "取消这天的记录" : "Remove activity",
    activityHint:
      language.value === "zh"
        ? "点击日期格标记哪天做过"
        : "Click a date cell to mark activity",
  };
}

function selectGanttTask(task: Task) {
  selectedGanttTaskId.value = selectedGanttTaskId.value === task.id ? null : task.id;
}

function closeGanttTaskDetails() {
  selectedGanttTaskId.value = null;
}

function editGanttTask(task: Task) {
  selectedGanttTaskId.value = null;
  editTask(task);
}

function ganttChartRows(): GanttChartRow[] {
  return ganttTaskEntries.value.map((entry) => {
    if (entry.kind === "project") {
      return {
        kind: "project",
        id: entry.id,
        text: entry.projectName,
        projectKey: entry.projectKey,
        taskCount: entry.taskCount,
        open: !isProjectGroupCollapsed(entry.projectKey),
      };
    }

    return {
      kind: "task",
      id: entry.task.id,
      text: entry.task.title,
      startDate: entry.task.startDate,
      startTime: entry.task.startTime,
      endTime: entry.task.status !== "done" && entry.task.dueDate === ganttTaskEndDate(entry.task) ? entry.task.dueTime : null,
      endDate: ganttTaskEndDate(entry.task),
      parentId: entry.task.parentTaskId ?? projectGroupId(entry.projectKey),
      open: isChildListExpanded(entry.task.id),
      status: entry.task.status,
      statusLabel: statusLabel(entry.task.status),
      overdue: entry.task.isOverdue,
      workedToday: entry.task.workedToday,
      activityDates: entry.task.activityDates,
      isImportant: entry.task.isImportant,
      isUrgent: entry.task.isUrgent,
      realStartDate: [entry.task.startDate, entry.task.startTime].filter(Boolean).join(" "),
      realDueDate: entry.task.dueDate ? [entry.task.dueDate, entry.task.dueTime].filter(Boolean).join(" ") : null,
      completionDate: entry.task.completionDate,
      projectName: entry.task.projectName
        ? projectDisplayName(entry.task.projectName)
        : null,
      selected: selectedGanttTaskId.value === entry.task.id,
    };
  });
}

function handleGanttTaskClick(taskId: string) {
  const task = tasks.value.find((candidate) => candidate.id === taskId);
  if (task) {
    selectGanttTask(task);
  }
}

async function reorderGanttTasks(orderedTaskIds: string[]) {
  await taskRepository.reorderTasks(orderedTaskIds);
  await loadTasks();
}

async function loadTasks() {
  isLoading.value = true;
  errorMessage.value = null;

  try {
    tasks.value = await taskRepository.listTasks();
    await loadProjectAndTagSummaries();
  } catch (error) {
    errorMessage.value = messageFromError(error, text.value.loadError);
  } finally {
    isLoading.value = false;
  }
}

async function loadProjectAndTagSummaries() {
  try {
    const [projectSummaries, tagSummaries] = await Promise.all([
      taskRepository.listProjects(),
      taskRepository.listTags(),
    ]);
    projects.value = projectSummaries;
    tags.value = tagSummaries;
  } catch (error) {
    errorMessage.value = messageFromError(error, text.value.loadError);
  }
}

async function loadRecurringTemplates() {
  try {
    recurringTemplates.value = await taskRepository.listRecurringTemplates();
  } catch (error) {
    errorMessage.value = messageFromError(error, text.value.loadError);
  }
}

async function loadDeletedTasks() {
  try {
    deletedTasks.value = await taskRepository.listDeletedTasks();
    selectedTrashTaskIds.value = new Set(
      [...selectedTrashTaskIds.value].filter((id) =>
        deletedTasks.value.some((task) => task.id === id),
      ),
    );
  } catch (error) {
    errorMessage.value = messageFromError(error, text.value.loadError);
  }
}

async function cleanupExpiredTrash() {
  const cutoff = Date.now() - trashRetentionDays.value * 24 * 60 * 60 * 1000;
  const deleted = await taskRepository.listDeletedTasks();
  const expired = deleted.filter((task) => Date.parse(task.deletedAt) < cutoff);

  for (const task of expired) {
    await taskRepository.permanentlyDeleteTask(task.id);
  }
}

async function saveTask(): Promise<boolean> {
  errorMessage.value = null;

  const draft = formToDraft();
  if (!draft.title) {
    errorMessage.value = text.value.titleRequired;
    return false;
  }
  if (draft.dueDate && `${draft.dueDate}T${draft.dueTime || '23:59'}` < `${draft.startDate}T${draft.startTime || '00:00'}`) {
    errorMessage.value = language.value === "zh" ? "截止时间不能早于开始时间。" : "The due date and time cannot be before the start.";
    return false;
  }

  try {
    if (selectedTaskId.value) {
      await taskRepository.updateTask(selectedTaskId.value, draft);
    } else if (childParentTaskId.value) {
      await taskRepository.createChildTask(childParentTaskId.value, draft);
    } else {
      await taskRepository.createTask(draft);
    }

    resetForm();
    await loadTasks();
    return true;
  } catch (error) {
    errorMessage.value = messageFromError(error, text.value.saveError);
    return false;
  }
}

async function createRecurringTemplate() {
  if (!validateRecurringForm(recurringForm)) {
    return;
  }

  const draft = recurringTemplateFormToDraft(recurringForm, {
    today: todayIsoDate(),
    newProjectValue: NEW_PROJECT_VALUE,
  });
  try {
    await taskRepository.createRecurringTemplate(draft);
    resetRecurringForm();
    await loadRecurringTemplates();
    await loadTasks();
  } catch (error) {
    errorMessage.value = messageFromError(error, text.value.saveError);
  }
}

function editRecurringTemplate(template: RecurringTaskTemplate) {
  editingRecurringTemplateId.value = template.id;
  fillRecurringFormFromTemplate(recurringEditForm, template);
}

function cancelRecurringTemplateEdit() {
  editingRecurringTemplateId.value = null;
  resetRecurringEditForm();
}

async function saveRecurringTemplateEdit() {
  if (!editingRecurringTemplateId.value) {
    return;
  }

  if (!validateRecurringForm(recurringEditForm)) {
    return;
  }

  const draft = recurringTemplateFormToDraft(recurringEditForm, {
    today: todayIsoDate(),
    newProjectValue: NEW_PROJECT_VALUE,
  });
  try {
    await taskRepository.updateRecurringTemplate(editingRecurringTemplateId.value, draft);
    cancelRecurringTemplateEdit();
    await loadRecurringTemplates();
    await loadTasks();
  } catch (error) {
    errorMessage.value = messageFromError(error, text.value.saveError);
  }
}

function validateRecurringForm(source: typeof recurringForm): boolean {
  const sameDay = source.frequency === "daily" ||
    (source.frequency === "weekly" && source.weekdays[0] === source.dueWeekday) ||
    (source.frequency === "monthly" && source.monthDays === source.dueMonthDay);
  if (sameDay && source.startTime && source.dueTime && source.dueTime < source.startTime) {
    errorMessage.value = language.value === "zh" ? "同一天的截止时间不能早于开始时间。" : "The due time cannot be before the start time on the same day.";
    return false;
  }
  const validationError = validateRecurringTemplateForm(source);
  if (validationError) {
    errorMessage.value = recurringValidationMessage(validationError);
    return false;
  }

  return true;
}

function recurringValidationMessage(error: RecurringTemplateFormValidationError): string {
  if (error === "title_required") {
    return text.value.titleRequired;
  }

  const messagesByError: Record<Exclude<RecurringTemplateFormValidationError, "title_required">, string> = {
    weekly_start_required:
      language.value === "zh"
        ? "\u8bf7\u9009\u62e9\u6bcf\u5468\u5468\u671f\u7684\u5f00\u59cb\u65f6\u95f4"
        : "Choose the weekly cycle start day",
    weekly_due_required:
      language.value === "zh"
        ? "\u8bf7\u9009\u62e9\u6bcf\u5468\u5468\u671f\u7684\u622a\u6b62\u65f6\u95f4"
        : "Choose the weekly cycle due day",
    monthly_start_required:
      language.value === "zh"
        ? "\u8bf7\u9009\u62e9\u6bcf\u6708\u5468\u671f\u7684\u5f00\u59cb\u65e5"
        : "Choose the monthly cycle start day",
    monthly_due_required:
      language.value === "zh"
        ? "\u8bf7\u9009\u62e9\u6bcf\u6708\u5468\u671f\u7684\u622a\u6b62\u65e5"
        : "Choose the monthly cycle due day",
  };

  return messagesByError[error];
}

async function deleteRecurringTemplate(template: RecurringTaskTemplate) {
  try {
    await taskRepository.deleteRecurringTemplate(template.id);
    await loadRecurringTemplates();
    await loadTasks();
    await loadDeletedTasks();
  } catch (error) {
    errorMessage.value = messageFromError(error, text.value.saveError);
  }
}

function captureFormState(): TaskFormSnapshot {
  return {
    title: form.title,
    description: form.description,
    status: form.status,
    projectSelection: form.projectSelection,
    newProjectName: form.newProjectName,
    childCategory: form.childCategory,
    tags: form.tags,
    startDate: form.startDate,
    startTime: form.startTime,
    dueTime: form.dueTime,
    dueDate: form.dueDate,
    completionDate: form.completionDate,
    isImportant: form.isImportant,
    isUrgent: form.isUrgent,
    showAdvancedSettings: showAdvancedSettings.value,
  };
}

function restoreFormState(snapshot: TaskFormSnapshot) {
  form.title = snapshot.title;
  form.description = snapshot.description;
  form.status = snapshot.status;
  form.projectSelection = snapshot.projectSelection;
  form.newProjectName = snapshot.newProjectName;
  form.childCategory = snapshot.childCategory;
  form.tags = snapshot.tags;
  form.startDate = snapshot.startDate;
  form.startTime = snapshot.startTime;
  form.dueTime = snapshot.dueTime;
  form.dueDate = snapshot.dueDate;
  form.completionDate = snapshot.completionDate;
  form.isImportant = snapshot.isImportant;
  form.isUrgent = snapshot.isUrgent;
  showAdvancedSettings.value = snapshot.showAdvancedSettings;
}

function clearFormFields() {
  form.title = "";
  form.description = "";
  form.status = "todo";
  form.projectSelection = "";
  form.newProjectName = "";
  form.childCategory = "";
  form.tags = "";
  form.startDate = todayIsoDate();
  form.startTime = "";
  form.dueTime = "";
  form.dueDate = "";
  form.completionDate = "";
  form.isImportant = false;
  form.isUrgent = false;
}

function pauseCreateFormIfOpen() {
  if (!isCreateFormOpen.value || isTaskFormModal.value || pausedCreateForm.value) {
    return;
  }

  pausedCreateForm.value = captureFormState();
}

function closeCreateForm() {
  pausedCreateForm.value = null;
  selectedTaskId.value = null;
  childParentTaskId.value = null;
  isCreateFormOpen.value = false;
  showAdvancedSettings.value = false;
  openSelectId.value = null;
  clearFormFields();
}

function openCreateTaskForm() {
  if (isCreateFormOpen.value && !isTaskFormModal.value) {
    closeCreateForm();
    return;
  }

  pausedCreateForm.value = null;
  selectedTaskId.value = null;
  childParentTaskId.value = null;
  isCreateFormOpen.value = true;
  showAdvancedSettings.value = false;
  openSelectId.value = null;
  clearFormFields();
}

function editTask(task: Task) {
  if (selectedTaskId.value === task.id) {
    resetForm();
    return;
  }

  pauseCreateFormIfOpen();
  selectedTaskId.value = task.id;
  childParentTaskId.value = null;
  form.title = task.title;
  form.description = task.description;
  form.status = task.status;
  form.projectSelection = task.projectName ?? "";
  form.newProjectName = "";
  form.childCategory = task.childCategory ?? "";
  form.tags = task.tags.join(", ");
  form.startDate = task.startDate;
  form.startTime = task.startTime ?? "";
  form.dueTime = task.dueTime ?? "";
  form.dueDate = task.dueDate ?? "";
  form.completionDate = task.completionDate ?? "";
  form.isImportant = task.isImportant;
  form.isUrgent = task.isUrgent;
  showAdvancedSettings.value = true;
}

let taskFormPressStartedOnBackdrop = false;

function trackTaskFormPress(event: PointerEvent) {
  taskFormPressStartedOnBackdrop =
    event.button === 0 && event.target === event.currentTarget;
}

function dismissTaskFormFromBackdrop(event: MouseEvent, dismiss: () => void) {
  // Dragging or selecting text from inside the editor must preserve the draft.
  const shouldDismiss =
    taskFormPressStartedOnBackdrop &&
    event.target === event.currentTarget &&
    document.elementFromPoint(event.clientX, event.clientY) === event.currentTarget;
  taskFormPressStartedOnBackdrop = false;
  if (shouldDismiss) dismiss();
}

function resetForm() {
  selectedTaskId.value = null;
  childParentTaskId.value = null;
  openSelectId.value = null;

  const pausedSnapshot = pausedCreateForm.value;
  pausedCreateForm.value = null;
  if (pausedSnapshot) {
    isCreateFormOpen.value = true;
    restoreFormState(pausedSnapshot);
    return;
  }

  isCreateFormOpen.value = false;
  showAdvancedSettings.value = false;
  clearFormFields();
}

function startChildTask(task: Task) {
  if (childParentTaskId.value === task.id) {
    resetForm();
    return;
  }

  pauseCreateFormIfOpen();
  selectedTaskId.value = null;
  childParentTaskId.value = task.id;
  form.title = "";
  form.description = "";
  form.status = "todo";
  form.projectSelection = task.projectName ?? "";
  form.newProjectName = "";
  form.childCategory = "";
  form.tags = task.tags.join(", ");
  form.startDate = todayIsoDate();
  form.startTime = "";
  form.dueTime = "";
  form.dueDate = task.dueDate ?? "";
  form.completionDate = "";
  form.isImportant = task.isImportant;
  form.isUrgent = task.isUrgent;
  expandChildList(task.id);
  showAdvancedSettings.value = true;
}

function formTitle(): string {
  if (isEditing.value) {
    return language.value === "zh" ? "\u7f16\u8f91\u4efb\u52a1" : "Edit task";
  }

  if (childParentTask.value) {
    return language.value === "zh" ? "\u62c6\u5206\u4efb\u52a1" : "Split task";
  }

  return text.value.newTask;
}

function formModeTaskName() {
  return selectedTask.value?.title ?? childParentTask.value?.title ?? "";
}

function isSplittingTask(taskId: string) {
  return childParentTaskId.value === taskId;
}

function closeCustomSelectOnOutsideClick(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (!target?.closest(".custom-select")) openSelectId.value = null;
}

function toggleCustomSelect(selectId: string) {
  openSelectId.value = openSelectId.value === selectId ? null : selectId;
}

function isCustomSelectOpen(selectId: string) {
  return openSelectId.value === selectId;
}

function selectLabel(options: SelectOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? "";
}

function selectFormProject(value: string) {
  form.projectSelection = value;
  openSelectId.value = null;
}

function selectFormStatus(value: string) {
  form.status = value as TaskStatus;
  if (form.status === "done" && !form.completionDate) {
    form.completionDate = todayIsoDate();
  }
  openSelectId.value = null;
}

function selectImportanceFilter(value: string) {
  filters.importance = value as ToggleFilter;
  openSelectId.value = null;
}

function selectUrgencyFilter(value: string) {
  filters.urgency = value as ToggleFilter;
  openSelectId.value = null;
}

function selectProjectFilter(value: string) {
  filters.project = value;
  openSelectId.value = null;
}

function selectTagFilter(value: string) {
  filters.tag = value;
  openSelectId.value = null;
}

function selectOverdueFilter(value: string) {
  filters.overdue = value as OverdueFilter;
  openSelectId.value = null;
}

function selectLanguage(value: string) {
  language.value = value as Language;
  openSelectId.value = null;
}

function selectThemeMode(value: string) {
  themeMode.value = value as ThemeMode;
  openSelectId.value = null;
}

async function toggleToday(task: Task) {
  await toggleActivity(task.id, todayIsoDate());
}

async function toggleActivity(taskId: string, activityDate: string) {
  if (activityDate > todayIsoDate()) {
    return;
  }

  await taskRepository.toggleActivity(taskId, activityDate);
  await loadTasks();
}

async function deleteTask(task: Task) {
  await preserveWindowScroll(async () => {
    await taskRepository.deleteTask(task.id);
    if (selectedTaskId.value === task.id) {
      resetForm();
    }
    await loadTasks();
    await loadDeletedTasks();
  });
}

async function preserveWindowScroll(action: () => Promise<void>) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  await action();
  await nextTick();
  requestAnimationFrame(() => {
    window.scrollTo(scrollX, scrollY);
  });
}

async function restoreTask(task: DeletedTask) {
  await taskRepository.restoreTask(task.id);
  selectedTrashTaskIds.value = new Set(
    [...selectedTrashTaskIds.value].filter((id) => id !== task.id),
  );
  await loadTasks();
  await loadDeletedTasks();
}

async function restoreSelectedTrashTasks() {
  const tasksToRestore = selectedTrashTasks.value;
  for (const task of tasksToRestore) {
    await taskRepository.restoreTask(task.id);
  }
  selectedTrashTaskIds.value = new Set();
  await loadTasks();
  await loadDeletedTasks();
}

function requestPermanentDelete(task: DeletedTask) {
  pendingPermanentDeleteIds.value = [task.id];
}

function requestPermanentDeleteSelected() {
  pendingPermanentDeleteIds.value = selectedTrashTasks.value.map((task) => task.id);
}

function cancelPermanentDelete() {
  pendingPermanentDeleteIds.value = [];
}

async function confirmPermanentDelete() {
  for (const id of pendingPermanentDeleteIds.value) {
    await taskRepository.permanentlyDeleteTask(id);
  }
  selectedTrashTaskIds.value = new Set(
    [...selectedTrashTaskIds.value].filter(
      (id) => !pendingPermanentDeleteIds.value.includes(id),
    ),
  );
  pendingPermanentDeleteIds.value = [];
  await loadDeletedTasks();
}

function toggleTrashTaskSelection(taskId: string) {
  const nextIds = new Set(selectedTrashTaskIds.value);
  if (nextIds.has(taskId)) {
    nextIds.delete(taskId);
  } else {
    nextIds.add(taskId);
  }
  selectedTrashTaskIds.value = nextIds;
}

function toggleAllTrashTasks() {
  selectedTrashTaskIds.value = allTrashTasksSelected.value
    ? new Set()
    : new Set(deletedTasks.value.map((task) => task.id));
}

function isExpanded(taskId: string) {
  return expandedTaskIds.value.has(taskId);
}

function toggleExpanded(taskId: string) {
  const nextIds = new Set(expandedTaskIds.value);

  if (nextIds.has(taskId)) {
    nextIds.delete(taskId);
  } else {
    nextIds.add(taskId);
  }

  expandedTaskIds.value = nextIds;
}

function isChildListExpanded(taskId: string) {
  return !collapsedChildTaskIds.value.has(taskId);
}

function toggleChildList(taskId: string) {
  const nextIds = new Set(collapsedChildTaskIds.value);

  if (nextIds.has(taskId)) {
    nextIds.delete(taskId);
  } else {
    nextIds.add(taskId);
  }

  collapsedChildTaskIds.value = nextIds;
}

function expandChildList(taskId: string) {
  const nextIds = new Set(collapsedChildTaskIds.value);
  nextIds.delete(taskId);
  collapsedChildTaskIds.value = nextIds;
}

function collapseChildList(taskId: string) {
  collapsedChildTaskIds.value = new Set([...collapsedChildTaskIds.value, taskId]);
}

function dragTaskStart(event: DragEvent, task: Task) {
  draggingTaskId.value = task.id;
  dragOverTaskId.value = null;
  dragOverColumnStatus.value = task.parentTaskId === null ? task.status : null;
  event.dataTransfer?.setData("text/plain", task.id);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function dragTaskEnd() {
  draggingTaskId.value = null;
  dragOverTaskId.value = null;
  dragOverColumnStatus.value = null;
}

async function dropTaskOn(targetTask: Task) {
  const sourceTask = tasks.value.find((task) => task.id === draggingTaskId.value);
  draggingTaskId.value = null;
  dragOverTaskId.value = null;
  dragOverColumnStatus.value = null;

  if (!sourceTask || sourceTask.id === targetTask.id) {
    return;
  }

  if (
    sourceTask.parentTaskId === null &&
    sourceTask.status !== targetTask.status
  ) {
    await moveTopLevelTaskToStatus(sourceTask, targetTask.status, targetTask.id);
    return;
  }

  if (sourceTask.parentTaskId !== targetTask.parentTaskId) {
    const newParentId = parentIdForCrossParentDrop(sourceTask, targetTask);
    if (
      newParentId === sourceTask.id ||
      (newParentId && isDescendantOf(newParentId, sourceTask.id))
    ) {
      return;
    }

    const orderedIds = orderedSiblingIdsAfterMove(sourceTask, targetTask, newParentId);
    await taskRepository.moveTask(sourceTask.id, newParentId, orderedIds);
    if (newParentId) {
      expandChildList(newParentId);
    }
    await loadTasks();
    return;
  }

  const siblings = tasks.value
    .filter(
      (task) =>
        task.parentTaskId === targetTask.parentTaskId &&
        (targetTask.parentTaskId !== null || task.status === targetTask.status),
    )
    .sort(sortTasksByOrder);
  const sourceIndex = siblings.findIndex((task) => task.id === sourceTask.id);
  const targetIndex = siblings.findIndex((task) => task.id === targetTask.id);

  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }

  const reordered = [...siblings];
  const [movedTask] = reordered.splice(sourceIndex, 1);
  const adjustedTargetIndex = reordered.findIndex((task) => task.id === targetTask.id);
  reordered.splice(
    adjustedTargetIndex < 0 ? reordered.length : adjustedTargetIndex + 1,
    0,
    movedTask,
  );

  await taskRepository.reorderTasks(reordered.map((task) => task.id));
  await loadTasks();
}

async function moveTopLevelTaskToStatus(
  sourceTask: Task,
  status: TaskStatus,
  targetTaskId: string | null = null,
) {
  const targetTasks = tasks.value
    .filter(
      (task) =>
        task.id !== sourceTask.id &&
        task.parentTaskId === null &&
        task.status === status,
    )
    .sort(sortTasksByOrder);
  const targetIds = targetTasks.map((task) => task.id);

  if (targetTaskId) {
    const targetIndex = targetIds.indexOf(targetTaskId);
    targetIds.splice(targetIndex < 0 ? targetIds.length : targetIndex + 1, 0, sourceTask.id);
  } else {
    targetIds.push(sourceTask.id);
  }

  if (sourceTask.status !== status) {
    await taskRepository.setTaskStatus(sourceTask.id, status);
  }

  await taskRepository.reorderTasks(targetIds);
  await loadTasks();
}

function parentIdForCrossParentDrop(sourceTask: Task, targetTask: Task): string | null {
  const sourceParent = sourceTask.parentTaskId
    ? tasks.value.find((task) => task.id === sourceTask.parentTaskId)
    : null;

  if (targetTask.parentTaskId === null) {
    return targetTask.id;
  }

  if (sourceParent && targetTask.parentTaskId === sourceParent.parentTaskId) {
    return targetTask.id;
  }

  if (targetTask.childCount > 0 || isExpanded(targetTask.id)) {
    return targetTask.id;
  }

  return targetTask.parentTaskId;
}

function orderedSiblingIdsAfterMove(
  sourceTask: Task,
  targetTask: Task,
  parentTaskId: string | null,
) {
  const siblingIds = tasks.value
    .filter(
      (task) =>
        task.id !== sourceTask.id &&
        task.parentTaskId === parentTaskId &&
        (parentTaskId !== null || task.status === sourceTask.status),
    )
    .sort(sortTasksByOrder)
    .map((task) => task.id);

  if (targetTask.parentTaskId === parentTaskId) {
    const targetIndex = siblingIds.indexOf(targetTask.id);
    siblingIds.splice(targetIndex < 0 ? siblingIds.length : targetIndex + 1, 0, sourceTask.id);
    return siblingIds;
  }

  return [...siblingIds, sourceTask.id];
}

function isDescendantOf(taskId: string, ancestorId: string) {
  let currentTask = tasks.value.find((task) => task.id === taskId);

  while (currentTask?.parentTaskId) {
    if (currentTask.parentTaskId === ancestorId) {
      return true;
    }
    currentTask = tasks.value.find((task) => task.id === currentTask?.parentTaskId);
  }

  return false;
}

function dragTaskOver(targetTask: Task) {
  const sourceTask = tasks.value.find((task) => task.id === draggingTaskId.value);
  if (!sourceTask || sourceTask.id === targetTask.id) {
    return;
  }

  if (
    sourceTask.parentTaskId === null &&
    sourceTask.status !== targetTask.status
  ) {
    dragOverTaskId.value = null;
    dragOverColumnStatus.value = targetTask.status;
    return;
  }

  dragOverTaskId.value = targetTask.id;
  dragOverColumnStatus.value = targetTask.parentTaskId === null ? targetTask.status : null;
}

function dragTaskLeave(targetTask: Task) {
  if (dragOverTaskId.value === targetTask.id) {
    dragOverTaskId.value = null;
  }
}

function dragTaskOverColumn(status: TaskStatus) {
  const sourceTask = tasks.value.find((task) => task.id === draggingTaskId.value);
  if (sourceTask?.parentTaskId === null) {
    dragOverColumnStatus.value = status;
    if (sourceTask.status !== status) {
      dragOverTaskId.value = null;
    }
  }
}

function dragTaskLeaveColumn(status: TaskStatus) {
  if (dragOverColumnStatus.value === status && !dragOverTaskId.value) {
    dragOverColumnStatus.value = null;
  }
}

async function dropTaskOnColumn(status: TaskStatus, event?: DragEvent) {
  const sourceTask = tasks.value.find((task) => task.id === draggingTaskId.value);

  if (event && (!sourceTask || sourceTask.parentTaskId !== null)) {
    return;
  }

  const targetElement = event?.target as HTMLElement | null;
  const droppedOnTaskCard = Boolean(
    targetElement?.closest(".task-card") &&
      (event?.currentTarget as HTMLElement | null)?.contains(targetElement),
  );
  if (event && sourceTask?.status === status && droppedOnTaskCard) {
    return;
  }

  if (event && sourceTask?.parentTaskId === null) {
    event.preventDefault();
    event.stopPropagation();
  }

  draggingTaskId.value = null;
  dragOverTaskId.value = null;
  dragOverColumnStatus.value = null;

  if (!sourceTask || sourceTask.parentTaskId !== null) {
    return;
  }

  await moveTopLevelTaskToStatus(sourceTask, status);
}

function formToDraft(): TaskDraft {
  const parentForChild =
    childParentTask.value ??
    tasks.value.find((task) => task.id === selectedTask.value?.parentTaskId);

  return {
    title: form.title.trim(),
    description: form.description,
    status: form.status,
    projectName: parentForChild?.projectName ?? selectedProjectName(),
    childCategory: parentForChild ? form.childCategory.trim() || null : null,
    tags: parentForChild
      ? parentForChild.tags
      : form.tags
          .split(new RegExp(`[,\\uFF0C]`))
          .map((tag) => tag.trim())
          .filter(Boolean),
    startDate: form.startDate || todayIsoDate(),
    startTime: form.startTime || null,
    dueTime: form.dueDate ? form.dueTime || null : null,
    dueDate: form.dueDate || null,
    completionDate:
      form.status === "done" ? form.completionDate || todayIsoDate() : null,
    isImportant: parentForChild?.isImportant ?? form.isImportant,
    isUrgent: parentForChild?.isUrgent ?? form.isUrgent,
  };
}

function selectedProjectName(): string | null {
  if (form.projectSelection === NEW_PROJECT_VALUE) {
    return form.newProjectName.trim() || null;
  }

  return form.projectSelection.trim() || null;
}

function resetRecurringForm() {
  resetRecurringTemplateFormState(recurringForm, todayIsoDate());
}

function resetRecurringEditForm() {
  resetRecurringTemplateFormState(recurringEditForm, todayIsoDate());
}

function weeklyCycleText(source: typeof recurringForm): string {
  return formatWeeklyCycleText(source, recurringTextContext());
}

function monthlyCycleText(source: typeof recurringForm): string {
  return formatMonthlyCycleText(source, language.value);
}

function monthlyLastDayNotice(source: typeof recurringForm): string {
  return formatMonthlyLastDayNotice(source, language.value);
}

function beginProjectRename(name: string) {
  projectManager.editingName = name;
  projectManager.draftName = name;
  projectManager.parentDraft = projects.value.find((project) => project.name === name)?.parentName ?? "";
  projectManager.deletingName = "";
}

function cancelProjectRename() {
  projectManager.editingName = "";
  projectManager.draftName = "";
  projectManager.parentDraft = "";
}

function startChildProject(parentName: string) {
  expandProjectTreeBranch(parentName);
  projectManager.newParentName = parentName;
  projectManager.newName = "";
  projectManager.editingName = "";
  projectManager.deletingName = "";
  errorMessage.value = null;
  void nextTick(() => {
    projectCreateFormEl.value?.scrollIntoView({ behavior: "smooth", block: "center" });
    projectCreateFormEl.value?.querySelector<HTMLInputElement>("input")?.focus();
  });
}

async function createProjectFromManager() {
  const name = projectManager.newName.trim();
  const parentName = projectManager.newParentName || null;
  if (!name) {
    return;
  }
  if (projects.value.some((project) => project.name === name)) {
    errorMessage.value =
      language.value === "zh" ? "\u9879\u76ee\u540d\u79f0\u5df2\u5b58\u5728\u3002" : "That project name already exists.";
    return;
  }

  await taskRepository.createProject(name, parentName);
  if (parentName) {
    expandProjectTreeBranch(parentName);
  }
  projectManager.newName = "";
  projectManager.newParentName = "";
  errorMessage.value = null;
  await loadProjectAndTagSummaries();
}

async function saveProjectRename() {
  const oldName = projectManager.editingName;
  const newName = projectManager.draftName.trim();
  if (!oldName || !newName) {
    return;
  }
  if (newName !== oldName && projects.value.some((project) => project.name === newName)) {
    errorMessage.value =
      language.value === "zh" ? "\u9879\u76ee\u540d\u79f0\u5df2\u5b58\u5728\u3002" : "That project name already exists.";
    return;
  }

  if (oldName !== newName) {
    await taskRepository.renameProject(oldName, newName);
  }
  await taskRepository.moveProject(newName, projectManager.parentDraft || null);
  if (filters.project === oldName) {
    filters.project = newName;
  }
  if (form.projectSelection === oldName) {
    form.projectSelection = newName;
  }
  if (recurringForm.projectSelection === oldName) {
    recurringForm.projectSelection = newName;
  }
  if (recurringEditForm.projectSelection === oldName) {
    recurringEditForm.projectSelection = newName;
  }
  projectOrderKeys.value = projectOrderKeys.value.map((name) =>
    name === oldName ? newName : name,
  );
  kanbanProjectOrderKeys.value = Object.fromEntries(
    TASK_STATUSES.map((status) => [
      status,
      (kanbanProjectOrderKeys.value[status] ?? []).map((name) =>
        name === oldName ? newName : name,
      ),
    ]),
  ) as Record<TaskStatus, string[]>;
  localStorage.setItem(PROJECT_ORDER_KEY, JSON.stringify(projectOrderKeys.value));
  localStorage.setItem(KANBAN_PROJECT_ORDER_KEY, JSON.stringify(kanbanProjectOrderKeys.value));
  if (expandedProjectDetailNames.value.has(oldName)) {
    const nextNames = new Set(expandedProjectDetailNames.value);
    nextNames.delete(oldName);
    nextNames.add(newName);
    expandedProjectDetailNames.value = nextNames;
  }
  if (collapsedProjectTreeNames.value.has(oldName)) {
    const nextNames = new Set(collapsedProjectTreeNames.value);
    nextNames.delete(oldName);
    nextNames.add(newName);
    collapsedProjectTreeNames.value = nextNames;
  }
  if (projectManager.parentDraft) {
    expandProjectTreeBranch(projectManager.parentDraft);
  }
  errorMessage.value = null;
  cancelProjectRename();
  await loadTasks();
}

function toggleProjectDetails(name: string) {
  const nextNames = new Set(expandedProjectDetailNames.value);
  if (nextNames.has(name)) {
    nextNames.delete(name);
  } else {
    nextNames.add(name);
  }
  expandedProjectDetailNames.value = nextNames;
}

function isProjectDetailsExpanded(name: string) {
  return expandedProjectDetailNames.value.has(name);
}

function hasChildProjects(name: string) {
  return projects.value.some((project) => project.parentName === name);
}

function directChildProjectCount(name: string) {
  return projects.value.filter((project) => project.parentName === name).length;
}

function isProjectTreeBranchCollapsed(name: string) {
  return collapsedProjectTreeNames.value.has(name);
}

function toggleProjectTreeBranch(name: string) {
  const nextNames = new Set(collapsedProjectTreeNames.value);
  if (nextNames.has(name)) {
    nextNames.delete(name);
  } else {
    nextNames.add(name);
  }
  collapsedProjectTreeNames.value = nextNames;
}

function expandProjectTreeBranch(name: string) {
  if (!collapsedProjectTreeNames.value.has(name)) {
    return;
  }
  const nextNames = new Set(collapsedProjectTreeNames.value);
  nextNames.delete(name);
  collapsedProjectTreeNames.value = nextNames;
}

function collapseAllProjectBranches() {
  collapsedProjectTreeNames.value = new Set(
    projects.value.filter((project) => hasChildProjects(project.name)).map((project) => project.name),
  );
}

function expandAllProjectBranches() {
  collapsedProjectTreeNames.value = new Set();
}

function startProjectDelete(name: string) {
  projectManager.deletingName = projectManager.deletingName === name ? "" : name;
  projectManager.editingName = "";
}

function cancelProjectDelete() {
  projectManager.deletingName = "";
}

async function deleteProjectFromManager(name: string, mode: ProjectDeleteMode) {
  await taskRepository.deleteProject(name, mode);
  if (filters.project === name) {
    filters.project = "";
  }
  if (form.projectSelection === name) {
    form.projectSelection = "";
  }
  if (recurringForm.projectSelection === name) {
    recurringForm.projectSelection = "";
  }
  if (recurringEditForm.projectSelection === name) {
    recurringEditForm.projectSelection = "";
  }
  if (collapsedProjectTreeNames.value.has(name)) {
    const nextNames = new Set(collapsedProjectTreeNames.value);
    nextNames.delete(name);
    collapsedProjectTreeNames.value = nextNames;
  }
  projectManager.deletingName = "";
  await loadTasks();
  await loadDeletedTasks();
}

function beginTagRename(name: string) {
  tagManager.editingName = name;
  tagManager.draftName = name;
}

function cancelTagRename() {
  tagManager.editingName = "";
  tagManager.draftName = "";
}

async function createTagFromManager() {
  const name = tagManager.newName.trim();
  if (!name) {
    return;
  }

  await taskRepository.createTag(name);
  tagManager.newName = "";
  await loadProjectAndTagSummaries();
}

async function saveTagRename() {
  const oldName = tagManager.editingName;
  const newName = tagManager.draftName.trim();
  if (!oldName || !newName) {
    return;
  }

  await taskRepository.renameTag(oldName, newName);
  if (filters.tag === oldName) {
    filters.tag = newName;
  }
  if (form.tags.split(new RegExp(`[,\\uFF0C]`)).map((tag) => tag.trim()).includes(oldName)) {
    form.tags = form.tags
      .split(new RegExp(`[,\\uFF0C]`))
      .map((tag) => (tag.trim() === oldName ? newName : tag.trim()))
      .filter(Boolean)
      .join(", ");
  }
  cancelTagRename();
  await loadTasks();
}

function toggleTagDetails(name: string) {
  const nextNames = new Set(expandedTagDetailNames.value);
  if (nextNames.has(name)) {
    nextNames.delete(name);
  } else {
    nextNames.add(name);
  }
  expandedTagDetailNames.value = nextNames;
}

function isTagDetailsExpanded(name: string) {
  return expandedTagDetailNames.value.has(name);
}

async function deleteTagFromManager(name: string) {
  await taskRepository.deleteTag(name);
  if (filters.tag === name) {
    filters.tag = "";
  }
  form.tags = form.tags
    .split(new RegExp(`[,\\uFF0C]`))
    .map((tag) => tag.trim())
    .filter((tag) => tag && tag !== name)
    .join(", ");
  await loadTasks();
}

function tasksForProjectDetails(projectName: string) {
  const includedProjects = descendantProjectNames(projectName);
  return tasks.value
    .filter(
      (task) =>
        Boolean(task.projectName && includedProjects.has(task.projectName)) &&
        task.parentTaskId === null,
    )
    .sort(sortTasksByOrder);
}

function tasksForTagDetails(tagName: string) {
  return tasks.value
    .filter((task) => task.tags.includes(tagName) && task.parentTaskId === null)
    .sort(sortTasksByOrder);
}

function managerStatusClass(status: TaskStatus) {
  return {
    "manager-status-todo": status === "todo",
    "manager-status-doing": status === "doing",
    "manager-status-done": status === "done",
  };
}

function statusLabel(status: TaskStatus): string {
  if (status === "todo") {
    return text.value.todo;
  }

  if (status === "doing") {
    return text.value.doing;
  }

  return text.value.done;
}

function recurringTemplateSummary(template: RecurringTaskTemplate): string {
  return formatRecurringTemplateSummary(template, recurringTextContext());
}

function frequencyLabel(frequency: RecurringFrequency): string {
  return (
    recurringFrequencyOptions.value.find((option) => option.value === frequency)?.label ??
    frequency
  );
}

function recurringTextContext() {
  return {
    language: language.value,
    weekdayOptions: weekdayOptions.value,
    frequencyLabel,
  };
}

function navTitle(page: PageKey): string {
  return navItems.value.find((item) => item.key === page)?.label ?? text.value.kanban;
}

function readLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  return stored === "zh" || stored === "en" ? stored : "en";
}

function readThemeMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

function readAlwaysOnTop(): boolean {
  return localStorage.getItem(ALWAYS_ON_TOP_KEY) === "true";
}

function readTrashRetentionDays(): number {
  const stored = Number(localStorage.getItem(TRASH_RETENTION_DAYS_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : 30;
}

function readProjectOrder(): string[] {
  return readStringArraySetting(PROJECT_ORDER_KEY);
}

function readKanbanProjectOrder(): Record<TaskStatus, string[]> {
  const fallback = { todo: [], doing: [], done: [] };
  const raw = localStorage.getItem(KANBAN_PROJECT_ORDER_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Record<TaskStatus, unknown>>;
    return {
      todo: Array.isArray(parsed.todo) ? parsed.todo.filter(isString) : [],
      doing: Array.isArray(parsed.doing) ? parsed.doing.filter(isString) : [],
      done: Array.isArray(parsed.done) ? parsed.done.filter(isString) : [],
    };
  } catch {
    return fallback;
  }
}

function readStringArraySetting(key: string): string[] {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isString) : [];
  } catch {
    return [];
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function applyTheme(mode: ThemeMode) {
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;

  document.documentElement.dataset.theme = resolved;
}

async function prepareWindowControls() {
  if (!runningInTauri) {
    return;
  }

  const appWindow = getCurrentWindow();
  const refreshMaximizedState = async () => {
    isWindowMaximized.value = await appWindow.isMaximized();
  };
  await refreshMaximizedState();
  stopWindowResizeListener = await appWindow.onResized(() => {
    void refreshMaximizedState();
  });
}

async function minimizeWindow() {
  await getCurrentWindow().minimize();
}

async function toggleMaximizeWindow() {
  const appWindow = getCurrentWindow();
  await appWindow.toggleMaximize();
  isWindowMaximized.value = await appWindow.isMaximized();
}

async function closeWindow() {
  await getCurrentWindow().close();
}

async function applyAlwaysOnTop(value: boolean) {
  if (!runningInTauri) {
    alwaysOnTopError.value = false;
    return;
  }

  try {
    await getCurrentWindow().setAlwaysOnTop(value);
    alwaysOnTopError.value = false;
  } catch {
    alwaysOnTopError.value = value;
  }
}

async function exportTaskWeaveData() {
  isTransferringData.value = true;
  dataTransferFailed.value = false;
  dataTransferMessage.value = null;
  try {
    const backup = await taskRepository.exportData();
    const blobUrl = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `TaskWeave-backup-${todayIsoDate()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
    dataTransferMessage.value =
      language.value === "zh"
        ? "\u6570\u636e\u6587\u4ef6\u5df2\u5bfc\u51fa\uff0c\u53ef\u5728\u684c\u9762\u7248\u4e2d\u5bfc\u5165\u3002"
        : "Data file exported. You can now import it into the desktop app.";
  } catch (error) {
    dataTransferFailed.value = true;
    dataTransferMessage.value = messageFromError(
      error,
      language.value === "zh" ? "\u6570\u636e\u5bfc\u51fa\u5931\u8d25" : "Data export failed",
    );
  } finally {
    isTransferringData.value = false;
  }
}

function chooseTaskWeaveDataFile() {
  dataTransferInput.value?.click();
}

async function importTaskWeaveData(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  isTransferringData.value = true;
  dataTransferFailed.value = false;
  dataTransferMessage.value = null;
  try {
    const backup = parseTaskWeaveBackup(await file.text());
    const imported = await taskRepository.importData(backup);
    await Promise.all([
      loadTasks(),
      loadDeletedTasks(),
      loadProjectAndTagSummaries(),
      loadRecurringTemplates(),
    ]);
    dataTransferMessage.value =
      language.value === "zh"
        ? `导入完成：${imported.tasks} 个任务、${imported.projects} 个项目、${imported.tags} 个标签、${imported.recurringTemplates} 个重复模板、${imported.reminders ?? 0} 条提醒。`
        : `Imported ${imported.tasks} tasks, ${imported.projects} projects, ${imported.tags} tags, ${imported.recurringTemplates} recurring templates, and ${imported.reminders ?? 0} reminders.`;
  } catch (error) {
    dataTransferFailed.value = true;
    dataTransferMessage.value = messageFromError(
      error,
      language.value === "zh"
        ? "\u65e0\u6cd5\u8bfb\u53d6\u8be5\u6570\u636e\u6587\u4ef6"
        : "The selected data file could not be imported",
    );
  } finally {
    input.value = "";
    isTransferringData.value = false;
  }
}
</script>

<template>
  <div class="desktop-frame" :class="{ 'is-tauri': runningInTauri }">
    <header v-if="runningInTauri" class="window-titlebar">
      <div
        class="window-drag-region"
        data-tauri-drag-region
        @dblclick="toggleMaximizeWindow"
      >
        <span class="window-app-mark" data-tauri-drag-region>T</span>
        <strong data-tauri-drag-region>TaskWeave</strong>
        <span v-if="alwaysOnTop" class="window-pinned-label" data-tauri-drag-region>
          {{ language === 'zh' ? '\u5df2\u7f6e\u9876' : 'Pinned' }}
        </span>
      </div>
      <div class="window-controls">
        <button
          class="window-control pin-control"
          :class="{ active: alwaysOnTop, error: alwaysOnTopError }"
          type="button"
          :title="language === 'zh' ? (alwaysOnTop ? '\u53d6\u6d88\u59cb\u7ec8\u7f6e\u9876' : '\u59cb\u7ec8\u7f6e\u9876') : (alwaysOnTop ? 'Stop keeping on top' : 'Always on top')"
          :aria-pressed="alwaysOnTop"
          @click="alwaysOnTop = !alwaysOnTop"
        >
          <PinOff v-if="alwaysOnTop" :size="15" aria-hidden="true" />
          <Pin v-else :size="15" aria-hidden="true" />
        </button>
        <button
          class="window-control"
          type="button"
          :title="language === 'zh' ? '\u6700\u5c0f\u5316' : 'Minimize'"
          @click="minimizeWindow"
        >
          <Minus :size="16" aria-hidden="true" />
        </button>
        <button
          class="window-control"
          :class="{ active: isWindowMaximized }"
          type="button"
          :title="language === 'zh' ? (isWindowMaximized ? '\u8fd8\u539f' : '\u6700\u5927\u5316') : (isWindowMaximized ? 'Restore' : 'Maximize')"
          @click="toggleMaximizeWindow"
        >
          <Copy v-if="isWindowMaximized" :size="13" aria-hidden="true" />
          <Square v-else :size="13" aria-hidden="true" />
        </button>
        <button
          class="window-control close-control"
          type="button"
          :title="language === 'zh' ? '\u5173\u95ed\u5230\u7cfb\u7edf\u6258\u76d8' : 'Close to system tray'"
          @click="closeWindow"
        >
          <X :size="17" aria-hidden="true" />
        </button>
      </div>
    </header>

    <main class="app-shell">
    <aside class="sidebar" :aria-label="language === 'zh' ? '功能导航' : 'Primary navigation'">
      <div class="brand">
        <div class="brand-mark">T</div>
        <div class="brand-copy">
          <h1>TaskWeave</h1>
          <p>{{ text.localWorkspace }}</p>
        </div>
      </div>

      <nav class="nav-list">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: activePage === item.key }"
          type="button"
          :title="item.label"
          :aria-label="item.label"
          :aria-current="activePage === item.key ? 'page' : undefined"
          @click="activePage = item.key; reminderTaskId = null"
        >
          <component :is="item.icon" :size="18" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
        <button
          class="nav-item support-nav-item"
          type="button"
          :title="language === 'zh' ? '请开发者喝杯饮料' : 'Buy the developer a drink'"
          :aria-label="language === 'zh' ? '请开发者喝杯饮料' : 'Buy the developer a drink'"
          aria-haspopup="dialog"
          @click="isSupportOpen = true"
        >
          <Heart :size="18" aria-hidden="true" />
          <span>{{ language === 'zh' ? '请开发者喝杯饮料' : 'Buy the dev a drink' }}</span>
        </button>
      </nav>
    </aside>

    <section v-page-motion="activePage" class="workspace">
      <aside v-if="availableUpdate && activePage !== 'settings'" class="update-banner">
        <div>
          <strong>
            {{ language === 'zh' ? `TaskWeave v${availableUpdate.version} 可以更新` : `TaskWeave ${availableUpdate.version} is available` }}
          </strong>
          <span>{{ language === 'zh' ? '由您决定何时下载安装；安装时软件会重新启动。' : 'Install when you are ready. TaskWeave will restart during the update.' }}</span>
        </div>
        <button
          class="primary-button"
          type="button"
          :disabled="updateStatus === 'downloading'"
          @click="downloadAndInstallUpdate"
        >
          <Download :size="15" aria-hidden="true" />
          {{ updateStatus === 'downloading' ? updateStatusText : (language === 'zh' ? '下载并安装' : 'Download and install') }}
        </button>
      </aside>
      <template v-if="activePage === 'kanban'">
        <aside v-if="showGuideHint" class="guide-welcome" :aria-label="text.help">
          <BookOpen :size="22" aria-hidden="true" />
          <div class="guide-welcome-copy">
            <strong>{{ language === 'zh' ? '使用指南' : 'User guide' }}</strong>
            <p>{{ language === 'zh' ? '从新建到完成一个任务，再了解如何整理和回顾工作。' : 'Create a task, work on it, and mark it done. Then organize and review your work.' }}</p>
          </div>
          <button class="worked-button" type="button" @click="activePage = 'help'">
            {{ language === 'zh' ? '查看指南' : 'Open guide' }}
          </button>
          <button class="icon-button small" type="button" :title="language === 'zh' ? '收起提示' : 'Dismiss hint'" @click="dismissGuideHint">
            <X :size="16" aria-hidden="true" />
          </button>
        </aside>

        <div
          v-if="isCreateFormOpen && isTaskFormModal && pausedCreateForm"
          class="task-create-shell task-create-preview-shell"
          aria-hidden="true"
        >
          <div class="task-form task-form-create task-form-paused">
            <div class="form-heading">
              <div>
                <h3>{{ text.newTask }}</h3>
              </div>
              <span class="form-mode-pill create">
                {{ language === 'zh' ? '\u4fdd\u6301\u6253\u5f00' : 'Still open' }}
              </span>
            </div>

            <div class="form-content">
              <label class="field title-field">
                <span>{{ text.taskName }}</span>
                <input
                  :value="pausedCreateForm.title"
                  :placeholder="text.taskPlaceholder"
                  disabled
                />
              </label>

              <div class="toggle-row">
                <button
                  class="toggle-field importance-toggle"
                  :class="{ active: pausedCreateForm.isImportant }"
                  type="button"
                  disabled
                >
                  <span class="switch-track" aria-hidden="true">
                    <span class="switch-thumb"></span>
                  </span>
                  <span>{{ text.important }}</span>
                </button>
                <button
                  class="toggle-field urgency-toggle"
                  :class="{ active: pausedCreateForm.isUrgent }"
                  type="button"
                  disabled
                >
                  <span class="switch-track" aria-hidden="true">
                    <span class="switch-thumb"></span>
                  </span>
                  <span>{{ text.urgent }}</span>
                </button>
              </div>

              <label class="field">
                <span>{{ text.project }}</span>
                <input
                  :value="selectLabel(projectSelectOptions, pausedCreateForm.projectSelection)"
                  disabled
                />
              </label>

              <label class="field">
                <span>{{ text.due }}</span>
                <DateInput :model-value="pausedCreateForm.dueDate" :language="language" disabled />
              </label>

              <button class="primary-button save-button" type="button" disabled>
                <Save :size="18" aria-hidden="true" />
                <span>{{ text.save }}</span>
              </button>
            </div>
          </div>
        </div>

        <Transition name="tw-overlay">
        <div
          v-if="isTaskFormVisible"
          :class="{
            'task-form-backdrop': isTaskFormModal,
            'task-create-shell': !isTaskFormModal,
          }"
          @pointerdown.capture="trackTaskFormPress"
          @click="dismissTaskFormFromBackdrop($event, resetForm)"
        >
        <form
          class="task-form"
          :class="{
            'task-form-create': !isEditing && !childParentTask,
            'task-form-editing': isEditing,
            'task-form-child': childParentTask,
            'task-form-modal': isTaskFormModal,
          }"
          @submit.prevent="saveTask"
        >
          <div class="form-heading">
            <div>
              <h3>{{ formTitle() }}</h3>
            </div>
            <button v-if="selectedTask && form.status !== 'done'" class="task-edit-button" type="button" @click="openTaskReminders(selectedTask)"><Bell :size="14" aria-hidden="true" />{{language === 'zh' ? '设置提醒' : 'Set reminder'}}</button>
            <span
              v-if="isEditing"
              class="form-mode-pill editing"
              :title="formModeTaskName()"
            >
              {{ formModeTaskName() }}
            </span>
            <span
              v-else-if="childParentTask"
              class="form-mode-pill child"
              :title="formModeTaskName()"
            >
              {{ formModeTaskName() }}
            </span>
            <button
              v-if="isEditing || childParentTask || isCreateFormOpen"
              class="icon-button small"
              type="button"
              :title="text.cancelEditing"
              @click="resetForm"
            >
              <X :size="16" aria-hidden="true" />
            </button>
          </div>

          <div class="form-content">
            <label class="field title-field">
              <span>{{ text.taskName }}</span>
              <input v-model="form.title" :placeholder="text.taskPlaceholder" />
            </label>

            <label v-if="isChildForm" class="field">
              <span>{{ language === 'zh' ? '\u5b50\u4efb\u52a1\u5206\u7c7b' : 'Child category' }}</span>
              <input
                v-model="form.childCategory"
                list="child-category-options"
                :placeholder="language === 'zh' ? '\u4f8b\uff1a\u8bbe\u8ba1 / \u5b9e\u73b0 / \u68c0\u67e5' : 'e.g. Design / Build / Review'"
              />
              <datalist id="child-category-options">
                <option
                  v-for="category in childCategoryOptions"
                  :key="category"
                  :value="category"
                />
              </datalist>
            </label>

            <div v-if="!isChildForm" class="toggle-row">
              <button
                class="toggle-field importance-toggle"
                :class="{ active: form.isImportant }"
                type="button"
                @click="form.isImportant = !form.isImportant"
              >
                <span class="switch-track" aria-hidden="true">
                  <span class="switch-thumb"></span>
                </span>
                <span>{{ text.important }}</span>
              </button>
              <button
                class="toggle-field urgency-toggle"
                :class="{ active: form.isUrgent }"
                type="button"
                @click="form.isUrgent = !form.isUrgent"
              >
                <span class="switch-track" aria-hidden="true">
                  <span class="switch-thumb"></span>
                </span>
                <span>{{ text.urgent }}</span>
              </button>
            </div>

            <label v-if="!isChildForm" class="field">
              <span>{{ text.project }}</span>
              <div class="custom-select">
                <button
                  class="custom-select-trigger"
                  :class="{ open: isCustomSelectOpen('form-project') }"
                  type="button"
                  @click.stop="toggleCustomSelect('form-project')"
                >
                  <span>{{ selectLabel(projectSelectOptions, form.projectSelection) }}</span>
                  <ChevronDown :size="15" aria-hidden="true" />
                </button>
                <Transition name="tw-popover">
                <div v-if="isCustomSelectOpen('form-project')" class="custom-select-menu">
                  <button
                    v-for="option in projectSelectOptions"
                    :key="option.value"
                    class="custom-select-option"
                    :class="{ active: form.projectSelection === option.value }"
                    type="button"
                    @click.stop="selectFormProject(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
                </Transition>
              </div>
            </label>

            <label
              v-if="!isChildForm && form.projectSelection === NEW_PROJECT_VALUE"
              class="field new-project-field"
            >
              <span>{{ language === 'zh' ? '\u9879\u76ee\u540d' : 'Project name' }}</span>
              <input
                v-model="form.newProjectName"
                :placeholder="language === 'zh' ? '\u8f93\u5165\u65b0\u9879\u76ee' : 'Name this project'"
              />
            </label>

            <label class="field">
              <span>{{ text.due }}</span>
              <DateInput v-model="form.dueDate" :language="language" />
            </label>

            <button class="primary-button save-button" type="submit">
              <Save :size="18" aria-hidden="true" />
              <span>{{ isEditing ? text.update : text.save }}</span>
            </button>

            <button
              class="advanced-toggle"
              type="button"
              :class="{ active: showAdvancedSettings }"
              @click="showAdvancedSettings = !showAdvancedSettings"
            >
              <ChevronDown :size="14" aria-hidden="true" />
              <span>{{ language === 'zh' ? '\u66f4\u591a\u8bbe\u7f6e' : 'More settings' }}</span>
            </button>

            <ExpandTransition>
            <div
              v-if="showAdvancedSettings"
              class="advanced-fields"
            >
              <div class="advanced-grid">
                <label
                  v-if="isTaskFormModal"
                  class="field description-field modal-description-field"
                >
                  <span>{{ language === 'zh' ? '\u63cf\u8ff0' : 'Description' }}</span>
                  <textarea
                    v-model="form.description"
                    :title="descriptionKeyboardHint"
                    :aria-description="descriptionKeyboardHint"
                    @keydown="insertDescriptionTab"
                    :placeholder="language === 'zh' ? '\u8865\u5145\u4efb\u52a1\u7ec6\u8282' : 'Add task details'"
                    rows="6"
                  ></textarea>
                </label>

                <label class="field">
                  <span>{{ text.status }}</span>
                  <div class="custom-select">
                    <button
                      class="custom-select-trigger"
                      :class="{ open: isCustomSelectOpen('form-status') }"
                      type="button"
                      @click.stop="toggleCustomSelect('form-status')"
                    >
                      <span>{{ selectLabel(statusSelectOptions, form.status) }}</span>
                      <ChevronDown :size="15" aria-hidden="true" />
                    </button>
                    <Transition name="tw-popover">
                    <div v-if="isCustomSelectOpen('form-status')" class="custom-select-menu">
                      <button
                        v-for="option in statusSelectOptions"
                        :key="option.value"
                        class="custom-select-option"
                        :class="{ active: form.status === option.value }"
                        type="button"
                        @click.stop="selectFormStatus(option.value)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                    </Transition>
                  </div>
                </label>

                <label v-if="form.status === 'done'" class="field">
                  <span>{{ language === 'zh' ? '\u5b8c\u6210\u65e5\u671f' : 'Completion date' }}</span>
                  <DateInput
                    v-model="form.completionDate"
                    :language="language"
                    :max="todayIsoDate()"
                  />
                </label>

                <label class="field">
                  <span>{{ text.start }}</span>
                  <DateInput v-model="form.startDate" :language="language" />
                </label>
                <label class="field"><span>{{language==='zh'?'开始时间（可选）':'Start time (optional)'}}</span><input v-model="form.startTime" type="time" step="60" /></label>
                <label class="field"><span>{{language==='zh'?'截止时间（可选）':'Due time (optional)'}}</span><input v-model="form.dueTime" type="time" step="60" :disabled="!form.dueDate" /></label>

                <label v-if="!isChildForm" class="field tags-field">
                  <span>{{ text.tags }}</span>
                  <input v-model="form.tags" :placeholder="text.tagsPlaceholder" />
                </label>

                <label v-if="!isTaskFormModal" class="field description-field">
                  <span>{{ language === 'zh' ? '\u63cf\u8ff0' : 'Description' }}</span>
                  <textarea
                    v-model="form.description"
                    :title="descriptionKeyboardHint"
                    :aria-description="descriptionKeyboardHint"
                    @keydown="insertDescriptionTab"
                    :placeholder="language === 'zh' ? '\u8865\u5145\u4efb\u52a1\u7ec6\u8282' : 'Add task details'"
                    rows="3"
                  ></textarea>
                </label>
              </div>
            </div>
            </ExpandTransition>
          </div>
        </form>
        </div>
        </Transition>

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

        <div class="filterbar" aria-label="Filters">
          <label class="filter-search">
            <Search :size="16" aria-hidden="true" />
            <input v-model="filters.query" :placeholder="text.search" />
          </label>

          <label class="filter-field">
            <Filter :size="16" aria-hidden="true" />
            <div class="custom-select compact-select">
              <button
                class="custom-select-trigger"
                :class="{ open: isCustomSelectOpen('filter-importance') }"
                type="button"
                @click.stop="toggleCustomSelect('filter-importance')"
              >
                <span>{{ selectLabel(importanceFilterOptions, filters.importance) }}</span>
                <ChevronDown :size="14" aria-hidden="true" />
              </button>
              <Transition name="tw-popover">
              <div v-if="isCustomSelectOpen('filter-importance')" class="custom-select-menu">
                <button
                  v-for="option in importanceFilterOptions"
                  :key="option.value"
                  class="custom-select-option"
                  :class="{ active: filters.importance === option.value }"
                  type="button"
                  @click.stop="selectImportanceFilter(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              </Transition>
            </div>
          </label>

          <label class="filter-field">
            <Filter :size="16" aria-hidden="true" />
            <div class="custom-select compact-select">
              <button
                class="custom-select-trigger"
                :class="{ open: isCustomSelectOpen('filter-urgency') }"
                type="button"
                @click.stop="toggleCustomSelect('filter-urgency')"
              >
                <span>{{ selectLabel(urgencyFilterOptions, filters.urgency) }}</span>
                <ChevronDown :size="14" aria-hidden="true" />
              </button>
              <Transition name="tw-popover">
              <div v-if="isCustomSelectOpen('filter-urgency')" class="custom-select-menu">
                <button
                  v-for="option in urgencyFilterOptions"
                  :key="option.value"
                  class="custom-select-option"
                  :class="{ active: filters.urgency === option.value }"
                  type="button"
                  @click.stop="selectUrgencyFilter(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              </Transition>
            </div>
          </label>

          <label class="filter-field">
            <Inbox :size="16" aria-hidden="true" />
            <div class="custom-select compact-select">
              <button
                class="custom-select-trigger"
                :class="{ open: isCustomSelectOpen('filter-project') }"
                type="button"
                @click.stop="toggleCustomSelect('filter-project')"
              >
                <span>{{ selectLabel(projectFilterOptions, filters.project) }}</span>
                <ChevronDown :size="14" aria-hidden="true" />
              </button>
              <Transition name="tw-popover">
              <div v-if="isCustomSelectOpen('filter-project')" class="custom-select-menu">
                <button
                  v-for="option in projectFilterOptions"
                  :key="option.value"
                  class="custom-select-option"
                  :class="{ active: filters.project === option.value }"
                  type="button"
                  @click.stop="selectProjectFilter(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              </Transition>
            </div>
          </label>

          <label class="filter-field">
            <Tags :size="16" aria-hidden="true" />
            <div class="custom-select compact-select">
              <button
                class="custom-select-trigger"
                :class="{ open: isCustomSelectOpen('filter-tag') }"
                type="button"
                @click.stop="toggleCustomSelect('filter-tag')"
              >
                <span>{{ selectLabel(tagFilterOptions, filters.tag) }}</span>
                <ChevronDown :size="14" aria-hidden="true" />
              </button>
              <Transition name="tw-popover">
              <div v-if="isCustomSelectOpen('filter-tag')" class="custom-select-menu">
                <button
                  v-for="option in tagFilterOptions"
                  :key="option.value"
                  class="custom-select-option"
                  :class="{ active: filters.tag === option.value }"
                  type="button"
                  @click.stop="selectTagFilter(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              </Transition>
            </div>
          </label>

          <label class="filter-field">
            <CalendarDays :size="16" aria-hidden="true" />
            <div class="custom-select compact-select">
              <button
                class="custom-select-trigger"
                :class="{ open: isCustomSelectOpen('filter-overdue') }"
                type="button"
                @click.stop="toggleCustomSelect('filter-overdue')"
              >
                <span>{{ selectLabel(overdueFilterOptions, filters.overdue) }}</span>
                <ChevronDown :size="14" aria-hidden="true" />
              </button>
              <Transition name="tw-popover">
              <div v-if="isCustomSelectOpen('filter-overdue')" class="custom-select-menu">
                <button
                  v-for="option in overdueFilterOptions"
                  :key="option.value"
                  class="custom-select-option"
                  :class="{ active: filters.overdue === option.value }"
                  type="button"
                  @click.stop="selectOverdueFilter(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              </Transition>
            </div>
          </label>

          <button
            v-if="hasActiveFilters"
            class="filter-clear"
            type="button"
            @click="clearFilters"
          >
            <X :size="15" aria-hidden="true" />
            <span>{{ language === 'zh' ? '\u6e05\u9664' : 'Clear' }}</span>
          </button>

          <button
            class="filter-add-button"
            :class="{ active: isCreateFormOpen }"
            type="button"
            @click="openCreateTaskForm"
          >
            <Plus :size="17" aria-hidden="true" />
            <span>{{ language === 'zh' ? '\u65b0\u5efa' : 'New' }}</span>
          </button>
        </div>

        <section class="board" aria-label="Kanban board">
          <article v-for="column in columns" :key="column.status" class="column">
            <header class="column-header">
              <h3>{{ column.title }}</h3>
              <span>{{ taskCountForStatus(column.status) }}</span>
            </header>

            <section
              v-if="column.status === 'done'"
              class="done-history-panel"
              :class="{ active: doneHistory.enabled }"
              aria-label="Done history"
            >
              <div class="done-history-head">
                <button
                  class="done-history-toggle"
                  :class="{ active: doneHistory.enabled }"
                  type="button"
                  @click="doneHistory.enabled = !doneHistory.enabled"
                >
                  <Check :size="15" aria-hidden="true" />
                  <span>{{ language === 'zh' ? '\u5386\u53f2\u5b8c\u6210' : 'Done history' }}</span>
                </button>
                <button
                  class="done-history-reset"
                  type="button"
                  @click="resetDoneHistoryRange"
                >
                  {{ language === 'zh' ? '\u6700\u8fd130\u5929' : 'Last 30 days' }}
                </button>
              </div>

              <div class="done-history-range">
                <label>
                  <span>{{ language === 'zh' ? '\u5b8c\u6210\u4ece' : 'Done from' }}</span>
                  <DateInput
                    v-model="doneHistory.fromDate"
                    :language="language"
                    :disabled="!doneHistory.enabled"
                  />
                </label>
                <label>
                  <span>{{ language === 'zh' ? '\u5230' : 'To' }}</span>
                  <DateInput
                    v-model="doneHistory.toDate"
                    :language="language"
                    :disabled="!doneHistory.enabled"
                  />
                </label>
              </div>
            </section>

            <div
              class="task-list"
              :class="{ 'column-drag-over': dragOverColumnStatus === column.status && !dragOverTaskId }"
              @dragover.prevent="dragTaskOverColumn(column.status)"
              @dragleave="dragTaskLeaveColumn(column.status)"
              @drop.capture="dropTaskOnColumn(column.status, $event)"
            >
              <p v-if="isLoading" class="empty-state">{{ text.loadingTasks }}</p>
              <p
                v-else-if="taskCountForStatus(column.status) === 0"
                class="empty-state"
              >
                {{ text.noTasks }}
              </p>

              <section
                v-for="group in projectGroupsForStatus(column.status)"
                v-else
                :key="group.projectKey"
                class="project-task-group"
              >
                <button
                  class="project-group-toggle"
                  :class="{
                    dragging: isDraggingKanbanProject(column.status, group.projectKey),
                    'drag-over': isDragOverKanbanProject(column.status, group.projectKey),
                  }"
                  type="button"
                  draggable="true"
                  :title="language === 'zh' ? '\u62d6\u52a8\u8c03\u6574\u9879\u76ee\u987a\u5e8f' : 'Drag to reorder projects'"
                  @dragstart="dragKanbanProjectStart($event, column.status, group.projectKey)"
                  @dragenter.prevent="dragKanbanProjectOver(column.status, group.projectKey)"
                  @dragover.prevent="dragKanbanProjectOver(column.status, group.projectKey)"
                  @dragleave="dragKanbanProjectLeave(column.status, group.projectKey)"
                  @drop.prevent="dropKanbanProjectOn(column.status, group.projectKey)"
                  @dragend="dragKanbanProjectEnd"
                  @click="toggleKanbanProjectGroup(column.status, group.projectKey)"
                >
                  <GripVertical :size="15" aria-hidden="true" />
                  <FolderKanban :size="15" aria-hidden="true" />
                  <span>{{ group.projectName }}</span>
                  <strong>{{ group.tasks.length }}</strong>
                  <ChevronDown
                    :class="{ open: !isKanbanProjectGroupCollapsed(column.status, group.projectKey) }"
                    :size="15"
                    aria-hidden="true"
                  />
                </button>

                <ExpandTransition>
                <div
                  v-show="!isKanbanProjectGroupCollapsed(column.status, group.projectKey)"
                  class="project-task-list"
                >
                  <article
                    v-for="task in group.tasks"
                    :key="task.id"
                class="task-card"
                :class="{
                  'matrix-important': task.isImportant,
                  'matrix-not-important': !task.isImportant,
                  'matrix-urgent': task.isUrgent,
                  'matrix-not-urgent': !task.isUrgent,
                  dragging: draggingTaskId === task.id,
                  'drag-over': dragOverTaskId === task.id,
                }"
                @dragover.prevent="dragTaskOver(task)"
                @dragenter.prevent="dragTaskOver(task)"
                @dragleave="dragTaskLeave(task)"
                @drop.stop="dropTaskOn(task)"
              >
                <div class="task-card-header">
                  <button
                    class="drag-handle"
                    type="button"
                    draggable="true"
                    :title="language === 'zh' ? '\u62d6\u52a8\u6392\u5e8f' : 'Drag to reorder'"
                    @dragstart="dragTaskStart($event, task)"
                    @dragend="dragTaskEnd"
                  >
                    <GripVertical :size="16" aria-hidden="true" />
                  </button>
                  <button class="task-title" type="button" @click="editTask(task)">
                    <span
                      class="task-title-text"
                      :class="{ selected: selectedTaskId === task.id }"
                    >
                      {{ task.title }}
                    </span>
                    <span
                      v-if="selectedTaskId === task.id"
                      class="title-toggle-hint"
                    >
                      {{ language === 'zh' ? '\u518d\u70b9\u9000\u51fa' : 'Click again to exit' }}
                    </span>
                  </button>
                  <div class="task-header-actions">
                    <span v-if="task.isOverdue" class="overdue">
                      {{ text.overdue }}
                    </span>
                    <button
                      class="icon-button small expand-button"
                      :class="{ open: isExpanded(task.id) }"
                      type="button"
                      :title="language === 'zh' ? '\u5c55\u5f00\u8be6\u60c5' : 'Toggle details'"
                      @click="toggleExpanded(task.id)"
                    >
                      <ChevronDown :size="16" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <footer class="task-actions inline-actions">
                  <button
                    class="worked-button"
                    :class="{ active: task.workedToday }"
                    type="button"
                    :title="text.today"
                    @click="toggleToday(task)"
                  >
                    <Check :size="16" aria-hidden="true" />
                    <span>{{ text.today }}</span>
                  </button>
                  <button
                    class="task-edit-button task-edit-icon"
                    type="button"
                    :title="language === 'zh' ? '编辑任务' : 'Edit task'"
                    :aria-label="language === 'zh' ? '编辑任务' : 'Edit task'"
                    @click="editTask(task)"
                  >
                    <Pencil :size="14" aria-hidden="true" />
                  </button>
                  <button
                    v-if="TASK_SPLITTING_ENABLED"
                    class="icon-button small"
                    :class="{ 'split-active': isSplittingTask(task.id) }"
                    type="button"
                    :title="text.splitTask"
                    @click="startChildTask(task)"
                  >
                    <ListPlus :size="16" aria-hidden="true" />
                  </button>
                  <button
                    class="icon-button small danger-action"
                    type="button"
                    :title="language === 'zh' ? '\u5220\u9664\u4efb\u52a1' : 'Delete task'"
                    @click="deleteTask(task)"
                  >
                    <Trash2 :size="16" aria-hidden="true" />
                  </button>
                </footer>

                <ExpandTransition>
                <div v-if="isExpanded(task.id)" class="task-detail-panel">
                  <section class="detail-block detail-description">
                    <span>{{ language === 'zh' ? '\u63cf\u8ff0' : 'Description' }}</span>
                    <p>
                      {{
                        task.description ||
                        (language === 'zh' ? '\u6682\u65e0\u63cf\u8ff0' : 'No description')
                      }}
                    </p>
                  </section>

                  <section class="detail-block">
                    <span>{{ text.due }}</span>
                    <strong>{{ dueDateSummary(task) }}</strong>
                  </section>

                  <section v-if="task.completionDate" class="detail-block">
                    <span>{{ language === 'zh' ? '\u5b8c\u6210\u65e5\u671f' : 'Completion date' }}</span>
                    <strong>{{ task.completionDate }}</strong>
                  </section>

                  <section class="detail-block">
                    <span>{{ text.tags }}</span>
                    <div v-if="task.tags.length > 0" class="tag-row detail-tags">
                      <span v-for="tag in task.tags" :key="tag">#{{ tag }}</span>
                    </div>
                    <strong v-else>{{ language === 'zh' ? '\u65e0\u6807\u7b7e' : 'No tags' }}</strong>
                  </section>
                </div>
                </ExpandTransition>

                <section
                  v-if="boardChildTaskCount(task.id) > 0"
                  class="child-task-list"
                  :class="{ collapsed: !isChildListExpanded(task.id) }"
                >
                  <button
                    class="child-list-toggle"
                    type="button"
                    @click="toggleChildList(task.id)"
                  >
                    <ChevronDown
                      :class="{ open: isChildListExpanded(task.id) }"
                      :size="14"
                      aria-hidden="true"
                    />
                    <span>{{ language === 'zh' ? '\u5b50\u4efb\u52a1' : 'Child tasks' }}</span>
                    <strong class="child-count-badge">{{ boardChildTaskCount(task.id) }}</strong>
                    <em>
                      {{
                        isChildListExpanded(task.id)
                          ? (language === 'zh' ? '\u6298\u53e0' : 'Collapse')
                          : (language === 'zh' ? '\u5c55\u5f00' : 'Expand')
                      }}
                    </em>
                  </button>

                  <template
                    v-for="childGroup in visibleChildCategoryGroupsFor(task.id)"
                    :key="childGroup.categoryKey"
                  >
                    <div class="child-category-header">
                      <span>{{ childGroup.categoryName }}</span>
                      <strong>{{ childGroup.entries.length }}</strong>
                    </div>

                    <article
                      v-for="childEntry in childGroup.entries"
                      :key="childEntry.task.id"
                    class="child-task"
                    :class="{
                      dragging: draggingTaskId === childEntry.task.id,
                      'drag-over': dragOverTaskId === childEntry.task.id,
                    }"
                    :style="{ marginLeft: `${childEntry.depth * 14}px` }"
                    @dragover.prevent.stop="dragTaskOver(childEntry.task)"
                    @dragenter.prevent.stop="dragTaskOver(childEntry.task)"
                    @dragleave.stop="dragTaskLeave(childEntry.task)"
                    @drop.stop="dropTaskOn(childEntry.task)"
                  >
                    <div class="child-task-main">
                      <button
                        v-if="boardChildTaskCount(childEntry.task.id) > 0"
                        class="icon-button small expand-button"
                        :class="{ open: isChildListExpanded(childEntry.task.id) }"
                        type="button"
                        :title="language === 'zh' ? '\u5c55\u5f00\u5b50\u4efb\u52a1' : 'Toggle child tasks'"
                        @click="toggleChildList(childEntry.task.id)"
                      >
                        <ChevronDown :size="14" aria-hidden="true" />
                      </button>
                      <span
                        v-else
                        class="child-indent-spacer"
                        aria-hidden="true"
                      ></span>
                      <button
                        class="drag-handle child-drag-handle"
                        type="button"
                        draggable="true"
                        :title="language === 'zh' ? '\u62d6\u52a8\u6392\u5e8f' : 'Drag to reorder'"
                        @dragstart.stop="dragTaskStart($event, childEntry.task)"
                        @dragend.stop="dragTaskEnd"
                      >
                        <GripVertical :size="14" aria-hidden="true" />
                      </button>
                      <button
                        class="task-title child-title"
                        type="button"
                        @click="editTask(childEntry.task)"
                      >
                        <span
                          class="task-title-text"
                          :class="{ selected: selectedTaskId === childEntry.task.id }"
                        >
                          {{ childEntry.task.title }}
                        </span>
                        <span
                          v-if="selectedTaskId === childEntry.task.id"
                          class="title-toggle-hint"
                        >
                          {{ language === 'zh' ? '\u518d\u70b9\u9000\u51fa' : 'Click again to exit' }}
                        </span>
                      </button>
                      <span v-if="childEntry.task.isOverdue" class="overdue">
                        {{ text.overdue }}
                      </span>
                    </div>

                    <footer class="child-actions">
                      <button
                        class="worked-button"
                        :class="{ active: childEntry.task.workedToday }"
                        type="button"
                        :title="text.today"
                        @click="toggleToday(childEntry.task)"
                      >
                        <Check :size="14" aria-hidden="true" />
                        <span>{{ text.today }}</span>
                      </button>
                      <button
                        class="task-edit-button task-edit-icon"
                        type="button"
                        :title="language === 'zh' ? '编辑任务' : 'Edit task'"
                        :aria-label="language === 'zh' ? '编辑任务' : 'Edit task'"
                        @click="editTask(childEntry.task)"
                      >
                        <Pencil :size="14" aria-hidden="true" />
                      </button>
                      <button
                        v-if="TASK_SPLITTING_ENABLED"
                        class="icon-button small"
                        :class="{ 'split-active': isSplittingTask(childEntry.task.id) }"
                        type="button"
                        :title="text.splitTask"
                        @click="startChildTask(childEntry.task)"
                      >
                        <ListPlus :size="14" aria-hidden="true" />
                      </button>
                      <button
                        class="icon-button small danger-action"
                        type="button"
                        :title="language === 'zh' ? '\u5220\u9664\u4efb\u52a1' : 'Delete task'"
                        @click="deleteTask(childEntry.task)"
                      >
                        <Trash2 :size="14" aria-hidden="true" />
                      </button>
                    </footer>
                  </article>
                  </template>
                </section>
              </article>
                </div>
                </ExpandTransition>
              </section>
            </div>
          </article>
        </section>
      </template>

      <template v-else-if="activePage === 'gantt'">
        <GanttPage
          :language="language"
          :rows="ganttChartRows()"
          v-model:range-start-date="ganttRangeStartDate"
          v-model:range-end-date="ganttRangeEndDate"
          :today-iso="currentIsoDate"
          :selected-task="selectedGanttTask"
          :labels="ganttPageLabels()"
          :chart-height="Math.max(380, ganttTaskEntries.length * 48 + 120)"
          :format-weekday="formatGanttWeekday"
          :status-label="statusLabel"
          :project-label="projectDisplayName"
          :task-count-label="ganttTaskCountLabel"
          @previous="shiftGanttWindow(-14)"
          @today="resetGanttWindow"
          @next="shiftGanttWindow(14)"
          @task-click="handleGanttTaskClick"
          @activity-toggle="toggleActivity"
          @project-order-change="setProjectOrder"
          @task-order-change="reorderGanttTasks"
          @project-opened="expandProjectGroup"
          @project-closed="collapseProjectGroup"
          @task-opened="expandChildList"
          @task-closed="collapseChildList"
          @close-task-details="closeGanttTaskDetails"
          @edit-task="editGanttTask"
        />

        <Transition name="tw-overlay">
        <div
          v-if="isTaskFormModal"
          class="task-form-backdrop"
          @pointerdown.capture="trackTaskFormPress"
          @click="dismissTaskFormFromBackdrop($event, resetForm)"
        >
          <form
            class="task-form task-form-modal"
            :class="{
              'task-form-editing': isEditing,
              'task-form-child': childParentTask,
            }"
            @submit.prevent="saveTask"
          >
            <div class="form-heading">
              <div>
                <h3>{{ formTitle() }}</h3>
              </div>
            <button v-if="selectedTask && form.status !== 'done'" class="task-edit-button" type="button" @click="openTaskReminders(selectedTask)"><Bell :size="14" aria-hidden="true" />{{language === 'zh' ? '设置提醒' : 'Set reminder'}}</button>
              <span
                v-if="isEditing"
                class="form-mode-pill editing"
                :title="formModeTaskName()"
              >
                {{ formModeTaskName() }}
              </span>
              <span
                v-else-if="childParentTask"
                class="form-mode-pill child"
                :title="formModeTaskName()"
              >
                {{ formModeTaskName() }}
              </span>
              <button
                class="icon-button small"
                type="button"
                :title="text.cancelEditing"
                @click="resetForm"
              >
                <X :size="16" aria-hidden="true" />
              </button>
            </div>

            <div class="form-content">
              <label class="field title-field">
                <span>{{ text.taskName }}</span>
                <input v-model="form.title" :placeholder="text.taskPlaceholder" />
              </label>

              <label v-if="isChildForm" class="field">
                <span>{{ language === 'zh' ? '\u5b50\u4efb\u52a1\u5206\u7c7b' : 'Child category' }}</span>
                <input
                  v-model="form.childCategory"
                  list="child-category-options"
                  :placeholder="language === 'zh' ? '\u4f8b\uff1a\u8bbe\u8ba1 / \u5b9e\u73b0 / \u68c0\u67e5' : 'e.g. Design / Build / Review'"
                />
                <datalist id="child-category-options">
                  <option
                    v-for="category in childCategoryOptions"
                    :key="category"
                    :value="category"
                  />
                </datalist>
              </label>

              <div v-if="!isChildForm" class="toggle-row">
                <button
                  class="toggle-field importance-toggle"
                  :class="{ active: form.isImportant }"
                  type="button"
                  @click="form.isImportant = !form.isImportant"
                >
                  <span class="switch-track" aria-hidden="true">
                    <span class="switch-thumb"></span>
                  </span>
                  <span>{{ text.important }}</span>
                </button>
                <button
                  class="toggle-field urgency-toggle"
                  :class="{ active: form.isUrgent }"
                  type="button"
                  @click="form.isUrgent = !form.isUrgent"
                >
                  <span class="switch-track" aria-hidden="true">
                    <span class="switch-thumb"></span>
                  </span>
                  <span>{{ text.urgent }}</span>
                </button>
              </div>

              <label v-if="!isChildForm" class="field">
                <span>{{ text.project }}</span>
                <div class="custom-select">
                  <button
                    class="custom-select-trigger"
                    :class="{ open: isCustomSelectOpen('gantt-form-project') }"
                    type="button"
                    @click.stop="toggleCustomSelect('gantt-form-project')"
                  >
                    <span>{{ selectLabel(projectSelectOptions, form.projectSelection) }}</span>
                    <ChevronDown :size="15" aria-hidden="true" />
                  </button>
                  <Transition name="tw-popover">
                  <div v-if="isCustomSelectOpen('gantt-form-project')" class="custom-select-menu">
                    <button
                      v-for="option in projectSelectOptions"
                      :key="option.value"
                      class="custom-select-option"
                      :class="{ active: form.projectSelection === option.value }"
                      type="button"
                      @click.stop="selectFormProject(option.value)"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                  </Transition>
                </div>
              </label>

              <label
                v-if="!isChildForm && form.projectSelection === NEW_PROJECT_VALUE"
                class="field new-project-field"
              >
                <span>{{ language === 'zh' ? '\u9879\u76ee\u540d' : 'Project name' }}</span>
                <input
                  v-model="form.newProjectName"
                  :placeholder="language === 'zh' ? '\u8f93\u5165\u65b0\u9879\u76ee' : 'Name this project'"
                />
              </label>

              <label class="field">
                <span>{{ text.due }}</span>
                <DateInput v-model="form.dueDate" :language="language" />
              </label>

              <button class="primary-button save-button" type="submit">
                <Save :size="18" aria-hidden="true" />
                <span>{{ isEditing ? text.update : text.save }}</span>
              </button>

              <button
                class="advanced-toggle"
                type="button"
                :class="{ active: showAdvancedSettings }"
                @click="showAdvancedSettings = !showAdvancedSettings"
              >
                <ChevronDown :size="14" aria-hidden="true" />
                <span>{{ language === 'zh' ? '\u66f4\u591a\u8bbe\u7f6e' : 'More settings' }}</span>
              </button>

              <ExpandTransition>
              <div
                v-if="showAdvancedSettings"
                class="advanced-fields"
              >
                <div class="advanced-grid">
                  <label class="field description-field modal-description-field">
                    <span>{{ language === 'zh' ? '\u63cf\u8ff0' : 'Description' }}</span>
                    <textarea
                      v-model="form.description"
                      :title="descriptionKeyboardHint"
                      :aria-description="descriptionKeyboardHint"
                      @keydown="insertDescriptionTab"
                      :placeholder="language === 'zh' ? '\u8865\u5145\u4efb\u52a1\u7ec6\u8282' : 'Add task details'"
                      rows="6"
                    ></textarea>
                  </label>

                  <label class="field">
                    <span>{{ text.status }}</span>
                    <div class="custom-select">
                      <button
                        class="custom-select-trigger"
                        :class="{ open: isCustomSelectOpen('gantt-form-status') }"
                        type="button"
                        @click.stop="toggleCustomSelect('gantt-form-status')"
                      >
                        <span>{{ selectLabel(statusSelectOptions, form.status) }}</span>
                        <ChevronDown :size="15" aria-hidden="true" />
                      </button>
                      <Transition name="tw-popover">
                      <div v-if="isCustomSelectOpen('gantt-form-status')" class="custom-select-menu">
                        <button
                          v-for="option in statusSelectOptions"
                          :key="option.value"
                          class="custom-select-option"
                          :class="{ active: form.status === option.value }"
                          type="button"
                          @click.stop="selectFormStatus(option.value)"
                        >
                          {{ option.label }}
                        </button>
                      </div>
                      </Transition>
                    </div>
                  </label>

                  <label v-if="form.status === 'done'" class="field">
                    <span>{{ language === 'zh' ? '\u5b8c\u6210\u65e5\u671f' : 'Completion date' }}</span>
                    <DateInput
                      v-model="form.completionDate"
                      :language="language"
                      :max="todayIsoDate()"
                    />
                  </label>

                  <label class="field">
                    <span>{{ text.start }}</span>
                    <DateInput v-model="form.startDate" :language="language" />
                  </label>
                <label class="field"><span>{{language==='zh'?'开始时间（可选）':'Start time (optional)'}}</span><input v-model="form.startTime" type="time" step="60" /></label>
                <label class="field"><span>{{language==='zh'?'截止时间（可选）':'Due time (optional)'}}</span><input v-model="form.dueTime" type="time" step="60" :disabled="!form.dueDate" /></label>

                  <label v-if="!isChildForm" class="field tags-field">
                    <span>{{ text.tags }}</span>
                    <input v-model="form.tags" :placeholder="text.tagsPlaceholder" />
                  </label>
                </div>
              </div>
              </ExpandTransition>
            </div>
          </form>
        </div>
        </Transition>
      </template>

      <template v-else-if="activePage === 'projects'">
        <section class="manager-panel">
          <form
            ref="projectCreateFormEl"
            class="manager-create"
            @submit.prevent="createProjectFromManager"
          >
            <label class="field">
              <span>{{ language === 'zh' ? '新增项目' : 'New project' }}</span>
              <input
                v-model="projectManager.newName"
                :placeholder="language === 'zh' ? '输入项目名称' : 'Project name'"
              />
            </label>
            <label class="field project-parent-field">
              <span>{{ language === 'zh' ? '父项目' : 'Parent project' }}</span>
              <select v-model="projectManager.newParentName">
                <option
                  v-for="option in projectParentOptions()"
                  :key="option.value || '__root__'"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <button class="save-button compact-save" type="submit">
              <span>{{ language === 'zh' ? '添加' : 'Add' }}</span>
            </button>
          </form>

          <p v-if="projects.length === 0" class="empty-state">
            {{ language === 'zh' ? '还没有项目' : 'No projects yet' }}
          </p>

          <section v-else class="manager-list project-tree-list">
            <div class="project-tree-toolbar">
              <div>
                <strong>{{ language === 'zh' ? '\u9879\u76ee\u6811' : 'Project tree' }}</strong>
                <span>
                  {{
                    language === 'zh'
                      ? `${projects.length} \u4e2a\u9879\u76ee\uff0c\u70b9\u51fb\u7bad\u5934\u6298\u53e0\u5b50\u9879\u76ee`
                      : `${projects.length} projects; use the arrows to fold branches`
                  }}
                </span>
              </div>
              <div class="project-tree-toolbar-actions">
                <button class="worked-button" type="button" @click="collapseAllProjectBranches">
                  {{ language === 'zh' ? '\u5168\u90e8\u6298\u53e0' : 'Collapse all' }}
                </button>
                <button class="worked-button" type="button" @click="expandAllProjectBranches">
                  {{ language === 'zh' ? '\u5168\u90e8\u5c55\u5f00' : 'Expand all' }}
                </button>
              </div>
            </div>
            <article
              v-for="project in visibleProjectTree"
              :key="project.name"
              class="manager-row project-tree-row"
              :class="{
                'is-child-project': project.depth > 0,
                'is-branch-project': hasChildProjects(project.name),
                'is-branch-collapsed': isProjectTreeBranchCollapsed(project.name),
              }"
              :style="{ '--project-indent': `${Math.min(project.depth, 8) * 28}px` }"
            >
              <div
                class="manager-row-top"
                role="button"
                tabindex="0"
                @click="toggleProjectDetails(project.name)"
                @keydown.enter.prevent="toggleProjectDetails(project.name)"
                @keydown.space.prevent="toggleProjectDetails(project.name)"
              >
              <div class="manager-main">
                <button
                  v-if="hasChildProjects(project.name)"
                  class="project-branch-toggle"
                  type="button"
                  :class="{ collapsed: isProjectTreeBranchCollapsed(project.name) }"
                  :aria-expanded="!isProjectTreeBranchCollapsed(project.name)"
                  :title="
                    isProjectTreeBranchCollapsed(project.name)
                      ? (language === 'zh' ? '\u5c55\u5f00\u5b50\u9879\u76ee' : 'Expand child projects')
                      : (language === 'zh' ? '\u6298\u53e0\u5b50\u9879\u76ee' : 'Collapse child projects')
                  "
                  @click.stop="toggleProjectTreeBranch(project.name)"
                  @keydown.stop
                >
                  <ChevronDown :size="16" aria-hidden="true" />
                </button>
                <span v-else class="project-branch-spacer" aria-hidden="true"></span>
                <Archive :size="17" aria-hidden="true" />
                <template v-if="projectManager.editingName === project.name">
                  <div class="project-inline-editor" @click.stop>
                    <input
                      v-model="projectManager.draftName"
                      class="manager-inline-input"
                      @keydown.enter.prevent="saveProjectRename"
                      @keydown.esc.prevent="cancelProjectRename"
                      :aria-label="language === 'zh' ? '项目名称' : 'Project name'"
                    />
                    <select
                      v-model="projectManager.parentDraft"
                      class="manager-inline-select"
                      :aria-label="language === 'zh' ? '父项目' : 'Parent project'"
                    >
                      <option
                        v-for="option in projectParentOptions(project.name)"
                        :key="option.value || '__root__'"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                </template>
                <template v-else>
                  <button
                    class="manager-name-button"
                    type="button"
                    @click.stop="beginProjectRename(project.name)"
                  >
                    {{ project.name }}
                  </button>
                  <span>
                    {{
                      language === 'zh'
                        ? project.directTaskCount === project.taskCount
                          ? `${project.taskCount} 个任务`
                          : `${project.taskCount} 个任务（含子项目）`
                        : project.directTaskCount === project.taskCount
                          ? `${project.taskCount} tasks`
                          : `${project.taskCount} tasks including children`
                    }}
                  </span>
                  <span v-if="hasChildProjects(project.name)" class="project-child-count">
                    {{
                      language === 'zh'
                        ? `${directChildProjectCount(project.name)} \u4e2a\u76f4\u5c5e\u5b50\u9879\u76ee`
                        : `${directChildProjectCount(project.name)} direct children`
                    }}
                  </span>
                </template>
              </div>

              <div class="manager-actions" @click.stop>
                <template v-if="projectManager.editingName === project.name">
                  <button class="icon-button small" type="button" @click="saveProjectRename">
                    <Save :size="15" aria-hidden="true" />
                  </button>
                  <button class="icon-button small" type="button" @click="cancelProjectRename">
                    <X :size="15" aria-hidden="true" />
                  </button>
                </template>
                <template v-else>
                  <button
                    class="worked-button"
                    type="button"
                    :title="language === 'zh' ? '添加子项目' : 'Add child project'"
                    @click="startChildProject(project.name)"
                  >
                    <Plus :size="15" aria-hidden="true" />
                    <span>{{ language === 'zh' ? '子项目' : 'Child' }}</span>
                  </button>
                  <button
                    class="worked-button"
                    type="button"
                    v-if="false"
                    @click="toggleProjectDetails(project.name)"
                  >
                    {{ isProjectDetailsExpanded(project.name) ? (language === 'zh' ? '\u6536\u8d77' : 'Collapse') : (language === 'zh' ? '\u5c55\u5f00' : 'Expand') }}
                  </button>
                  <button v-if="false" class="worked-button" type="button" @click="beginProjectRename(project.name)">
                    {{ language === 'zh' ? '重命名' : 'Rename' }}
                  </button>
                  <button
                    class="worked-button danger-action"
                    type="button"
                    @click="startProjectDelete(project.name)"
                  >
                    {{ language === 'zh' ? '\u5220\u9664' : 'Delete' }}
                  </button>
                  <button
                    v-if="false"
                    class="worked-button danger-action"
                    type="button"
                    @click="startProjectDelete(project.name)"
                  >
                    {{ language === 'zh' ? '任务变未归档' : 'Unfile tasks' }}
                  </button>
                  <button
                    v-if="false"
                    class="worked-button danger-action"
                    type="button"
                    @click="deleteProjectFromManager(project.name, 'trash_tasks')"
                  >
                    {{ language === 'zh' ? '任务进回收站' : 'Trash tasks' }}
                  </button>
                </template>
              </div>
              </div>

              <ExpandTransition>
              <section v-if="projectManager.deletingName === project.name" class="manager-confirm">
                <strong>{{ language === 'zh' ? '\u9879\u76ee\u4e0b\u7684\u4efb\u52a1\u600e\u4e48\u5904\u7406\uff1f' : 'What should happen to this project\'s tasks?' }}</strong>
                <p v-if="hasChildProjects(project.name)">
                  {{
                    language === 'zh'
                      ? '\u5b50\u9879\u76ee\u4f1a\u5b89\u5168\u63d0\u5347\u5230\u4e0a\u4e00\u7ea7\uff0c\u4e0d\u4f1a\u88ab\u5220\u9664\u3002'
                      : 'Child projects will be promoted one level and kept.'
                  }}
                </p>
                <div>
                  <button
                    class="worked-button"
                    type="button"
                    @click="deleteProjectFromManager(project.name, 'unfile_tasks')"
                  >
                    {{ language === 'zh' ? '\u53d8\u4e3a\u672a\u5f52\u6863' : 'Make tasks unfiled' }}
                  </button>
                  <button
                    class="worked-button danger-action"
                    type="button"
                    @click="deleteProjectFromManager(project.name, 'trash_tasks')"
                  >
                    {{ language === 'zh' ? '\u4efb\u52a1\u8fdb\u56de\u6536\u7ad9' : 'Move tasks to Trash' }}
                  </button>
                  <button class="icon-button small" type="button" @click="cancelProjectDelete">
                    <X :size="15" aria-hidden="true" />
                  </button>
                </div>
              </section>
              </ExpandTransition>

              <ExpandTransition>
              <section v-if="isProjectDetailsExpanded(project.name)" class="manager-task-list">
                <p v-if="tasksForProjectDetails(project.name).length === 0" class="manager-empty">
                  {{ language === 'zh' ? '\u6682\u65e0\u4efb\u52a1' : 'No tasks in this project' }}
                </p>
                <article
                  v-for="task in tasksForProjectDetails(project.name)"
                  :key="task.id"
                  class="manager-task-row"
                >
                  <strong>{{ task.title }}</strong>
                  <span
                    v-if="task.projectName !== project.name"
                    class="manager-task-chip project-path-chip"
                  >
                    {{ projectDisplayName(task.projectName) }}
                  </span>
                  <span class="manager-task-chip" :class="managerStatusClass(task.status)">
                    {{ statusLabel(task.status) }}
                  </span>
                  <span
                    class="manager-task-chip importance-chip"
                    :class="{ muted: !task.isImportant }"
                  >
                    {{ task.isImportant ? text.important : text.notImportant }}
                  </span>
                  <span
                    class="manager-task-chip urgency-chip"
                    :class="{ muted: !task.isUrgent }"
                  >
                    {{ task.isUrgent ? text.urgent : text.notUrgent }}
                  </span>
                </article>
              </section>
              </ExpandTransition>
            </article>
          </section>
        </section>
      </template>

      <template v-else-if="activePage === 'tags'">
        <section class="manager-panel">
          <form class="manager-create" @submit.prevent="createTagFromManager">
            <label class="field">
              <span>{{ language === 'zh' ? '新增标签' : 'New tag' }}</span>
              <input
                v-model="tagManager.newName"
                :placeholder="language === 'zh' ? '输入标签名称' : 'Tag name'"
              />
            </label>
            <button class="save-button compact-save" type="submit">
              <span>{{ language === 'zh' ? '添加' : 'Add' }}</span>
            </button>
          </form>

          <p v-if="tags.length === 0" class="empty-state">
            {{ language === 'zh' ? '还没有标签' : 'No tags yet' }}
          </p>

          <section v-else class="manager-list tag-manager-list">
            <article v-for="tag in tags" :key="tag.name" class="manager-row">
              <div
                class="manager-row-top"
                role="button"
                tabindex="0"
                @click="toggleTagDetails(tag.name)"
                @keydown.enter.prevent="toggleTagDetails(tag.name)"
                @keydown.space.prevent="toggleTagDetails(tag.name)"
              >
              <div class="manager-main">
                <Tags :size="17" aria-hidden="true" />
                <template v-if="tagManager.editingName === tag.name">
                  <input
                    v-model="tagManager.draftName"
                    class="manager-inline-input"
                    @click.stop
                    @keydown.enter.prevent="saveTagRename"
                    @keydown.esc.prevent="cancelTagRename"
                    :aria-label="language === 'zh' ? '标签名称' : 'Tag name'"
                  />
                </template>
                <template v-else>
                  <button
                    class="manager-name-button"
                    type="button"
                    @click.stop="beginTagRename(tag.name)"
                  >
                    #{{ tag.name }}
                  </button>
                  <span>
                    {{
                      language === 'zh'
                        ? `${tag.taskCount} 个任务`
                        : `${tag.taskCount} tasks`
                    }}
                  </span>
                </template>
              </div>

              <div class="manager-actions" @click.stop>
                <template v-if="tagManager.editingName === tag.name">
                  <button class="icon-button small" type="button" @click="saveTagRename">
                    <Save :size="15" aria-hidden="true" />
                  </button>
                  <button class="icon-button small" type="button" @click="cancelTagRename">
                    <X :size="15" aria-hidden="true" />
                  </button>
                </template>
                <template v-else>
                  <button
                    class="worked-button"
                    type="button"
                    v-if="false"
                    @click="toggleTagDetails(tag.name)"
                  >
                    {{ isTagDetailsExpanded(tag.name) ? (language === 'zh' ? '\u6536\u8d77' : 'Collapse') : (language === 'zh' ? '\u5c55\u5f00' : 'Expand') }}
                  </button>
                  <button v-if="false" class="worked-button" type="button" @click="beginTagRename(tag.name)">
                    {{ language === 'zh' ? '重命名' : 'Rename' }}
                  </button>
                  <button
                    class="worked-button danger-action"
                    type="button"
                    @click="deleteTagFromManager(tag.name)"
                  >
                    {{ language === 'zh' ? '删除标签' : 'Delete tag' }}
                  </button>
                </template>
              </div>
              </div>
              <ExpandTransition>
              <section v-if="isTagDetailsExpanded(tag.name)" class="manager-task-list">
                <p v-if="tasksForTagDetails(tag.name).length === 0" class="manager-empty">
                  {{ language === 'zh' ? '\u6682\u65e0\u4efb\u52a1' : 'No tasks with this tag' }}
                </p>
                <article
                  v-for="task in tasksForTagDetails(tag.name)"
                  :key="task.id"
                  class="manager-task-row"
                >
                  <strong>{{ task.title }}</strong>
                  <span class="manager-task-chip" :class="managerStatusClass(task.status)">
                    {{ statusLabel(task.status) }}
                  </span>
                  <span
                    class="manager-task-chip importance-chip"
                    :class="{ muted: !task.isImportant }"
                  >
                    {{ task.isImportant ? text.important : text.notImportant }}
                  </span>
                  <span
                    class="manager-task-chip urgency-chip"
                    :class="{ muted: !task.isUrgent }"
                  >
                    {{ task.isUrgent ? text.urgent : text.notUrgent }}
                  </span>
                </article>
              </section>
              </ExpandTransition>
            </article>
          </section>
        </section>
      </template>

      <template v-else-if="activePage === 'recurring'">
        <section class="recurring-panel">
          <form class="recurring-create" @submit.prevent="createRecurringTemplate">
            <div class="recurring-create-main">
              <label class="field recurring-title-field">
                <span>{{ language === 'zh' ? '\u6a21\u677f\u540d\u79f0' : 'Template title' }}</span>
                <input
                  v-model="recurringForm.title"
                  :placeholder="language === 'zh' ? '\u4f8b\uff1a\u6bcf\u5468\u5199\u590d\u76d8' : 'e.g. Weekly review'"
                />
              </label>

              <div class="toggle-row recurring-toggles recurring-create-toggles">
                <button
                  class="toggle-field importance-toggle"
                  :class="{ active: recurringForm.isImportant }"
                  type="button"
                  @click="recurringForm.isImportant = !recurringForm.isImportant"
                >
                  <span class="switch-track" aria-hidden="true">
                    <span class="switch-thumb"></span>
                  </span>
                  <span>{{ text.important }}</span>
                </button>
                <button
                  class="toggle-field urgency-toggle"
                  :class="{ active: recurringForm.isUrgent }"
                  type="button"
                  @click="recurringForm.isUrgent = !recurringForm.isUrgent"
                >
                  <span class="switch-track" aria-hidden="true">
                    <span class="switch-thumb"></span>
                  </span>
                  <span>{{ text.urgent }}</span>
                </button>
              </div>

              <label class="field">
                <span>{{ text.project }}</span>
                <select v-model="recurringForm.projectSelection">
                  <option
                    v-for="option in projectSelectOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <label
                v-if="recurringForm.projectSelection === NEW_PROJECT_VALUE"
                class="field"
              >
                <span>{{ language === 'zh' ? '\u9879\u76ee\u540d' : 'Project name' }}</span>
                <input
                  v-model="recurringForm.newProjectName"
                  :placeholder="language === 'zh' ? '\u8f93\u5165\u65b0\u9879\u76ee' : 'Name this project'"
                />
              </label>

              <label class="field">
                <span>{{ text.tags }}</span>
                <input v-model="recurringForm.tags" :placeholder="text.tagsPlaceholder" />
              </label>

              <label class="field"><span>{{language==='zh'?'开始时间（可选）':'Start time (optional)'}}</span><input v-model="recurringForm.startTime" type="time" step="60" /></label>
              <label class="field"><span>{{language==='zh'?'截止时间（可选）':'Due time (optional)'}}</span><input v-model="recurringForm.dueTime" type="time" step="60" /></label>
              <label class="field recurring-description-field">
                <span>{{ language === 'zh' ? '\u63cf\u8ff0' : 'Description' }}</span>
                <textarea
                  v-model="recurringForm.description"
                  :title="descriptionKeyboardHint"
                  :aria-description="descriptionKeyboardHint"
                  @keydown="insertDescriptionTab"
                  rows="3"
                  :placeholder="language === 'zh' ? '\u8f93\u5165\u6bcf\u6b21\u751f\u6210\u7684\u4efb\u52a1\u9700\u8981\u643a\u5e26\u7684\u8bf4\u660e' : 'Details copied to every generated task'"
                ></textarea>
              </label>
            </div>

            <div class="recurring-rule-panel">
              <label class="field recurring-rule-field">
                <span>{{ language === 'zh' ? '\u9891\u7387' : 'Frequency' }}</span>
                <select v-model="recurringForm.frequency">
                  <option
                    v-for="option in recurringFrequencyOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <RecurringCyclePicker
                v-if="recurringForm.frequency === 'weekly'"
                :start-label="language === 'zh' ? '\u5f00\u59cb' : 'Start'"
                :due-label="language === 'zh' ? '\u622a\u6b62' : 'Due'"
                :unset-label="language === 'zh' ? '\u672a\u9009' : 'Unset'"
                :start-value="weeklyCycleStart(recurringForm)"
                :due-value="weeklyCycleDue(recurringForm)"
                :placement-step="weeklyPlacementStep(recurringForm)"
                :options="weekdayOptions"
                :summary="weeklyCycleText(recurringForm)"
                @pick="chooseWeeklyCycleDay(recurringForm, $event)"
              />

              <RecurringCyclePicker
                v-else-if="recurringForm.frequency === 'monthly'"
                :start-label="language === 'zh' ? '\u5f00\u59cb' : 'Start'"
                :due-label="language === 'zh' ? '\u622a\u6b62' : 'Due'"
                :unset-label="language === 'zh' ? '\u672a\u9009' : 'Unset'"
                :start-value="monthlyCycleStart(recurringForm)"
                :due-value="monthlyCycleDue(recurringForm)"
                :placement-step="monthlyPlacementStep(recurringForm)"
                :options="monthDayOptions"
                :summary="monthlyCycleText(recurringForm)"
                :notice="monthlyLastDayNotice(recurringForm)"
                days-class="monthly"
                @pick="chooseMonthlyCycleDay(recurringForm, $event)"
              />

              <label
                v-else-if="recurringForm.frequency === 'yearly'"
                class="field recurring-rule-field"
              >
                <span>
                  {{
                    language === 'zh'
                      ? '\u6bcf\u5e74\u65e5\u671f\uff08\u53ef\u586b 2-29,12-last\uff09'
                      : 'Year days (e.g. 2-29,12-last)'
                  }}
                </span>
                <input v-model="recurringForm.yearDays" placeholder="2-29,12-last" />
              </label>

              <button class="primary-button recurring-save" type="submit">
                <Save :size="17" aria-hidden="true" />
                <span>{{ language === 'zh' ? '\u521b\u5efa\u6a21\u677f' : 'Create template' }}</span>
              </button>
            </div>
          </form>

          <p v-if="recurringTemplates.length === 0" class="empty-state">
            {{ language === 'zh' ? '\u8fd8\u6ca1\u6709\u91cd\u590d\u4efb\u52a1\u6a21\u677f' : 'No recurring templates yet' }}
          </p>

          <section v-else class="recurring-list">
            <article
              v-for="template in recurringTemplates"
              :key="template.id"
              class="recurring-card"
            >
              <header>
                <button
                  class="recurring-card-title"
                  type="button"
                  @click="editRecurringTemplate(template)"
                >
                  <h3>{{ template.title }}</h3>
                  <p>{{ recurringTemplateSummary(template) }}</p>
                </button>
                <div class="recurring-card-actions">
                  <button class="task-edit-button task-edit-icon" type="button" :title="language === 'zh' ? '编辑模板' : 'Edit template'" :aria-label="language === 'zh' ? '编辑模板' : 'Edit template'" @click="editRecurringTemplate(template)">
                    <Pencil :size="14" aria-hidden="true" />
                  </button>
                  <button
                    class="icon-button small danger-action"
                    type="button"
                    :title="language === 'zh' ? '\u5220\u9664\u6a21\u677f' : 'Delete template'"
                    @click="deleteRecurringTemplate(template)"
                  >
                    <Trash2 :size="15" aria-hidden="true" />
                  </button>
                </div>
              </header>

              <p v-if="template.description" class="recurring-card-description">
                {{ template.description }}
              </p>

              <div class="recurring-card-meta">
                <span>{{ projectDisplayName(template.projectName) }}</span>
                <span
                  class="recurring-meta-priority importance-chip"
                  :class="{ muted: !template.isImportant }"
                >
                  {{ template.isImportant ? text.important : text.notImportant }}
                </span>
                <span
                  class="recurring-meta-priority urgency-chip"
                  :class="{ muted: !template.isUrgent }"
                >
                  {{ template.isUrgent ? text.urgent : text.notUrgent }}
                </span>
              </div>

              <div v-if="template.tags.length > 0" class="tag-row">
                <span v-for="tag in template.tags" :key="tag">#{{ tag }}</span>
              </div>
            </article>
          </section>

          <Transition name="tw-overlay">
          <div
            v-if="editingRecurringTemplateId"
            class="task-form-backdrop"
            @pointerdown.capture="trackTaskFormPress"
            @click="dismissTaskFormFromBackdrop($event, cancelRecurringTemplateEdit)"
          >
            <form
              class="task-form task-form-modal task-form-editing recurring-edit-modal"
              @submit.prevent="saveRecurringTemplateEdit"
            >
              <div class="form-heading">
                <div>
                  <h3>{{ language === 'zh' ? '\u7f16\u8f91\u91cd\u590d\u6a21\u677f' : 'Edit recurring template' }}</h3>
                </div>
                <button
                  class="icon-button small"
                  type="button"
                  :title="language === 'zh' ? '\u5173\u95ed' : 'Close'"
                  @click="cancelRecurringTemplateEdit"
                >
                  <X :size="16" aria-hidden="true" />
                </button>
              </div>

              <div class="recurring-create-main">
                <label class="field recurring-title-field">
                  <span>{{ language === 'zh' ? '\u6a21\u677f\u540d\u79f0' : 'Template title' }}</span>
                  <input
                    v-model="recurringEditForm.title"
                    :placeholder="language === 'zh' ? '\u4f8b\uff1a\u6bcf\u5468\u5199\u590d\u76d8' : 'e.g. Weekly review'"
                  />
                </label>

                <div class="toggle-row recurring-toggles recurring-create-toggles">
                  <button
                    class="toggle-field importance-toggle"
                    :class="{ active: recurringEditForm.isImportant }"
                    type="button"
                    @click="recurringEditForm.isImportant = !recurringEditForm.isImportant"
                  >
                    <span class="switch-track" aria-hidden="true">
                      <span class="switch-thumb"></span>
                    </span>
                    <span>{{ text.important }}</span>
                  </button>
                  <button
                    class="toggle-field urgency-toggle"
                    :class="{ active: recurringEditForm.isUrgent }"
                    type="button"
                    @click="recurringEditForm.isUrgent = !recurringEditForm.isUrgent"
                  >
                    <span class="switch-track" aria-hidden="true">
                      <span class="switch-thumb"></span>
                    </span>
                    <span>{{ text.urgent }}</span>
                  </button>
                </div>

                <label class="field">
                  <span>{{ text.project }}</span>
                  <select v-model="recurringEditForm.projectSelection">
                    <option
                      v-for="option in projectSelectOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <label
                  v-if="recurringEditForm.projectSelection === NEW_PROJECT_VALUE"
                  class="field"
                >
                  <span>{{ language === 'zh' ? '\u9879\u76ee\u540d' : 'Project name' }}</span>
                  <input
                    v-model="recurringEditForm.newProjectName"
                    :placeholder="language === 'zh' ? '\u8f93\u5165\u65b0\u9879\u76ee' : 'Name this project'"
                  />
                </label>

                <label class="field">
                  <span>{{ text.tags }}</span>
                  <input v-model="recurringEditForm.tags" :placeholder="text.tagsPlaceholder" />
                </label>

                <label class="field"><span>{{language==='zh'?'开始时间（可选）':'Start time (optional)'}}</span><input v-model="recurringEditForm.startTime" type="time" step="60" /></label>
              <label class="field"><span>{{language==='zh'?'截止时间（可选）':'Due time (optional)'}}</span><input v-model="recurringEditForm.dueTime" type="time" step="60" /></label>
              <label class="field recurring-description-field">
                  <span>{{ language === 'zh' ? '\u63cf\u8ff0' : 'Description' }}</span>
                  <textarea
                    v-model="recurringEditForm.description"
                    :title="descriptionKeyboardHint"
                    :aria-description="descriptionKeyboardHint"
                    @keydown="insertDescriptionTab"
                    rows="3"
                    :placeholder="language === 'zh' ? '\u8f93\u5165\u6bcf\u6b21\u751f\u6210\u7684\u4efb\u52a1\u9700\u8981\u643a\u5e26\u7684\u8bf4\u660e' : 'Details copied to every generated task'"
                  ></textarea>
                </label>
              </div>

              <div class="recurring-rule-panel">
                <label class="field recurring-rule-field">
                  <span>{{ language === 'zh' ? '\u9891\u7387' : 'Frequency' }}</span>
                  <select v-model="recurringEditForm.frequency">
                    <option
                      v-for="option in recurringFrequencyOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <RecurringCyclePicker
                  v-if="recurringEditForm.frequency === 'weekly'"
                  :start-label="language === 'zh' ? '\u5f00\u59cb' : 'Start'"
                  :due-label="language === 'zh' ? '\u622a\u6b62' : 'Due'"
                  :unset-label="language === 'zh' ? '\u672a\u9009' : 'Unset'"
                  :start-value="weeklyCycleStart(recurringEditForm)"
                  :due-value="weeklyCycleDue(recurringEditForm)"
                  :placement-step="weeklyPlacementStep(recurringEditForm)"
                  :options="weekdayOptions"
                  :summary="weeklyCycleText(recurringEditForm)"
                  @pick="chooseWeeklyCycleDay(recurringEditForm, $event)"
                />

                <RecurringCyclePicker
                  v-else-if="recurringEditForm.frequency === 'monthly'"
                  :start-label="language === 'zh' ? '\u5f00\u59cb' : 'Start'"
                  :due-label="language === 'zh' ? '\u622a\u6b62' : 'Due'"
                  :unset-label="language === 'zh' ? '\u672a\u9009' : 'Unset'"
                  :start-value="monthlyCycleStart(recurringEditForm)"
                  :due-value="monthlyCycleDue(recurringEditForm)"
                  :placement-step="monthlyPlacementStep(recurringEditForm)"
                  :options="monthDayOptions"
                  :summary="monthlyCycleText(recurringEditForm)"
                  :notice="monthlyLastDayNotice(recurringEditForm)"
                  days-class="monthly"
                  @pick="chooseMonthlyCycleDay(recurringEditForm, $event)"
                />

                <label
                  v-else-if="recurringEditForm.frequency === 'yearly'"
                  class="field recurring-rule-field"
                >
                  <span>{{ language === 'zh' ? '\u6bcf\u5e74\u65e5\u671f\uff08\u53ef\u586b 2-29,12-last\uff09' : 'Year days (e.g. 2-29,12-last)' }}</span>
                  <input v-model="recurringEditForm.yearDays" placeholder="2-29,12-last" />
                </label>

                <button class="primary-button recurring-save" type="submit">
                  <Save :size="17" aria-hidden="true" />
                  <span>{{ language === 'zh' ? '\u4fdd\u5b58\u4fee\u6539' : 'Save changes' }}</span>
                </button>
              </div>
            </form>
          </div>
          </Transition>
        </section>
      </template>

      <template v-else-if="activePage === 'trash'">
        <p v-if="deletedTasks.length === 0" class="empty-state">
          {{ language === 'zh' ? '\u56de\u6536\u7ad9\u4e3a\u7a7a' : 'Trash is empty' }}
        </p>

        <div v-else class="trash-toolbar">
          <label class="trash-select-all">
            <input
              type="checkbox"
              :checked="allTrashTasksSelected"
              @change="toggleAllTrashTasks"
            />
            <span>{{ language === 'zh' ? '\u5168\u9009' : 'Select all' }}</span>
          </label>
          <span>
            {{
              language === 'zh'
                ? `\u5df2\u9009 ${selectedTrashTasks.length} \u9879`
                : `${selectedTrashTasks.length} selected`
            }}
          </span>
          <button
            class="worked-button active"
            type="button"
            :disabled="selectedTrashTasks.length === 0"
            @click="restoreSelectedTrashTasks"
          >
            <RotateCcw :size="16" aria-hidden="true" />
            <span>{{ language === 'zh' ? '\u6279\u91cf\u6062\u590d' : 'Restore selected' }}</span>
          </button>
          <button
            class="worked-button danger-action"
            type="button"
            :disabled="selectedTrashTasks.length === 0"
            @click="requestPermanentDeleteSelected"
          >
            <Trash2 :size="16" aria-hidden="true" />
            <span>{{ language === 'zh' ? '\u6279\u91cf\u5220\u9664' : 'Delete selected' }}</span>
          </button>
        </div>

        <section v-if="deletedTasks.length > 0" class="trash-list" aria-label="Trash">
          <article
            v-for="task in deletedTasks"
            :key="task.id"
            class="task-card trash-card"
            :class="{ selected: selectedTrashTaskIds.has(task.id) }"
          >
            <div class="task-card-header">
              <label class="trash-card-check">
                <input
                  type="checkbox"
                  :checked="selectedTrashTaskIds.has(task.id)"
                  @change="toggleTrashTaskSelection(task.id)"
                />
              </label>
              <button class="task-title" type="button" disabled>
                {{ task.title }}
              </button>
              <span class="overdue">
                {{ language === 'zh' ? '\u5df2\u5220\u9664' : 'Deleted' }}
              </span>
            </div>

            <div class="meta-grid">
              <span>{{ projectDisplayName(task.projectName) }}</span>
              <span>{{ text.start }} {{ task.startDate }}</span>
              <span>
                {{ task.dueDate ? `${text.due} ${task.dueDate}` : text.openEnded }}
              </span>
              <span>
                {{ language === 'zh' ? '\u5220\u9664\u4e8e' : 'Deleted at' }}
                {{ task.deletedAt }}
              </span>
            </div>

            <div class="tag-row">
              <span v-for="tag in task.tags" :key="tag">#{{ tag }}</span>
            </div>

            <footer class="task-actions">
              <button class="worked-button active" type="button" @click="restoreTask(task)">
                <RotateCcw :size="16" aria-hidden="true" />
                <span>{{ language === 'zh' ? '\u6062\u590d' : 'Restore' }}</span>
              </button>
              <button
                class="worked-button danger-action"
                type="button"
                @click="requestPermanentDelete(task)"
              >
                <Trash2 :size="16" aria-hidden="true" />
                <span>
                  {{ language === 'zh' ? '\u5f7b\u5e95\u5220\u9664' : 'Delete permanently' }}
                </span>
              </button>
            </footer>
          </article>
        </section>

        <Transition name="tw-overlay">
        <div
          v-if="pendingPermanentDeleteIds.length > 0"
          class="confirm-backdrop"
          @click.self="cancelPermanentDelete"
        >
          <section class="confirm-dialog">
            <header>
              <h3>{{ language === 'zh' ? '\u786e\u8ba4\u5f7b\u5e95\u5220\u9664\uff1f' : 'Delete permanently?' }}</h3>
              <button class="icon-button small" type="button" @click="cancelPermanentDelete">
                <X :size="16" aria-hidden="true" />
              </button>
            </header>
            <p>
              {{
                language === 'zh'
                  ? '\u8fd9\u4e2a\u64cd\u4f5c\u4e0d\u80fd\u4ece\u56de\u6536\u7ad9\u6062\u590d\u3002'
                  : 'This cannot be restored from Trash.'
              }}
            </p>
            <div class="confirm-items">
              <span v-for="task in pendingPermanentDeleteTasks" :key="task.id">
                {{ task.title }}
              </span>
            </div>
            <footer>
              <button class="worked-button" type="button" @click="cancelPermanentDelete">
                {{ language === 'zh' ? '\u53d6\u6d88' : 'Cancel' }}
              </button>
              <button class="worked-button danger-action" type="button" @click="confirmPermanentDelete">
                {{ language === 'zh' ? '\u786e\u8ba4\u5220\u9664' : 'Delete permanently' }}
              </button>
            </footer>
          </section>
        </div>
        </Transition>
      </template>

      <template v-else-if="activePage === 'reminders'">
        <RemindersPage :language="language" :tasks="tasks" :task-id="reminderTaskId" :running-in-tauri="runningInTauri" />
      </template>

      <template v-else-if="activePage === 'help'">
        <HelpPage v-model:article-id="helpArticleId" :language="language" :running-in-tauri="runningInTauri" @navigate="activePage = $event" />
      </template>

      <template v-else-if="activePage === 'settings'">
        <section class="settings-panel">
          <div class="settings-row">
            <label class="field">
              <span>{{ text.language }}</span>
              <div class="custom-select">
                <button
                  class="custom-select-trigger"
                  :class="{ open: isCustomSelectOpen('settings-language') }"
                  type="button"
                  @click.stop="toggleCustomSelect('settings-language')"
                >
                  <span>{{ selectLabel(languageOptions, language) }}</span>
                  <ChevronDown :size="15" aria-hidden="true" />
                </button>
                <Transition name="tw-popover">
                <div v-if="isCustomSelectOpen('settings-language')" class="custom-select-menu">
                  <button
                    v-for="option in languageOptions"
                    :key="option.value"
                    class="custom-select-option"
                    :class="{ active: language === option.value }"
                    type="button"
                    @click.stop="selectLanguage(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
                </Transition>
              </div>
            </label>
          </div>

          <div v-if="runningInTauri" class="settings-row settings-toggle-row">
            <div class="settings-toggle-copy">
              <strong>{{ language === 'zh' ? '开机自动启动' : 'Launch at startup' }}</strong>
              <span>
                {{ language === 'zh'
                  ? '登录 Windows 后静默进入系统托盘，提醒功能继续运行。'
                  : 'Start silently in the system tray after you sign in to Windows.' }}
              </span>
              <em v-if="autostartError">{{ autostartError }}</em>
            </div>
            <button
              class="switch-button"
              :class="{ active: autostartEnabled }"
              type="button"
              role="switch"
              :aria-checked="autostartEnabled"
              :aria-label="language === 'zh' ? '开机自动启动' : 'Launch at startup'"
              :disabled="autostartBusy"
              @click="changeAutostart(!autostartEnabled)"
            >
              <span></span>
            </button>
          </div>

          <div v-if="runningInTauri" class="settings-row software-update-row">
            <div class="software-update-copy">
              <strong>{{ language === 'zh' ? '软件更新' : 'Software update' }}</strong>
              <span :class="{ error: updateStatus === 'error' }">{{ updateStatusText }}</span>
              <em v-if="updateError && updateStatus === 'available'">{{ updateError }}</em>
              <p v-if="availableUpdate?.body" class="update-release-notes">{{ availableUpdate.body }}</p>
            </div>
            <div class="software-update-actions">
              <button
                class="worked-button"
                type="button"
                :disabled="updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'unconfigured'"
                @click="checkForUpdates(true)"
              >
                <RefreshCw :class="{ spinning: updateStatus === 'checking' }" :size="15" aria-hidden="true" />
                {{ language === 'zh' ? '检查更新' : 'Check for updates' }}
              </button>
              <button
                v-if="availableUpdate"
                class="primary-button"
                type="button"
                :disabled="updateStatus === 'downloading'"
                @click="downloadAndInstallUpdate"
              >
                <Download :size="15" aria-hidden="true" />
                {{ language === 'zh' ? '下载并安装' : 'Download and install' }}
              </button>
            </div>
          </div>

          <div class="settings-row">
            <label class="field">
              <span>{{ text.appearance }}</span>
              <div class="custom-select">
                <button
                  class="custom-select-trigger"
                  :class="{ open: isCustomSelectOpen('settings-theme') }"
                  type="button"
                  @click.stop="toggleCustomSelect('settings-theme')"
                >
                  <span>{{ selectLabel(themeOptions, themeMode) }}</span>
                  <ChevronDown :size="15" aria-hidden="true" />
                </button>
                <Transition name="tw-popover">
                <div v-if="isCustomSelectOpen('settings-theme')" class="custom-select-menu">
                  <button
                    v-for="option in themeOptions"
                    :key="option.value"
                    class="custom-select-option"
                    :class="{ active: themeMode === option.value }"
                    type="button"
                    @click.stop="selectThemeMode(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
                </Transition>
              </div>
            </label>
          </div>

          <div class="settings-row">
            <label class="field">
              <span>
                {{
                  language === 'zh'
                    ? '\u56de\u6536\u7ad9\u81ea\u52a8\u5220\u9664\u5929\u6570'
                    : 'Trash auto-delete days'
                }}
              </span>
              <input v-model.number="trashRetentionDays" min="1" type="number" />
            </label>
          </div>

          <div class="settings-row data-transfer-row">
            <div class="data-transfer-copy">
              <strong>{{ language === 'zh' ? '\u6570\u636e\u8fc1\u79fb\u4e0e\u5907\u4efd' : 'Data transfer and backup' }}</strong>
              <span>
                {{
                  language === 'zh'
                    ? '\u5728\u7f51\u9875\u6d4b\u8bd5\u7248\u5bfc\u51fa\u6570\u636e\uff0c\u518d\u5230\u684c\u9762\u7248\u5bfc\u5165\u3002\u5bfc\u5165\u4f1a\u5408\u5e76\u8bb0\u5f55\uff0c\u4e0d\u4f1a\u8986\u76d6\u5df2\u6709\u4efb\u52a1\u3002'
                    : 'Export from the browser test version, then import into the desktop app. Existing records are kept.'
                }}
              </span>
            </div>
            <div class="data-transfer-actions">
              <button
                class="worked-button"
                type="button"
                :disabled="isTransferringData"
                @click="exportTaskWeaveData"
              >
                <Save :size="15" aria-hidden="true" />
                {{ language === 'zh' ? '\u5bfc\u51fa\u6570\u636e\u6587\u4ef6' : 'Export data file' }}
              </button>
              <button
                class="primary-button data-import-button"
                type="button"
                :disabled="isTransferringData"
                @click="chooseTaskWeaveDataFile"
              >
                <Archive :size="15" aria-hidden="true" />
                {{ language === 'zh' ? '\u5bfc\u5165\u6570\u636e\u6587\u4ef6' : 'Import data file' }}
              </button>
              <input
                ref="dataTransferInput"
                class="sr-only"
                type="file"
                accept="application/json,.json"
                @change="importTaskWeaveData"
              />
            </div>
            <p
              v-if="dataTransferMessage"
              class="data-transfer-message"
              :class="{ error: dataTransferFailed }"
            >
              {{ dataTransferMessage }}
            </p>
          </div>
        </section>
      </template>

      <template v-else>
        <header class="topbar">
          <div>
            <p class="eyebrow">TaskWeave</p>
            <h2>{{ navTitle(activePage) }}</h2>
          </div>
        </header>

        <p class="empty-state">{{ text.unavailable }}</p>
      </template>
    </section>
    </main>
    <Transition name="tw-overlay">
    <div v-if="!runningInTauri && reminderAlerts.length" class="central-reminder-backdrop">
      <ReminderAlertView :alerts="reminderAlerts" :language="language" :busy="reminderAlertBusy" :error="reminderAlertError"
        @dismiss="ids=>handleReminderAlert(()=>dismissReminderAlerts(ids))"
        @snooze="(id,minutes)=>handleReminderAlert(()=>snoozeReminderAlert(id,minutes))"
        @view-task="viewReminderTask" />
    </div>
    </Transition>
    <ReminderTaskPreview v-if="viewedReminderTask" :key="viewedReminderTask.id" :task="viewedReminderTask" :language="language" @close="viewedReminderTaskId=null" />
    <SupportDialog v-if="isSupportOpen" :language="language" @close="isSupportOpen = false" />
  </div>
</template>

<style>
:root {
  color-scheme: light;
  --app-bg: #ffffff;
  --sidebar-bg: #ffffff;
  --panel-bg: #ffffff;
  --field-bg: #fafafa;
  --border: #e0e0e0;
  --border-strong: #cccccc;
  --text: #202124;
  --heading: #262626;
  --muted: #737373;
  --subtle: #595959;
  --primary: #404040;
  --primary-hover: #262626;
  --primary-soft: #f4f4f4;
  --primary-border: #8a8a8a;
  --neutral-soft: #eeeeee;
  --success-bg: #dff3e7;
  --success-text: #1f7a4d;
  --status-todo-bg: #e7f5e6;
  --status-todo-text: #4a7c45;
  --status-doing-bg: #bfe8c8;
  --status-doing-text: #237247;
  --status-done-bg: #63b985;
  --status-done-text: #ffffff;
  --gantt-todo-bg: #d8dce0;
  --gantt-todo-text: #4f5862;
  --gantt-doing-bg: #bfdbfe;
  --gantt-doing-text: #1e4f8f;
  --gantt-week-divider: #707070;
  --gantt-worked-bg: #fff4c2;
  --gantt-worked-border: #e3b341;
  --importance-bg: #d9ebff;
  --importance-text: #1955a6;
  --importance-muted-bg: #eaf4ff;
  --importance-muted-text: #456b95;
  --matrix-important-bg: #add2ff;
  --matrix-not-important-bg: #e5f2ff;
  --importance-switch-bg: #d9ebff;
  --urgency-bg: #ffdee4;
  --urgency-text: #a51f3c;
  --urgency-muted-bg: #fff0f3;
  --urgency-muted-text: #985363;
  --matrix-urgent-bg: #ffbec8;
  --matrix-not-urgent-bg: #fff0f3;
  --urgency-switch-bg: #ffdee4;
  --danger-bg: #fff2f1;
  --danger-chip: #f9d8d6;
  --danger-border: #f0c6c3;
  --danger-text: #9a2f27;
  color: var(--text);
  background: var(--app-bg);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  font-size: 15px;
  line-height: 1.5;
  font-weight: 400;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --app-bg: #171916;
  --sidebar-bg: #1f211d;
  --panel-bg: #242720;
  --field-bg: #1b1d19;
  --border: #3a3e36;
  --border-strong: #4a5046;
  --text: #e8eadf;
  --heading: #f5f6ef;
  --muted: #a6ab9f;
  --subtle: #b6baaf;
  --primary: #7db89b;
  --primary-hover: #a4d1b8;
  --primary-soft: #26382f;
  --primary-border: #4d785f;
  --neutral-soft: #343831;
  --success-bg: #1f3c2d;
  --success-text: #9ad7b2;
  --status-todo-bg: #263629;
  --status-todo-text: #acd5a8;
  --status-doing-bg: #24513a;
  --status-doing-text: #c0f0d0;
  --status-done-bg: #3f9c65;
  --status-done-text: #ffffff;
  --gantt-todo-bg: #4b5560;
  --gantt-todo-text: #f0f3f5;
  --gantt-doing-bg: #2f4e6f;
  --gantt-doing-text: #d7ecff;
  --gantt-week-divider: #8e9a87;
  --gantt-worked-bg: #4b3f22;
  --gantt-worked-border: #d8b95b;
  --importance-bg: #163b78;
  --importance-text: #d8e8ff;
  --importance-muted-bg: #27313f;
  --importance-muted-text: #9aaabe;
  --matrix-important-bg: #244f87;
  --matrix-not-important-bg: #27323c;
  --importance-switch-bg: #274c87;
  --urgency-bg: #6f1d1b;
  --urgency-text: #ffe0dd;
  --urgency-muted-bg: #3a2a2a;
  --urgency-muted-text: #c9a3a3;
  --matrix-urgent-bg: #69302e;
  --matrix-not-urgent-bg: #342d30;
  --urgency-switch-bg: #70302d;
  --danger-bg: #3b2423;
  --danger-chip: #4b2a29;
  --danger-border: #7a3d39;
  --danger-text: #f0aaa4;
}

* {
  box-sizing: border-box;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  padding: 0;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: var(--app-bg);
}

.desktop-frame {
  min-height: 100vh;
}

.window-titlebar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  height: 38px;
  align-items: stretch;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  background: var(--sidebar-bg);
  color: var(--text);
  user-select: none;
}

.window-drag-region {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 8px;
  padding-left: 10px;
  font-size: 12px;
}

.window-app-mark {
  display: inline-grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 5px;
  background: var(--primary);
  color: var(--panel-bg);
  font-size: 11px;
  font-weight: 900;
}

.window-pinned-label {
  border: 1px solid var(--primary-border);
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary-hover);
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 800;
}

.window-controls {
  display: flex;
  flex: 0 0 auto;
}

.window-control {
  display: inline-grid;
  width: 46px;
  height: 38px;
  place-items: center;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--subtle);
  cursor: default;
  padding: 0;
}

.window-control:hover,
.window-control.active {
  background: var(--neutral-soft);
  color: var(--text);
}

.window-control.pin-control.active {
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.window-control.pin-control.error {
  color: var(--danger-text);
}

.window-control.close-control:hover {
  background: #c42b1c;
  color: #fff;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  min-height: 100vh;
}

.central-reminder-backdrop {position:fixed;inset:0;z-index:200;display:grid;place-items:center;background:#0004;padding:24px 0;}


.desktop-frame.is-tauri .app-shell {
  min-height: calc(100vh - 38px);
}

.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 25;
  display: flex;
  width: 76px;
  height: 100vh;
  height: 100dvh;
  flex-direction: column;
  gap: 12px;
  border-right: 1px solid var(--border);
  background: var(--sidebar-bg);
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px 8px;
  transition: width 180ms ease, box-shadow 180ms ease;
  grid-column: 1;
}

.sidebar:is(:hover, :has(.nav-item:focus-visible)) {
  width: 232px;
  box-shadow: 8px 0 24px rgb(20 24 20 / 0.12);
}

.desktop-frame.is-tauri .sidebar {
  top: 38px;
  height: calc(100vh - 38px);
  height: calc(100dvh - 38px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 38px;
  padding: 0 14px;
  white-space: nowrap;
}

.brand-mark {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border-radius: 7px;
  background: var(--primary);
  color: var(--panel-bg);
  font-weight: 700;
}

.brand h1,
.brand p,
.topbar h2,
.topbar p,
.form-heading h3,
.form-heading p,
.column h3 {
  margin: 0;
}

.brand h1 {
  color: var(--heading);
  font-size: 15px;
}

.brand p,
.eyebrow {
  color: var(--muted);
  font-size: 12px;
}

.nav-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 4px;
}

.nav-item,
.filter-chip,
.primary-button,
.icon-button,
.worked-button,
.status-button,
.task-title {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
}

.nav-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  justify-content: flex-start;
  width: 100%;
  min-height: 34px;
  gap: 14px;
  padding: 0 19px;
  color: var(--subtle);
  background: transparent;
  text-align: left;
  white-space: nowrap;
}

.brand-copy,
.nav-item > span {
  min-width: 0;
  overflow: hidden;
  opacity: 0;
  visibility: hidden;
  transition: opacity 120ms ease;
}

.sidebar:is(:hover, :has(.nav-item:focus-visible)) .brand-copy,
.sidebar:is(:hover, :has(.nav-item:focus-visible)) .nav-item > span {
  opacity: 1;
  visibility: visible;
}

.nav-item:focus-visible {
  outline: 2px solid var(--primary-border);
  outline-offset: -2px;
}

.nav-item.active,
.nav-item:hover {
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.workspace {
  display: flex;
  grid-column: 2;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.update-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid var(--primary-border);
  border-radius: 9px;
  background: var(--primary-soft);
  color: var(--primary-hover);
  padding: 11px 13px;
}

.update-banner > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.update-banner strong {
  font-size: 13px;
}

.update-banner span {
  font-size: 12px;
  line-height: 1.45;
}

.update-banner .primary-button {
  flex: 0 0 auto;
  width: auto;
}

@media (prefers-reduced-motion: reduce) {
  .sidebar,
  .brand-copy,
  .nav-item > span {
    transition: none;
  }
}

.guide-welcome {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--primary-border);
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.guide-welcome > svg,
.guide-welcome > button {
  flex-shrink: 0;
}

.guide-welcome-copy {
  min-width: 0;
  flex: 1;
}

.guide-welcome-copy strong {
  font-size: 14px;
}

.guide-welcome-copy p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--subtle);
}

@media (max-width: 600px) {
  .guide-welcome {
    flex-wrap: wrap;
  }

  .guide-welcome-copy {
    flex-basis: calc(100% - 40px);
  }
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.topbar h2 {
  color: var(--heading);
  font-size: 28px;
  line-height: 1.2;
}

.topbar-actions {
  display: flex;
  gap: 8px;
}

.primary-button {
  min-height: 38px;
  padding: 0 14px;
  background: var(--primary);
  color: var(--panel-bg);
}

.icon-button {
  width: 38px;
  height: 38px;
  border-color: var(--border-strong);
  background: var(--panel-bg);
  color: var(--subtle);
}

.icon-button.small {
  width: 34px;
  height: 34px;
}

.icon-button.split-active {
  border-color: var(--danger-border);
  background: var(--urgency-muted-bg);
  color: var(--danger-text);
  box-shadow: inset 0 0 0 1px var(--danger-border);
}

.task-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  padding: 16px 18px;
  box-shadow: 0 1px 2px rgb(20 24 20 / 0.04);
}

.task-create-shell {
  order: 2;
}

.task-form-backdrop {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: grid;
  place-items: start center;
  background: rgb(20 24 20 / 0.18);
  padding: 64px 20px 20px;
}

.task-form-modal {
  width: min(1160px, 100%);
  max-height: calc(100vh - 96px);
  overflow: auto;
  padding: 28px 36px;
  box-shadow: 0 22px 70px rgb(20 24 20 / 0.24);
}

.task-form-create {
  border-color: var(--primary);
  background: var(--panel-bg);
  box-shadow:
    inset 4px 0 0 var(--primary),
    0 2px 8px rgb(20 24 20 / 0.08);
}

.task-form-editing {
  border-color: var(--importance-text);
  background: var(--panel-bg);
  box-shadow:
    inset 4px 0 0 var(--importance-text),
    0 2px 8px rgb(20 24 20 / 0.08);
}

.task-form-child {
  border-color: var(--urgency-text);
  background: var(--panel-bg);
  box-shadow:
    inset 4px 0 0 var(--urgency-text),
    0 2px 8px rgb(20 24 20 / 0.08);
}

.form-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
}

.form-heading h3 {
  color: var(--text);
  font-size: 16px;
  line-height: 1.25;
}

.form-mode-pill {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  max-width: min(360px, 42vw);
  min-height: 28px;
  overflow: hidden;
  border-radius: 999px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-mode-pill.editing {
  background: var(--importance-bg);
  color: var(--importance-text);
}

.form-mode-pill.child {
  background: var(--urgency-bg);
  color: var(--urgency-text);
}

.form-mode-pill.create {
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.task-create-preview-shell {
  pointer-events: none;
}

.task-form-paused {
  opacity: 0.92;
  filter: saturate(0.92);
}

.task-form-paused :disabled {
  cursor: default;
}

.form-content {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  align-items: end;
}

.form-content > .field {
  flex: 1 1 176px;
  min-width: 150px;
}

.form-content > .title-field {
  flex: 2 1 360px;
  min-width: 280px;
}

.form-content > .new-project-field {
  flex: 1 1 180px;
}

.field,
.check-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field span,
.check-field span {
  color: var(--subtle);
  font-size: 12px;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  min-height: 36px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--field-bg);
  color: var(--text);
  padding: 0 11px;
  resize: vertical;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease,
    background 120ms ease;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--primary-border);
  box-shadow: 0 0 0 3px var(--primary-soft);
  outline: none;
}

.field textarea {
  min-height: 76px;
  padding-top: 8px;
  line-height: 1.45;
}

.field textarea,
.description-text,
.gantt-description-card p,
.recurring-card-description {
  tab-size: 4;
}

.task-form-modal .form-content {
  gap: 14px;
}

.task-form-modal .advanced-fields {
  padding-top: 14px;
}

.task-form-modal .advanced-grid {
  grid-template-columns: repeat(3, minmax(180px, 1fr));
  gap: 14px;
}

.task-form-modal .modal-description-field {
  grid-column: 1 / -1;
}

.task-form-modal .modal-description-field textarea {
  min-height: clamp(160px, 24vh, 280px);
  max-height: min(46vh, 420px);
  field-sizing: content;
}

.toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  min-height: 36px;
}

.toggle-field {
  min-height: 28px;
  justify-content: flex-start;
  gap: 7px;
  border: 0;
  background: transparent;
  color: var(--subtle);
  padding: 0;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  transition:
    border-color 120ms ease,
    background 120ms ease,
    color 120ms ease;
}

.toggle-field.importance-toggle.active {
  color: var(--importance-text);
}

.toggle-field.urgency-toggle.active {
  color: var(--urgency-text);
}

.switch-track {
  position: relative;
  display: inline-flex;
  width: 34px;
  height: 20px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--neutral-soft);
  box-shadow: inset 0 0 0 1px var(--border-strong);
  transition:
    background 120ms ease,
    box-shadow 120ms ease;
}

.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--panel-bg);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.24);
  transition: transform 120ms ease;
}

.toggle-field.active .switch-thumb {
  transform: translateX(14px);
}

.importance-toggle.active .switch-track {
  background: var(--importance-text);
  box-shadow: inset 0 0 0 1px var(--importance-text);
}

.urgency-toggle.active .switch-track {
  background: var(--urgency-text);
  box-shadow: inset 0 0 0 1px var(--urgency-text);
}

.advanced-fields {
  flex: 1 0 100%;
  border: 0;
  border-top: 1px solid var(--border);
  background: transparent;
  color: var(--subtle);
  padding-top: 10px;
}

.advanced-toggle {
  flex: 0 0 auto;
  align-self: end;
  min-height: 36px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--panel-bg);
  color: var(--subtle);
  padding: 0 11px;
  font-size: 12px;
  font-weight: 700;
}

.advanced-toggle svg {
  transition: transform 120ms ease;
}

.advanced-toggle.active svg {
  transform: rotate(180deg);
}

.advanced-grid {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(160px, 220px) minmax(220px, 1fr);
  gap: 10px;
}

.description-field {
  grid-column: 1 / -1;
}

.check-field {
  align-items: flex-start;
  justify-content: center;
  min-height: 36px;
  flex-direction: row;
  gap: 6px;
}

.check-field input {
  margin-top: 3px;
}

.save-button {
  align-self: end;
  flex: 0 0 auto;
  min-width: 104px;
  min-height: 36px;
}

.error-message {
  margin: 0;
  border: 1px solid var(--danger-border);
  border-radius: 8px;
  background: var(--danger-bg);
  color: var(--danger-text);
  padding: 10px 12px;
}

.filterbar {
  order: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.error-message {
  order: 3;
}

.board {
  order: 4;
}

.filter-search,
.filter-field,
.filter-clear {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--panel-bg);
  color: var(--text);
  padding: 0 10px;
}

.filter-search {
  flex: 1 1 220px;
  max-width: 340px;
}

.filter-field {
  flex: 0 1 180px;
}

.filter-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  outline: none;
}

.custom-select {
  position: relative;
  width: 100%;
  min-width: 0;
}

.custom-select-trigger {
  display: flex;
  width: 100%;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--field-bg);
  color: var(--text);
  cursor: pointer;
  padding: 0 9px;
  text-align: left;
}

.filter-field .custom-select-trigger {
  min-height: 28px;
  border: 0;
  background: transparent;
  padding: 0;
}

.custom-select-trigger span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-select-trigger svg {
  flex: 0 0 auto;
  color: var(--muted);
  transition: transform 140ms ease;
}

.custom-select-trigger.open {
  border-color: var(--primary-border);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.filter-field .custom-select-trigger.open {
  box-shadow: none;
}

.custom-select-trigger.open svg {
  transform: rotate(180deg);
}

.custom-select-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 40;
  display: grid;
  width: max(100%, 168px);
  max-height: 260px;
  gap: 4px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  padding: 5px;
  box-shadow: 0 14px 34px rgb(20 24 20 / 0.18);
}

.custom-select-option {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--subtle);
  padding: 0 9px;
  font-size: 13px;
  font-weight: 800;
  text-align: left;
}

.custom-select-option:hover {
  background: var(--neutral-soft);
  color: var(--text);
}

.custom-select-option.active {
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.filter-clear {
  cursor: pointer;
  color: var(--subtle);
}

.filter-clear:hover {
  border-color: var(--danger-border);
  color: var(--danger-text);
}

.filter-add-button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 7px;
  margin-left: auto;
  border: 1px solid var(--primary-border);
  border-radius: 8px;
  background: var(--primary-soft);
  color: var(--primary-hover);
  cursor: pointer;
  padding: 0 12px;
  font-weight: 800;
}

.filter-add-button:hover,
.filter-add-button.active {
  border-color: var(--primary-hover);
  background: color-mix(in srgb, var(--primary-soft) 78%, var(--primary) 22%);
}

.board {
  display: grid;
  grid-template-columns: repeat(3, minmax(230px, 1fr));
  gap: 14px;
  min-height: 0;
}

.gantt-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: 0 1px 2px rgb(20 24 20 / 0.04);
}

.gantt-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border);
  padding: 12px 14px;
}

.gantt-range,
.gantt-range-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 13px;
  font-weight: 800;
}

.gantt-range-controls {
  flex-wrap: wrap;
}

.gantt-range-controls > span:first-child {
  color: var(--muted);
}

.gantt-range-separator {
  color: var(--muted);
}

.gantt-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.gantt-range-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

.gantt-range-field input {
  width: 138px;
  height: 34px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--panel-bg);
  color: var(--text);
  padding: 0 8px;
}

.gantt-range-field.compact input {
  width: 72px;
}

.gantt-chart {
  width: 100%;
  min-height: 380px;
}

.gantt-chart .gantt_layout_cell,
.gantt-chart .gantt_task,
.gantt-chart .gantt_grid,
.gantt-chart .gantt_task_scale,
.gantt-chart .gantt_grid_scale {
  background: var(--panel-bg);
}

.gantt-chart .gantt_grid_scale,
.gantt-chart .gantt_task_scale,
.gantt-chart .gantt_scale_cell,
.gantt-chart .gantt_grid_head_cell {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.gantt-chart .gantt_scale_cell {
  border-color: var(--border);
  text-align: center;
}

.gantt-chart .gantt_scale_line:first-child .gantt_scale_cell {
  background: var(--field-bg);
  color: var(--text);
  font-size: 11px;
}

.gantt-chart .gantt_scale_line:last-child .gantt_scale_cell {
  font-size: 12px;
}

.gantt-chart .gantt_grid_data .gantt_row,
.gantt-chart .gantt_task_row {
  border-color: var(--border);
}

.gantt-chart .gantt_task_cell {
  border-color: var(--border);
}

.gantt-chart .gantt_scale_cell.tw-gantt-week-start,
.gantt-chart .gantt_task_cell.tw-gantt-week-start {
  box-sizing: border-box;
  border-left: 2px solid var(--gantt-week-divider);
}

.gantt-chart .tw-gantt-activity-toggle {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 8;
  display: grid;
  width: 15px;
  height: 15px;
  place-items: center;
  transform: translate(-50%, -50%);
  border: 1px solid color-mix(in srgb, var(--gantt-worked-border) 55%, var(--border));
  border-radius: 50%;
  background: color-mix(in srgb, var(--panel-bg) 82%, transparent);
  color: var(--success-text);
  cursor: pointer;
  opacity: 0.18;
  padding: 0;
  transition:
    opacity 120ms ease,
    transform 120ms ease,
    background 120ms ease;
}

.gantt-chart .gantt_task_cell:hover .tw-gantt-activity-toggle,
.gantt-chart .tw-gantt-activity-toggle:focus-visible,
.gantt-chart .tw-gantt-activity-toggle.active {
  opacity: 1;
}

.gantt-chart .tw-gantt-activity-toggle:hover,
.gantt-chart .tw-gantt-activity-toggle:focus-visible {
  transform: translate(-50%, -50%) scale(1.16);
  outline: none;
}

.gantt-chart .tw-gantt-activity-toggle.active {
  border-color: var(--gantt-worked-border);
  background: var(--gantt-worked-bg);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--panel-bg) 75%, transparent);
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}

.gantt-chart .tw-gantt-activity-toggle span {
  transform: translateY(-0.5px);
}

.gantt-activity-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--subtle);
  font-size: 12px;
  font-weight: 750;
}

.gantt-activity-hint > span {
  display: grid;
  width: 17px;
  height: 17px;
  place-items: center;
  border: 1px solid var(--gantt-worked-border);
  border-radius: 50%;
  background: var(--gantt-worked-bg);
  color: var(--success-text);
  font-size: 11px;
  font-weight: 900;
}

.gantt-chart .gantt_cell,
.gantt-chart .gantt_tree_content {
  color: var(--text);
  font-weight: 700;
}

.gantt-chart .tw-gantt-project-grid-row,
.gantt-chart .tw-gantt-project-timeline-row {
  background: var(--field-bg);
}

.gantt-chart .tw-gantt-project-grid-row .gantt_cell,
.gantt-chart .tw-gantt-project-grid-row .gantt_tree_content {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

.gantt-chart .tw-gantt-project-timeline-row .gantt_task_cell {
  background: var(--field-bg);
}

.gantt-chart .tw-gantt-grid-important.tw-gantt-grid-urgent .gantt_cell {
  background:
    linear-gradient(135deg, var(--matrix-important-bg) 0 50%, var(--matrix-urgent-bg) 50% 100%);
  color: var(--text);
}

.gantt-chart .tw-gantt-grid-important.tw-gantt-grid-not-urgent .gantt_cell {
  background:
    linear-gradient(135deg, var(--matrix-important-bg) 0 50%, var(--matrix-not-urgent-bg) 50% 100%);
  color: var(--text);
}

.gantt-chart .tw-gantt-grid-not-important.tw-gantt-grid-urgent .gantt_cell {
  background:
    linear-gradient(135deg, var(--matrix-not-important-bg) 0 50%, var(--matrix-urgent-bg) 50% 100%);
  color: var(--text);
}

.gantt-chart .tw-gantt-grid-not-important.tw-gantt-grid-not-urgent .gantt_cell {
  background:
    linear-gradient(135deg, var(--matrix-not-important-bg) 0 50%, var(--matrix-not-urgent-bg) 50% 100%);
  color: var(--text);
}

.gantt-chart .tw-gantt-grid-important .gantt_tree_content,
.gantt-chart .tw-gantt-grid-urgent .gantt_tree_content {
  color: var(--text);
  text-shadow: none;
}

.gantt-chart .gantt_task_line {
  border: 0;
  border-radius: 8px;
  background: var(--primary);
}

.gantt-chart .gantt_task_content {
  color: var(--panel-bg);
  font-size: 12px;
  font-weight: 800;
  line-height: 24px;
  padding-left: 8px;
  text-align: left;
}

.gantt-chart .tw-gantt-project-row {
  display: none !important;
}

.gantt-chart .tw-gantt-todo {
  background: var(--gantt-todo-bg);
}

.gantt-chart .tw-gantt-todo .gantt_task_content {
  color: var(--gantt-todo-text);
}

.gantt-chart .tw-gantt-doing {
  background: var(--gantt-doing-bg);
}

.gantt-chart .tw-gantt-doing .gantt_task_content {
  color: var(--gantt-doing-text);
}

.gantt-chart .tw-gantt-done {
  background: var(--success-text);
}

.gantt-chart .tw-gantt-done .gantt_task_content {
  color: var(--panel-bg);
}

.gantt-chart .tw-gantt-overdue {
  background: var(--danger-text);
}

.gantt-chart .tw-gantt-overdue .gantt_task_content {
  color: #ffffff;
}

.gantt-chart .tw-gantt-worked-today {
  box-shadow: inset 0 0 0 2px var(--gantt-worked-border);
}

.gantt-chart .tw-gantt-selected {
  box-shadow: 0 0 0 2px var(--importance-text);
}

.gantt-chart .tw-gantt-today-cell {
  background:
    linear-gradient(90deg, var(--primary-border), var(--primary-border)) left / 2px 100% no-repeat,
    linear-gradient(90deg, var(--primary-border), var(--primary-border)) right / 2px 100% no-repeat,
    color-mix(in srgb, var(--primary-soft) 86%, var(--panel-bg) 14%) !important;
  color: var(--primary-hover) !important;
  box-shadow:
    inset 0 1px 0 var(--primary-border),
    inset 0 -1px 0 var(--primary-border);
  font-weight: 900 !important;
}

.gantt-chart .tw-gantt-worked-today-cell {
  background:
    linear-gradient(135deg, transparent 0 54%, var(--gantt-worked-bg) 54% 100%),
    var(--panel-bg) !important;
  box-shadow: inset 0 0 0 1px var(--gantt-worked-border);
}

.gantt-chart .tw-gantt-today-cell.tw-gantt-worked-today-cell {
  background:
    linear-gradient(135deg, transparent 0 48%, var(--gantt-worked-bg) 48% 100%),
    linear-gradient(90deg, var(--primary-border), var(--primary-border)) left / 2px 100% no-repeat,
    linear-gradient(90deg, var(--primary-border), var(--primary-border)) right / 2px 100% no-repeat,
    color-mix(in srgb, var(--primary-soft) 78%, var(--panel-bg) 22%) !important;
  box-shadow:
    inset 0 0 0 1px var(--gantt-worked-border),
    inset 0 1px 0 var(--primary-border),
    inset 0 -1px 0 var(--primary-border);
}

.gantt_tooltip {
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
  background: var(--panel-bg) !important;
  box-shadow: 0 12px 32px rgb(20 24 20 / 0.16) !important;
  color: var(--text) !important;
  padding: 10px 12px !important;
  opacity: 1 !important;
}

.gantt_tooltip .tw-gantt-tooltip {
  display: flex;
  min-width: 180px;
  flex-direction: column;
  gap: 6px;
  color: var(--text);
  font-family: inherit;
}

.gantt_tooltip .tw-gantt-tooltip strong {
  font-size: 13px;
  line-height: 1.35;
}

.gantt_tooltip .tw-gantt-tooltip span {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  color: var(--text);
  font-size: 12px;
}

.gantt_tooltip .tw-gantt-tooltip em {
  color: var(--muted);
  font-style: normal;
}

.gantt-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: start center;
  background: rgb(20 24 20 / 0.16);
  padding: 72px 20px 20px;
}

.gantt-detail-panel {
  display: flex;
  width: min(680px, calc(100vw - 40px));
  max-height: min(720px, calc(100vh - 100px));
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  padding: 14px;
  overflow: auto;
  box-shadow: 0 20px 60px rgb(20 24 20 / 0.22);
}

.gantt-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.gantt-detail-actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-left: auto;
}

.gantt-detail-edit {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--primary-border);
  border-radius: 8px;
  background: var(--primary-soft);
  color: var(--primary-hover);
  cursor: pointer;
  padding: 0 11px;
  font-size: 13px;
  font-weight: 900;
}

.gantt-detail-edit:hover {
  border-color: var(--primary-hover);
  background: color-mix(in srgb, var(--primary-soft) 74%, var(--primary) 26%);
}

.gantt-detail-panel h3 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  line-height: 1.25;
}

.gantt-description-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--field-bg);
  padding: 12px;
}

.gantt-description-card p {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.gantt-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.gantt-detail-grid div {
  display: flex;
  min-height: 58px;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--field-bg);
  padding: 10px;
}

.gantt-detail-grid span {
  color: var(--muted);
  font-size: 12px;
}

.gantt-detail-grid strong {
  color: var(--text);
  font-size: 14px;
}

.column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 2px;
}

.column-header h3 {
  color: var(--heading);
  font-size: 15px;
}

.column-header span {
  color: var(--muted);
  font-size: 13px;
}

.done-history-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  padding: 8px;
}

.done-history-panel.active {
  border-color: var(--primary-border);
  box-shadow: inset 3px 0 0 var(--primary);
}

.done-history-head,
.done-history-range {
  display: flex;
  align-items: center;
  gap: 7px;
}

.done-history-head {
  justify-content: space-between;
}

.done-history-toggle,
.done-history-reset {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--panel-bg);
  color: var(--subtle);
  cursor: pointer;
  padding: 0 9px;
  font-size: 12px;
  font-weight: 900;
}

.done-history-toggle.active {
  border-color: var(--primary-border);
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.done-history-reset {
  flex: 0 0 auto;
  color: var(--muted);
}

.done-history-toggle:hover,
.done-history-reset:hover {
  border-color: var(--primary-border);
  color: var(--primary-hover);
}

.done-history-range {
  flex-wrap: wrap;
}

.done-history-range label {
  display: grid;
  flex: 1 1 112px;
  gap: 4px;
}

.done-history-range span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}

.done-history-range input {
  width: 100%;
  min-height: 32px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--panel-bg);
  color: var(--text);
  padding: 0 8px;
  font-size: 12px;
}

.done-history-range input:disabled {
  opacity: 0.58;
}

.task-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 42px;
  padding-bottom: 4px;
}

.task-list.column-drag-over::after {
  position: absolute;
  right: 6px;
  bottom: -1px;
  left: 6px;
  z-index: 2;
  height: 3px;
  border-radius: 999px;
  background: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
  content: "";
}

.project-task-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-group-toggle {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--field-bg);
  color: var(--subtle);
  cursor: pointer;
  padding: 0 9px;
  text-align: left;
}

.project-group-toggle:hover {
  border-color: var(--primary-border);
  color: var(--primary-hover);
}

.project-group-toggle.dragging {
  opacity: 0.48;
}

.project-group-toggle.drag-over::after,
.task-card.drag-over::after,
.child-task.drag-over::after {
  position: absolute;
  right: 8px;
  bottom: -7px;
  left: 8px;
  z-index: 2;
  height: 3px;
  border-radius: 999px;
  background: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
  content: "";
}

.project-group-toggle svg {
  flex: 0 0 auto;
}

.project-group-toggle svg:last-child {
  transition: transform 140ms ease;
}

.project-group-toggle svg:last-child.open {
  transform: rotate(180deg);
}

.project-group-toggle span {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-group-toggle strong {
  display: grid;
  min-width: 22px;
  height: 20px;
  place-items: center;
  border-radius: 999px;
  background: var(--neutral-soft);
  color: var(--muted);
  font-size: 11px;
}

.project-task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty-state {
  margin: 0;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  color: var(--muted);
  padding: 14px;
}

.task-card,
.settings-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  padding: 14px;
}

.task-card {
  --task-matrix-left: var(--matrix-not-important-bg);
  --task-matrix-right: var(--matrix-not-urgent-bg);
}

.task-card.matrix-important {
  --task-matrix-left: var(--matrix-important-bg);
}

.task-card.matrix-not-important {
  --task-matrix-left: var(--matrix-not-important-bg);
}

.task-card.matrix-urgent {
  --task-matrix-right: var(--matrix-urgent-bg);
}

.task-card.matrix-not-urgent {
  --task-matrix-right: var(--matrix-not-urgent-bg);
}

.task-card:not(.settings-panel) {
  background:
    linear-gradient(
      110deg,
      var(--task-matrix-left) 0 49.2%,
      rgb(255 255 255 / 0.68) 49.4% 50.6%,
      var(--task-matrix-right) 50.8% 100%
    );
}

.task-card:not(.settings-panel) > .task-card-header,
.task-card:not(.settings-panel) > .task-actions {
  border-radius: 8px;
  background: rgb(255 255 255 / 0.42);
  padding: 6px;
}

:root[data-theme="dark"] .task-card:not(.settings-panel) > .task-card-header,
:root[data-theme="dark"] .task-card:not(.settings-panel) > .task-actions {
  background: rgb(20 24 20 / 0.28);
}

:root[data-theme="dark"] .task-card:not(.settings-panel) {
  background:
    linear-gradient(
      110deg,
      var(--task-matrix-left) 0 49.2%,
      rgb(255 255 255 / 0.12) 49.4% 50.6%,
      var(--task-matrix-right) 50.8% 100%
    );
}

.task-card,
.child-task {
  position: relative;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease,
    opacity 120ms ease,
    transform 120ms ease;
}

.task-card.dragging,
.child-task.dragging {
  opacity: 0.45;
}

.task-card.drag-over,
.child-task.drag-over {
  border-color: var(--border);
  box-shadow: none;
}

.settings-panel {
  max-width: 720px;
}

.settings-row {
  max-width: 280px;
}

.data-transfer-row {
  display: grid;
  max-width: none;
  gap: 10px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}

.data-transfer-copy {
  display: grid;
  gap: 3px;
}

.data-transfer-copy strong {
  color: var(--text);
  font-size: 14px;
}

.data-transfer-copy span {
  max-width: 620px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.data-transfer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.data-transfer-actions .worked-button,
.data-transfer-actions .primary-button {
  min-height: 34px;
}

.data-import-button {
  width: auto;
}

.data-transfer-message {
  margin: 0;
  border-radius: 7px;
  background: var(--success-bg);
  color: var(--success-text);
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 700;
}

.data-transfer-message.error {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.settings-toggle-row {
  display: flex;
  max-width: 520px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.settings-toggle-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.settings-toggle-copy strong {
  color: var(--text);
  font-size: 14px;
}

.settings-toggle-copy span,
.settings-toggle-copy em {
  color: var(--muted);
  font-size: 12px;
  font-style: normal;
  line-height: 1.45;
}

.settings-toggle-copy em {
  color: var(--danger-text);
}

.switch-button {
  position: relative;
  flex: 0 0 auto;
  width: 44px;
  height: 26px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--neutral-soft);
  cursor: pointer;
  padding: 2px;
  transition:
    background 140ms ease,
    border-color 140ms ease;
}

.switch-button span {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--panel-bg);
  box-shadow: 0 1px 4px rgb(20 24 20 / 0.22);
  transition: transform 140ms ease;
}

.switch-button.active {
  border-color: var(--primary-border);
  background: var(--primary);
}

.switch-button.active span {
  transform: translateX(18px);
}

.switch-button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.software-update-row {
  display: grid;
  max-width: none;
  gap: 10px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}

.software-update-copy {
  display: grid;
  gap: 3px;
}

.software-update-copy strong {
  color: var(--text);
  font-size: 14px;
}

.software-update-copy span,
.software-update-copy em {
  color: var(--muted);
  font-size: 12px;
  font-style: normal;
  line-height: 1.5;
}

.software-update-copy span.error,
.software-update-copy em {
  color: var(--danger-text);
}

.update-release-notes {
  max-width: 620px;
  max-height: 130px;
  margin: 5px 0 0;
  color: var(--subtle);
  overflow: auto;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.software-update-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.software-update-actions .worked-button,
.software-update-actions .primary-button {
  width: auto;
  min-height: 34px;
}

.spinning {
  animation: taskweave-spin 900ms linear infinite;
}

@keyframes taskweave-spin {
  to {
    transform: rotate(360deg);
  }
}

.task-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 28px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: grab;
  padding: 0;
}

.drag-handle:hover {
  background: var(--neutral-soft);
  color: var(--text);
}

.drag-handle:active {
  cursor: grabbing;
}

.child-drag-handle {
  width: 22px;
  height: 26px;
}

.child-indent-spacer {
  flex: 0 0 28px;
  width: 28px;
  height: 26px;
}

.task-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.expand-button {
  transition: transform 160ms ease;
}

.expand-button.open {
  transform: rotate(180deg);
}

.task-title {
  justify-content: flex-start;
  padding: 2px 4px;
  color: var(--text);
  background: transparent;
  font-weight: 700;
  font-size: 15px;
  line-height: 1.35;
  text-align: left;
  border-radius: 6px;
  flex-wrap: wrap;
  flex: 1 1 auto;
  min-width: 0;
}

.task-title:hover {
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.task-title-text.selected {
  color: var(--importance-text);
}

.title-toggle-hint {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  border-radius: 999px;
  background: var(--importance-bg);
  color: var(--importance-text);
  padding: 0 7px;
  font-size: 11px;
  font-weight: 800;
}

.task-title:has(.task-title-text.selected) {
  background: var(--importance-muted-bg);
  box-shadow: inset 0 0 0 1px var(--importance-bg);
}

.task-title:disabled {
  cursor: default;
  color: var(--text);
}

.child-task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-left: 2px solid var(--border-strong);
  padding-left: 10px;
}

.child-task-list.collapsed {
  gap: 0;
}

.child-list-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--field-bg);
  color: var(--subtle);
  cursor: pointer;
  padding: 0 9px;
  text-align: left;
}

.child-list-toggle:hover {
  border-color: var(--primary-border);
  color: var(--primary-hover);
}

.child-list-toggle svg {
  flex: 0 0 auto;
  transition: transform 140ms ease;
}

.child-list-toggle svg.open {
  transform: rotate(180deg);
}

.child-list-toggle span {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  font-weight: 800;
}

.child-list-toggle strong {
  flex: 0 0 auto;
}

.child-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  border-radius: 999px;
  background: var(--neutral-soft);
  color: var(--muted);
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}

.child-list-toggle em {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.child-category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 24px;
  border-radius: 6px;
  background: var(--neutral-soft);
  color: var(--muted);
  padding: 0 8px;
  font-size: 12px;
  font-weight: 800;
}

.child-category-header strong {
  font-size: 11px;
}

.task-detail-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid rgb(255 255 255 / 0.58);
  border-radius: 8px;
  padding: 10px;
  box-shadow: inset 0 0 0 1px rgb(20 24 20 / 0.03);
}

.detail-block {
  display: grid;
  gap: 4px;
}

.detail-block > span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 900;
}

.detail-block > strong,
.detail-block > p {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
}

.detail-description {
  border-bottom: 1px solid rgb(20 24 20 / 0.08);
  padding-bottom: 8px;
}

:root[data-theme="dark"] .detail-description {
  border-bottom-color: rgb(255 255 255 / 0.1);
}

.detail-tags {
  gap: 5px;
}

.description-text {
  margin: 0;
  border-left: 2px solid var(--border-strong);
  color: var(--subtle);
  padding-left: 8px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.child-task {
  display: flex;
  flex-direction: column;
  gap: 7px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--field-bg);
  padding: 9px;
}

.child-task-main,
.child-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.child-task-main {
  justify-content: flex-start;
}

.child-task-main .overdue {
  margin-left: auto;
}

.child-title {
  font-size: 14px;
  font-weight: 650;
}

.child-status-actions {
  gap: 4px;
}

.child-status-actions .status-button {
  flex: 1 1 58px;
  justify-content: center;
}

.child-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--subtle);
  font-size: 12px;
}

.badges,
.tag-row,
.task-actions,
.status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.badge,
.overdue,
.tag-row span {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  line-height: 1;
}

.badge.importance {
  background: var(--importance-bg);
  color: var(--importance-text);
}

.badge.urgency {
  background: var(--urgency-bg);
  color: var(--urgency-text);
}

.badge.importance.muted {
  background: var(--importance-muted-bg);
  color: var(--importance-muted-text);
}

.badge.urgency.muted {
  background: var(--urgency-muted-bg);
  color: var(--urgency-muted-text);
}

.overdue {
  background: var(--danger-chip);
  color: var(--danger-text);
  white-space: nowrap;
}

.meta-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 3px;
  color: var(--subtle);
  font-size: 13px;
}

.tag-row span {
  background: var(--neutral-soft);
  color: var(--subtle);
}

.status-button {
  min-height: 28px;
  padding: 0 8px;
  border-color: var(--border-strong);
  background: var(--field-bg);
  color: var(--subtle);
  font-size: 12px;
}

.status-button.active {
  border-color: var(--primary-border);
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.status-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  border: 1px solid rgb(255 255 255 / 0.56);
  border-radius: 8px;
  background: rgb(255 255 255 / 0.58);
  color: var(--muted);
  padding: 2px 4px 2px 8px;
  box-shadow: 0 1px 2px rgb(20 24 20 / 0.06);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
}

:root[data-theme="dark"] .status-select {
  border-color: rgb(255 255 255 / 0.12);
  background: rgb(20 24 20 / 0.38);
}

.compact-status {
  flex: 0 0 auto;
}

.status-select strong {
  color: var(--text);
  font-size: 12px;
  line-height: 1;
}

.status-select svg {
  color: var(--muted);
  transition: transform 140ms ease;
}

.status-select.open {
  border-color: var(--primary-border);
  box-shadow:
    0 0 0 2px var(--primary-soft),
    0 4px 12px rgb(20 24 20 / 0.08);
}

.status-select.open svg {
  transform: rotate(180deg);
}

.status-picker {
  position: relative;
  z-index: 5;
  display: inline-flex;
}

.child-status-picker {
  z-index: 6;
}

.status-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  display: grid;
  min-width: 112px;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  padding: 5px;
  box-shadow: 0 14px 32px rgb(20 24 20 / 0.18);
}

.status-menu-item {
  justify-content: flex-start;
  min-height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--subtle);
  padding: 0 9px;
  font-size: 12px;
  font-weight: 800;
}

.status-menu-item:hover {
  background: var(--neutral-soft);
  color: var(--text);
}

.status-menu-item.active {
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.child-status-select {
  min-height: 26px;
  padding-left: 7px;
}

.task-actions {
  align-items: center;
  justify-content: space-between;
}

.task-edit-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 28px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--panel-bg);
  color: var(--subtle);
  padding: 0 7px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.task-edit-button:hover { background: var(--primary-soft); color: var(--primary-hover); }
.task-edit-button { white-space: nowrap; }
.task-edit-icon { width: 28px; padding: 0; }

.inline-actions {
  justify-content: flex-start;
}

.inline-actions .worked-button,
.child-actions .worked-button {
  min-height: 28px;
  padding: 0 8px;
  background: rgb(255 255 255 / 0.58);
}

:root[data-theme="dark"] .inline-actions .worked-button,
:root[data-theme="dark"] .child-actions .worked-button {
  background: rgb(20 24 20 / 0.38);
}

.task-detail-panel,
.child-task-list,
.child-task {
  background-color: rgb(255 255 255 / 0.52);
}

:root[data-theme="dark"] .task-detail-panel,
:root[data-theme="dark"] .child-task-list,
:root[data-theme="dark"] .child-task {
  background-color: rgb(20 24 20 / 0.26);
}

.danger-action:hover {
  border-color: var(--danger-border);
  color: var(--danger-text);
}

.trash-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.trash-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  padding: 10px;
  box-shadow: 0 1px 2px rgb(20 24 20 / 0.04);
}

.trash-toolbar > span {
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
}

.trash-select-all,
.trash-card-check {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--subtle);
  font-size: 13px;
  font-weight: 800;
}

.trash-select-all input,
.trash-card-check input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

.trash-card.selected {
  border-color: var(--primary-border);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: rgb(20 24 20 / 0.22);
  padding: 20px;
}

.confirm-dialog {
  display: flex;
  width: min(460px, calc(100vw - 40px));
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--danger-border);
  border-radius: 8px;
  background: var(--panel-bg);
  padding: 14px;
  box-shadow: 0 20px 60px rgb(20 24 20 / 0.25);
}

.confirm-dialog header,
.confirm-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.confirm-dialog h3,
.confirm-dialog p {
  margin: 0;
}

.confirm-dialog h3 {
  color: var(--danger-text);
  font-size: 16px;
}

.confirm-dialog p {
  color: var(--subtle);
  font-size: 13px;
}

.confirm-items {
  display: flex;
  max-height: 160px;
  flex-direction: column;
  gap: 5px;
  overflow: auto;
}

.confirm-items span {
  border-radius: 6px;
  background: var(--danger-bg);
  color: var(--danger-text);
  padding: 5px 8px;
  font-size: 13px;
  font-weight: 800;
}

.manager-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 920px;
}

.manager-create {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  padding: 12px;
  box-shadow: 0 1px 2px rgb(20 24 20 / 0.04);
}

.manager-create .field {
  flex: 1 1 260px;
}

.manager-create .project-parent-field {
  flex-basis: 220px;
}

.compact-save {
  width: auto;
  min-width: 78px;
  min-height: 38px;
  flex: 0 0 auto;
  border-color: var(--border-strong);
  border-radius: 8px;
  background: var(--panel-bg);
  color: var(--subtle);
  padding: 0 13px;
  box-shadow: none;
  font-size: 13px;
  font-weight: 800;
}

.compact-save:hover {
  border-color: var(--primary-border);
  background: var(--primary-soft);
  color: var(--primary-hover);
  box-shadow: none;
}

.manager-list {
  display: grid;
  gap: 10px;
}

.project-tree-list {
  overflow: hidden;
}

.project-tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--field-bg);
  padding: 10px 12px;
}

.project-tree-toolbar > div:first-child {
  display: grid;
  gap: 2px;
}

.project-tree-toolbar strong {
  color: var(--text);
  font-size: 13px;
}

.project-tree-toolbar span {
  color: var(--muted);
  font-size: 12px;
}

.project-tree-toolbar-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.recurring-panel {
  display: flex;
  max-width: 1120px;
  flex-direction: column;
  gap: 14px;
}

.recurring-create,
.recurring-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: 0 1px 2px rgb(20 24 20 / 0.04);
}

.recurring-create {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
}

.recurring-create-main {
  display: grid;
  grid-template-columns: minmax(270px, 1.5fr) auto minmax(180px, 0.8fr) minmax(200px, 1fr);
  align-items: end;
  gap: 10px;
}

.recurring-title-field {
  min-width: 0;
}

.recurring-description-field {
  grid-column: 1 / -1;
}

.recurring-description-field textarea {
  min-height: 76px;
  resize: vertical;
}

.recurring-create-toggles {
  align-self: end;
  justify-content: flex-start;
  min-height: 36px;
}

.recurring-rule-panel {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(0, 1fr) auto;
  align-items: flex-end;
  gap: 10px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.recurring-rule-field {
  min-width: 0;
}

.compact-rule-field {
  flex: 0 1 180px;
}

.recurring-toggles {
  align-self: center;
}

.recurring-save {
  justify-self: end;
}

.recurring-list {
  display: grid;
  gap: 10px;
}

.recurring-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 13px;
}

.recurring-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.recurring-card-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.recurring-card-title {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  gap: 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  margin: -5px;
  padding: 5px;
  text-align: left;
}

.recurring-card-title:hover {
  background: var(--field-bg);
}

.recurring-edit-modal {
  gap: 16px;
}

.recurring-card h3,
.recurring-card p {
  margin: 0;
}

.recurring-card h3 {
  color: var(--text);
  font-size: 16px;
}

.recurring-card p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.recurring-card .recurring-card-description {
  white-space: pre-wrap;
}

.recurring-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.recurring-card-meta span {
  border-radius: 999px;
  background: var(--neutral-soft);
  color: var(--muted);
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 800;
}

.recurring-card-meta span.active {
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.recurring-card-meta .recurring-meta-priority.importance-chip {
  background: var(--matrix-important-bg);
  color: var(--importance-text);
}

.recurring-card-meta .recurring-meta-priority.importance-chip.muted {
  background: var(--matrix-not-important-bg);
  color: var(--importance-muted-text);
}

.recurring-card-meta .recurring-meta-priority.urgency-chip {
  background: var(--matrix-urgent-bg);
  color: var(--urgency-text);
}

.recurring-card-meta .recurring-meta-priority.urgency-chip.muted {
  background: var(--matrix-not-urgent-bg);
  color: var(--urgency-muted-text);
}

.manager-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  padding: 12px;
  box-shadow: 0 1px 2px rgb(20 24 20 / 0.04);
}

.manager-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 8px;
  cursor: pointer;
  margin: -4px;
  padding: 4px;
}

.manager-row-top:hover {
  background: var(--field-bg);
}

.project-tree-row {
  position: relative;
  width: calc(100% - var(--project-indent));
  margin-left: var(--project-indent);
  transition: margin 160ms ease, width 160ms ease, border-color 160ms ease;
}

.project-tree-row.is-branch-project {
  border-color: var(--border-strong);
}

.project-tree-row.is-child-project {
  border-left: 3px solid var(--primary-border);
  background: var(--panel-bg);
}

.project-tree-row.is-child-project::before {
  position: absolute;
  top: -11px;
  left: -18px;
  width: 15px;
  height: 31px;
  border-bottom: 2px solid var(--primary-border);
  border-left: 2px solid var(--primary-border);
  border-bottom-left-radius: 7px;
  content: "";
  pointer-events: none;
}

.project-tree-row .manager-row-top {
  padding-left: 4px;
}

.project-branch-toggle {
  display: inline-grid;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  place-items: center;
  border: 1px solid var(--primary-border);
  border-radius: 7px;
  background: var(--primary-soft);
  color: var(--primary-hover);
  cursor: pointer;
}

.project-branch-toggle svg {
  transition: transform 160ms ease;
}

.project-branch-toggle.collapsed svg {
  transform: rotate(-90deg);
}

.manager-main .project-branch-spacer {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.manager-main .project-child-count {
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.manager-main {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 10px;
}

.manager-main svg {
  color: var(--primary);
  flex: 0 0 auto;
}

.manager-name-button,
.manager-main strong {
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 15px;
  font-weight: 800;
  padding: 0;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manager-name-button:hover {
  color: var(--primary-hover);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.manager-main span {
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--neutral-soft);
  color: var(--muted);
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 800;
}

.manager-inline-input {
  max-width: 320px;
}

.project-inline-editor {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 8px;
}

.project-inline-editor .manager-inline-input,
.project-inline-editor .manager-inline-select {
  min-width: 0;
  flex: 1 1 180px;
}

.manager-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.manager-actions .worked-button {
  min-height: 30px;
  padding: 0 9px;
  font-size: 12px;
}

.manager-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--danger-border);
  border-radius: 8px;
  background: var(--danger-bg);
  padding: 10px;
}

.manager-confirm strong {
  color: var(--danger-text);
  font-size: 13px;
}

.manager-confirm div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.manager-task-list {
  display: grid;
  gap: 6px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.manager-empty {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.manager-task-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) repeat(3, auto);
  gap: 8px;
  align-items: center;
  min-height: 32px;
  border-radius: 8px;
  background: var(--field-bg);
  padding: 0 10px;
}

.manager-task-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manager-task-chip {
  border-radius: 999px;
  background: var(--neutral-soft);
  color: var(--muted);
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.manager-status-todo {
  background: var(--status-todo-bg);
  color: var(--status-todo-text);
}

.manager-status-doing {
  background: var(--status-doing-bg);
  color: var(--status-doing-text);
}

.manager-status-done {
  background: var(--status-done-bg);
  color: var(--status-done-text);
}

.manager-task-chip.importance-chip {
  background: var(--matrix-important-bg);
  color: var(--importance-text);
}

.manager-task-chip.importance-chip.muted {
  background: var(--matrix-not-important-bg);
  color: var(--importance-muted-text);
}

.manager-task-chip.urgency-chip {
  background: var(--matrix-urgent-bg);
  color: var(--urgency-text);
}

.manager-task-chip.urgency-chip.muted {
  background: var(--matrix-not-urgent-bg);
  color: var(--urgency-muted-text);
}

.worked-button {
  min-height: 34px;
  padding: 0 10px;
  border-color: var(--border-strong);
  background: var(--panel-bg);
  color: var(--subtle);
}

.worked-button.active {
  border-color: var(--primary-border);
  background: var(--primary-soft);
  color: var(--primary-hover);
}

.worked-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

/* Compact spacing and task rows are shared by all views. */
.task-form:not(.task-form-modal),
.settings-panel,
.manager-row,
.gantt-detail-panel {
  gap: 8px;
  padding: 10px;
}

.form-content,
.filterbar,
.board,
.column,
.manager-list,
.project-task-list {
  gap: 8px;
}

.form-content {
  align-items: end;
}

.field,
.check-field {
  gap: 4px;
}

.field > span {
  font-size: 11px;
}

.field input,
.field textarea,
.field select,
.custom-select-trigger,
.filter-search,
.filter-field,
.filter-clear,
.filter-add-button,
.save-button,
.primary-button {
  min-height: 32px;
}

.filter-search {
  max-width: none;
  flex: 2 1 190px;
}

.filter-field {
  flex: 1 1 118px;
  padding-right: 7px;
  padding-left: 7px;
}

.filter-field > svg {
  display: none;
}

.board {
  grid-template-columns: repeat(3, minmax(260px, 1fr));
}

.column-header {
  min-height: 28px;
}

.task-card,
.child-task {
  gap: 6px;
  padding: 7px;
}

.task-card:not(.settings-panel) > .task-card-header,
.task-card:not(.settings-panel) > .task-actions {
  padding: 3px;
}

.task-title {
  font-size: 14px;
  line-height: 1.25;
  padding: 1px 3px;
}

.icon-button {
  width: 32px;
  height: 32px;
}

.icon-button.small {
  width: 28px;
  height: 28px;
}

.worked-button,
.status-button,
.done-history-toggle,
.done-history-reset {
  min-height: 28px;
  padding: 0 8px;
  font-size: 12px;
}

.done-history-panel,
.task-detail-panel,
.manager-confirm,
.gantt-description-card {
  padding: 8px;
}

.done-history-panel:not(.active) .done-history-range {
  display: none;
}

.board .task-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.board .task-card > .task-card-header {
  min-width: 0;
  grid-column: 1;
  grid-row: 1;
}

.board .task-card > .task-actions {
  grid-column: 2;
  grid-row: 1;
  align-self: stretch;
  flex-wrap: nowrap;
}

.board .task-card > .task-detail-panel,
.board .task-card > .child-task-list {
  grid-column: 1 / -1;
}

.board .task-card-header,
.board .task-header-actions {
  gap: 3px;
}

.board .drag-handle {
  width: 18px;
}

.board .status-select > span,
.board .inline-actions .worked-button span,
.board .child-actions .worked-button span,
.board .child-list-toggle em,
.board .title-toggle-hint {
  display: none;
}

.board .inline-actions .worked-button,
.board .child-actions .worked-button {
  width: 28px;
  min-width: 28px;
  padding: 0;
}

.board .child-task {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.board .child-task-main {
  min-width: 0;
  grid-column: 1;
  grid-row: 1;
  gap: 4px;
}

.board .child-actions {
  grid-column: 2;
  grid-row: 1;
  flex-wrap: nowrap;
  gap: 3px;
}

.board .child-task-list {
  gap: 5px;
  padding-left: 6px;
}

.project-task-group,
.project-task-list,
.task-list {
  gap: 5px;
}

.project-group-toggle,
.child-list-toggle {
  min-height: 26px;
}

.recurring-panel {
  max-width: none;
}

.recurring-list {
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.recurring-card,
.trash-card,
.manager-create,
.project-tree-toolbar {
  padding: 9px;
}

.gantt-toolbar {
  padding: 8px 10px;
}

.settings-toggle-row {
  gap: 12px;
}

.switch-button {
  width: 40px;
  height: 24px;
}

.switch-button span {
  width: 18px;
  height: 18px;
}

.switch-button.active span {
  transform: translateX(16px);
}

@media (max-width: 1200px) {
  .form-content > .title-field {
    flex-basis: 100%;
  }
}

@media (max-width: 900px) {
  .board,
  .advanced-grid,
  .task-form-modal .advanced-grid,
  .recurring-create-main,
  .recurring-rule-panel,
  .recurring-list,
  .manager-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .manager-panel,
  .manager-create .field {
    min-width: 0;
  }

  .manager-create,
  .manager-row-top,
  .manager-main {
    flex-wrap: wrap;
  }

  .manager-create .field,
  .manager-row-top .manager-main {
    flex-basis: 100%;
  }

  .recurring-save {
    justify-self: stretch;
  }

  .task-form-modal {
    padding: 24px;
  }

  .form-content > .field,
  .form-content > .title-field,
  .toggle-row,
  .save-button,
  .advanced-fields,
  .advanced-toggle {
    flex-basis: 100%;
    width: 100%;
  }

  .toggle-row {
    justify-content: flex-start;
  }

  .project-tree-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .project-tree-toolbar-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .project-tree-row {
    width: calc(100% - min(var(--project-indent), 112px));
    margin-left: min(var(--project-indent), 112px);
  }
}
</style>
