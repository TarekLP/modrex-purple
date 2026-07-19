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
        /// Directory names the ambient scan must never treat as a user mod, even though they
        /// match `scan_markers`/`entry_markers` — known bundled framework internals shipped
        /// alongside genuinely installable content. Use when `index_gated_markers` can't apply
        /// (the bundled content's files are never hashed into the mod index — e.g. UE4SS's own
        /// framework sub-mods under `Mods/`, which are plain `.lua` scripts, not `.pak` files).
        excluded_names: &'static [&'static str],
        priority_prefix: bool,
    },
}

/// UE4SS ships these framework-internal sub-mods bundled inside every install's `Mods/` folder
/// (verified against the real UE4SS-CB and PD3-UE4SS releases) — they carry the exact same
/// `Scripts/main.lua` shape as a genuine user sub-mod, so the ambient scan must exclude them by
/// name rather than by marker. `shared` holds Lua libraries the bundled modules import, not a
/// mod itself.
const UE4SS_BUNDLED_SUBMODS: &[&str] = &[
    "ActorDumperMod",
    "BPML_GenericFunctions",
    "BPModLoaderMod",
    "CheatManagerEnablerMod",
    "ConsoleCommandsMod",
    "ConsoleEnablerMod",
    "jsbLuaProfilerMod",
    "Keybinds",
    "LineTraceMod",
    "SplitScreenMod",
    "shared",
];

pub struct ScanTarget {
    pub tag: &'static str,
    pub label_key: &'static str,
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

    pub fn priority_prefix_enabled(&self) -> bool {
        match &self.unit {
            ModUnit::File {
                priority_prefix, ..
            }
            | ModUnit::Directory {
                priority_prefix, ..
            } => *priority_prefix,
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
    targets: &[
        ScanTarget {
            tag: "paks",
            unit: ModUnit::File {
                extension: "pak",
                disabled_suffix: ".disabled",
                priority_prefix: true,
            },
            label_key: "mods",
            mods_subpath: &["PAYDAY3", "Content", "Paks", "~mods"],
            disabled_subpath: &["PAYDAY3", "Content", "Paks", "~mods", "disabled"],
            backup_subpath: &["PAYDAY3", "Content", "~mods.bak"],
        },
        ScanTarget {
            tag: "ue4ss_mods",
            unit: ModUnit::Directory {
                entry_markers: &["Scripts/main.lua"],
                scan_markers: &["Scripts/main.lua"],
                index_gated_markers: &[],
                excluded_names: UE4SS_BUNDLED_SUBMODS,
                priority_prefix: false,
            },
            // game_path already ends in `PAYDAY3` (the Steam installdir) — see ue4ss.rs's
            // descriptor comment for why this isn't a second copy of it. Steam/Epic only.
            label_key: "ue4ssMods",
            mods_subpath: &["PAYDAY3", "Binaries", "Win64", "Mods"],
            disabled_subpath: &["PAYDAY3", "Binaries", "Win64", "Mods", "disabled"],
            backup_subpath: &["PAYDAY3", "Binaries", "Win64", "Mods.bak"],
        },
    ],
};

// Primary target is `CrimeBoss/Mods/<name>/` (Directory unit) — the official ModKit's install
// location. Unlike PD2/PDTH's Directory targets, the install-time content isn't an
// author-supplied folder copied as-is; Modrex synthesizes the `Content/Paks/WindowsNoEditor/`
// skeleton itself around the extracted .pak (+ .ucas/.utoc) regardless of how the source archive
// is packaged (see zip.rs's CB-specific resolution path). The official UGC mod-loader merges
// multiple mods' Data Table Extensions additively when mods live here; the legacy `paks` target
// (generic Unreal pak-mount, no merge semantics) only ever "last loaded wins" on overlapping
// data, so it's kept for backward compatibility / loose-triplet-only mods but never selected for
// new installs (`resolve_archive_download` dispatches on `cfg.primary().unit`, which is this
// Directory target — `paks` is reachable only via `target_for(Some("paks"))`, i.e. ambient scan
// of pre-existing installs).
pub static CRIMEBOSS_ENGINE: ModEngineConfig = ModEngineConfig {
    game_id: "cb",
    index_game_name: "Crime Boss: Rockay City",
    state_filename: ".modrex.json",
    targets: &[
        ScanTarget {
            tag: "mods",
            unit: ModUnit::Directory {
                entry_markers: &[],
                scan_markers: &[],
                index_gated_markers: &[],
                excluded_names: &[],
                priority_prefix: false,
            },
            label_key: "modkitMods",
            mods_subpath: &["CrimeBoss", "Mods"],
            disabled_subpath: &["CrimeBoss", "Mods", "disabled"],
            backup_subpath: &["CrimeBoss", "Mods.bak"],
        },
        ScanTarget {
            tag: "paks",
            unit: ModUnit::File {
                extension: "pak",
                disabled_suffix: ".disabled",
                priority_prefix: true,
            },
            label_key: "legacyPaks",
            mods_subpath: &["CrimeBoss", "Content", "Paks", "~mods"],
            disabled_subpath: &["CrimeBoss", "Content", "Paks", "~mods", "disabled"],
            backup_subpath: &["CrimeBoss", "Content", "~mods.bak"],
        },
        ScanTarget {
            tag: "ue4ss_mods",
            unit: ModUnit::Directory {
                entry_markers: &["Scripts/main.lua"],
                scan_markers: &["Scripts/main.lua"],
                index_gated_markers: &[],
                excluded_names: UE4SS_BUNDLED_SUBMODS,
                priority_prefix: false,
            },
            label_key: "ue4ssMods",
            mods_subpath: &["CrimeBoss", "Binaries", "Win64", "Mods"],
            disabled_subpath: &["CrimeBoss", "Binaries", "Win64", "Mods", "disabled"],
            backup_subpath: &["CrimeBoss", "Binaries", "Win64", "Mods.bak"],
        },
    ],
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
                excluded_names: &[],
                priority_prefix: false,
            },
            label_key: "mods",
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
                excluded_names: &[],
                priority_prefix: false,
            },
            label_key: "overrides",
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
                excluded_names: &[],
                priority_prefix: false,
            },
            label_key: "mods",
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
                excluded_names: &[],
                priority_prefix: false,
            },
            label_key: "overrides",
            mods_subpath: &["assets", "mod_overrides"],
            disabled_subpath: &["assets", "mod_overrides", "disabled"],
            backup_subpath: &["assets", "mod_overrides.bak"],
        },
    ],
};

// BLT infrastructure dirs that live under RAID's mods/ but are never user mods — mirrors
// RAIDWW2-BeardLib's own _ignore_folders list (Classes/Frameworks.lua), verified against a real
// install. BeardLib (the framework) is deliberately omitted: unlike these runtime/basemod dirs
// it's a normal installable mod page (id 49760), tracked like any other mod (matching PD2).
const RAID_INFRA_FOLDERS: &[&str] = &["base", "downloads", "logs", "saves"];

// RAID's modern loader (RAID-SuperBLT + RAIDWW2-BeardLib) loads BLT script mods AND asset
// override packs from a single mods/<name>/ folder: the game's older assets/mod_overrides mount
// was removed (current builds show a "MOD OVERRIDES IS NO LONGER USED" migration dialog, and
// BeardLib's FindOverrides scans each mods/<name>/ folder for override content — soundbanks/,
// guis/, units/, etc. — instead). So RAID has one blanket-accept target like Crime Boss's Mods/:
// every folder in mods/ is a user mod unless it's on RAID_INFRA_FOLDERS. Markers aren't usable
// here because asset packs carry no supermod.xml/mod.xml; identification still reads those
// embedded ids when present (embedded_modworkshop_id) and otherwise falls back to SHA256/name.
// The top-level base skip in find_untracked_paks also covers mods/base (which carries a
// supermod.xml that a blanket scan would otherwise treat as a user mod).
pub static RAID_ENGINE: ModEngineConfig = ModEngineConfig {
    game_id: "raid",
    index_game_name: "RAID: World War II",
    state_filename: ".modrex.json",
    targets: &[ScanTarget {
        tag: "mods",
        unit: ModUnit::Directory {
            entry_markers: &[],
            scan_markers: &[],
            index_gated_markers: &[],
            excluded_names: RAID_INFRA_FOLDERS,
            priority_prefix: false,
        },
        label_key: "mods",
        mods_subpath: &["mods"],
        disabled_subpath: &["mods", "disabled"],
        backup_subpath: &["mods.bak"],
    }],
};

pub fn engine_for_game(game_id: &str) -> Result<&'static ModEngineConfig, String> {
    crate::commands::games::game_spec(game_id)
        .map(|s| s.engine)
        .ok_or_else(|| format!("unknown game id '{game_id}'"))
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
