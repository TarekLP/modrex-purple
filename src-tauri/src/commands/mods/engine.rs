use std::path::PathBuf;

pub enum ModUnit {
    File {
        extension: &'static str,
        disabled_suffix: &'static str,
        priority_prefix: bool,
    },
    Directory {
        /// Markers used to recognise mod directories inside a ZIP during install classification.
        entry_markers: &'static [&'static str],
        /// Markers that unconditionally promote a directory to a mod during the ambient scan.
        scan_markers: &'static [&'static str],
        /// Like `scan_markers` but the directory is only tracked if its SHA256 matches the index.
        /// Unidentified entries are silently dropped — they are loader framework internals, not
        /// user mods. Use when a marker (e.g. `base.lua`) is shared between framework modules
        /// and genuinely installable mods that are distinguishable only via the mod index.
        index_gated_markers: &'static [&'static str],
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

pub static CRIMEBOSS_ENGINE: ModEngineConfig = ModEngineConfig {
    game_id: "cb",
    index_game_name: "Crime Boss: Rockay City",
    state_filename: ".modrex.json",
    targets: &[ScanTarget {
        tag: "paks",
        unit: ModUnit::File {
            extension: "pak",
            disabled_suffix: ".disabled",
            priority_prefix: true,
        },
        mods_subpath: &["CrimeBoss", "Content", "Paks", "~mods"],
        disabled_subpath: &["CrimeBoss", "Content", "Paks", "~mods", "disabled"],
        backup_subpath: &["CrimeBoss", "Content", "~mods.bak"],
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
                scan_markers: &["mod.txt", "main.xml"],
                index_gated_markers: &[],
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
                scan_markers: &[],
                index_gated_markers: &[],
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
                // base.lua is the DAHM mod-framework entry point. It is in entry_markers so
                // DAHM sub-mod ZIPs are classified correctly during install, and in
                // index_gated_markers so base.lua-only directories ARE discovered by the scan
                // but only tracked when their SHA256 matches the mod index — that's the reliable
                // way to tell user-installed DAHM sub-mods from DAHM's bundled framework modules.
                entry_markers: &["mod.txt", "base.lua"],
                scan_markers: &["mod.txt"],
                index_gated_markers: &["base.lua"],
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
                scan_markers: &[],
                index_gated_markers: &[],
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
        "cb" => &CRIMEBOSS_ENGINE,
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
