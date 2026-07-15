use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StartupPhase {
    #[default]
    Prepare,
    Interface,
    Game,
    Mods,
    Ready,
    Error,
}

#[derive(Default)]
pub struct StartupState(Mutex<StartupPhase>);

impl StartupState {
    pub fn is_ready(&self) -> bool {
        matches!(
            *self.0.lock().unwrap_or_else(|e| e.into_inner()),
            StartupPhase::Ready
        )
    }
}

#[tauri::command]
pub fn report_startup_phase(
    app: AppHandle,
    state: State<'_, StartupState>,
    phase: StartupPhase,
) -> Result<(), String> {
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = phase;
    app.emit_to("splash", "startup:progress", phase)
        .map_err(|e| format!("failed to report startup progress: {e}"))
}

#[tauri::command]
pub fn get_startup_phase(state: State<'_, StartupState>) -> StartupPhase {
    *state.0.lock().unwrap_or_else(|e| e.into_inner())
}

#[tauri::command]
pub fn finish_startup(app: AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main window is unavailable".to_string())?;
    main.show()
        .map_err(|e| format!("failed to show main window: {e}"))?;
    main.set_focus()
        .map_err(|e| format!("failed to focus main window: {e}"))?;

    let splash = app
        .get_webview_window("splash")
        .ok_or_else(|| "startup window is unavailable".to_string())?;
    splash
        .close()
        .map_err(|e| format!("failed to close startup window: {e}"))
}
