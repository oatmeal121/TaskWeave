import { isTauri } from "@tauri-apps/api/core";
import { checkBrowserReminders } from "./data/reminderRepository";
import { queueBrowserReminder } from "./data/reminderAlerts";

/** Desktop delivery runs in Rust; browser tabs share the pending alert queue. */
export function startReminderService(onChange: () => void): ()=>void {
  let stopped=false;
  if(isTauri()) return ()=>{};
  const check=async()=>{
    if(stopped)return;
    const run=async()=>{await checkBrowserReminders(queueBrowserReminder);onChange();};
    try {if(navigator.locks) await navigator.locks.request("taskweave-reminders",{ifAvailable:true},lock=>lock?run():undefined);else await run();}
    catch(error) {console.error("Reminder check failed",error);}
  };
  const timer=window.setInterval(()=>void check(),5000);
  window.addEventListener("focus",check);document.addEventListener("visibilitychange",check);void check();
  return ()=>{stopped=true;clearInterval(timer);window.removeEventListener("focus",check);document.removeEventListener("visibilitychange",check);};
}
