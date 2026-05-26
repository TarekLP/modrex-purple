use crate::commands::launchers::types::{GameDef, Launcher};
use std::fs;
use std::path::{Path, PathBuf};

pub struct Epic;

impl Launcher for Epic {
    fn id(&self) -> &'static str {
        "epic"
    }

    fn is_installed(&self) -> bool {
        epic_manifest_dir().exists()
    }

    fn find_game(&self, game: &GameDef) -> Option<String> {
        let def = game.epic.as_ref()?;
        epic_find_game(def.display_name).map(|(loc, _)| loc)
    }

    fn identify_path(&self, game_path: &str) -> bool {
        Path::new(game_path).join(".egstore").exists()
    }

    fn launch(&self, game: &GameDef, _game_path: &str, _opts: Option<&str>) {
        let Some(def) = game.epic.as_ref() else { return };
        if let Some((_, app_name)) = epic_find_game(def.display_name) {
            super::open_url(&format!(
                "com.epicgames.launcher://apps/{}?action=launch&silent=true",
                app_name
            ));
        }
    }
}

fn epic_manifest_dir() -> PathBuf {
    let prog_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    PathBuf::from(prog_data)
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests")
}

fn epic_find_game(display_name: &str) -> Option<(String, String)> {
    let manifest_dir = epic_manifest_dir();
    if !manifest_dir.exists() { return None; }
    for entry in fs::read_dir(&manifest_dir).ok()?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("item") { continue; }
        let content = fs::read_to_string(&path).unwrap_or_default();
        if content.trim().is_empty() { continue; }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
            if v["DisplayName"].as_str() == Some(display_name) {
                let location = v["InstallLocation"].as_str()?.to_string();
                let app_name = v["AppName"].as_str().unwrap_or("").to_string();
                return Some((location, app_name));
            }
        }
    }
    None
}
