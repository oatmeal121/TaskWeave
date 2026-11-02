use chrono::{Datelike, Duration, Local, NaiveDate, NaiveDateTime, Timelike};
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{DbInstances, DbPool};

const FORMAT: &str = "%Y-%m-%dT%H:%M";

fn next_occurrence(anchor: &str, frequency: &str, now: NaiveDateTime) -> Option<String> {
    if frequency == "once" {
        return None;
    }
    let anchor = NaiveDateTime::parse_from_str(anchor, FORMAT).ok()?;
    if anchor > now {
        return Some(anchor.format(FORMAT).to_string());
    }
    let mut next = now.date().and_time(anchor.time());
    match frequency {
        "hourly" => {
            next = now.date().and_hms_opt(now.hour(), anchor.minute(), 0)?;
            if next <= now {
                next += Duration::hours(1);
            }
        }
        "daily" => {
            if next <= now {
                next += Duration::days(1);
            }
        }
        "weekly" => {
            let days = (anchor.weekday().num_days_from_monday() + 7
                - now.weekday().num_days_from_monday())
                % 7;
            next += Duration::days(days as i64);
            if next <= now {
                next += Duration::days(7);
            }
        }
        "monthly" => {
            let make = |year, month| {
                let (ny, nm) = if month == 12 {
                    (year + 1, 1)
                } else {
                    (year, month + 1)
                };
                let last = NaiveDate::from_ymd_opt(ny, nm, 1)?.pred_opt()?.day();
                Some(
                    NaiveDate::from_ymd_opt(year, month, anchor.day().min(last))?
                        .and_time(anchor.time()),
                )
            };
            next = make(now.year(), now.month())?;
            if next <= now {
                let (year, month) = if now.month() == 12 {
                    (now.year() + 1, 1)
                } else {
                    (now.year(), now.month() + 1)
                };
                next = make(year, month)?;
            }
        }
        _ => return None,
    }
    Some(next.format(FORMAT).to_string())
}

async fn check_due(pool: &SqlitePool, now: NaiveDateTime) -> Result<usize, sqlx::Error> {
    // Completed, deleted, or permanently removed tasks cannot keep an active reminder.
    sqlx::query("update reminders set enabled=0,next_at=null where enabled=1 and task_id is not null and not exists (select 1 from tasks where tasks.id=reminders.task_id and tasks.status<>'done' and tasks.is_deleted=0)")
        .execute(pool).await?;
    crate::reminder_popup::cleanup(pool).await?;
    let timestamp = now.format(FORMAT).to_string();
    let rows=sqlx::query("select id,title,description,task_id,anchor_at,frequency,next_at from reminders where enabled=1 and next_at <= ? order by next_at limit 50")
        .bind(&timestamp).fetch_all(pool).await?;
    let mut fired = 0;
    for row in rows {
        let id: String = row.get("id");
        let title: String = row.get("title");
        let description: String = row.get("description");
        let scheduled: String = row.get("next_at");
        let anchor: String = row.get("anchor_at");
        let frequency: String = row.get("frequency");
        let task_id: Option<String> = row.get("task_id");
        let next = next_occurrence(&anchor, &frequency, now);
        let mut transaction = pool.begin().await?;
        let claimed=sqlx::query("update reminders set next_at=?,enabled=?,last_fired_at=?,last_scheduled_at=?,error=null,updated_at=? where id=? and enabled=1 and next_at=? and (task_id is null or exists (select 1 from tasks where tasks.id=reminders.task_id and tasks.status<>'done' and tasks.is_deleted=0))")
            .bind(&next).bind(i32::from(next.is_some())).bind(&timestamp).bind(&scheduled).bind(&timestamp).bind(&id).bind(&scheduled).execute(&mut *transaction).await?;
        if claimed.rows_affected() == 0 {
            continue;
        }
        // Commit together; the unique reminder_id index keeps an existing pending
        // or snoozed delivery while still advancing the recurring schedule.
        sqlx::query("insert or ignore into reminder_alerts(id,reminder_id,task_id,title,description,scheduled_at,available_at) values(lower(hex(randomblob(16))),?,?,?,?,?,?)")
            .bind(&id).bind(task_id).bind(title).bind(description).bind(&scheduled)
            .bind(now.format(crate::reminder_popup::SECOND_FORMAT).to_string())
            .execute(&mut *transaction).await?;
        transaction.commit().await?;
        fired += 1;
    }
    Ok(fired)
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            let pool = {
                let state = app.state::<DbInstances>();
                let instances = state.0.read().await;
                match instances.get("sqlite:taskweave.db") {
                    Some(DbPool::Sqlite(pool)) => Some(pool.clone()),
                    _ => None,
                }
            };
            let Some(pool) = pool else {
                continue;
            };
            let result = check_due(&pool, Local::now().naive_local()).await;
            if let Err(error) = result {
                eprintln!("Reminder scheduler: {error}");
            }
            if let Err(error) = crate::reminder_popup::sync(&app, &pool).await {
                eprintln!("Reminder window: {error}");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn date(value: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(value, FORMAT).unwrap()
    }
    async fn test_pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql("create table tasks(id text primary key,status text,is_deleted integer); create table recurring_task_templates(id text primary key);")
            .execute(&pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/0004_times_and_reminders.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0005_reminder_alerts.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0006_hourly_reminders.sql"))
            .execute(&pool)
            .await
            .unwrap();
        pool
    }
    #[test]
    fn monthly_reminders_keep_original_day_after_short_months() {
        assert_eq!(
            next_occurrence("2026-01-31T14:00", "monthly", date("2026-02-01T09:00")),
            Some("2026-02-28T14:00".into())
        );
        assert_eq!(
            next_occurrence("2026-01-31T14:00", "monthly", date("2026-02-28T15:00")),
            Some("2026-03-31T14:00".into())
        );
        assert_eq!(
            next_occurrence("2026-01-31T14:00", "monthly", date("2028-02-01T09:00")),
            Some("2028-02-29T14:00".into())
        );
    }
    #[test]
    fn missed_cycles_are_skipped_and_year_boundaries_work() {
        assert_eq!(
            next_occurrence("2026-10-19T14:00", "weekly", date("2026-12-31T18:00")),
            Some("2027-01-04T14:00".into())
        );
        assert_eq!(
            next_occurrence("2026-10-19T14:00", "daily", date("2026-10-22T14:00")),
            Some("2026-10-23T14:00".into())
        );
        assert_eq!(
            next_occurrence("2026-10-19T14:00", "once", date("2026-10-22T14:00")),
            None
        );
    }
    #[test]
    fn hourly_reminders_keep_the_chosen_minute_and_skip_missed_hours() {
        for (now, expected) in [
            ("2026-10-22T13:40", "2026-10-22T14:30"),
            ("2026-10-22T14:30", "2026-10-22T15:30"),
            ("2026-10-22T15:05", "2026-10-22T15:30"),
            ("2026-10-23T08:45", "2026-10-23T09:30"),
            ("2026-12-31T23:45", "2027-01-01T00:30"),
        ] {
            assert_eq!(
                next_occurrence("2026-10-22T14:30", "hourly", date(now)),
                Some(expected.into())
            );
        }
    }
    #[tokio::test]
    async fn due_reminders_are_claimed_once_and_completed_tasks_are_cancelled() {
        let pool = test_pool().await;
        sqlx::query("insert into tasks(id,status,is_deleted) values('done','done',0)")
            .execute(&pool)
            .await
            .unwrap();
        for (id, task) in [
            ("one", None),
            ("completed", Some("done")),
            ("removed", Some("missing")),
        ] {
            sqlx::query("insert into reminders(id,title,description,task_id,anchor_at,frequency,next_at,enabled,created_at,updated_at) values(?,'Meeting','',?,'2026-10-22T13:00','once','2026-10-22T13:00',1,'created','updated')").bind(id).bind(task).execute(&pool).await.unwrap();
        }
        assert_eq!(check_due(&pool, date("2026-10-22T14:00")).await.unwrap(), 1);
        assert_eq!(check_due(&pool, date("2026-10-22T14:01")).await.unwrap(), 0);
        let active: i64 = sqlx::query_scalar("select count(*) from reminders where enabled=1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(active, 0);
        let queued: i64 = sqlx::query_scalar("select count(*) from reminder_alerts")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(queued, 1, "Repeated checks retain one unacknowledged alert");
    }

    #[tokio::test]
    async fn failed_delivery_enqueue_does_not_consume_the_occurrence() {
        let pool = test_pool().await;
        sqlx::query("insert into reminders(id,title,description,anchor_at,frequency,next_at,enabled,created_at,updated_at) values('one','Meeting','','2026-10-22T13:00','once','2026-10-22T13:00',1,'created','updated')")
            .execute(&pool).await.unwrap();
        sqlx::raw_sql("create trigger reject_alert before insert on reminder_alerts begin select raise(abort,'simulated storage failure'); end;")
            .execute(&pool).await.unwrap();
        assert!(check_due(&pool, date("2026-10-22T14:00")).await.is_err());
        let row = sqlx::query("select enabled,next_at,last_fired_at from reminders where id='one'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.get::<i64, _>("enabled"), 1);
        assert_eq!(row.get::<String, _>("next_at"), "2026-10-22T13:00");
        assert_eq!(row.get::<Option<String>, _>("last_fired_at"), None);
        sqlx::query("drop trigger reject_alert")
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(check_due(&pool, date("2026-10-22T14:01")).await.unwrap(), 1);
    }

    #[tokio::test]
    async fn completing_or_deleting_a_task_cancels_pending_and_snoozed_alerts() {
        let pool = test_pool().await;
        for id in ["complete", "delete", "remove", "keep"] {
            sqlx::query("insert into tasks(id,status,is_deleted) values(?,'todo',0)")
                .bind(id)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("insert into reminders(id,title,description,task_id,anchor_at,frequency,next_at,enabled,created_at,updated_at) values(?,'Meeting', '',?,'2026-10-22T13:00','weekly','2026-10-22T13:00',1,'created','updated')")
                .bind(id).bind(id).execute(&pool).await.unwrap();
        }
        assert_eq!(check_due(&pool, date("2026-10-22T14:00")).await.unwrap(), 4);
        sqlx::raw_sql("update reminder_alerts set available_at='2099-01-01T14:00:00'; update tasks set status='done' where id='complete'; update tasks set is_deleted=1 where id='delete'; delete from tasks where id='remove';")
            .execute(&pool).await.unwrap();
        assert_eq!(check_due(&pool, date("2026-10-22T14:01")).await.unwrap(), 0);
        let remaining: Vec<String> = sqlx::query_scalar("select task_id from reminder_alerts")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, vec!["keep"]);
        let active: Vec<String> = sqlx::query_scalar("select id from reminders where enabled=1")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(active, vec!["keep"]);
    }

    #[tokio::test]
    async fn hourly_cycles_reuse_pending_alerts_and_never_override_a_snooze() {
        let pool = test_pool().await;
        sqlx::query("insert into reminders(id,title,anchor_at,frequency,next_at,created_at,updated_at) values('stand-up','Stand up','2026-10-22T10:30','hourly','2026-10-22T10:30','created','updated')")
            .execute(&pool).await.unwrap();
        assert_eq!(check_due(&pool, date("2026-10-22T10:30")).await.unwrap(), 1);
        let id: String = sqlx::query_scalar("select id from reminder_alerts")
            .fetch_one(&pool)
            .await
            .unwrap();
        sqlx::query("update reminder_alerts set available_at='2026-10-23T09:00:00'")
            .execute(&pool)
            .await
            .unwrap();
        for now in [
            "2026-10-22T11:30",
            "2026-10-22T12:30",
            "2026-10-22T13:30",
            "2026-10-23T08:05",
        ] {
            assert_eq!(check_due(&pool, date(now)).await.unwrap(), 1);
            let rows: Vec<(String, String)> =
                sqlx::query_as("select id,available_at from reminder_alerts")
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            assert_eq!(rows, vec![(id.clone(), "2026-10-23T09:00:00".into())]);
        }
        let next: String = sqlx::query_scalar("select next_at from reminders where id='stand-up'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(next, "2026-10-23T08:30");
        sqlx::query("delete from reminder_alerts")
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(check_due(&pool, date("2026-10-23T08:30")).await.unwrap(), 1);
        let new_id: String = sqlx::query_scalar("select id from reminder_alerts")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_ne!(
            id, new_id,
            "Acknowledged reminders can alert on the next hourly cycle"
        );
    }

    #[tokio::test]
    async fn hourly_migration_preserves_records_and_snoozes_with_foreign_keys_enabled() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql("create table tasks(id text primary key); create table recurring_task_templates(id text primary key);").execute(&pool).await.unwrap();
        for migration in [
            include_str!("../migrations/0004_times_and_reminders.sql"),
            include_str!("../migrations/0005_reminder_alerts.sql"),
        ] {
            sqlx::raw_sql(migration).execute(&pool).await.unwrap();
        }
        assert_eq!(
            sqlx::query_scalar::<_, i64>("pragma foreign_keys")
                .fetch_one(&pool)
                .await
                .unwrap(),
            1
        );
        for (id, frequency) in [
            ("once", "once"),
            ("daily", "daily"),
            ("weekly", "weekly"),
            ("monthly", "monthly"),
        ] {
            sqlx::query("insert into reminders values(?,'Original title','Notes',null,'2026-10-22T10:30',?,'2026-10-22T11:30',0,'2026-10-22T10:30','2026-10-22T10:30','Original error','Created','Updated')")
                .bind(id).bind(frequency).execute(&pool).await.unwrap();
        }
        sqlx::raw_sql("insert into reminder_alerts values('pending','daily',null,'Daily','Notes','2026-10-22T10:30','2026-10-22T10:30:00',0),('snoozed','weekly','task','Weekly','Indented notes','2026-10-22T10:30','2099-01-01T09:00:00',0),('duplicate','weekly','task','Weekly','Indented notes','2026-10-22T11:30','2026-10-22T11:30:00',0),('test',null,null,'Test','Notes','2026-10-22T10:30','2026-10-22T10:30:00',1);")
            .execute(&pool).await.unwrap();
        type ReminderRecord = (
            String,
            String,
            String,
            Option<String>,
            String,
            String,
            Option<String>,
            i64,
            Option<String>,
            Option<String>,
            Option<String>,
            String,
            String,
        );
        type AlertRecord = (
            String,
            Option<String>,
            Option<String>,
            String,
            String,
            String,
            String,
            i64,
        );
        let before: Vec<ReminderRecord> = sqlx::query_as("select * from reminders order by id")
            .fetch_all(&pool)
            .await
            .unwrap();
        let alerts_before: Vec<AlertRecord> =
            sqlx::query_as("select * from reminder_alerts where id<>'duplicate' order by id")
                .fetch_all(&pool)
                .await
                .unwrap();
        let mut transaction = pool.begin().await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/0006_hourly_reminders.sql"))
            .execute(&mut *transaction)
            .await
            .unwrap();
        transaction.commit().await.unwrap();
        let after: Vec<ReminderRecord> = sqlx::query_as("select * from reminders order by id")
            .fetch_all(&pool)
            .await
            .unwrap();
        let alerts_after: Vec<AlertRecord> =
            sqlx::query_as("select * from reminder_alerts order by id")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(before.len(), after.len());
        for (old, new) in before.iter().zip(after.iter()) {
            assert_eq!(
                (&old.0, &old.1, &old.2, &old.3, &old.4, &old.5, &old.6),
                (&new.0, &new.1, &new.2, &new.3, &new.4, &new.5, &new.6)
            );
            assert_eq!(
                (&old.7, &old.8, &old.9, &old.10, &old.11, &old.12),
                (&new.7, &new.8, &new.9, &new.10, &new.11, &new.12),
                "Reminder state and history must remain unchanged"
            );
        }
        assert_eq!(
            alerts_before, alerts_after,
            "Only the duplicate is merged; the snooze and other alerts remain intact"
        );
        assert!(sqlx::query("pragma foreign_key_check")
            .fetch_all(&pool)
            .await
            .unwrap()
            .is_empty());
        sqlx::query("update reminders set frequency='hourly' where id='once'")
            .execute(&pool)
            .await
            .unwrap();
        assert!(sqlx::query("insert into reminder_alerts values('another','weekly',null,'Duplicate','','2026-10-22T12:30','2026-10-22T12:30:00',0)").execute(&pool).await.is_err());
        sqlx::query("delete from reminders where id='weekly'")
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "select count(*) from reminder_alerts where reminder_id='weekly'"
            )
            .fetch_one(&pool)
            .await
            .unwrap(),
            0,
            "Foreign key cascade must still target the renamed reminder table"
        );
    }
}
