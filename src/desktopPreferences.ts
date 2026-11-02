import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

export function readAutostartEnabled(): Promise<boolean> {
  return isEnabled();
}

export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  if (enabled) {
    await enable();
  } else {
    await disable();
  }

  const actual = await isEnabled();
  await invoke("refresh_tray_menu");
  return actual;
}

export function syncTrayPreferences(language: "zh" | "en", dark: boolean): Promise<void> {
  return invoke("sync_tray_preferences", { language, dark });
}
