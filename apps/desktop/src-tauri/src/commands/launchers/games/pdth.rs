use crate::commands::launchers::types::{GameDef, SteamDef};

pub const PDTH: GameDef = GameDef {
    name: "PAYDAY: The Heist",
    executables: &["payday_win32_release.exe"],
    process_names: &["payday_win32_release"],
    steam: Some(SteamDef {
        app_id: 24240,
        folder_name: "PAYDAY The Heist",
    }),
    epic: None,
    xbox: None,
};
