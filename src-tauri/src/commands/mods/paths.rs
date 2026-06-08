use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub fn mods_base(game_path: &str) -> PathBuf {
    PathBuf::from(game_path)
        .join("PAYDAY3")
        .join("Content")
        .join("Paks")
        .join("~mods")
}

pub fn disabled_base(game_path: &str) -> PathBuf {
    mods_base(game_path).join("disabled")
}

pub fn get_state_path(game_path: &str) -> PathBuf {
    mods_base(game_path).join(".modrex.json")
}

pub fn active_mod_path(game_path: &str, filename: &str, folder_rel: Option<&str>) -> PathBuf {
    match folder_rel {
        Some(rel) => mods_base(game_path).join(rel).join(filename),
        None => mods_base(game_path).join(filename),
    }
}

pub fn disabled_mod_path(game_path: &str, filename: &str, folder_rel: Option<&str>) -> PathBuf {
    let base = match folder_rel {
        Some(rel) => disabled_base(game_path).join(rel),
        None => disabled_base(game_path),
    };
    base.join(format!("{}.disabled", filename))
}

pub async fn find_untracked_paks(game_path: &str, known: &HashSet<String>) -> Vec<(String, bool)> {
    let bak = PathBuf::from(game_path).join("PAYDAY3").join("Content").join("~mods.bak");
    if bak.exists() {
        return vec![];
    }
    let mut out = Vec::new();
    scan_active(&mods_base(game_path), "", known, &mut out).await;
    scan_disabled(&disabled_base(game_path), "", known, &mut out).await;
    out
}

async fn scan_active(dir: &Path, prefix: &str, known: &HashSet<String>, out: &mut Vec<(String, bool)>) {
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

async fn scan_disabled(dir: &Path, prefix: &str, known: &HashSet<String>, out: &mut Vec<(String, bool)>) {
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
