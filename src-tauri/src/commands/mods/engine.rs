use std::path::PathBuf;

pub enum ModUnit {
    File {
        extension: &'static str,
        disabled_suffix: &'static str,
        priority_prefix: bool,
    },
    Directory {
        entry_markers: &'static [&'static str],
        priority_prefix: bool,
    },
}

pub struct ScanTarget {
    pub tag: &'static str,
    pub unit: ModUnit,
    pub mods_subpath: &'static [&'static str],
    pub disabled_subpath: &'static [&'static str],
    pub backup_subpath: &'static [&'static str],
}

impl ScanTarget {
    pub fn is_directory_unit(&self) -> bool {
        matches!(self.unit, ModUnit::Directory { .. })
    }

    pub fn disabled_suffix(&self) -> &'static str {
        match &self.unit {
            ModUnit::File {
                disabled_suffix, ..
            } => disabled_suffix,
            ModUnit::Directory { .. } => "",
        }
    }
}

pub struct ModEngineConfig {
    pub game_id: &'static str,
    pub index_game_name: &'static str,
    pub state_filename: &'static str,
    pub targets: &'static [ScanTarget],
}

impl ModEngineConfig {
    pub fn primary(&self) -> &ScanTarget {
        &self.targets[0]
    }

    pub fn target_for(&self, tag: Option<&str>) -> &ScanTarget {
        let Some(t) = tag else { return self.primary() };
        self.targets
            .iter()
            .find(|s| s.tag == t)
            .unwrap_or_else(|| self.primary())
    }
}

pub static PD3_ENGINE: ModEngineConfig = ModEngineConfig {
    game_id: "pd3",
    index_game_name: "PAYDAY 3",
    state_filename: ".modrex.json",
    targets: &[ScanTarget {
        tag: "paks",
        unit: ModUnit::File {
            extension: "pak",
            disabled_suffix: ".disabled",
            priority_prefix: true,
        },
        mods_subpath: &["PAYDAY3", "Content", "Paks", "~mods"],
        disabled_subpath: &["PAYDAY3", "Content", "Paks", "~mods", "disabled"],
        backup_subpath: &["PAYDAY3", "Content", "~mods.bak"],
    }],
};

pub static PD2_ENGINE: ModEngineConfig = ModEngineConfig {
    game_id: "pd2",
    index_game_name: "PAYDAY 2",
    state_filename: ".modrex.json",
    targets: &[
        ScanTarget {
            tag: "mods",
            unit: ModUnit::Directory {
                entry_markers: &["mod.txt", "main.xml"],
                priority_prefix: false,
            },
            mods_subpath: &["mods"],
            disabled_subpath: &["mods", "disabled"],
            backup_subpath: &["mods.bak"],
        },
        ScanTarget {
            tag: "mod_overrides",
            unit: ModUnit::Directory {
                entry_markers: &[],
                priority_prefix: false,
            },
            mods_subpath: &["assets", "mod_overrides"],
            disabled_subpath: &["assets", "mod_overrides", "disabled"],
            backup_subpath: &["assets", "mod_overrides.bak"],
        },
    ],
};

pub static PDTH_ENGINE: ModEngineConfig = ModEngineConfig {
    game_id: "pdth",
    index_game_name: "PAYDAY: The Heist",
    state_filename: ".modrex.json",
    targets: &[
        ScanTarget {
            tag: "mods",
            unit: ModUnit::Directory {
                // base.lua is the DAHM mod-framework entry point (no mod.txt)
                entry_markers: &["mod.txt", "base.lua"],
                priority_prefix: false,
            },
            mods_subpath: &["mods"],
            disabled_subpath: &["mods", "disabled"],
            backup_subpath: &["mods.bak"],
        },
        ScanTarget {
            tag: "mod_overrides",
            unit: ModUnit::Directory {
                entry_markers: &[],
                priority_prefix: false,
            },
            mods_subpath: &["assets", "mod_overrides"],
            disabled_subpath: &["assets", "mod_overrides", "disabled"],
            backup_subpath: &["assets", "mod_overrides.bak"],
        },
    ],
};

pub fn engine_for_game(game_id: &str) -> &'static ModEngineConfig {
    match game_id {
        "pd2" => &PD2_ENGINE,
        "pdth" => &PDTH_ENGINE,
        _ => &PD3_ENGINE,
    }
}

pub fn mods_dir(game_path: &str, target: &ScanTarget) -> PathBuf {
    target
        .mods_subpath
        .iter()
        .fold(PathBuf::from(game_path), |p, s| p.join(s))
}

pub fn disabled_dir(game_path: &str, target: &ScanTarget) -> PathBuf {
    target
        .disabled_subpath
        .iter()
        .fold(PathBuf::from(game_path), |p, s| p.join(s))
}

pub fn backup_dir(game_path: &str, target: &ScanTarget) -> PathBuf {
    target
        .backup_subpath
        .iter()
        .fold(PathBuf::from(game_path), |p, s| p.join(s))
}

pub fn state_path(game_path: &str, cfg: &ModEngineConfig) -> PathBuf {
    mods_dir(game_path, cfg.primary()).join(cfg.state_filename)
}
