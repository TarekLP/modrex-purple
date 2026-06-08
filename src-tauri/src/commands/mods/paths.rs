use std::collections::HashSet;
use std::path::{Path, PathBuf};
use super::engine::{
    backup_dir as engine_backup_dir, disabled_dir, mods_dir, state_path as engine_state_path,
    ModEngineConfig, ModUnit,
};

pub fn mods_base(game_path: &str, cfg: &ModEngineConfig) -> PathBuf {
    mods_dir(game_path, cfg)
}

pub fn disabled_base(game_path: &str, cfg: &ModEngineConfig) -> PathBuf {
    disabled_dir(game_path, cfg)
}

pub fn get_state_path(game_path: &str, cfg: &ModEngineConfig) -> PathBuf {
    engine_state_path(game_path, cfg)
}

pub fn active_mod_path(
    game_path: &str,
    filename: &str,
    folder_rel: Option<&str>,
    cfg: &ModEngineConfig,
) -> PathBuf {
    match folder_rel {
        Some(rel) => mods_base(game_path, cfg).join(rel).join(filename),
        None => mods_base(game_path, cfg).join(filename),
    }
}

pub fn disabled_mod_path(
    game_path: &str,
    filename: &str,
    folder_rel: Option<&str>,
    cfg: &ModEngineConfig,
) -> PathBuf {
    let base = match folder_rel {
        Some(rel) => disabled_base(game_path, cfg).join(rel),
        None => disabled_base(game_path, cfg),
    };
    match &cfg.unit {
        ModUnit::File { disabled_suffix, .. } => base.join(format!("{}{}", filename, disabled_suffix)),
        ModUnit::Directory { .. } => base.join(filename),
    }
}

pub async fn find_untracked_paks(
    game_path: &str,
    known: &HashSet<String>,
    cfg: &ModEngineConfig,
) -> Vec<(String, bool)> {
    if engine_backup_dir(game_path, cfg).exists() {
        return vec![];
    }
    let mut out = Vec::new();
    scan_active(&mods_base(game_path, cfg), "", known, &mut out).await;
    scan_disabled(&disabled_base(game_path, cfg), "", known, &mut out).await;
    out
}

async fn scan_active(
    dir: &Path,
    prefix: &str,
    known: &HashSet<String>,
    out: &mut Vec<(String, bool)>,
) {
    let mut rd = match tokio::fs::read_dir(dir).await {
        Ok(r) => r,
        Err(_) => return,
    };
    let mut subdirs = Vec::new();
    while let Ok(Some(entry)) = rd.next_entry().await {
        let name = entry.file_name().to_string_lossy().into_owned();
        if prefix.is_empty() && name == "disabled" {
            continue;
        }
        let ft = match entry.file_type().await {
            Ok(t) => t,
            Err(_) => continue,
        };
        let rel = if prefix.is_empty() { name.clone() } else { format!("{}/{}", prefix, name) };
        if ft.is_dir() {
            subdirs.push((entry.path(), rel));
        } else if name.ends_with(".pak") && !known.contains(&rel) {
            out.push((rel, true));
        }
    }
    for (path, sub) in subdirs {
        Box::pin(scan_active(&path, &sub, known, out)).await;
    }
}

async fn scan_disabled(
    dir: &Path,
    prefix: &str,
    known: &HashSet<String>,
    out: &mut Vec<(String, bool)>,
) {
    let mut rd = match tokio::fs::read_dir(dir).await {
        Ok(r) => r,
        Err(_) => return,
    };
    let mut subdirs = Vec::new();
    while let Ok(Some(entry)) = rd.next_entry().await {
        let name = entry.file_name().to_string_lossy().into_owned();
        let ft = match entry.file_type().await {
            Ok(t) => t,
            Err(_) => continue,
        };
        let sub = if prefix.is_empty() { name.clone() } else { format!("{}/{}", prefix, name) };
        if ft.is_dir() {
            subdirs.push((entry.path(), sub));
        } else if name.ends_with(".pak.disabled") {
            let pak = name.trim_end_matches(".disabled").to_string();
            let rel = if prefix.is_empty() { pak.clone() } else { format!("{}/{}", prefix, pak) };
            if !known.contains(&rel) {
                out.push((rel, false));
            }
        }
    }
    for (path, sub) in subdirs {
        Box::pin(scan_disabled(&path, &sub, known, out)).await;
    }
}
