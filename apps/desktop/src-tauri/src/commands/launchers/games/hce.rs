use crate::commands::launchers::types::{GameDef, SteamDef, XboxDef};

// The Microsoft Store / Game Pass product id is a placeholder (see docs/plans/
// halo-campaign-evolved.md): a fake id simply never matches a real install, so the Xbox
// launcher def is present for the storefront list while auto-detection stays Steam-only
// until the real id and WinGDK exe name are verified.
pub const HCE: GameDef = GameDef {
    name: "Halo: Campaign Evolved",
    // Nested relative to the install root: the UE5 binaries live in Meteorite/Binaries/,
    // there is no HaloCampaignEvolved.exe at the root of a Steam or manual install.
    executables: &["Meteorite/Binaries/Win64/HaloCampaignEvolved.exe"],
    process_names: &["HaloCampaignEvolved-Win64-Shipping"],
    steam: Some(SteamDef {
        app_id: 2806050,
        folder_name: "Halo Campaign Evolved",
    }),
    epic: None,
    xbox: Some(XboxDef {
        product_id: "MODREX_PLACEHOLDER",
        executable: "Meteorite/Binaries/WinGDK/HaloCampaignEvolved.exe",
    }),
};
