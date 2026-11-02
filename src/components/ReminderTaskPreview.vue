<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { X } from "@lucide/vue";
import type { Task } from "../domain/task";
const props=defineProps<{task:Task;language:"zh"|"en"}>();
const emit=defineEmits<{close:[]}>();
const dialog=ref<HTMLDialogElement|null>(null);
const zh=computed(()=>props.language==="zh");
const status=computed(()=>({todo:zh.value?'待办':'Todo',doing:zh.value?'进行中':'Doing',done:zh.value?'完成':'Done'})[props.task.status]);
onMounted(()=>dialog.value?.showModal());
</script>
<template>
  <dialog ref="dialog" class="reminder-task-preview" aria-labelledby="reminder-task-title" @close="emit('close')">
    <header><span>{{zh?'关联任务':'Linked task'}}</span><button class="icon-button small" type="button" :aria-label="zh?'关闭任务详情':'Close task details'" @click="dialog?.close()"><X :size="18" /></button></header>
    <h2 id="reminder-task-title">{{task.title}}</h2>
    <dl><div><dt>{{zh?'状态':'Status'}}</dt><dd>{{status}}</dd></div><div><dt>{{zh?'项目':'Project'}}</dt><dd>{{task.projectName||(zh?'未归档':'Unfiled')}}</dd></div><div><dt>{{zh?'开始':'Start'}}</dt><dd>{{[task.startDate,task.startTime].filter(Boolean).join(' ')}}</dd></div><div><dt>{{zh?'截止':'Due'}}</dt><dd>{{task.dueDate?[task.dueDate,task.dueTime].filter(Boolean).join(' '):(zh?'无截止时间':'Open-ended')}}</dd></div></dl>
    <section><h3>{{zh?'描述':'Description'}}</h3><p>{{task.description||(zh?'暂无描述':'No description')}}</p></section>
    <button class="primary-button" type="button" @click="dialog?.close()">{{zh?'关闭':'Close'}}</button>
  </dialog>
</template>
<style scoped>
.reminder-task-preview[open]{animation:reminder-preview-enter var(--motion-normal,180ms) var(--motion-ease,ease);}
.reminder-task-preview[open]::backdrop{animation:reminder-preview-backdrop-enter var(--motion-normal,180ms) var(--motion-ease,ease);}
@keyframes reminder-preview-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes reminder-preview-backdrop-enter{from{opacity:0}to{opacity:1}}
@media(prefers-reduced-motion:reduce){.reminder-task-preview[open],.reminder-task-preview[open]::backdrop{animation:none;}}
.reminder-task-preview{width:min(640px,calc(100vw - 40px));max-height:85dvh;overflow:auto;border:1px solid var(--border);border-radius:14px;padding:28px;background:var(--panel-bg);color:var(--text);box-shadow:0 20px 80px #0004}.reminder-task-preview::backdrop{background:#0005}.reminder-task-preview header{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:12px}.reminder-task-preview h2{font-size:22px;line-height:1.5;overflow-wrap:anywhere;margin:16px 0}.reminder-task-preview dl{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:20px 0}.reminder-task-preview dt{font-size:11px;color:var(--muted);margin-bottom:5px}.reminder-task-preview dd{margin:0;font-size:13px;overflow-wrap:anywhere}.reminder-task-preview h3{font-size:12px;color:var(--muted)}.reminder-task-preview p{white-space:pre-wrap;tab-size:4;overflow-wrap:anywhere;line-height:1.7;font-size:14px}.reminder-task-preview>button{margin-top:16px}@media(max-width:420px){.reminder-task-preview{padding:20px}.reminder-task-preview dl{grid-template-columns:1fr}}
</style>
