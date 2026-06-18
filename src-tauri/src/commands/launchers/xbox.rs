use crate::commands::launchers::types::{GameDef, Launcher};
use std::fs;
use std::path::{Path, PathBuf};

const GAMING_APP: &str = "Microsoft.GamingApp_8wekyb3d8bbwe";
const DRIVES: &[&str] = &["C", "D", "E", "F", "G"];

pub struct Xbox;

impl Launcher for Xbox {
    fn id(&self) -> &'static str {
        "xbox"
    }

    fn is_installed(&self) -> bool {
        #[cfg(not(target_os = "windows"))]
        return false;
        #[cfg(target_os = "windows")]
        {
            let local = std::env::var("LOCALAPPDATA")
                .unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".to_string());
            Path::new(&local).join("Packages").join(GAMING_APP).exists()
        }
    }

    fn find_game(&self, game: &GameDef) -> Option<String> {
        let def = game.xbox.as_ref()?;

        #[cfg(target_os = "windows")]
        let result = if let Some(p) = find_in_drives(game.name, def.executable) {
            Some(p)
        } else {
            find_via_package_manager(def.product_id, def.executable)
        };
        #[cfg(not(target_os = "windows"))]
        let result = find_in_drives(game.name, def.executable);

        result
    }

    fn identify_path(&self, game_path: &str) -> bool {
        Path::new(game_path).join("MicrosoftGame.config").exists()
    }

    fn launch(&self, game: &GameDef, game_path: &str, _opts: Option<&str>) {
        let helper = Path::new(game_path).join("gamelaunchhelper.exe");
        if helper.exists() {
            if let Err(e) = std::process::Command::new(&helper).spawn() {
                log::warn!("xbox launch: spawn {helper:?}: {e}");
            }
        } else if let Some(def) = game.xbox.as_ref() {
            super::open_url(&format!("msxbox://game/?productId={}", def.product_id));
        }
    }
}

fn find_in_drives(game_name: &str, xbox_executable: &str) -> Option<String> {
    for drive in DRIVES {
        let drive_root = PathBuf::from(format!("{}:\\", drive));
        if !drive_root.exists() {
            continue;
        }
        let dirs = match fs::read_dir(&drive_root) {
            Ok(d) => d,
            Err(_) => continue,
        };
        for entry in dirs.flatten() {
            let candidate = entry.path().join(game_name).join("Content");
            if candidate.join(xbox_executable).exists() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn find_via_package_manager(product_id: &str, xbox_executable: &str) -> Option<String> {
    use std::os::windows::process::CommandExt;
    let script = format!(
        "$p=Get-AppxPackage|?{{$c=Join-Path $_.InstallLocation 'Content\\MicrosoftGame.config';(Test-Path $c)-and((gc $c -Raw)-match '{}')}}|Select -First 1;if($p){{Join-Path $p.InstallLocation 'Content'}}",
        product_id
    );
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .ok()?;
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        return None;
    }
    if Path::new(&path).join(xbox_executable).exists() {
        Some(path)
    } else {
        None
    }
}
