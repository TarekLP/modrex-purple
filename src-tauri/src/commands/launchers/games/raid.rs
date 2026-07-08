use crate::commands::launchers::types::{GameDef, SteamDef};

pub const RAID: GameDef = GameDef {
    name: "RAID: World War II",
    executables: &["raid_win64_release.exe"],
    process_names: &["raid_win64_release"],
    steam: Some(SteamDef {
        app_id: 414740,
        folder_name: "RAID World War II",
    }),
    epic: None,
    xbox: None,
};
