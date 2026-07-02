use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModFolder {
    pub id: String,
    pub disk_name: String,
    pub display_name: String,
    pub priority: i64,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TopLevelItem {
    #[serde(rename = "folder")]
    Folder { id: String },
    #[serde(rename = "mod")]
    Mod { id: String },
}

fn default_source() -> String {
    "modworkshop".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    #[serde(default)]
    pub uid: String,
    pub id: i64,
    pub name: String,
    pub version: String,
    pub filename: String,
    pub enabled: bool,
    pub installed_at: String,
    #[serde(default = "default_source")]
    pub source: String,
    // Only recorded for non-modworkshop sources; modworkshop authorship and
    // artwork come from the live API via the mod id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub missing: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archive_broken: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
}

impl Default for InstalledMod {
    fn default() -> Self {
        Self {
            uid: String::new(),
            id: 0,
            name: String::new(),
            version: String::new(),
            filename: String::new(),
            enabled: false,
            installed_at: String::new(),
            source: default_source(),
            author: None,
            thumbnail_url: None,
            file_id: None,
            file_type: None,
            sha256: None,
            priority: None,
            missing: None,
            folder_id: None,
            archive_broken: None,
            location: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModsState {
    pub folders: Vec<ModFolder>,
    pub mods: Vec<InstalledMod>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledResponse {
    pub mods: Vec<InstalledMod>,
    pub folders: Vec<ModFolder>,
    pub mods_hidden: bool,
}
