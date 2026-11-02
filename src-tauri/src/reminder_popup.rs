use chrono::{DateTime, Datelike, Duration, Local};
use serde::Serialize;
use sqlx::{Row, SqlitePool};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_sql::{DbInstances, DbPool};

const LABEL: &str = "reminder-popup";
pub const SECOND_FORMAT: &str = "%Y-%m-%dT%H:%M:%S";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderAlert {
    id: String,
    reminder_id: Option<String>,
    task_id: Option<String>,
    title: String,
    description: String,
    scheduled_at: String,
    available_at: String,
    is_test: bool,
}

#[derive(Default)]
pub struct ReminderNavigation(pub Mutex<Option<String>>);

pub async fn database(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<DbInstances>();
    let instances = state.0.read().await;
    match instances.get("sqlite:taskweave.db") {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("Database is not ready".into()),
    }
}

pub async fn cleanup(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("delete from reminder_alerts where task_id is not null and not exists (select 1 from tasks where tasks.id=reminder_alerts.task_id and tasks.status<>'done' and tasks.is_deleted=0)")
        .execute(pool).await?;
    Ok(())
}

async fn active(pool: &SqlitePool) -> Result<Vec<ReminderAlert>, sqlx::Error> {
    let now = Local::now().format(SECOND_FORMAT).to_string();
    let rows =
        sqlx::query("select * from reminder_alerts where available_at<=? order by available_at,id")
            .bind(now)
            .fetch_all(pool)
            .await?;
    Ok(rows
        .into_iter()
        .map(|row| ReminderAlert {
            id: row.get("id"),
            reminder_id: row.get("reminder_id"),
            task_id: row.get("task_id"),
            title: row.get("title"),
            description: row.get("description"),
            scheduled_at: row.get("scheduled_at"),
            available_at: row.get("available_at"),
            is_test: row.get::<i64, _>("is_test") != 0,
        })
        .collect())
}

// Reuse one window. Polling must never move an already-visible reminder or take focus.
pub async fn sync(app: &AppHandle, pool: &SqlitePool) -> Result<(), String> {
    cleanup(pool).await.map_err(|e| e.to_string())?;
    let alerts = active(pool).await.map_err(|e| e.to_string())?;
    let handle = app.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let result = (|| -> tauri::Result<()> {
            let window = handle.get_webview_window(LABEL);
            if alerts.is_empty() {
                if let Some(window) = window {
                    window.hide()?;
                }
                return Ok(());
            }
            let window = if let Some(window) = window {
                window
            } else {
                let builder = WebviewWindowBuilder::new(
                    &handle,
                    LABEL,
                    WebviewUrl::App("index.html?reminder-popup=1".into()),
                )
                .title("TaskWeave · 提醒")
                .inner_size(560.0, 560.0)
                .min_inner_size(340.0, 260.0)
                .prevent_overflow()
                .decorations(false)
                .shadow(true)
                .always_on_top(true)
                .focused(false)
                .visible(false)
                .skip_taskbar(true)
                .minimizable(false)
                .maximizable(false)
                .disable_drag_drop_handler();
                // Use the same default app profile as the main webview (settings and locale).
                let window = builder.build()?;
                let close_app = handle.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let app = close_app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(error) = dismiss_visible(&app).await {
                                eprintln!("Reminder close: {error}");
                            }
                        });
                    }
                });
                window
            };
            if !window.is_visible()? {
                let cursor = handle.cursor_position()?;
                let monitor = handle.available_monitors()?.into_iter().find(|m| {
                    let p = m.position();
                    let s = m.size();
                    cursor.x >= p.x as f64
                        && cursor.y >= p.y as f64
                        && cursor.x < (p.x as f64 + s.width as f64)
                        && cursor.y < (p.y as f64 + s.height as f64)
                });
                if let Some(monitor) = monitor {
                    let size = window.outer_size()?;
                    let p = monitor.position();
                    let s = monitor.size();
                    window.set_position(PhysicalPosition::new(
                        p.x + (s.width.saturating_sub(size.width) / 2) as i32,
                        p.y + (s.height.saturating_sub(size.height) / 2) as i32,
                    ))?;
                } else {
                    window.center()?;
                }
                window.show()?;
            }
            window.emit("reminder-alerts-changed", ())?;
            Ok(())
        })();
        let _ = sender.send(result.map_err(|e| e.to_string()));
    })
    .map_err(|e| e.to_string())?;
    receiver.await.map_err(|e| e.to_string())?
}

async fn dismiss_visible(app: &AppHandle) -> Result<(), String> {
    let pool = database(app).await?;
    sqlx::query("delete from reminder_alerts where available_at<=?")
        .bind(Local::now().format(SECOND_FORMAT).to_string())
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window(LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_reminder_alerts(app: AppHandle) -> Result<Vec<ReminderAlert>, String> {
    let pool = database(&app).await?;
    cleanup(&pool).await.map_err(|e| e.to_string())?;
    active(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn dismiss_reminder_alerts(app: AppHandle, ids: Vec<String>) -> Result<(), String> {
    let pool = database(&app).await?;
    for id in ids {
        sqlx::query("delete from reminder_alerts where id=?")
            .bind(id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    sync(&app, &pool).await
}

#[tauri::command]
pub async fn snooze_reminder_alert(
    app: AppHandle,
    id: String,
    minutes: Option<i64>,
) -> Result<(), String> {
    let available_at = snooze_at(minutes.unwrap_or(5), Local::now())?;
    let pool = database(&app).await?;
    // A separate delivery time leaves the recurring reminder's anchor/next_at intact.
    sqlx::query("update reminder_alerts set available_at=? where id=?")
        .bind(available_at)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    sync(&app, &pool).await
}

fn snooze_at(minutes: i64, now: DateTime<Local>) -> Result<String, String> {
    let invalid = || "Invalid snooze duration".to_string();
    if minutes <= 0 {
        return Err(invalid());
    }
    let until = now
        .checked_add_signed(Duration::try_minutes(minutes).ok_or_else(invalid)?)
        .filter(|date| date.year() <= 9999)
        .ok_or_else(invalid)?;
    Ok(until.format(SECOND_FORMAT).to_string())
}

#[tauri::command]
pub async fn open_reminder_task(app: AppHandle, id: String) -> Result<(), String> {
    let pool = database(&app).await?;
    let task:Option<String>=sqlx::query_scalar("select a.task_id from reminder_alerts a join tasks t on t.id=a.task_id where a.id=? and t.is_deleted=0")
        .bind(&id).fetch_optional(&pool).await.map_err(|e|e.to_string())?;
    let task = task.ok_or("Task no longer exists")?;
    let window = app
        .get_webview_window("main")
        .ok_or("Main window is unavailable")?;
    *app.state::<ReminderNavigation>()
        .0
        .lock()
        .map_err(|e| e.to_string())? = Some(task);
    window.unminimize().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    window
        .emit("reminder-open-task", ())
        .map_err(|e| e.to_string())?;
    dismiss_reminder_alerts(app, vec![id]).await
}

#[tauri::command]
pub fn take_reminder_task(app: AppHandle) -> Result<Option<String>, String> {
    Ok(app
        .state::<ReminderNavigation>()
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take())
}

#[tauri::command]
pub async fn test_reminder_popup(app: AppHandle, language: String) -> Result<(), String> {
    let pool = database(&app).await?;
    let now = Local::now();
    let zh = language == "zh";
    sqlx::query("insert into reminder_alerts(id,title,description,scheduled_at,available_at,is_test) values(?,?,?,?,?,1)")
        .bind(format!("test-{}",now.timestamp_nanos_opt().unwrap_or_default()))
        .bind(if zh {"这是一条测试提醒"} else {"This is a test reminder"})
        .bind(if zh {"提醒会保留到手动处理。您可以确认，或自定义多少分钟、小时或天后再提醒。"} else {"This reminder stays until handled. Acknowledge it or snooze for a custom number of minutes, hours, or days."})
        .bind(now.format("%Y-%m-%dT%H:%M").to_string()).bind(now.format(SECOND_FORMAT).to_string())
        .execute(&pool).await.map_err(|e|e.to_string())?;
    sync(&app, &pool).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn custom_snooze_keeps_seconds_and_crosses_calendar_boundaries() {
        let now = Local
            .with_ymd_and_hms(2026, 12, 31, 23, 58, 47)
            .single()
            .unwrap();
        assert_eq!(snooze_at(17, now).unwrap(), "2027-01-01T00:15:47");
        assert_eq!(snooze_at(2 * 60, now).unwrap(), "2027-01-01T01:58:47");
        assert_eq!(snooze_at(3 * 24 * 60, now).unwrap(), "2027-01-03T23:58:47");
    }

    #[test]
    fn invalid_snooze_durations_are_rejected_without_panicking() {
        let now = Local::now();
        for minutes in [0, -1, i64::MAX] {
            assert!(snooze_at(minutes, now).is_err());
        }
    }
}
