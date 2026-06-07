use crate::commands::launchers::types::{GameDef, SteamDef};

pub const PD2: GameDef = GameDef {
    name: "PAYDAY 2",
    executable: "payday2_win32_release.exe",
    process_name: "payday2_win32_release",
    steam: Some(SteamDef { app_id: 218620, folder_name: "PAYDAY 2" }),
    epic: None,
    xbox: None,
};
