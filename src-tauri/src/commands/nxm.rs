// Handles nxm:// links, the free-tier download handoff — see the comment on
// nexus.rs's nexus_get_download_link for why this path exists at all.
// Shape: nxm://<domain>/mods/<mod_id>/files/<file_id>?key=...&expires=...

use tauri::{AppHandle, Emitter};

use crate::commands::download::download_file;
use crate::commands::mods::{install_nexus_download, NexusInstallMeta};
use crate::commands::nexus::{
    game_id_for_domain, nexus_get_download_link, nexus_get_file, nexus_get_mod,
};
use crate::commands::settings::{game_settings, read_settings};

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
    // nxm is not a special scheme, so url leaves the host case as-is unlike http(s).
    let domain = parsed
        .host_str()
        .ok_or("nxm: missing game domain")?
        .to_lowercase();
    let game_id = game_id_for_domain(&domain)?.to_string();

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

fn extension_from_name(name: &str) -> Option<String> {
    std::path::Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_string())
}

fn extension_from_uri(uri: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(uri).ok()?;
    extension_from_name(parsed.path_segments()?.next_back()?)
}

// The CDN URI's path doesn't reliably carry a filename (observed live), so the
// file-details endpoint's file_name is the authoritative fallback.
async fn resolve_extension(app: &AppHandle, link: &NxmLink, uri: &str) -> Result<String, String> {
    if let Some(ext) = extension_from_uri(uri) {
        return Ok(ext);
    }
    let file_info = nexus_get_file(app, &link.game_id, link.mod_id, link.file_id).await?;
    file_info["file_name"]
        .as_str()
        .and_then(extension_from_name)
        .ok_or_else(|| "nxm: could not determine file type from URI or file details".to_string())
}

pub fn spawn_handle_nxm_url(app: &AppHandle, url: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = handle_nxm_url(&app, &url).await {
            log::warn!("nxm handoff failed: {e}");
            let _ = app.emit("nxm:install-failed", e);
        }
    });
}

pub async fn handle_nxm_url(app: &AppHandle, url: &str) -> Result<(), String> {
    let link = parse_nxm_url(url)?;

    // Fired before any network work so the card leaves its idle state the moment
    // the handoff lands, not seconds later when download bytes start flowing.
    let _ = app.emit(
        "nxm:install-started",
        serde_json::json!({
            "gameId": link.game_id,
            "modId": link.mod_id,
            "fileId": link.file_id,
        }),
    );

    // Checked before any network work so a misconfigured game fails fast and
    // never leaves an orphaned temp download.
    let settings = read_settings(app);
    let game_path = game_settings(&settings, &link.game_id)
        .and_then(|gs| gs.game_path.clone())
        .ok_or_else(|| format!("nxm: no game path configured for '{}'", link.game_id))?;

    let mod_info = nexus_get_mod(app.clone(), link.game_id.clone(), link.mod_id).await?;
    let mod_name = mod_info["name"]
        .as_str()
        .ok_or("nxm: mod info missing name")?
        .to_string();
    let mod_version = mod_info["version"].as_str().unwrap_or("").to_string();
    let mod_author = mod_info["author"].as_str().map(|s| s.to_string());
    let thumbnail_url = mod_info["picture_url"].as_str().map(|s| s.to_string());

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
    let ext = resolve_extension(app, &link, uri).await?;

    // nxm-prefixed so it never collides with the app's other download-id conventions.
    let download_id = format!("nxm:{}:{}", link.mod_id, link.file_id);
    let dest = download_file(app, uri, &ext, &download_id).await?;

    install_nexus_download(
        app,
        &link.game_id,
        &game_path,
        dest,
        NexusInstallMeta {
            mod_id: link.mod_id,
            file_id: link.file_id,
            name: mod_name.clone(),
            version: mod_version,
            author: mod_author,
            thumbnail_url,
            file_type: ext,
        },
    )
    .await?;

    log::info!(
        "nxm install complete: mod {} file {} ({mod_name})",
        link.mod_id,
        link.file_id
    );

    app.emit(
        "nxm:install-complete",
        serde_json::json!({
            "gameId": link.game_id,
            "modId": link.mod_id,
            "fileId": link.file_id,
            "name": mod_name,
        }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
#[path = "nxm_tests.rs"]
mod tests;
