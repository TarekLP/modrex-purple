use std::path::PathBuf;

pub enum ModUnit {
    File {
        extension: &'static str,
        disabled_suffix: &'static str,
        priority_prefix: bool,
    },
    Directory {
        entry_marker: &'static str,
        priority_prefix: bool,
    },
}

pub struct ModEngineConfig {
    pub game_id: &'static str,
    pub index_game_name: &'static str,
    pub unit: ModUnit,
    pub state_filename: &'static str,
    pub mods_subpath: &'static [&'static str],
    pub disabled_subpath: &'static [&'static str],
    pub backup_subpath: &'static [&'static str],
}

pub static PD3_ENGINE: ModEngineConfig = ModEngineConfig {
    game_id: "pd3",
    index_game_name: "PAYDAY 3",
    unit: ModUnit::File {
        extension: "pak",
        disabled_suffix: ".disabled",
        priority_prefix: true,
    },
    state_filename: ".modrex.json",
    mods_subpath: &["PAYDAY3", "Content", "Paks", "~mods"],
    disabled_subpath: &["PAYDAY3", "Content", "Paks", "~mods", "disabled"],
    backup_subpath: &["PAYDAY3", "Content", "~mods.bak"],
};

pub static PD2_ENGINE: ModEngineConfig = ModEngineConfig {
    game_id: "pd2",
    index_game_name: "PAYDAY 2",
    unit: ModUnit::Directory {
        entry_marker: "mod.txt",
        priority_prefix: false,
    },
    state_filename: ".modrex.json",
    mods_subpath: &["mods"],
    disabled_subpath: &["mods", "disabled"],
    backup_subpath: &["mods.bak"],
};

pub static PDTH_ENGINE: ModEngineConfig = ModEngineConfig {
    game_id: "pdth",
    index_game_name: "PAYDAY: The Heist",
    unit: ModUnit::Directory {
        entry_marker: "mod.txt",
        priority_prefix: false,
    },
    state_filename: ".modrex.json",
    mods_subpath: &["mods"],
    disabled_subpath: &["mods", "disabled"],
    backup_subpath: &["mods.bak"],
};

pub fn engine_for_game(game_id: &str) -> &'static ModEngineConfig {
    match game_id {
        "pd2" => &PD2_ENGINE,
        "pdth" => &PDTH_ENGINE,
        _ => &PD3_ENGINE,
    }
}

pub fn mods_dir(game_path: &str, cfg: &ModEngineConfig) -> PathBuf {
    cfg.mods_subpath.iter().fold(PathBuf::from(game_path), |p, s| p.join(s))
}

pub fn disabled_dir(game_path: &str, cfg: &ModEngineConfig) -> PathBuf {
    cfg.disabled_subpath.iter().fold(PathBuf::from(game_path), |p, s| p.join(s))
}

pub fn backup_dir(game_path: &str, cfg: &ModEngineConfig) -> PathBuf {
    cfg.backup_subpath.iter().fold(PathBuf::from(game_path), |p, s| p.join(s))
}

pub fn state_path(game_path: &str, cfg: &ModEngineConfig) -> PathBuf {
    mods_dir(game_path, cfg).join(cfg.state_filename)
}

impl ModEngineConfig {
    pub fn disabled_suffix(&self) -> &'static str {
        match &self.unit {
            ModUnit::File { disabled_suffix, .. } => disabled_suffix,
            ModUnit::Directory { .. } => "",
        }
    }

    pub fn is_directory_unit(&self) -> bool {
        matches!(self.unit, ModUnit::Directory { .. })
    }
}
