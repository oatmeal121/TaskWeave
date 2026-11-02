import { createApp } from "vue";
import App from "./App.vue";
import ReminderPopup from "./ReminderPopup.vue";
import "./styles/motion.css";

createApp(new URLSearchParams(location.search).has("reminder-popup") ? ReminderPopup : App).mount("#app");
