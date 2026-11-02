import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export type AppUpdate = Update;

export const appUpdatesConfigured =
  import.meta.env.VITE_TASKWEAVE_UPDATE_CONFIGURED === "true";

export function checkForAppUpdate(): Promise<AppUpdate | null> {
  return check({ timeout: 15_000 });
}

export async function installAppUpdate(
  update: AppUpdate,
  onProgress: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null;
      onProgress(downloaded, total);
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress(downloaded, total);
    } else {
      onProgress(total ?? downloaded, total);
    }
  }, { restartAfterInstall: true });
}
