<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Bell, Check, ChevronDown, Clock3, ExternalLink, X } from "@lucide/vue";
import ExpandTransition from "./ExpandTransition.vue";
import type { ReminderAlert } from "../domain/reminderAlert";
import { snoozeDurationMinutes, type SnoozeUnit } from "../domain/reminderAlert";

const props = defineProps<{
  alerts: ReminderAlert[];
  language: "zh" | "en";
  desktop?: boolean;
  busy?: boolean;
  error?: string;
}>();
const emit = defineEmits<{
  dismiss: [ids: string[]];
  snooze: [id: string, minutes: number];
  viewTask: [alert: ReminderAlert];
}>();
const zh = computed(() => props.language === "zh");
const customSnoozeId = ref<string | null>(null);
const customAmount = ref<number | string>(5);
const customUnit = ref<SnoozeUnit>("minutes");
const customMinutes = computed(() => snoozeDurationMinutes(Number(customAmount.value), customUnit.value));
function toggleCustomSnooze(id: string) {
  if (customSnoozeId.value === id) { customSnoozeId.value = null; return; }
  customAmount.value = 5;
  customUnit.value = "minutes";
  customSnoozeId.value = id;
}
function submitCustomSnooze(id: string) {
  if (customMinutes.value !== null) emit("snooze", id, customMinutes.value);
}
watch(() => props.alerts.map(a => a.id), ids => {
  if (customSnoozeId.value && !ids.includes(customSnoozeId.value)) customSnoozeId.value = null;
});
</script>

<template>
  <section class="central-reminder" :class="{'central-reminder-desktop': desktop}" :role="desktop ? undefined : 'dialog'" :aria-modal="desktop ? undefined : true" aria-labelledby="central-reminder-title">
    <header class="central-reminder-header">
      <div class="central-reminder-heading" :data-tauri-drag-region="desktop ? '' : undefined">
        <span class="central-reminder-emblem"><Bell :size="24" aria-hidden="true" /></span>
        <div><span class="central-reminder-product">TaskWeave</span><h1 id="central-reminder-title">{{zh ? '到提醒时间了' : 'It’s time'}}</h1></div>
      </div>
      <button class="central-reminder-close" type="button" :disabled="busy || !alerts.length" :title="zh ? '确认并关闭当前所有提醒' : 'Acknowledge and close all shown reminders'" :aria-label="zh ? '确认并关闭当前所有提醒' : 'Acknowledge and close all shown reminders'" @click="emit('dismiss', alerts.map(a=>a.id))"><X :size="20" /></button>
    </header>
    <div class="central-reminder-summary" aria-live="polite">{{zh ? `${alerts.length} 条待处理提醒` : `${alerts.length} pending reminder${alerts.length === 1 ? '' : 's'}`}}</div>
    <div class="central-reminder-list">
      <article v-for="alert in alerts" :key="alert.id" class="central-reminder-card" :data-alert-id="alert.id">
        <div class="central-reminder-meta"><time>{{alert.scheduledAt.replace('T',' ').slice(0,16)}}</time><span v-if="alert.isTest">{{zh ? '测试提醒' : 'Test reminder'}}</span><span v-else>{{alert.taskId ? (zh ? '任务提醒' : 'Task reminder') : (zh ? '独立提醒' : 'Standalone reminder')}}</span></div>
        <h2>{{alert.title}}</h2>
        <p v-if="alert.description" class="central-reminder-description">{{alert.description}}</p>
        <div class="central-reminder-actions">
          <button class="central-action central-action-primary" type="button" :disabled="busy" @click="emit('dismiss',[alert.id])"><Check :size="16" />{{zh ? '知道了' : 'Got it'}}</button>
          <span class="central-snooze-buttons">
            <button class="central-action central-snooze-default" type="button" :disabled="busy" @click="emit('snooze',alert.id,5)"><Clock3 :size="16" />{{zh ? '5 分钟后再提醒' : 'Snooze 5 minutes'}}</button>
            <button class="central-action central-snooze-custom" type="button" :disabled="busy" :title="zh ? '自定义稍后提醒时间' : 'Customize snooze duration'" :aria-label="zh ? '自定义稍后提醒时间' : 'Customize snooze duration'" :aria-expanded="customSnoozeId === alert.id" :aria-controls="`snooze-form-${alert.id}`" @click="toggleCustomSnooze(alert.id)"><ChevronDown :size="16" /></button>
          </span>
          <button v-if="alert.taskId" class="central-action central-view-task" type="button" :disabled="busy" @click="emit('viewTask',alert)"><ExternalLink :size="15" />{{zh ? '查看任务' : 'View task'}}</button>
        </div>
        <ExpandTransition>
        <form v-if="customSnoozeId === alert.id" :id="`snooze-form-${alert.id}`" class="central-snooze-form" @submit.prevent="submitCustomSnooze(alert.id)">
          <span class="central-snooze-label">{{zh ? '自定义稍后提醒' : 'Custom snooze'}}</span>
          <div class="central-snooze-fields">
            <input v-model="customAmount" class="central-snooze-amount" type="number" min="1" step="1" required :disabled="busy" :aria-label="zh ? '稍后提醒时长' : 'Snooze duration'" />
            <select v-model="customUnit" class="central-snooze-unit" :disabled="busy" :aria-label="zh ? '时间单位' : 'Time unit'"><option value="minutes">{{zh ? '分钟' : 'minutes'}}</option><option value="hours">{{zh ? '小时' : 'hours'}}</option><option value="days">{{zh ? '天' : 'days'}}</option></select>
            <span>{{zh ? '后再提醒' : 'from now'}}</span>
          </div>
          <p v-if="customMinutes === null" class="central-snooze-invalid" role="alert">{{zh ? '请输入有效的正整数时长。' : 'Enter a valid positive whole-number duration.'}}</p>
          <div class="central-snooze-submit"><button class="central-action central-action-primary" type="submit" :disabled="busy || customMinutes === null">{{zh ? '确认' : 'Confirm'}}</button><button class="central-action" type="button" :disabled="busy" @click="customSnoozeId = null">{{zh ? '取消' : 'Cancel'}}</button></div>
        </form>
        </ExpandTransition>
      </article>
      <p v-if="!alerts.length" class="central-reminder-empty">{{zh ? '暂无待处理提醒' : 'No pending reminders'}}</p>
    </div>
    <p v-if="error" class="central-reminder-error" role="alert">{{error}}</p>
    <footer class="central-reminder-footer"><span>{{zh ? '提醒将保留到您手动处理。' : 'Reminders stay until you handle them.'}}</span><button v-if="alerts.length>1" class="central-action" type="button" :disabled="busy" @click="emit('dismiss',alerts.map(a=>a.id))">{{zh ? '全部知道了' : 'Dismiss all'}}</button></footer>
  </section>
</template>

<style scoped>
.central-reminder { display:flex;flex-direction:column;width:min(580px,calc(100vw - 40px));max-height:calc(100dvh - 48px);background:var(--panel-bg,#fff);color:var(--text,#202124);border:1px solid var(--border,#e0e0e0);border-radius:16px;box-shadow:0 22px 80px #0004;overflow:hidden;font-family:inherit; }
.central-reminder-desktop { width:100%;height:100dvh;max-height:100dvh;border-radius:0;box-shadow:none; }
.central-reminder-header {display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 24px 12px;background:var(--panel-bg,#fff);}
.central-reminder-heading {display:flex;align-items:center;gap:12px;flex:1;min-width:0;}
.central-reminder-heading > * {pointer-events:none;}
.central-reminder-emblem {width:48px;height:48px;flex:0 0 48px;display:grid;place-items:center;border-radius:14px;background:var(--primary,#404040);color:#fff;}
.central-reminder-product {display:block;font-size:11px;letter-spacing:.04em;color:var(--muted,#737373);margin-bottom:4px;}
.central-reminder-heading h1 {font-size:22px;line-height:1.3;margin:0;font-weight:750;}
.central-reminder-close {display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--muted,#737373);cursor:pointer;}
.central-reminder-close:hover {background:var(--neutral-soft,#eeeeee);color:var(--text,#202124);}
.central-reminder-summary {padding:0 24px 16px;font-size:12px;color:var(--muted,#737373);}
.central-reminder-list {overflow-y:auto;min-height:0;flex:1;padding:0 24px 8px;overscroll-behavior:contain;}
.central-reminder-card {border:1px solid var(--border,#e0e0e0);border-left:4px solid var(--primary,#404040);border-radius:10px;padding:16px;margin-bottom:12px;background:var(--field-bg,#fafafa);}
.central-reminder-meta {display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;color:var(--muted,#737373);font-size:11px;font-variant-numeric:tabular-nums;}
.central-reminder-card h2 {font-size:20px;line-height:1.5;overflow-wrap:anywhere;margin:10px 0;}
.central-reminder-description {font-size:14px;line-height:1.7;color:var(--subtle,#595959);white-space:pre-wrap;tab-size:4;overflow-wrap:anywhere;max-height:180px;overflow:auto;margin:0 0 16px;}
.central-reminder-actions {display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
.central-snooze-buttons {display:inline-flex;}
.central-snooze-buttons .central-snooze-default {border-top-right-radius:0;border-bottom-right-radius:0;}
.central-snooze-buttons .central-snooze-custom {border-top-left-radius:0;border-bottom-left-radius:0;margin-left:-1px;padding-left:7px;padding-right:7px;}
.central-snooze-custom svg {transition:transform var(--motion-fast,120ms) var(--motion-ease,ease);}
.central-snooze-custom[aria-expanded="true"] svg {transform:rotate(180deg);}
.central-snooze-form {margin-top:16px;padding-top:14px;border-top:1px solid var(--border,#e0e0e0);font-size:12px;}
.central-snooze-label {display:block;color:var(--muted,#737373);margin-bottom:8px;}
.central-snooze-fields {display:flex;align-items:center;flex-wrap:wrap;gap:8px;}
.central-snooze-fields input,.central-snooze-fields select {min-height:36px;min-width:0;width:auto;border:1px solid var(--border-strong,#cccccc);border-radius:7px;background:var(--panel-bg,#fff);color:var(--text,#202124);padding:6px 10px;font:inherit;}
.central-snooze-fields input {width:88px;}
.central-snooze-fields select {width:100px;}
.central-snooze-submit {display:flex;gap:8px;margin-top:12px;}
.central-snooze-invalid {color:var(--danger-text,#9a2f27);margin:8px 0 0;}
.central-action {display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;border:1px solid var(--border-strong,#cccccc);border-radius:7px;padding:7px 12px;background:var(--panel-bg,#fff);color:var(--text,#202124);font:inherit;font-size:12px;font-weight:600;cursor:pointer;}
.central-action:hover {border-color:var(--primary,#404040);background:var(--primary-soft,#f4f4f4);}
.central-action-primary {background:var(--primary,#404040);border-color:var(--primary,#404040);color:#fff;}
.central-action-primary:hover {background:var(--primary-hover,#262626);color:#fff;}
.central-action:disabled,.central-reminder-close:disabled {opacity:.55;cursor:default;}
.central-action:focus-visible,.central-reminder-close:focus-visible {outline:2px solid var(--primary,#404040);outline-offset:2px;}
.central-reminder-footer {display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:14px 24px;border-top:1px solid var(--border,#e0e0e0);font-size:11px;color:var(--muted,#737373);}
.central-reminder-error {margin:8px 24px;color:var(--danger-text,#9a2f27);font-size:12px;overflow-wrap:anywhere;}
.central-reminder-empty {padding:16px 0;color:var(--muted,#737373);font-size:13px;}
@media(prefers-reduced-motion:reduce){.central-snooze-custom svg{transition:none;}}
@media(max-width:420px){.central-reminder-header{padding:18px 16px 12px}.central-reminder-heading h1{font-size:19px}.central-reminder-summary,.central-reminder-list{padding-left:16px;padding-right:16px}.central-reminder-footer{padding:12px 16px}.central-reminder-card{padding:12px}.central-reminder-card h2{font-size:18px}.central-reminder-actions{gap:6px}}
</style>
