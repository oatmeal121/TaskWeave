use std::sync::Mutex;

use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;

const TRAY_ID: &str = "main-tray";
const AUTOSTART_ID: &str = "autostart";
const LANGUAGE_ID: &str = "toggle-language";
const DARK_MODE_ID: &str = "toggle-dark-mode";
const CHECK_UPDATES_ID: &str = "check-updates";
const QUIT_ID: &str = "quit";
const AUTOSTART_ARG: &str = "--taskweave-autostart";

#[derive(Clone)]
struct TrayPreferences {
    language: String,
    dark: bool,
}

impl Default for TrayPreferences {
    fn default() -> Self {
        Self {
            language: "en".into(),
            dark: false,
        }
    }
}

#[derive(Default)]
pub struct TrayState(Mutex<TrayPreferences>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutostartChanged {
    enabled: bool,
    error: Option<String>,
}

pub fn autostart_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_autostart::Builder::new()
        .arg(AUTOSTART_ARG)
        .build()
}

pub fn single_instance_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app))
}

pub fn show_main_window(app: &AppHandle) {
    let app = app.clone();
    if let Err(error) = app.clone().run_on_main_thread(move || {
        if let Some(window) = app.get_webview_window("main") {
            if let Err(error) = window.unminimize() {
                eprintln!("Failed to restore the TaskWeave window: {error}");
            }
            if let Err(error) = window.show() {
                eprintln!("Failed to show the TaskWeave window: {error}");
            }
            if let Err(error) = window.set_focus() {
                eprintln!("Failed to focus the TaskWeave window: {error}");
            }
        }
    }) {
        eprintln!("Failed to schedule the TaskWeave window restore: {error}");
    }
}

fn is_autostart_launch() -> bool {
    std::env::args_os().any(|argument| argument == AUTOSTART_ARG)
}

fn tray_copy(language: &str) -> (&'static str, &'static str, &'static str, &'static str, &'static str) {
    if language == "zh" {
        (
            "开机自动启动",
            "切换至 English",
            "深色模式",
            "检查更新",
            "退出 TaskWeave",
        )
    } else {
        (
            "Launch at startup",
            "切换至中文",
            "Dark mode",
            "Check for updates",
            "Exit TaskWeave",
        )
    }
}

fn rebuild_tray_menu(app: &AppHandle) -> Result<(), String> {
    let preferences = app
        .state::<TrayState>()
        .0
        .lock()
        .map_err(|_| "Tray preferences are unavailable".to_string())?
        .clone();
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let (autostart, language, dark_mode, check_updates, quit) = tray_copy(&preferences.language);

    let autostart_item = CheckMenuItem::with_id(
        app,
        AUTOSTART_ID,
        autostart,
        true,
        autostart_enabled,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let language_item = MenuItem::with_id(app, LANGUAGE_ID, language, true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let dark_mode_item = CheckMenuItem::with_id(
        app,
        DARK_MODE_ID,
        dark_mode,
        true,
        preferences.dark,
        None::<&str>,
    )
    .map_err(|error| error.to_string())?;
    let check_updates_item =
        MenuItem::with_id(app, CHECK_UPDATES_ID, check_updates, true, None::<&str>)
            .map_err(|error| error.to_string())?;
    let separator = PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?;
    let quit_item = MenuItem::with_id(app, QUIT_ID, quit, true, None::<&str>)
        .map_err(|error| error.to_string())?;
    let menu = Menu::with_items(
        app,
        &[
            &autostart_item,
            &language_item,
            &dark_mode_item,
            &check_updates_item,
            &separator,
            &quit_item,
        ],
    )
    .map_err(|error| error.to_string())?;

    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "TaskWeave tray icon is unavailable".to_string())?;
    tray.set_menu(Some(menu)).map_err(|error| error.to_string())
}

fn toggle_autostart(app: &AppHandle) {
    let result = (|| {
        let manager = app.autolaunch();
        if manager.is_enabled().map_err(|error| error.to_string())? {
            manager.disable().map_err(|error| error.to_string())?;
            Ok(false)
        } else {
            manager.enable().map_err(|error| error.to_string())?;
            Ok(true)
        }
    })();

    let payload = match result {
        Ok(enabled) => AutostartChanged {
            enabled,
            error: None,
        },
        Err(error) => AutostartChanged {
            enabled: app.autolaunch().is_enabled().unwrap_or(false),
            error: Some(error),
        },
    };
    let _ = app.emit_to("main", "desktop-autostart-changed", payload);
    let _ = rebuild_tray_menu(app);
}

pub fn setup(app: &App) -> tauri::Result<()> {
    app.manage(TrayState::default());

    let initial_menu = Menu::new(app)?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(
            app.default_window_icon()
                .expect("TaskWeave window icon is missing")
                .clone(),
        )
        .tooltip("TaskWeave")
        .menu(&initial_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            AUTOSTART_ID => toggle_autostart(app),
            LANGUAGE_ID => {
                let _ = app.emit_to("main", "desktop-toggle-language", ());
            }
            DARK_MODE_ID => {
                let _ = app.emit_to("main", "desktop-toggle-dark-mode", ());
            }
            CHECK_UPDATES_ID => {
                show_main_window(app);
                let _ = app.emit_to("main", "desktop-check-for-updates", ());
            }
            QUIT_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    if let Err(error) = rebuild_tray_menu(app.handle()) {
        eprintln!("Failed to build the TaskWeave tray menu: {error}");
    }

    if let Some(window) = app.get_webview_window("main") {
        let window_to_hide = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Err(error) = window_to_hide.hide() {
                    eprintln!("Failed to hide TaskWeave to the system tray: {error}");
                }
            }
        });
    }

    if !is_autostart_launch() {
        show_main_window(app.handle());
    }

    Ok(())
}

#[tauri::command]
pub fn sync_tray_preferences(
    app: AppHandle,
    state: tauri::State<'_, TrayState>,
    language: String,
    dark: bool,
) -> Result<(), String> {
    let language = if language == "zh" { "zh" } else { "en" };
    *state
        .0
        .lock()
        .map_err(|_| "Tray preferences are unavailable".to_string())? = TrayPreferences {
        language: language.into(),
        dark,
    };
    rebuild_tray_menu(&app)
}

#[tauri::command]
pub fn refresh_tray_menu(app: AppHandle) -> Result<(), String> {
    rebuild_tray_menu(&app)
}
