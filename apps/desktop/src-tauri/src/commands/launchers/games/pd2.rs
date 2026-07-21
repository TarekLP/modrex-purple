use crate::commands::launchers::types::{EpicDef, GameDef, SteamDef};

pub const PD2: GameDef = GameDef {
    name: "PAYDAY 2",
    executables: &["PAYDAY2.exe", "payday2_win32_release.exe"],
    process_names: &["PAYDAY2", "payday2_win32_release"],
    steam: Some(SteamDef {
        app_id: 218620,
        folder_name: "PAYDAY 2",
    }),
    epic: Some(EpicDef {
        display_name: "PAYDAY 2",
    }),
    xbox: None,
};
