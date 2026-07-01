// Handles nxm:// links, the free-tier download handoff — see the comment on
// nexus.rs's nexus_get_download_link for why this path exists at all.
// Shape: nxm://<domain>/mods/<mod_id>/files/<file_id>?key=...&expires=...

use tauri::{AppHandle, Emitter};

use crate::commands::download::download_file;
use crate::commands::nexus::{game_id_for_domain, nexus_get_download_link};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NxmLink {
    pub game_id: String,
    pub mod_id: u32,
    pub file_id: u32,
    pub key: String,
    pub expires: String,
}

pub fn parse_nxm_url(url: &str) -> Result<NxmLink, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("nxm: invalid url: {e}"))?;
    if parsed.scheme() != "nxm" {
        return Err(format!("nxm: unexpected scheme '{}'", parsed.scheme()));
    }
    let domain = parsed.host_str().ok_or("nxm: missing game domain")?;
    let game_id = game_id_for_domain(domain)?.to_string();

    let segments: Vec<&str> = parsed
        .path_segments()
        .map(|s| s.collect())
        .unwrap_or_default();
    let ["mods", mod_id, "files", file_id] = segments.as_slice() else {
        return Err(format!("nxm: unexpected path shape '{}'", parsed.path()));
    };
    let mod_id: u32 = mod_id
        .parse()
        .map_err(|_| format!("nxm: bad mod id '{mod_id}'"))?;
    let file_id: u32 = file_id
        .parse()
        .map_err(|_| format!("nxm: bad file id '{file_id}'"))?;

    let pairs: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
    let key = pairs.get("key").cloned().ok_or("nxm: missing key param")?;
    let expires = pairs
        .get("expires")
        .cloned()
        .ok_or("nxm: missing expires param")?;

    Ok(NxmLink {
        game_id,
        mod_id,
        file_id,
        key,
        expires,
    })
}

fn extension_from_uri(uri: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(uri).ok()?;
    let name = parsed.path_segments()?.next_back()?;
    std::path::Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_string())
}

pub async fn handle_nxm_url(app: &AppHandle, url: &str) -> Result<(), String> {
    let link = parse_nxm_url(url)?;

    let resolved = nexus_get_download_link(
        app.clone(),
        link.game_id.clone(),
        link.mod_id,
        link.file_id,
        Some(link.key.clone()),
        Some(link.expires.clone()),
    )
    .await?;

    let uri = resolved
        .get(0)
        .and_then(|v| v.get("URI"))
        .and_then(|v| v.as_str())
        .ok_or("nxm: no download URI in resolved link")?;
    let ext = extension_from_uri(uri).ok_or("nxm: could not determine file extension from URI")?;

    let dest = download_file(app, uri, &ext, &uuid::Uuid::new_v4().to_string()).await?;

    app.emit(
        "nxm:download-complete",
        serde_json::json!({
            "gameId": link.game_id,
            "modId": link.mod_id,
            "fileId": link.file_id,
            "path": dest,
        }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
#[path = "nxm_tests.rs"]
mod tests;
