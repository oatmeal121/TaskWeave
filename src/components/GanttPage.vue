<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Pencil, X } from "@lucide/vue";
import DateInput from "./DateInput.vue";
import type { Task, TaskStatus } from "../domain/task";
import {
  DhtmlxGanttAdapter,
  type GanttChartLabels,
  type GanttChartRow,
} from "../gantt/dhtmlxGanttAdapter";

type GanttPageLabels = GanttChartLabels & {
  noTasks: string;
  panelLabel: string;
  dateRange: string;
  previous: string;
  today: string;
  next: string;
  unableToLoad: string;
  taskDetails: string;
  edit: string;
  close: string;
  important: string;
  notImportant: string;
  urgent: string;
  notUrgent: string;
  overdue: string;
  activityHint: string;
};

const props = defineProps<{
  language: "zh" | "en";
  rows: GanttChartRow[];
  rangeStartDate: string;
  rangeEndDate: string;
  todayIso: string;
  selectedTask: Task | null;
  labels: GanttPageLabels;
  chartHeight: number;
  formatWeekday: (date: Date) => string;
  statusLabel: (status: TaskStatus) => string;
  projectLabel: (projectName: string | null) => string;
  taskCountLabel: (count: number) => string;
}>();

const emit = defineEmits<{
  "update:rangeStartDate": [value: string];
  "update:rangeEndDate": [value: string];
  previous: [];
  today: [];
  next: [];
  taskClick: [taskId: string];
  activityToggle: [taskId: string, activityDate: string];
  projectOrderChange: [projectKeys: string[]];
  taskOrderChange: [taskIds: string[]];
  projectOpened: [projectKey: string];
  projectClosed: [projectKey: string];
  taskOpened: [taskId: string];
  taskClosed: [taskId: string];
  closeTaskDetails: [];
  editTask: [task: Task];
}>();

const ganttContainerEl = ref<HTMLDivElement | null>(null);
const ganttErrorMessage = ref<string | null>(null);
const ganttChart = new DhtmlxGanttAdapter();
const chartStyle = computed(() => {
  const contentHeight = Math.max(380, props.chartHeight);
  return {
    height: `min(${contentHeight}px, calc(100vh - 174px))`,
    minHeight: "360px",
  };
});

onMounted(() => {
  window.addEventListener("resize", resizeGanttChart);
  void nextTick(renderGanttChart);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeGanttChart);
  ganttChart.destroy();
});

watch(
  () => [
    props.rows,
    props.rangeStartDate,
    props.rangeEndDate,
    props.todayIso,
    props.labels,
    props.chartHeight,
  ],
  () => {
    void nextTick(renderGanttChart);
  },
  { deep: true },
);

async function renderGanttChart() {
  if (!ganttContainerEl.value || props.rows.length === 0) {
    return;
  }

  ganttErrorMessage.value = null;
  try {
    await ganttChart.render({
      container: ganttContainerEl.value,
      rows: props.rows,
      startDate: props.rangeStartDate,
      endDate: props.rangeEndDate,
      today: props.todayIso,
      labels: props.labels,
      formatWeekday: props.formatWeekday,
      taskCountLabel: props.taskCountLabel,
      onTaskClick: (taskId) => emit("taskClick", taskId),
      onActivityToggle: (taskId, activityDate) => emit("activityToggle", taskId, activityDate),
      onProjectOrderChange: (projectKeys) => emit("projectOrderChange", projectKeys),
      onTaskOrderChange: (taskIds) => emit("taskOrderChange", taskIds),
      onProjectOpened: (projectKey) => emit("projectOpened", projectKey),
      onProjectClosed: (projectKey) => emit("projectClosed", projectKey),
      onTaskOpened: (taskId) => emit("taskOpened", taskId),
      onTaskClosed: (taskId) => emit("taskClosed", taskId),
    });
  } catch (error) {
    ganttErrorMessage.value =
      error instanceof Error ? error.message : "Unable to load the Gantt chart.";
  }
}

function resizeGanttChart() {
  ganttChart.resize();
}
</script>

<template>
  <p v-if="rows.length === 0" class="empty-state">
    {{ labels.noTasks }}
  </p>

  <section v-else class="gantt-panel" :aria-label="labels.panelLabel">
    <div class="gantt-toolbar">
      <div class="gantt-range-controls">
        <span>{{ labels.dateRange }}</span>
        <label class="gantt-range-field">
          <span class="sr-only">{{ labels.start }}</span>
          <DateInput
            :model-value="rangeStartDate"
            :language="language"
            @update:model-value="$emit('update:rangeStartDate', $event)"
          />
        </label>
        <span class="gantt-range-separator">-</span>
        <label class="gantt-range-field">
          <span class="sr-only">{{ labels.due }}</span>
          <DateInput
            :model-value="rangeEndDate"
            :language="language"
            @update:model-value="$emit('update:rangeEndDate', $event)"
          />
        </label>
      </div>

      <div class="gantt-actions">
        <span class="gantt-activity-hint">
          <span aria-hidden="true">✓</span>
          {{ labels.activityHint }}
        </span>
        <button class="filter-clear" type="button" @click="$emit('previous')">
          {{ labels.previous }}
        </button>
        <button class="filter-clear" type="button" @click="$emit('today')">
          {{ labels.today }}
        </button>
        <button class="filter-clear" type="button" @click="$emit('next')">
          {{ labels.next }}
        </button>
      </div>
    </div>

    <div
      v-show="!ganttErrorMessage"
      ref="ganttContainerEl"
      class="gantt-chart"
      :style="chartStyle"
    ></div>
    <p v-if="ganttErrorMessage" class="empty-state gantt-error">
      {{ labels.unableToLoad }}
      {{ ganttErrorMessage }}
    </p>
  </section>

  <Transition name="tw-overlay">
  <div
    v-if="selectedTask"
    class="gantt-detail-backdrop"
    @click.self="$emit('closeTaskDetails')"
  >
    <section class="gantt-detail-panel">
      <header class="gantt-detail-header">
        <div>
          <p class="eyebrow">{{ labels.taskDetails }}</p>
          <h3>{{ selectedTask.title }}</h3>
        </div>
        <div class="gantt-detail-actions">
          <div class="badges" aria-label="Importance">
            <span
              class="badge importance"
              :class="{ muted: !selectedTask.isImportant }"
            >
              {{ selectedTask.isImportant ? labels.important : labels.notImportant }}
            </span>
            <span
              class="badge urgency"
              :class="{ muted: !selectedTask.isUrgent }"
            >
              {{ selectedTask.isUrgent ? labels.urgent : labels.notUrgent }}
            </span>
            <span v-if="selectedTask.isOverdue" class="overdue">
              {{ labels.overdue }}
            </span>
          </div>
          <button
            class="gantt-detail-edit"
            type="button"
            @click="$emit('editTask', selectedTask)"
          >
            <Pencil :size="15" aria-hidden="true" />
            <span>{{ labels.edit }}</span>
          </button>
          <button
            class="icon-button small"
            type="button"
            :title="labels.close"
            @click="$emit('closeTaskDetails')"
          >
            <X :size="16" aria-hidden="true" />
          </button>
        </div>
      </header>

      <section v-if="selectedTask.description" class="gantt-description-card">
        <p>{{ selectedTask.description }}</p>
      </section>

      <div class="gantt-detail-grid">
        <div>
          <span>{{ labels.status }}</span>
          <strong>{{ statusLabel(selectedTask.status) }}</strong>
        </div>
        <div>
          <span>{{ labels.project }}</span>
          <strong>{{ projectLabel(selectedTask.projectName) }}</strong>
        </div>
        <div>
          <span>{{ labels.start }}</span>
          <strong>{{ [selectedTask.startDate, selectedTask.startTime].filter(Boolean).join(' ') }}</strong>
        </div>
        <div>
          <span>{{ labels.due }}</span>
          <strong>{{ selectedTask.dueDate ? [selectedTask.dueDate, selectedTask.dueTime].filter(Boolean).join(' ') : labels.openEnded }}</strong>
        </div>
        <div v-if="selectedTask.completionDate">
          <span>{{ labels.done }}</span>
          <strong>{{ selectedTask.completionDate }}</strong>
        </div>
      </div>

      <div v-if="selectedTask.tags.length > 0" class="tag-row">
        <span v-for="tag in selectedTask.tags" :key="tag">#{{ tag }}</span>
      </div>
    </section>
  </div>
  </Transition>
</template>
