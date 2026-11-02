import type { TaskStatus } from "../domain/task";

type DhtmlxGantt = typeof import("dhtmlx-gantt")["gantt"];

export type GanttChartLabels = {
  taskName: string;
  project: string;
  status: string;
  start: string;
  due: string;
  done: string;
  openEnded: string;
  unfiled: string;
  addActivity: string;
  removeActivity: string;
};

export type GanttChartProjectRow = {
  kind: "project";
  id: string;
  text: string;
  projectKey: string;
  taskCount: number;
  open: boolean;
};

export type GanttChartTaskRow = {
  kind: "task";
  id: string;
  text: string;
  startDate: string;
  startTime?: string | null;
  endTime?: string | null;
  endDate: string;
  parentId: string;
  open: boolean;
  status: TaskStatus;
  statusLabel: string;
  overdue: boolean;
  workedToday: boolean;
  activityDates: string[];
  isImportant: boolean;
  isUrgent: boolean;
  realStartDate: string;
  realDueDate: string | null;
  completionDate: string | null;
  projectName: string | null;
  selected: boolean;
};

export type GanttChartRow = GanttChartProjectRow | GanttChartTaskRow;

export type GanttChartRenderOptions = {
  container: HTMLElement;
  rows: GanttChartRow[];
  startDate: string;
  endDate: string;
  today: string;
  labels: GanttChartLabels;
  formatWeekday: (date: Date) => string;
  taskCountLabel: (count: number) => string;
  onTaskClick: (taskId: string) => void;
  onActivityToggle: (taskId: string, activityDate: string) => void | Promise<void>;
  onProjectOrderChange: (projectKeys: string[]) => void;
  onTaskOrderChange: (taskIds: string[]) => void | Promise<void>;
  onProjectOpened: (projectKey: string) => void;
  onProjectClosed: (projectKey: string) => void;
  onTaskOpened: (taskId: string) => void;
  onTaskClosed: (taskId: string) => void;
};

type GanttTaskData = {
  id: string;
  text?: string;
  status?: TaskStatus;
  statusLabel?: string;
  overdue?: boolean;
  projectRow?: boolean;
  taskCount?: number;
  realStartDate?: string;
  realDueDate?: string | null;
  completionDate?: string | null;
  projectName?: string | null;
  activityDates?: string[];
  isImportant?: boolean;
  isUrgent?: boolean;
  selected?: boolean;
};

export class DhtmlxGanttAdapter {
  private gantt: DhtmlxGantt | null = null;
  private initialized = false;
  private latestOptions: GanttChartRenderOptions | null = null;
  private rowById = new Map<string, GanttChartRow>();
  private container: HTMLElement | null = null;
  private activityClickHandler: ((event: MouseEvent) => void) | null = null;

  async render(options: GanttChartRenderOptions) {
    this.latestOptions = options;
    this.rowById = new Map(options.rows.map((row) => [row.id, row]));

    const gantt = await this.getGanttApi();
    const viewport = this.initialized ? gantt.getScrollState() : null;
    const gridWidth = this.initialized ? gantt.config.grid_width : 250;

    if (!this.initialized) {
      this.configureOnce(gantt, options.container);
    }

    gantt.config.columns = [
      { name: "text", label: options.labels.taskName, tree: true, width: gridWidth, resize: true },
    ];
    gantt.config.grid_width = gridWidth;
    gantt.config.scales = this.scales(options.formatWeekday);
    gantt.config.start_date = parseLocalDate(options.startDate);
    gantt.config.end_date = parseLocalDate(addDaysIso(options.endDate, 1));
    gantt.clearAll();
    gantt.parse({
      data: options.rows.map((row) => this.toDhtmlxRow(row, options)),
    });
    if (viewport) {
      gantt.scrollTo(viewport.x, viewport.y);
    }
  }

  resize() {
    this.gantt?.setSizes();
  }

  destroy() {
    if (this.container && this.activityClickHandler) {
      this.container.removeEventListener("click", this.activityClickHandler, true);
    }
    if (this.initialized && this.gantt) {
      this.gantt.destructor();
    }
    this.gantt = null;
    this.initialized = false;
    this.latestOptions = null;
    this.rowById = new Map();
    this.container = null;
    this.activityClickHandler = null;
  }

  private async getGanttApi() {
    if (!this.gantt) {
      const module = await import("dhtmlx-gantt");
      this.gantt = module.Gantt.getGanttInstance();
    }

    return this.gantt;
  }

  private configureOnce(gantt: DhtmlxGantt, container: HTMLElement) {
    this.container = container;
    gantt.plugins({ tooltip: true });
    gantt.config.date_format = "%Y-%m-%d";
    gantt.config.readonly = false;
    gantt.config.drag_move = false;
    gantt.config.drag_resize = false;
    gantt.config.drag_progress = false;
    gantt.config.drag_links = false;
    gantt.config.show_links = false;
    gantt.config.scroll_on_click = false;
    gantt.config.order_branch = "marker";
    gantt.config.order_branch_free = false;
    gantt.config.details_on_dblclick = false;
    gantt.config.show_progress = false;
    gantt.config.grid_width = 250;
    gantt.config.row_height = 42;
    gantt.config.bar_height = 24;
    gantt.config.scale_height = 56;
    gantt.config.inherit_scale_class = true;

    gantt.templates.task_class = (_start, _end, task) => {
      const taskData = task as GanttTaskData;
      return [
        taskData.projectRow ? "tw-gantt-project-row" : "",
        taskData.status === "todo" ? "tw-gantt-todo" : "",
        taskData.status === "doing" ? "tw-gantt-doing" : "",
        taskData.status === "done" ? "tw-gantt-done" : "",
        taskData.status !== "done" && taskData.overdue ? "tw-gantt-overdue" : "",
        taskData.selected ? "tw-gantt-selected" : "",
      ]
        .filter(Boolean)
        .join(" ");
    };
    gantt.templates.task_text = (_start, _end, task) =>
      (task as GanttTaskData).projectRow ? "" : ((task as GanttTaskData).statusLabel ?? "");

    const templates = gantt.templates as typeof gantt.templates & {
      grid_row_class?: (start: Date, end: Date, task: unknown) => string;
      scale_cell_class?: (date: Date) => string;
      task_row_class?: (start: Date, end: Date, task: unknown) => string;
      tooltip_text?: (start: Date, end: Date, task: unknown) => string;
      timeline_cell_class?: (task: unknown, date: Date) => string;
    };
    templates.grid_row_class = (_start, _end, task) => this.gridRowClass(task as GanttTaskData);
    templates.scale_cell_class = (date) => this.scaleCellClass(date);
    templates.task_row_class = (_start, _end, task) =>
      (task as GanttTaskData).projectRow ? "tw-gantt-project-timeline-row" : "";
    templates.tooltip_text = (_start, _end, task) => this.tooltipHtml(task as GanttTaskData);
    templates.timeline_cell_class = (task, date) =>
      this.timelineCellClass(task as GanttTaskData, date);
    templates.timeline_cell_content = (task, date) =>
      this.timelineCellContent(task as GanttTaskData, date);

    this.activityClickHandler = (event) => this.handleActivityClick(event);
    container.addEventListener("click", this.activityClickHandler, true);

    gantt.attachEvent("onTaskClick", (id, event) => this.handleTaskClick(String(id), event));
    gantt.attachEvent("onBeforeRowDragMove", (id, parent) =>
      this.canMoveRowWithinCurrentParent(String(id), String(parent ?? 0)),
    );
    gantt.attachEvent("onBeforeRowDragEnd", (id, parent) =>
      this.canMoveRowWithinCurrentParent(String(id), String(parent ?? 0)),
    );
    gantt.attachEvent("onRowDragEnd", (id) => {
      void this.persistRowOrder(String(id));
    });
    gantt.attachEvent("onTaskOpened", (id) => this.handleTaskOpened(String(id)));
    gantt.attachEvent("onTaskClosed", (id) => this.handleTaskClosed(String(id)));
    gantt.init(container);
    this.initialized = true;
  }

  private toDhtmlxRow(row: GanttChartRow, options: GanttChartRenderOptions) {
    if (row.kind === "project") {
      return {
        id: row.id,
        text: row.text,
        start_date: parseLocalDate(options.startDate),
        end_date: parseLocalDate(addDaysIso(options.endDate, 1)),
        parent: 0,
        type: "project",
        open: row.open,
        projectRow: true,
        taskCount: row.taskCount,
      };
    }

    return {
      id: row.id,
      text: row.text,
      start_date: row.startTime ? new Date(`${row.startDate}T${row.startTime}`) : parseLocalDate(row.startDate),
      end_date: row.endTime ? new Date(`${row.endDate}T${row.endTime}`) : parseLocalDate(addDaysIso(row.endDate, 1)),
      parent: row.parentId,
      open: row.open,
      status: row.status,
      statusLabel: row.statusLabel,
      overdue: row.overdue,
      workedToday: row.workedToday,
      activityDates: row.activityDates,
      isImportant: row.isImportant,
      isUrgent: row.isUrgent,
      realStartDate: row.realStartDate,
      realDueDate: row.realDueDate,
      completionDate: row.completionDate,
      projectName: row.projectName,
      selected: row.selected,
    };
  }

  private scales(formatWeekday: (date: Date) => string): DhtmlxGantt["config"]["scales"] {
    return [
      { unit: "day", step: 1, format: formatWeekday },
      { unit: "day", step: 1, format: "%m/%d" },
    ] as DhtmlxGantt["config"]["scales"];
  }

  private handleTaskClick(id: string, event?: Event) {
    const target = event?.target as HTMLElement | null;
    if (target?.closest(".gantt_tree_icon, .gantt_open, .gantt_close")) {
      return true;
    }

    const row = this.rowById.get(id);
    if (row?.kind === "task") {
      this.latestOptions?.onTaskClick(row.id);
    }

    return true;
  }

  private canMoveRowWithinCurrentParent(id: string, targetParentId: string) {
    const currentParentId = String(this.gantt?.getParent(id) ?? 0);
    return currentParentId === String(targetParentId ?? 0);
  }

  private async persistRowOrder(id: string) {
    if (!this.gantt || !this.latestOptions) {
      return;
    }

    const row = this.rowById.get(id);
    if (row?.kind === "project") {
      const orderedProjectKeys = this.gantt
        .getChildren(0)
        .map((childId) => this.rowById.get(String(childId)))
        .filter((childRow): childRow is GanttChartProjectRow => childRow?.kind === "project")
        .map((childRow) => childRow.projectKey);
      this.latestOptions.onProjectOrderChange(orderedProjectKeys);
      return;
    }

    const parentId = this.gantt.getParent(id);
    const orderedSiblingIds = this.gantt
      .getChildren(parentId)
      .map((childId) => String(childId))
      .filter((childId) => this.rowById.get(childId)?.kind === "task");

    await this.latestOptions.onTaskOrderChange(orderedSiblingIds);
  }

  private handleTaskOpened(id: string) {
    const row = this.rowById.get(id);
    if (row?.kind === "project") {
      this.latestOptions?.onProjectOpened(row.projectKey);
    } else if (row?.kind === "task") {
      this.latestOptions?.onTaskOpened(row.id);
    }
    return true;
  }

  private handleTaskClosed(id: string) {
    const row = this.rowById.get(id);
    if (row?.kind === "project") {
      this.latestOptions?.onProjectClosed(row.projectKey);
    } else if (row?.kind === "task") {
      this.latestOptions?.onTaskClosed(row.id);
    }
    return true;
  }

  private gridRowClass(taskData: GanttTaskData) {
    if (taskData.projectRow) {
      return "tw-gantt-project-grid-row";
    }

    return [
      taskData.isImportant ? "tw-gantt-grid-important" : "tw-gantt-grid-not-important",
      taskData.isUrgent ? "tw-gantt-grid-urgent" : "tw-gantt-grid-not-urgent",
    ].join(" ");
  }

  private scaleCellClass(date: Date) {
    return [
      date.getDay() === 1 ? "tw-gantt-week-start" : "",
      localIsoDate(date) === this.latestOptions?.today ? "tw-gantt-today-cell" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  private timelineCellClass(taskData: GanttTaskData, date: Date) {
    const isoDate = localIsoDate(date);
    const isToday = isoDate === this.latestOptions?.today;
    return [
      date.getDay() === 1 ? "tw-gantt-week-start" : "",
      isToday ? "tw-gantt-today-cell" : "",
      taskData.activityDates?.includes(isoDate) ? "tw-gantt-worked-today-cell" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  private timelineCellContent(taskData: GanttTaskData, date: Date) {
    const options = this.latestOptions;
    const taskId = taskData.id;
    if (!options || taskData.projectRow || !taskId) {
      return "";
    }

    const activityDate = localIsoDate(date);
    if (activityDate > options.today) {
      return "";
    }

    const active = taskData.activityDates?.includes(activityDate) ?? false;
    const actionLabel = active ? options.labels.removeActivity : options.labels.addActivity;
    const label = `${actionLabel}: ${activityDate}`;
    return `
      <button
        class="tw-gantt-activity-toggle${active ? " active" : ""}"
        type="button"
        data-tw-activity-task-id="${escapeTooltipHtml(taskId)}"
        data-tw-activity-date="${activityDate}"
        aria-label="${escapeTooltipHtml(label)}"
        aria-pressed="${active}"
        title="${escapeTooltipHtml(label)}"
      ><span aria-hidden="true">${active ? "✓" : ""}</span></button>
    `;
  }

  private handleActivityClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const toggle = target?.closest<HTMLElement>("[data-tw-activity-task-id][data-tw-activity-date]");
    if (!toggle || !this.container?.contains(toggle)) {
      return;
    }

    const taskId = toggle.dataset.twActivityTaskId;
    const activityDate = toggle.dataset.twActivityDate;
    if (!taskId || !activityDate) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void this.latestOptions?.onActivityToggle(taskId, activityDate);
  }

  private tooltipHtml(taskData: GanttTaskData) {
    const options = this.latestOptions;
    if (!options) {
      return "";
    }

    if (taskData.projectRow) {
      const countLabel = options.taskCountLabel(taskData.taskCount ?? 0);
      return `
        <div class="tw-gantt-tooltip">
          <strong>${escapeTooltipHtml(taskData.text ?? "")}</strong>
          <span><em>${escapeTooltipHtml(options.labels.project)}</em>${escapeTooltipHtml(countLabel)}</span>
        </div>
      `;
    }

    const rows = [
      [options.labels.status, taskData.statusLabel ?? ""],
      [options.labels.start, taskData.realStartDate ?? ""],
      [options.labels.due, taskData.realDueDate ?? options.labels.openEnded],
      [options.labels.project, taskData.projectName ?? options.labels.unfiled],
    ];

    if (taskData.completionDate) {
      rows.push([options.labels.done, taskData.completionDate]);
    }

    return `
      <div class="tw-gantt-tooltip">
        <strong>${escapeTooltipHtml(taskData.text ?? "")}</strong>
        ${rows
          .map(
            ([label, value]) =>
              `<span><em>${escapeTooltipHtml(label)}</em>${escapeTooltipHtml(value)}</span>`,
          )
          .join("")}
      </div>
    `;
  }
}

function parseLocalDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeTooltipHtml(value: string) {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return value.replace(/[&<>"']/g, (char) => replacements[char] ?? char);
}
