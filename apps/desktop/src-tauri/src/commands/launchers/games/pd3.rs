use crate::commands::launchers::types::{EpicDef, GameDef, SteamDef, XboxDef};

pub const PD3: GameDef = GameDef {
    name: "PAYDAY 3",
    executables: &["PAYDAY3.exe"],
    process_names: &["PAYDAY3-Win64-Shipping"],
    steam: Some(SteamDef {
        app_id: 1272080,
        folder_name: "PAYDAY3",
    }),
    epic: Some(EpicDef {
        display_name: "PAYDAY 3",
    }),
    xbox: Some(XboxDef {
        product_id: "9NPZVDCH73SX",
        executable: "PAYDAY3/Binaries/WinGDK/PAYDAY3-WinGDK-Shipping.exe",
    }),
};
