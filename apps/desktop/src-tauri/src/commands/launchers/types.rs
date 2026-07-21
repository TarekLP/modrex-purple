pub struct SteamDef {
    pub app_id: u32,
    pub folder_name: &'static str,
}

pub struct EpicDef {
    pub display_name: &'static str,
}

pub struct XboxDef {
    pub product_id: &'static str,
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    pub executable: &'static str,
}

pub struct GameDef {
    pub name: &'static str,
    pub executables: &'static [&'static str],
    pub process_names: &'static [&'static str],
    pub steam: Option<SteamDef>,
    pub epic: Option<EpicDef>,
    pub xbox: Option<XboxDef>,
}

impl GameDef {
    pub fn resolve_executable(&self, game_path: &str) -> Option<&'static str> {
        self.executables
            .iter()
            .copied()
            .find(|exe| std::path::Path::new(game_path).join(exe).exists())
    }
}

pub trait Launcher: Send + Sync {
    fn id(&self) -> &'static str;
    fn is_installed(&self) -> bool;
    fn find_game(&self, game: &GameDef) -> Option<String>;
    fn identify_path(&self, game_path: &str) -> bool;
    fn launch(&self, game: &GameDef, game_path: &str, opts: Option<&str>);
}
