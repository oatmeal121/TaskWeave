import { isTauri } from "@tauri-apps/api/core";
import { getDatabase } from "./database";
import { localMinute, nextReminderOccurrence, validReminderDate } from "../domain/reminder";
import type { Reminder, ReminderDraft } from "../domain/reminder";
import { clearReminderAlerts } from "./reminderAlerts";
const KEY = "taskweave.browser.reminders";
type ReminderRow = {
  id: string; title: string; description: string; task_id: string | null; anchor_at: string;
  frequency: Reminder["frequency"]; next_at: string | null; enabled: number;
  last_fired_at: string | null; last_scheduled_at: string | null; error: string | null;
};
const browserRead = (): Reminder[] => JSON.parse(localStorage.getItem(KEY) || "[]");
const browserWrite = (items: Reminder[]) => localStorage.setItem(KEY, JSON.stringify(items));
const rowToReminder = (r: ReminderRow): Reminder => ({ id:r.id,title:r.title,description:r.description,taskId:r.task_id,anchorAt:r.anchor_at,frequency:r.frequency,nextAt:r.next_at,enabled:Boolean(r.enabled),lastFiredAt:r.last_fired_at,lastScheduledAt:r.last_scheduled_at,error:r.error });
export async function listReminders(): Promise<Reminder[]> {
  if (!isTauri()) return browserRead();
  const db = await getDatabase();
  return (await db.select<ReminderRow[]>("select * from reminders order by coalesce(next_at, anchor_at), title")).map(rowToReminder);
}
async function writeReminder(item: Reminder) {
  if (!isTauri()) {
    const all=browserRead();const index=all.findIndex(r=>r.id===item.id);
    if(index<0) all.push(item); else all[index]=item;
    browserWrite(all);return;
  }
  const db=await getDatabase();const now=new Date().toISOString();
  await db.execute(`insert into reminders (id,title,description,task_id,anchor_at,frequency,next_at,enabled,last_fired_at,last_scheduled_at,error,created_at,updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
    on conflict(id) do update set title=excluded.title,description=excluded.description,task_id=excluded.task_id,anchor_at=excluded.anchor_at,frequency=excluded.frequency,next_at=excluded.next_at,enabled=excluded.enabled,last_fired_at=excluded.last_fired_at,last_scheduled_at=excluded.last_scheduled_at,error=excluded.error,updated_at=excluded.updated_at`,
    [item.id,item.title,item.description,item.taskId,item.anchorAt,item.frequency,item.nextAt,Number(item.enabled),item.lastFiredAt,item.lastScheduledAt,item.error,now]);
}
export async function saveReminder(draft: ReminderDraft, id?: string): Promise<void> {
  if (!draft.title.trim() || !validReminderDate(draft.anchorAt)) throw new Error("invalid_reminder");
  const nextAt=draft.anchorAt>localMinute()||draft.frequency==='once'?draft.anchorAt:nextReminderOccurrence(draft.anchorAt,draft.frequency);
  await writeReminder({ ...draft, title:draft.title.trim(),id:id||crypto.randomUUID(),nextAt,enabled:true,lastFiredAt:null,lastScheduledAt:null,error:null });
  if (id) await clearReminderAlerts(id);
}
export async function toggleReminder(item: Reminder): Promise<void> {
  const enabled=!item.enabled;
  const nextAt=enabled?(item.anchorAt>localMinute()?item.anchorAt:item.frequency==='once'?item.anchorAt:nextReminderOccurrence(item.anchorAt,item.frequency)):item.nextAt;
  if (!isTauri()) {
    // Read fresh state: a scheduler tick may have fired since the list was rendered.
    browserWrite(browserRead().map(current => current.id === item.id
      ? {...current, enabled, nextAt: enabled ? nextAt : current.nextAt, error: null}
      : current));
    await clearReminderAlerts(item.id);
    return;
  }
  // Pausing never restores a stale next_at or notification history from the view.
  await (await getDatabase()).execute(
    "update reminders set enabled=$1,next_at=case when $1=1 then $2 else next_at end,error=null,updated_at=$3 where id=$4",
    [Number(enabled), nextAt, new Date().toISOString(), item.id],
  );
  await clearReminderAlerts(item.id);
}
export async function deleteReminder(id: string): Promise<void> {
  await clearReminderAlerts(id);
  if(!isTauri()) {browserWrite(browserRead().filter(r=>r.id!==id));return;}
  await (await getDatabase()).execute("delete from reminders where id=$1",[id]);
}
export async function importReminders(incoming: Reminder[]): Promise<number> {
  const known=new Set((await listReminders()).map(r=>r.id));let count=0;
  for(const item of incoming) if(!known.has(item.id)) {await writeReminder(item);known.add(item.id);count++;}
  return count;
}

/** Browser fallback; desktop scheduling runs in Rust, including while the window is hidden. */
export async function checkBrowserReminders(notify: (item: Reminder) => void): Promise<void> {
  if(isTauri()) return;
  const now=localMinute();const all=browserRead();
  const tasks=JSON.parse(localStorage.getItem('taskweave.browser.tasks')||'[]') as Array<{id:string;status:string;deletedAt?:string|null}>;
  const fired:Reminder[]=[];let changed=false;
  for(const item of all) {
    if(!item.enabled) continue;
    if(item.taskId && !tasks.some(t=>t.id===item.taskId&&t.status!=='done'&&!t.deletedAt)) {item.enabled=false;item.nextAt=null;changed=true;continue;}
    if(item.nextAt&&item.nextAt<=now) {
      const scheduled=item.nextAt;
      item.nextAt=nextReminderOccurrence(item.anchorAt,item.frequency);
      item.enabled=item.nextAt!==null;item.lastFiredAt=now;item.lastScheduledAt=scheduled;item.error=null;
      fired.push({...item});changed=true;
    }
  }
  // Persist before notifying so a re-entrant render or a reload cannot fire the same occurrence twice.
  if(changed) browserWrite(all);
  for(const item of fired) notify(item);
}
