<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Bell, Pencil, Trash2, X } from "@lucide/vue";
import DateInput from "./DateInput.vue";
import ExpandTransition from "./ExpandTransition.vue";
import { insertDescriptionTab } from "../descriptionEditing";
import { listReminders, saveReminder, toggleReminder, deleteReminder } from "../data/reminderRepository";
import { localMinute, nextReminderOccurrence, validReminderDate } from "../domain/reminder";
import type { Reminder, ReminderFrequency } from "../domain/reminder";
import type { Task } from "../domain/task";
import { testReminderPopup } from "../data/reminderAlerts";

const props=defineProps<{language:"zh"|"en";tasks:Task[];taskId:string|null;runningInTauri:boolean}>();
const zh=computed(()=>props.language==="zh");
const items=ref<Reminder[]>([]);const editingId=ref<string|null>(null);const error=ref("");const message=ref("");const busy=ref(false);
const filter=ref("all");const deleteId=ref<string|null>(null);
const initial=()=>{const at=localMinute(new Date(Date.now()+10*60_000));return {title:"",description:"",date:at.slice(0,10),time:at.slice(11),frequency:"once" as ReminderFrequency,taskId:""};};
const form=reactive(initial());
const activeTasks=computed(()=>props.tasks.filter(t=>t.status!=="done"));
const shown=computed(()=>items.value.filter(r=>filter.value==="all"||(filter.value==="task"?Boolean(r.taskId):!r.taskId)).sort((a,b)=>Number(b.enabled)-Number(a.enabled)||(a.nextAt??a.anchorAt).localeCompare(b.nextAt??b.anchorAt)));
const frequencies=computed(()=>[{value:"once",label:zh.value?"仅一次":"Once"},{value:"hourly",label:zh.value?"每小时":"Hourly"},{value:"daily",label:zh.value?"每天":"Daily"},{value:"weekly",label:zh.value?"每周":"Weekly"},{value:"monthly",label:zh.value?"每月":"Monthly"}]);
const preview=computed(()=>nextReminderOccurrence(`${form.date}T${form.time}`,form.frequency));
const repeatNote=computed(()=>form.frequency==='hourly'
  ?(zh.value?'从所选日期和时间开始，每小时提醒一次，保留设定的分钟数。':'Repeats every hour from the chosen date and time, keeping the chosen minute.')
  :(zh.value?'按所选日期的星期或月中日期重复；月底没有该日时使用当月最后一天。':'Repeats on the chosen weekday or day of the month; short months use the last day.'));
async function refresh(){items.value=await listReminders();}
function reset(){Object.assign(form,initial());editingId.value=null;error.value="";}
function chooseTask(){const task=props.tasks.find(t=>t.id===form.taskId);if(task){form.title=task.title;form.description=task.description;const at=`${task.startDate}T${task.startTime||'09:00'}`;if(at>localMinute()){form.date=task.startDate;form.time=task.startTime||'09:00';}}}
watch(()=>props.taskId,id=>{reset();form.taskId=id??"";if(id)chooseTask();},{immediate:true});
function edit(item:Reminder){editingId.value=item.id;Object.assign(form,{title:item.title,description:item.description,date:item.anchorAt.slice(0,10),time:item.anchorAt.slice(11),frequency:item.frequency,taskId:item.taskId??""});error.value="";window.scrollTo({top:0,behavior:"smooth"});}
async function save(){
  error.value="";message.value="";const anchorAt=`${form.date}T${form.time}`;
  if(!form.title.trim()||!validReminderDate(anchorAt)){error.value=zh.value?"请填写标题和有效的提醒日期、时间。":"Enter a title and a valid date and time.";return;}
  if(form.frequency==="once"&&anchorAt<=localMinute()){error.value=zh.value?"请选择未来的提醒时间。":"Choose a future reminder time.";return;}
  if(form.taskId&&!activeTasks.value.some(t=>t.id===form.taskId)){error.value=zh.value?"关联任务已完成或删除，请选择其他任务或改为独立提醒。":"The linked task is completed or deleted. Choose another task or a standalone reminder.";return;}
  busy.value=true;
  try {await saveReminder({title:form.title,description:form.description,taskId:form.taskId||null,anchorAt,frequency:form.frequency},editingId.value??undefined);reset();await refresh();message.value=zh.value?"提醒已保存。":"Reminder saved.";}
  catch(e){error.value=String(e);}finally{busy.value=false;}
}
async function toggle(item:Reminder){try{await toggleReminder(item);await refresh();}catch(e){error.value=String(e);}}
async function remove(id:string){try{await deleteReminder(id);deleteId.value=null;await refresh();}catch(e){error.value=String(e);}}
async function test(){try{await testReminderPopup(props.language);message.value=zh.value?"已打开中央测试提醒。":"The central test reminder is open.";}catch(e){error.value=String(e);}}
function taskName(id:string|null){return props.tasks.find(t=>t.id===id)?.title??(zh.value?"任务已删除":"Deleted task");}
function stopped(item:Reminder){return Boolean(item.taskId&&!activeTasks.value.some(t=>t.id===item.taskId));}
function status(item:Reminder){return stopped(item)?(zh.value?"关联任务已结束":"Linked task ended"):item.enabled?(zh.value?"待提醒":"Scheduled"):item.nextAt?(zh.value?"已暂停":"Paused"):item.lastFiredAt?(zh.value?"已提醒":"Reminded"):(zh.value?"已暂停":"Paused");}
let timer:number|undefined;
const refreshSafely = () => { void refresh().catch(e => error.value = String(e)); };
onMounted(()=>{refreshSafely();timer=window.setInterval(refreshSafely,5000);window.addEventListener("focus",refreshSafely);});
onBeforeUnmount(()=>{clearInterval(timer);window.removeEventListener("focus",refreshSafely);});
</script>

<template>
  <section class="reminders-page">
    <header class="reminders-header"><div><h2>{{zh?'提醒':'Reminders'}}</h2><p>{{zh?'为任务设置提醒，或单独安排会议、见面等事项。':'Remind yourself about a task, or schedule a meeting or appointment independently.'}}</p></div><Bell :size="24" aria-hidden="true" /></header>
    <aside class="reminder-delivery-settings"><span>{{zh?'中央弹窗提醒':'Central reminder window'}}</span><button class="worked-button reminder-test-button" type="button" @click="test">{{zh?'测试提醒窗口':'Test reminder window'}}</button><p>{{runningInTauri?(zh?'到点后在屏幕中央置顶显示，保留到您手动处理，无提示音。窗口打开或留在托盘时均可提醒，彻底退出后停止。':'A silent, always-on-top window appears in the center of your screen and stays until handled. Reminders run while open or in the tray; full Exit stops them.'):(zh?'到点后在页面中央显示提醒，保留到手动处理，无提示音。网页版需保持页面打开；桌面版支持托盘提醒。':'A silent reminder stays in the center of this page until handled. Keep the page open; the desktop app also runs in the tray.')}}</p></aside>
    <form class="reminder-form task-form" @submit.prevent="save">
      <div class="form-heading"><h3>{{editingId?(zh?'编辑提醒':'Edit reminder'):(zh?'新建提醒':'New reminder')}}</h3><button v-if="editingId" class="icon-button small" type="button" :title="zh?'取消编辑':'Cancel editing'" @click="reset"><X :size="16" /></button></div>
      <div class="reminder-fields">
        <label class="field"><span>{{zh?'关联任务':'Linked task'}}</span><select v-model="form.taskId" @change="chooseTask"><option value="">{{zh?'独立提醒（不创建任务）':'Standalone reminder (no task)'}}</option><option v-for="task in activeTasks" :key="task.id" :value="task.id">{{task.title}}</option></select></label>
        <label class="field"><span>{{zh?'标题':'Title'}}</span><input v-model="form.title" required :placeholder="zh?'例如：项目例会':'e.g. Project meeting'" /></label>
        <label class="field"><span>{{zh?'提醒日期':'Reminder date'}}</span><DateInput v-model="form.date" :language="language" required /></label>
        <label class="field"><span>{{zh?'提醒时间':'Reminder time'}}</span><input v-model="form.time" type="time" step="60" required /></label>
        <label class="field"><span>{{zh?'重复':'Repeat'}}</span><select v-model="form.frequency"><option v-for="option in frequencies" :key="option.value" :value="option.value">{{option.label}}</option></select></label>
        <label class="field reminder-description"><span>{{zh?'备注':'Notes'}}</span><textarea v-model="form.description" rows="2" :placeholder="zh?'会议地点、链接或需要准备的内容':'Location, link, or preparation notes'" @keydown="insertDescriptionTab"></textarea></label>
      </div>
      <ExpandTransition><p v-if="form.frequency!=='once'" class="reminder-repeat-note">{{repeatNote}} {{preview?(zh?'下次：':'Next: ')+preview.replace('T',' '):''}}</p></ExpandTransition>
      <div class="reminder-save"><button class="primary-button" type="submit" :disabled="busy">{{zh?'保存并启用提醒':'Save and enable reminder'}}</button><button v-if="editingId" class="worked-button" type="button" @click="reset">{{zh?'取消':'Cancel'}}</button></div>
    </form>
    <p v-if="error" class="reminder-error" role="alert">{{error}}</p><p v-if="message" class="reminder-message" role="status">{{message}}</p>
    <div class="reminder-filters"><button v-for="option in [{value:'all',label:zh?'全部':'All'},{value:'task',label:zh?'任务提醒':'Task reminders'},{value:'standalone',label:zh?'独立提醒':'Standalone'}]" :key="option.value" class="worked-button" :class="{active:filter===option.value}" type="button" @click="filter=option.value">{{option.label}}</button><span>{{shown.length}} {{zh?'条提醒':'reminders'}}</span></div>
    <p v-if="!shown.length" class="empty-state">{{zh?'暂无提醒':'No reminders yet'}}</p>
    <div class="reminder-list">
      <article v-for="item in shown" :key="item.id" class="reminder-card" :data-reminder-id="item.id">
        <header><div><h3>{{item.title}}</h3><p>{{item.taskId?(zh?'任务：':'Task: ')+taskName(item.taskId):(zh?'独立提醒':'Standalone reminder')}} · {{frequencies.find(f=>f.value===item.frequency)?.label}}</p></div><span class="reminder-status" :class="{active:item.enabled&&!stopped(item)}">{{status(item)}}</span></header>
        <strong class="reminder-next">{{item.nextAt&&!stopped(item)?item.nextAt.replace('T',' '):(item.lastScheduledAt??item.anchorAt).replace('T',' ')}}</strong>
        <p v-if="item.description" class="reminder-notes">{{item.description}}</p><p v-if="item.lastFiredAt" class="reminder-history">{{zh?'最近提醒：':'Last reminder: '}}{{item.lastFiredAt.replace('T',' ')}}</p><p v-if="item.error" class="reminder-error">{{zh?'提醒未成功显示：':'Reminder could not be displayed: '}}{{item.error}}</p>
        <footer><button class="task-edit-button task-edit-icon" type="button" :title="zh?'编辑提醒':'Edit reminder'" :aria-label="zh?'编辑提醒':'Edit reminder'" @click="edit(item)"><Pencil :size="14" aria-hidden="true" /></button><button class="worked-button" type="button" :disabled="stopped(item)" @click="toggle(item)">{{item.enabled?(zh?'暂停':'Pause'):(zh?'启用':'Enable')}}</button><button class="worked-button" type="button" @click="deleteId=item.id"><Trash2 :size="14" />{{zh?'删除':'Delete'}}</button></footer>
        <ExpandTransition><div v-if="deleteId===item.id" class="reminder-delete-confirm"><span>{{zh?'删除这条提醒？关联任务会保留。':'Delete this reminder? Its task will be kept.'}}</span><button class="worked-button" type="button" @click="remove(item.id)">{{zh?'确认删除':'Delete'}}</button><button class="worked-button" type="button" @click="deleteId=null">{{zh?'取消':'Cancel'}}</button></div></ExpandTransition>
      </article>
    </div>
  </section>
</template>

<style scoped>
.reminders-page { max-width:1180px;width:100%; }
.reminders-header {display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:16px;color:var(--text);}
.reminders-header h2 {margin:0;font-size:22px}.reminders-header p {margin:5px 0 0;font-size:13px;color:var(--muted)}
.reminder-delivery-settings {display:flex;flex-wrap:wrap;align-items:center;gap:8px;border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px;background:var(--panel-bg);font-size:13px;}
.reminder-delivery-settings p {flex-basis:100%;margin:0;color:var(--muted);font-size:12px;line-height:1.6;}
.reminder-fields {display:grid;grid-template-columns:2fr 2fr 1.2fr 1fr 1fr;gap:12px;}.reminder-fields .field{min-width:0}.reminder-description {grid-column:1/-1;}
.reminder-save {display:flex;gap:8px;}.reminder-repeat-note {margin:0;font-size:12px;color:var(--muted);}
.reminder-error {color:var(--danger-text);font-size:13px;overflow-wrap:anywhere}.reminder-message {color:var(--success-text);font-size:13px;}
.reminder-filters {display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:20px 0 12px}.reminder-filters>span{margin-left:auto;color:var(--muted);font-size:12px;}
.reminder-list {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:10px;}
.reminder-card {min-width:0;border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--panel-bg);}
.reminder-card header {display:flex;align-items:flex-start;gap:12px;justify-content:space-between}.reminder-card h3{margin:0;color:var(--text);font-size:15px;overflow-wrap:anywhere}.reminder-card header p {margin:4px 0 0;font-size:12px;color:var(--muted);overflow-wrap:anywhere;}
.reminder-status {white-space:nowrap;border-radius:4px;background:var(--neutral-soft);padding:3px 6px;font-size:11px;color:var(--muted)}.reminder-status.active {background:var(--primary-soft);color:var(--primary-hover);}
.reminder-next {display:block;margin-top:12px;font-size:16px;color:var(--text);font-variant-numeric:tabular-nums;}
.reminder-notes {white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4;font-size:13px;line-height:1.6;color:var(--subtle)}.reminder-history{font-size:11px;color:var(--muted)}
.reminder-card footer {display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}.reminder-delete-confirm{display:flex;flex-wrap:wrap;gap:8px;border-top:1px solid var(--border);padding-top:12px;margin-top:12px;font-size:12px;color:var(--danger-text);}
@media(max-width:1100px){.reminder-fields{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:600px){.reminder-fields{grid-template-columns:minmax(0,1fr);}.reminder-description{grid-column:1;}.reminder-save{flex-wrap:wrap;}}
</style>
