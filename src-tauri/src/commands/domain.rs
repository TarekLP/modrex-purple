//! Neutral mod types the renderer consumes, and the modworkshop translation into them.
//!
//! Two structs per shape, deliberately:
//!
//! The private Wire types are what modworkshop actually sends. They carry a
//! container-level serde(default) because the API omits fields inconsistently (type and
//! size are absent on link-type downloads, avatar on users who never set one). These
//! shapes used to cross IPC as untyped JSON that TypeScript only claimed to know, so a
//! missing field rendered as a blank label. Deserializing into a struct WITHOUT defaults
//! would turn that same response into a hard error and empty the whole browse page, so
//! the wire layer stays maximally forgiving.
//!
//! The public types are what crosses IPC, and their fields are required. Normalizing in
//! Rust (absent string becomes empty, absent count becomes zero) is what lets the renderer
//! keep strong types: specta derives optionality from the serde attributes, so one struct
//! carrying both derives plus serde(default) exports EVERY field as optional, which is
//! weaker than the hand-written types this replaces. Option survives only where absence is
//! real and the renderer already branches on it.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireThumbnail {
    file: String,
    has_thumb: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireDownload {
    id: i64,
    version: String,
    size: Option<i64>,
    #[serde(rename = "type")]
    kind: Option<String>,
    download_url: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireUser {
    id: Option<i64>,
    name: String,
    donation_url: Option<String>,
    avatar: Option<String>,
    avatar_has_thumb: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireModSummary {
    id: i64,
    name: String,
    desc: String,
    short_desc: String,
    version: String,
    downloads: i64,
    likes: i64,
    views: i64,
    published_at: String,
    bumped_at: String,
    category_id: i64,
    has_download: bool,
    disable_mod_managers: Option<bool>,
    thumbnail: Option<WireThumbnail>,
    download: Option<WireDownload>,
    user: WireUser,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WirePageMeta {
    current_page: i64,
    last_page: i64,
    per_page: i64,
    total: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireModPage {
    data: Vec<WireModSummary>,
    meta: WirePageMeta,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModThumbnail {
    pub file: String,
    pub has_thumb: Option<bool>,
}

/// The default download attached to a listing. modworkshop has two shapes here:
/// file-hosted mods carry download_url/type/size, external-link mods carry only url.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModDownload {
    pub id: i64,
    pub version: String,
    pub size: Option<i64>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub download_url: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModUser {
    pub id: Option<i64>,
    pub name: String,
    pub donation_url: Option<String>,
    pub avatar: Option<String>,
    pub avatar_has_thumb: Option<bool>,
}

/// A mod as a listing returns it. The detail call adds images, banner, dependencies,
/// instructs_template and tags, which is why those are deliberately absent here.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModSummary {
    pub id: i64,
    pub name: String,
    pub desc: String,
    pub short_desc: String,
    pub version: String,
    pub downloads: i64,
    pub likes: i64,
    pub views: i64,
    pub published_at: String,
    pub bumped_at: String,
    pub category_id: i64,
    pub has_download: bool,
    pub disable_mod_managers: Option<bool>,
    pub thumbnail: Option<ModThumbnail>,
    pub download: Option<ModDownload>,
    pub user: ModUser,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct PageMeta {
    pub current_page: i64,
    pub last_page: i64,
    pub per_page: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModPage {
    pub data: Vec<ModSummary>,
    pub meta: PageMeta,
}

impl From<WireThumbnail> for ModThumbnail {
    fn from(w: WireThumbnail) -> Self {
        Self {
            file: w.file,
            has_thumb: w.has_thumb,
        }
    }
}

impl From<WireDownload> for ModDownload {
    fn from(w: WireDownload) -> Self {
        Self {
            id: w.id,
            version: w.version,
            size: w.size,
            kind: w.kind,
            download_url: w.download_url,
            url: w.url,
        }
    }
}

impl From<WireUser> for ModUser {
    fn from(w: WireUser) -> Self {
        Self {
            id: w.id,
            name: w.name,
            donation_url: w.donation_url,
            avatar: w.avatar,
            avatar_has_thumb: w.avatar_has_thumb,
        }
    }
}

impl From<WireModSummary> for ModSummary {
    fn from(w: WireModSummary) -> Self {
        Self {
            id: w.id,
            name: w.name,
            desc: w.desc,
            short_desc: w.short_desc,
            version: w.version,
            downloads: w.downloads,
            likes: w.likes,
            views: w.views,
            published_at: w.published_at,
            bumped_at: w.bumped_at,
            category_id: w.category_id,
            has_download: w.has_download,
            disable_mod_managers: w.disable_mod_managers,
            thumbnail: w.thumbnail.map(Into::into),
            download: w.download.map(Into::into),
            user: w.user.into(),
        }
    }
}

impl From<WirePageMeta> for PageMeta {
    fn from(w: WirePageMeta) -> Self {
        Self {
            current_page: w.current_page,
            last_page: w.last_page,
            per_page: w.per_page,
            total: w.total,
        }
    }
}

impl From<WireModPage> for ModPage {
    fn from(w: WireModPage) -> Self {
        Self {
            data: w.data.into_iter().map(Into::into).collect(),
            meta: w.meta.into(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireModFile {
    id: i64,
    name: String,
    version: String,
    size: i64,
    #[serde(rename = "type")]
    kind: Option<String>,
    download_url: String,
    url: Option<String>,
    image_id: Option<i64>,
    desc: Option<String>,
    label: Option<String>,
    downloads: Option<i64>,
    created_at: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireModLink {
    id: i64,
    name: String,
    url: String,
    desc: Option<String>,
    label: Option<String>,
    version: Option<String>,
    image_id: Option<i64>,
    downloads: Option<i64>,
    created_at: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireFilePage {
    data: Vec<WireModFile>,
    meta: WirePageMeta,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireLinkPage {
    data: Vec<WireModLink>,
    meta: WirePageMeta,
}

/// One downloadable file on a mod. Distinct from ModDownload above, which is the single
/// default download a listing carries; a mod can publish many files.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModFile {
    pub id: i64,
    pub name: String,
    pub version: String,
    pub size: i64,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub download_url: String,
    pub url: Option<String>,
    pub image_id: Option<i64>,
    pub desc: Option<String>,
    pub label: Option<String>,
    pub downloads: Option<i64>,
    pub created_at: Option<String>,
}

/// An external link a mod lists. Carries url but never download_url/type/size, which is
/// what separates it from a hosted file.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModLink {
    pub id: i64,
    pub name: String,
    pub url: String,
    pub desc: Option<String>,
    pub label: Option<String>,
    pub version: Option<String>,
    pub image_id: Option<i64>,
    pub downloads: Option<i64>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct FilePage {
    pub data: Vec<ModFile>,
    pub meta: PageMeta,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct LinkPage {
    pub data: Vec<ModLink>,
    pub meta: PageMeta,
}

impl From<WireModFile> for ModFile {
    fn from(w: WireModFile) -> Self {
        Self {
            id: w.id,
            name: w.name,
            version: w.version,
            size: w.size,
            kind: w.kind,
            download_url: w.download_url,
            url: w.url,
            image_id: w.image_id,
            desc: w.desc,
            label: w.label,
            downloads: w.downloads,
            created_at: w.created_at,
        }
    }
}

impl From<WireModLink> for ModLink {
    fn from(w: WireModLink) -> Self {
        Self {
            id: w.id,
            name: w.name,
            url: w.url,
            desc: w.desc,
            label: w.label,
            version: w.version,
            image_id: w.image_id,
            downloads: w.downloads,
            created_at: w.created_at,
        }
    }
}

/// Parses a modworkshop file listing into the neutral page shape.
pub fn parse_file_page(value: serde_json::Value) -> Result<FilePage, String> {
    let wire: WireFilePage = serde_json::from_value(value)
        .map_err(|e| format!("modworkshop file listing did not parse: {e}"))?;
    Ok(FilePage {
        data: wire.data.into_iter().map(Into::into).collect(),
        meta: wire.meta.into(),
    })
}

/// Parses a modworkshop link listing into the neutral page shape.
pub fn parse_link_page(value: serde_json::Value) -> Result<LinkPage, String> {
    let wire: WireLinkPage = serde_json::from_value(value)
        .map_err(|e| format!("modworkshop link listing did not parse: {e}"))?;
    Ok(LinkPage {
        data: wire.data.into_iter().map(Into::into).collect(),
        meta: wire.meta.into(),
    })
}

/// Parses a modworkshop listing response into the neutral page shape.
pub fn parse_mod_page(value: serde_json::Value) -> Result<ModPage, String> {
    let wire: WireModPage = serde_json::from_value(value)
        .map_err(|e| format!("modworkshop listing did not parse: {e}"))?;
    Ok(wire.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(json: &str) -> ModPage {
        parse_mod_page(serde_json::from_str(json).expect("json")).expect("page")
    }

    // The listing shape as modworkshop actually returns it, trimmed to the fields the
    // renderer reads. Guards the field names, which are the whole contract.
    const LIST_JSON: &str = r#"{
        "data": [{
            "id": 58065,
            "name": "Test Mod",
            "desc": "long",
            "short_desc": "short",
            "version": "2.11",
            "downloads": 100,
            "likes": 5,
            "views": 900,
            "published_at": "2024-01-01",
            "bumped_at": "2024-02-01",
            "category_id": 7,
            "has_download": true,
            "thumbnail": { "file": "abc.png", "has_thumb": true },
            "download": {
                "id": 1,
                "version": "1.9.4",
                "size": 2048,
                "type": "zip",
                "download_url": "https://example.test/a.zip"
            },
            "user": { "id": 3, "name": "Author" }
        }],
        "meta": { "current_page": 1, "last_page": 4, "per_page": 24, "total": 90 }
    }"#;

    #[test]
    fn parses_a_real_listing_shape() {
        let page = parse(LIST_JSON);
        assert_eq!(page.meta.last_page, 4);
        assert_eq!(page.meta.total, 90);
        let m = &page.data[0];
        assert_eq!(m.id, 58065);
        assert_eq!(m.version, "2.11");
        assert_eq!(m.thumbnail.as_ref().expect("thumbnail").file, "abc.png");
        let d = m.download.as_ref().expect("download");
        assert_eq!(d.kind.as_deref(), Some("zip"));
        // The file-level version is a different field from the mod-level one above, and
        // conflating them is a known trap: installed state must store the mod-level value.
        assert_eq!(d.version, "1.9.4");
        assert_eq!(m.user.name, "Author");
    }

    // An external-link mod: download carries url and none of download_url/type/size.
    // Modelling those as required would error the entire page over one such mod.
    #[test]
    fn parses_a_link_type_download() {
        let page = parse(
            r#"{"data":[{"id":1,"name":"L","download":{"id":9,"version":"1",
            "url":"https://example.test/page"}}],"meta":{}}"#,
        );
        let d = page.data[0].download.as_ref().expect("download");
        assert_eq!(d.url.as_deref(), Some("https://example.test/page"));
        assert!(d.download_url.is_none());
        assert!(d.kind.is_none());
        assert!(d.size.is_none());
    }

    // The failure mode this whole module is defensive about: a mod missing fields the old
    // untyped path rendered as blank must not take the entire request down with it.
    #[test]
    fn a_mod_missing_optional_fields_still_parses() {
        let page = parse(r#"{"data":[{"id":2,"name":"Bare"}],"meta":{}}"#);
        let m = &page.data[0];
        assert_eq!(m.name, "Bare");
        assert_eq!(m.version, "");
        assert!(!m.has_download);
        assert!(m.thumbnail.is_none());
        assert!(m.download.is_none());
        assert_eq!(m.user.name, "");
    }

    #[test]
    fn an_empty_page_parses() {
        let page = parse(r#"{"data":[],"meta":{}}"#);
        assert!(page.data.is_empty());
        assert_eq!(page.meta.total, 0);
    }

    // Unmodelled fields are dropped rather than rejected, so modworkshop adding a field
    // never breaks a shipped build.
    #[test]
    fn unknown_fields_are_ignored() {
        let page = parse(r#"{"data":[{"id":3,"name":"X","brand_new_field":{"a":1}}],"meta":{}}"#);
        assert_eq!(page.data[0].id, 3);
    }

    // A hosted file carries download_url/type/size; the renderer picks install behaviour
    // from type, so it must survive as null rather than becoming an empty string.
    #[test]
    fn parses_a_file_listing() {
        let page = parse_file_page(
            serde_json::from_str(
                r#"{"data":[{"id":7,"name":"main.zip","version":"1.2","size":99,
                "type":"zip","download_url":"https://example.test/f.zip"}],"meta":{"total":1}}"#,
            )
            .expect("json"),
        )
        .expect("page");
        let f = &page.data[0];
        assert_eq!(f.id, 7);
        assert_eq!(f.kind.as_deref(), Some("zip"));
        assert_eq!(f.download_url, "https://example.test/f.zip");
        assert!(f.desc.is_none());
        assert_eq!(page.meta.total, 1);
    }

    // Files with no type are real: the renderer falls back to the URL extension.
    #[test]
    fn a_file_without_a_type_still_parses() {
        let page = parse_file_page(
            serde_json::from_str(r#"{"data":[{"id":8,"download_url":"u"}],"meta":{}}"#)
                .expect("json"),
        )
        .expect("page");
        assert!(page.data[0].kind.is_none());
        assert_eq!(page.data[0].version, "");
    }

    #[test]
    fn parses_a_link_listing() {
        let page = parse_link_page(
            serde_json::from_str(
                r#"{"data":[{"id":3,"name":"Mirror","url":"https://example.test"}],"meta":{}}"#,
            )
            .expect("json"),
        )
        .expect("page");
        assert_eq!(page.data[0].name, "Mirror");
        assert_eq!(page.data[0].url, "https://example.test");
        assert!(page.data[0].version.is_none());
    }
}
