use crate::commands::launchers::types::{GameDef, Launcher};
#[cfg(target_os = "windows")]
use std::fs;
use std::path::Path;
#[cfg(target_os = "windows")]
use std::path::PathBuf;

const GAMING_APP: &str = "Microsoft.GamingApp_8wekyb3d8bbwe";

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

    #[cfg(target_os = "windows")]
    fn find_game(&self, game: &GameDef) -> Option<String> {
        let def = game.xbox.as_ref()?;
        find_in_drives(game.name, def.executable)
            .or_else(|| find_via_package_manager(def.product_id, def.executable))
    }

    #[cfg(not(target_os = "windows"))]
    fn find_game(&self, _game: &GameDef) -> Option<String> {
        None
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

// Neither call does volume or network I/O, so enumeration can't stall on a dead
// drive. Non-fixed drives are excluded: stats on a disconnected network/VPN drive
// block for the SMB timeout, and Xbox installs only ever live on fixed volumes.
#[cfg(target_os = "windows")]
fn fixed_drive_roots() -> Vec<PathBuf> {
    const DRIVE_FIXED: u32 = 3;
    #[link(name = "kernel32")]
    extern "system" {
        fn GetLogicalDrives() -> u32;
        fn GetDriveTypeW(root_path_name: *const u16) -> u32;
    }
    let mask = unsafe { GetLogicalDrives() };
    (0..26)
        .filter(|i| mask & (1u32 << i) != 0)
        .map(|i| format!("{}:\\", (b'A' + i) as char))
        .filter(|root| {
            let wide: Vec<u16> = root.encode_utf16().chain(std::iter::once(0)).collect();
            unsafe { GetDriveTypeW(wide.as_ptr()) == DRIVE_FIXED }
        })
        .map(PathBuf::from)
        .collect()
}

#[cfg(target_os = "windows")]
fn find_in_drives(game_name: &str, xbox_executable: &str) -> Option<String> {
    for drive_root in fixed_drive_roots() {
        let dirs = match fs::read_dir(&drive_root) {
            Ok(d) => d,
            Err(_) => continue,
        };
        for entry in dirs.flatten() {
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
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
    let script = format!(
        "$p=Get-AppxPackage|?{{$c=Join-Path $_.InstallLocation 'Content\\MicrosoftGame.config';(Test-Path $c)-and((gc $c -Raw)-match '{}')}}|Select -First 1;if($p){{Join-Path $p.InstallLocation 'Content'}}",
        product_id
    );
    let mut cmd = std::process::Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        &script,
    ]);
    // Get-AppxPackage legitimately takes ~10s on slow machines, bound generously.
    let out = super::run_bounded(cmd, std::time::Duration::from_secs(15))?;
    let path = out.trim().to_string();
    if path.is_empty() {
        return None;
    }
    Path::new(&path)
        .join(xbox_executable)
        .exists()
        .then_some(path)
}
