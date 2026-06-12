use super::engine::{
    backup_dir as engine_backup_dir, disabled_dir, mods_dir, state_path as engine_state_path,
    ModEngineConfig, ModUnit, ScanTarget,
};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub fn mods_base(game_path: &str, target: &ScanTarget) -> PathBuf {
    mods_dir(game_path, target)
}

pub fn disabled_base(game_path: &str, target: &ScanTarget) -> PathBuf {
    disabled_dir(game_path, target)
}

pub fn get_state_path(game_path: &str, cfg: &ModEngineConfig) -> PathBuf {
    engine_state_path(game_path, cfg)
}

pub fn active_mod_path(
    game_path: &str,
    filename: &str,
    folder_rel: Option<&str>,
    target: &ScanTarget,
) -> PathBuf {
    match folder_rel {
        Some(rel) => mods_dir(game_path, target).join(rel).join(filename),
        None => mods_dir(game_path, target).join(filename),
    }
}

pub fn disabled_mod_path(
    game_path: &str,
    filename: &str,
    folder_rel: Option<&str>,
    target: &ScanTarget,
) -> PathBuf {
    let base = match folder_rel {
        Some(rel) => disabled_dir(game_path, target).join(rel),
        None => disabled_dir(game_path, target),
    };
    match &target.unit {
        ModUnit::File {
            disabled_suffix, ..
        } => base.join(format!("{}{}", filename, disabled_suffix)),
        ModUnit::Directory { .. } => base.join(filename),
    }
}

pub async fn find_untracked_paks(
    game_path: &str,
    known: &HashSet<String>,
    cfg: &ModEngineConfig,
) -> Vec<(String, bool, Option<String>)> {
    let mut out = Vec::new();
    for (i, target) in cfg.targets.iter().enumerate() {
        if engine_backup_dir(game_path, target).exists() {
            continue;
        }
        let tag = if i == 0 { "" } else { target.tag };
        let tag_prefix = format!("{}:", tag);
        let target_known: HashSet<String> = known
            .iter()
            .filter_map(|k| k.strip_prefix(&tag_prefix).map(|s| s.to_string()))
            .collect();
        let location_tag: Option<String> = if i == 0 {
            None
        } else {
            Some(target.tag.to_string())
        };
        // mods/base is the BLT loader's basemod, not a user mod — tracking it
        // would let the user disable their mod loader from the installed list.
        let skip_base = i == 0 && matches!(target.unit, ModUnit::Directory { .. });
        let mut target_out: Vec<(String, bool)> = Vec::new();
        scan_active(
            &mods_dir(game_path, target),
            "",
            &target_known,
            target,
            skip_base,
            &mut target_out,
        )
        .await;
        scan_disabled(
            &disabled_dir(game_path, target),
            "",
            &target_known,
            target,
            &mut target_out,
        )
        .await;
        for (path, enabled) in target_out {
            out.push((path, enabled, location_tag.clone()));
        }
    }
    out
}

async fn scan_active(
    dir: &Path,
    prefix: &str,
    known: &HashSet<String>,
    target: &ScanTarget,
    skip_base: bool,
    out: &mut Vec<(String, bool)>,
) {
    let mut rd = match tokio::fs::read_dir(dir).await {
        Ok(r) => r,
        Err(_) => return,
    };
    let mut subdirs = Vec::new();
    while let Ok(Some(entry)) = rd.next_entry().await {
        let name = entry.file_name().to_string_lossy().into_owned();
        if prefix.is_empty() && (name == "disabled" || (skip_base && name == "base")) {
            continue;
        }
        let ft = match entry.file_type().await {
            Ok(t) => t,
            Err(_) => continue,
        };
        let rel = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", prefix, name)
        };
        match &target.unit {
            ModUnit::File { .. } => {
                if ft.is_dir() {
                    subdirs.push((entry.path(), rel));
                } else if name.ends_with(".pak") && !known.contains(&rel) {
                    out.push((rel, true));
                }
            }
            ModUnit::Directory { entry_markers, .. } => {
                if ft.is_dir() {
                    let is_mod = if entry_markers.is_empty() {
                        true
                    } else {
                        entry_markers.iter().any(|m| entry.path().join(m).exists())
                    };
                    if is_mod {
                        if !known.contains(&rel) {
                            out.push((rel, true));
                        }
                    } else {
                        subdirs.push((entry.path(), rel));
                    }
                }
            }
        }
    }
    for (path, sub) in subdirs {
        Box::pin(scan_active(&path, &sub, known, target, skip_base, out)).await;
    }
}

async fn scan_disabled(
    dir: &Path,
    prefix: &str,
    known: &HashSet<String>,
    target: &ScanTarget,
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
        let sub = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", prefix, name)
        };
        match &target.unit {
            ModUnit::File { .. } => {
                if ft.is_dir() {
                    subdirs.push((entry.path(), sub));
                } else if name.ends_with(".pak.disabled") {
                    let pak = name.trim_end_matches(".disabled").to_string();
                    let rel = if prefix.is_empty() {
                        pak.clone()
                    } else {
                        format!("{}/{}", prefix, pak)
                    };
                    if !known.contains(&rel) {
                        out.push((rel, false));
                    }
                }
            }
            ModUnit::Directory { entry_markers, .. } => {
                if ft.is_dir() {
                    let is_mod = if entry_markers.is_empty() {
                        true
                    } else {
                        entry_markers.iter().any(|m| entry.path().join(m).exists())
                    };
                    if is_mod {
                        if !known.contains(&sub) {
                            out.push((sub, false));
                        }
                    } else {
                        subdirs.push((entry.path(), sub));
                    }
                }
            }
        }
    }
    for (path, sub) in subdirs {
        Box::pin(scan_disabled(&path, &sub, known, target, out)).await;
    }
}
