pub struct SteamDef {
    pub app_id: u32,
    pub folder_name: &'static str,
}

pub struct EpicDef {
    pub display_name: &'static str,
}

pub struct XboxDef {
    pub product_id: &'static str,
    pub executable: &'static str,
}

pub struct GameDef {
    pub name: &'static str,
    pub executable: &'static str,
    pub process_name: &'static str,
    pub steam: Option<SteamDef>,
    pub epic: Option<EpicDef>,
    pub xbox: Option<XboxDef>,
}

pub trait Launcher: Send + Sync {
    fn id(&self) -> &'static str;
    fn is_installed(&self) -> bool;
    fn find_game(&self, game: &GameDef) -> Option<String>;
    fn identify_path(&self, game_path: &str) -> bool;
    fn launch(&self, game: &GameDef, game_path: &str, opts: Option<&str>);
}
