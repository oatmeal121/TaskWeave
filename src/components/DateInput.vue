<script setup lang="ts">
import { computed, nextTick, ref, watch, watchEffect } from "vue";
import { CalendarDays } from "@lucide/vue";

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  modelValue?: string | null;
  language?: "zh" | "en";
  min?: string;
  max?: string;
  disabled?: boolean;
}>(), { modelValue: "", language: "zh" });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const draft = ref(props.modelValue ?? "");
const textInput = ref<HTMLInputElement | null>(null);
const picker = ref<HTMLInputElement | null>(null);
const touched = ref(false);
const zh = computed(() => props.language === "zh");
const candidate = computed(() => draft.value.trim().replace(/\//g, "-"));
function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}
const error = computed(() => {
  const value = candidate.value;
  if (!value || props.disabled) return "";
  if (!isDate(value)) return zh.value ? "请输入有效日期，格式为年-月-日，例如 2026-10-22" : "Enter a valid date as YYYY-MM-DD, for example 2026-10-22";
  if (props.min && value < props.min) return zh.value ? `日期不能早于 ${props.min}` : `Date must be on or after ${props.min}`;
  if (props.max && value > props.max) return zh.value ? `日期不能晚于 ${props.max}` : `Date must be on or before ${props.max}`;
  return "";
});
watch(() => props.modelValue, value => { draft.value = value ?? ""; });
watchEffect(() => textInput.value?.setCustomValidity(error.value));
function edit(event: Event) {
  draft.value = (event.target as HTMLInputElement).value;
  if (!error.value) emit("update:modelValue", candidate.value);
}
function finish() {
  touched.value = true;
  if (!error.value) draft.value = candidate.value;
}
function openPicker() {
  if (props.disabled) return;
  if (picker.value?.showPicker) picker.value.showPicker();
  else picker.value?.click();
}
async function choose(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  draft.value = value;
  touched.value = true;
  emit("update:modelValue", value);
  await nextTick();
  textInput.value?.focus({ preventScroll: true });
}
</script>

<template>
  <span class="date-input" :class="{ 'date-input-disabled': disabled }">
    <input
      ref="textInput"
      v-bind="$attrs"
      class="date-text-input"
      type="text"
      :value="draft"
      :placeholder="zh ? '年-月-日' : 'YYYY-MM-DD'"
      :disabled="disabled"
      :aria-invalid="touched && error ? 'true' : undefined"
      :title="error || 'YYYY-MM-DD'"
      maxlength="10"
      autocomplete="off"
      @input="edit"
      @blur="finish"
      @keydown.alt.down.prevent="openPicker"
    />
    <button class="date-picker-button" type="button" :disabled="disabled" :title="zh ? '选择日期' : 'Choose date'" :aria-label="zh ? '选择日期' : 'Choose date'" @click="openPicker">
      <CalendarDays :size="15" aria-hidden="true" />
    </button>
    <input ref="picker" class="native-date-picker" type="date" :value="modelValue" :min="min" :max="max" :disabled="disabled" :lang="zh ? 'zh-CN' : 'en'" tabindex="-1" aria-hidden="true" @change="choose" />
  </span>
</template>

<style scoped>
.date-input { position: relative; display: block; width: 100%; min-width: 0; font-size: inherit; }
.date-input .date-text-input { width: 100%; padding-right: 34px; font: inherit; font-variant-numeric: tabular-nums; }
.date-input .date-text-input[aria-invalid="true"] { border-color: var(--danger-border); }
.date-picker-button { position: absolute; top: 1px; right: 1px; bottom: 1px; display: grid; width: 31px; place-items: center; border: 0; border-radius: 0 7px 7px 0; padding: 0; background: transparent; color: var(--subtle); cursor: pointer; }
.date-picker-button:hover { background: var(--neutral-soft); color: var(--primary-hover); }
.date-picker-button:focus-visible { outline: 2px solid var(--primary-border); outline-offset: -3px; }
.date-input .native-date-picker { position: absolute; top: 0; right: 0; width: 1px; height: 1px; min-height: 0; border: 0; padding: 0; opacity: 0; pointer-events: none; }
.date-input-disabled { opacity: .58; }
.date-input-disabled .date-text-input { opacity: 1; }
.date-picker-button:disabled { cursor: default; }
.date-picker-button { transition: background-color var(--motion-fast, 120ms) ease, color var(--motion-fast, 120ms) ease; }
.date-picker-button:not(:disabled):active svg { transform: scale(.92); }
.date-picker-button svg { transition: transform var(--motion-fast, 120ms) var(--motion-ease, ease); }
@media (prefers-reduced-motion: reduce) {
  .date-picker-button, .date-picker-button svg { transition: none; }
  .date-picker-button:not(:disabled):active svg { transform: none; }
}
</style>
