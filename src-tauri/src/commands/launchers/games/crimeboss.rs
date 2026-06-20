use crate::commands::launchers::types::{EpicDef, GameDef, SteamDef};

pub const CRIMEBOSS: GameDef = GameDef {
    name: "Crime Boss: Rockay City",
    executable: "CrimeBoss.exe",
    process_name: "CrimeBoss-Win64-Shipping",
    steam: Some(SteamDef {
        app_id: 2933080,
        folder_name: "CrimeBossRockayCity",
    }),
    epic: Some(EpicDef {
        display_name: "Crime Boss: Rockay City",
    }),
    xbox: None,
};
