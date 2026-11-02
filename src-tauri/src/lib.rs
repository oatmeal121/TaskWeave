use tauri_plugin_sql::{Migration, MigrationKind};
#[cfg(desktop)]
mod desktop;
mod reminder_popup;
mod reminders;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial TaskWeave schema",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add hierarchical projects",
            sql: include_str!("../migrations/0002_project_hierarchy.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add recurring template descriptions",
            sql: include_str!("../migrations/0003_recurring_template_description.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add task times and reminders",
            sql: include_str!("../migrations/0004_times_and_reminders.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "persist pending central reminders",
            sql: include_str!("../migrations/0005_reminder_alerts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "allow hourly reminders while preserving pending alerts",
            sql: include_str!("../migrations/0006_hourly_reminders.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(desktop::single_instance_plugin())
            .plugin(desktop::autostart_plugin())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:taskweave.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .manage(reminder_popup::ReminderNavigation::default())
        .invoke_handler(tauri::generate_handler![
            reminder_popup::list_reminder_alerts,
            reminder_popup::dismiss_reminder_alerts,
            reminder_popup::snooze_reminder_alert,
            reminder_popup::open_reminder_task,
            reminder_popup::take_reminder_task,
            reminder_popup::test_reminder_popup,
            desktop::sync_tray_preferences,
            desktop::refresh_tray_menu,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            desktop::setup(app)?;
            reminders::start(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
