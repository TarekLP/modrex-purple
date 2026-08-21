use crate::commands::launchers::types::{GameDef, SteamDef};

pub const ITR2: GameDef = GameDef {
    name: "Into the Radius 2",
    executables: &["IntoTheRadius2.exe"],
    process_names: &["IntoTheRadius2-Win64-Shipping"],
    steam: Some(SteamDef {
        app_id: 2307350,
        folder_name: "IntoTheRadius2",
    }),
    epic: None,
    xbox: None,
};
