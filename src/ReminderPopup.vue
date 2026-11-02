<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ReminderAlertView from "./components/ReminderAlertView.vue";
import { listReminderAlerts, dismissReminderAlerts, snoozeReminderAlert } from "./data/reminderAlerts";
import type { ReminderAlert } from "./domain/reminderAlert";

const alerts = ref<ReminderAlert[]>([]);
const language = ref<"zh"|"en">("zh");
const busy = ref(false);
const error = ref("");
let stopped = false;
let remove: (()=>void)|undefined;
let timer: number|undefined;

async function refresh() {
  language.value = localStorage.getItem("taskweave.settings.language") === "en" ? "en" : "zh";
  const theme = localStorage.getItem("taskweave.settings.theme");
  document.documentElement.dataset.theme = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  try { alerts.value = await listReminderAlerts(); } catch(e) { error.value=String(e); }
}
async function act(action:()=>Promise<void>) {
  busy.value = true; error.value = "";
  try { await action(); await refresh(); } catch(e) { error.value=String(e); }
  finally { busy.value=false; }
}
onMounted(()=>{
  void refresh();
  void listen("reminder-alerts-changed",()=>void refresh()).then(unlisten=>{if(stopped)unlisten();else remove=unlisten;});
  timer=window.setInterval(()=>void refresh(),5000);
});
onBeforeUnmount(()=>{stopped=true;remove?.();clearInterval(timer);});
</script>

<template>
  <ReminderAlertView :alerts="alerts" :language="language" desktop :busy="busy" :error="error"
    @dismiss="ids=>act(()=>dismissReminderAlerts(ids))"
    @snooze="(id,minutes)=>act(()=>snoozeReminderAlert(id,minutes))"
    @view-task="alert=>act(()=>invoke('open_reminder_task',{id:alert.id}))" />
</template>

<style>
html:has(.central-reminder-desktop),body:has(.central-reminder-desktop) {overflow:hidden;}
</style>
