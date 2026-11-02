<script setup lang="ts">
type CycleStep = "start" | "due";
type CycleOption = {
  value: number;
  label: string;
};

const props = withDefaults(
  defineProps<{
    startLabel: string;
    dueLabel: string;
    unsetLabel: string;
    startValue: number | null;
    dueValue: number | null;
    placementStep: CycleStep;
    options: CycleOption[];
    summary: string;
    notice?: string;
    daysClass?: string;
  }>(),
  {
    notice: "",
    daysClass: "",
  },
);

defineEmits<{
  pick: [value: number];
}>();

function optionLabel(value: number | null) {
  if (!value) {
    return props.unsetLabel;
  }

  return props.options.find((option) => option.value === value)?.label ?? String(value);
}

function isInRange(value: number) {
  const start = props.startValue;
  const due = props.dueValue;

  if (!start || !due) {
    return false;
  }

  if (start <= due) {
    return value >= start && value <= due;
  }

  return value >= start || value <= due;
}
</script>

<template>
  <div class="cycle-picker">
    <div class="cycle-toolbar">
      <span class="cycle-slot" :class="{ active: placementStep === 'start' }">
        <span>{{ startLabel }}</span>
        <strong>{{ optionLabel(startValue) }}</strong>
      </span>
      <span class="cycle-arrow" aria-hidden="true">-&gt;</span>
      <span class="cycle-slot" :class="{ active: placementStep === 'due' }">
        <span>{{ dueLabel }}</span>
        <strong>{{ optionLabel(dueValue) }}</strong>
      </span>
      <p>{{ summary }}</p>
    </div>

    <div class="cycle-days" :class="daysClass" role="group">
      <button
        v-for="option in options"
        :key="option.value"
        class="cycle-day"
        :class="{
          start: startValue === option.value,
          due: dueValue === option.value,
          inRange: isInRange(option.value),
        }"
        type="button"
        @click="$emit('pick', option.value)"
      >
        <span>{{ option.label }}</span>
        <em v-if="startValue === option.value">{{ startLabel }}</em>
        <em v-if="dueValue === option.value">{{ dueLabel }}</em>
      </button>
    </div>

    <Transition name="tw-popover">
      <p v-if="notice" class="cycle-notice">{{ notice }}</p>
    </Transition>
  </div>
</template>

<style scoped>
.cycle-picker {
  display: contents;
}

.cycle-toolbar {
  display: flex;
  grid-column: 2;
  grid-row: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.cycle-slot {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--field-bg);
  color: var(--subtle);
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
  transition: background-color var(--motion-fast, 120ms) ease,
    border-color var(--motion-fast, 120ms) ease,
    color var(--motion-fast, 120ms) ease,
    box-shadow var(--motion-fast, 120ms) ease;
}

.cycle-slot.active {
  border-color: var(--primary-border);
  background: var(--primary-soft);
  color: var(--primary-hover);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-soft) 68%, transparent);
}

.cycle-slot strong {
  color: var(--text);
  font-size: 13px;
}

.cycle-arrow {
  flex: 0 0 auto;
  color: var(--muted);
  font-weight: 900;
}

.cycle-toolbar p {
  min-width: 150px;
  flex: 1 1 auto;
  margin: 0 0 0 4px;
  color: var(--subtle);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.35;
}

.cycle-days {
  display: grid;
  grid-column: 1 / 3;
  grid-row: 2;
  grid-template-columns: repeat(7, minmax(44px, 1fr));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
}

.cycle-days.monthly {
  grid-template-columns: repeat(8, minmax(42px, 1fr));
}

.cycle-day {
  position: relative;
  display: grid;
  min-height: 42px;
  align-content: center;
  border: 0;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  gap: 2px;
  padding: 5px 4px;
  font-size: 12px;
  font-weight: 850;
  transition: background-color var(--motion-fast, 120ms) ease,
    color var(--motion-fast, 120ms) ease,
    box-shadow var(--motion-fast, 120ms) ease;
}

.cycle-days.monthly .cycle-day {
  min-height: 40px;
}

.cycle-day:last-child,
.cycle-days.monthly .cycle-day:nth-child(8n) {
  border-right: 0;
}

.cycle-day.inRange {
  background: color-mix(in srgb, var(--primary-soft) 58%, transparent);
}

.cycle-day.inRange::after {
  position: absolute;
  right: 5px;
  bottom: 4px;
  left: 5px;
  height: 2px;
  border-radius: 999px;
  background: var(--primary);
  content: "";
  opacity: 0.62;
}

.cycle-day.start,
.cycle-day.due {
  background: var(--field-bg);
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--primary-border);
}

.cycle-day.start.due {
  box-shadow: inset 0 0 0 2px var(--primary-border), inset 0 -3px 0 var(--primary);
}

.cycle-day.due::before {
  position: absolute;
  right: 4px;
  bottom: 3px;
  width: 0;
  height: 0;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-left: 6px solid var(--primary);
  content: "";
  opacity: 0.82;
}

.cycle-day span {
  position: relative;
  z-index: 1;
}

.cycle-day em {
  position: relative;
  z-index: 1;
  justify-self: center;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary-hover);
  padding: 1px 5px;
  font-size: 10px;
  font-style: normal;
}

.cycle-notice {
  grid-column: 1 / 3;
  grid-row: 3;
  margin: -1px 0 0;
  border: 1px solid color-mix(in srgb, var(--primary-border) 45%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--primary-soft) 58%, var(--panel-bg));
  color: var(--subtle);
  padding: 7px 9px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
}

@media (prefers-reduced-motion: reduce) {
  .cycle-slot,
  .cycle-day {
    transition: none;
  }
}
</style>
