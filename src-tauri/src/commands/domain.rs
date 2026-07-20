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

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireImage {
    id: i64,
    file: String,
    #[serde(rename = "type")]
    kind: String,
    size: i64,
    display_order: i64,
    visible: bool,
    has_thumb: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireTag {
    id: i64,
    name: String,
    color: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireMember {
    id: i64,
    name: String,
    level: String,
    accepted: bool,
    donation_url: Option<String>,
    avatar: Option<String>,
    avatar_has_thumb: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireDependency {
    id: i64,
    mod_id: Option<i64>,
    name: Option<String>,
    url: Option<String>,
    optional: bool,
    order: Option<i64>,
    #[serde(rename = "mod")]
    target: Option<WireModSummary>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireInstructsTemplate {
    id: i64,
    name: String,
    instructions: String,
    dependencies: Vec<WireDependency>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireModDetail {
    #[serde(flatten)]
    summary: WireModSummary,
    changelog: Option<String>,
    instructions: Option<String>,
    license: Option<String>,
    repo_url: Option<String>,
    donation: Option<String>,
    banner: Option<WireImage>,
    images: Vec<WireImage>,
    dependencies: Vec<WireDependency>,
    instructs_template: Option<WireInstructsTemplate>,
    tags: Vec<WireTag>,
    members: Vec<WireMember>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModImage {
    pub id: i64,
    pub file: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub size: i64,
    pub display_order: i64,
    pub visible: bool,
    pub has_thumb: bool,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModTag {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModMember {
    pub id: i64,
    pub name: String,
    pub level: String,
    pub accepted: bool,
    pub donation_url: Option<String>,
    pub avatar: Option<String>,
    pub avatar_has_thumb: Option<bool>,
}

/// A declared dependency. The nested mod is a SUMMARY, not a detail: modworkshop returns
/// the listing shape here, and the renderer only ever reads summary fields off it. Typing
/// it as a detail would also make this type recursive for no gain.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModDependency {
    pub id: i64,
    /// None for offsite dependencies, which are hosted outside modworkshop.
    pub mod_id: Option<i64>,
    pub name: Option<String>,
    pub url: Option<String>,
    pub optional: bool,
    /// Author-defined install order. The renderer sorts by it, matching the mod page.
    pub order: Option<i64>,
    #[serde(rename = "mod")]
    pub target: Option<ModSummary>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct InstructsTemplate {
    pub id: i64,
    pub name: String,
    pub instructions: String,
    pub dependencies: Vec<ModDependency>,
}

/// A mod as /mods/{id} returns it: every summary field plus the ones only the detail call
/// carries. The collections are required but may be empty, which is the normalization the
/// renderer previously did itself with `?? []` at each use.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ModDetail {
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
    pub changelog: Option<String>,
    pub instructions: Option<String>,
    pub license: Option<String>,
    pub repo_url: Option<String>,
    pub donation: Option<String>,
    pub banner: Option<ModImage>,
    pub images: Vec<ModImage>,
    pub dependencies: Vec<ModDependency>,
    pub instructs_template: Option<InstructsTemplate>,
    pub tags: Vec<ModTag>,
    pub members: Vec<ModMember>,
}

impl From<WireImage> for ModImage {
    fn from(w: WireImage) -> Self {
        Self {
            id: w.id,
            file: w.file,
            kind: w.kind,
            size: w.size,
            display_order: w.display_order,
            visible: w.visible,
            has_thumb: w.has_thumb,
        }
    }
}

impl From<WireTag> for ModTag {
    fn from(w: WireTag) -> Self {
        Self {
            id: w.id,
            name: w.name,
            color: w.color,
        }
    }
}

impl From<WireMember> for ModMember {
    fn from(w: WireMember) -> Self {
        Self {
            id: w.id,
            name: w.name,
            level: w.level,
            accepted: w.accepted,
            donation_url: w.donation_url,
            avatar: w.avatar,
            avatar_has_thumb: w.avatar_has_thumb,
        }
    }
}

impl From<WireDependency> for ModDependency {
    fn from(w: WireDependency) -> Self {
        Self {
            id: w.id,
            mod_id: w.mod_id,
            name: w.name,
            url: w.url,
            optional: w.optional,
            order: w.order,
            target: w.target.map(Into::into),
        }
    }
}

impl From<WireInstructsTemplate> for InstructsTemplate {
    fn from(w: WireInstructsTemplate) -> Self {
        Self {
            id: w.id,
            name: w.name,
            instructions: w.instructions,
            dependencies: w.dependencies.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<WireModDetail> for ModDetail {
    fn from(w: WireModDetail) -> Self {
        let s = ModSummary::from(w.summary);
        Self {
            id: s.id,
            name: s.name,
            desc: s.desc,
            short_desc: s.short_desc,
            version: s.version,
            downloads: s.downloads,
            likes: s.likes,
            views: s.views,
            published_at: s.published_at,
            bumped_at: s.bumped_at,
            category_id: s.category_id,
            has_download: s.has_download,
            disable_mod_managers: s.disable_mod_managers,
            thumbnail: s.thumbnail,
            download: s.download,
            user: s.user,
            changelog: w.changelog,
            instructions: w.instructions,
            license: w.license,
            repo_url: w.repo_url,
            donation: w.donation,
            banner: w.banner.map(Into::into),
            images: w.images.into_iter().map(Into::into).collect(),
            dependencies: w.dependencies.into_iter().map(Into::into).collect(),
            instructs_template: w.instructs_template.map(Into::into),
            tags: w.tags.into_iter().map(Into::into).collect(),
            members: w.members.into_iter().map(Into::into).collect(),
        }
    }
}

/// Parses a modworkshop mod detail response into the neutral detail shape.
pub fn parse_mod_detail(value: serde_json::Value) -> Result<ModDetail, String> {
    let wire: WireModDetail = serde_json::from_value(value)
        .map_err(|e| format!("modworkshop mod detail did not parse: {e}"))?;
    Ok(wire.into())
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireNexusNode {
    #[serde(rename = "modId")]
    mod_id: i64,
    name: String,
    summary: Option<String>,
    #[serde(rename = "pictureUrl")]
    picture_url: Option<String>,
    author: Option<String>,
    downloads: i64,
    endorsements: i64,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct WireNexusPage {
    #[serde(rename = "totalCount")]
    total_count: i64,
    nodes: Vec<WireNexusNode>,
}

/// Nexus search results, mapped onto the same summary shape modworkshop produces.
///
/// Three mappings are judgement calls rather than renames, and each loses something:
///
/// - endorsements becomes likes. Both count approval, but they are not the same metric.
/// - pictureUrl becomes thumbnail.file. modworkshop stores a CDN filename there, Nexus
///   gives a full URL; the renderer's useThumbnail passes absolute URLs through untouched,
///   which is the same route locally recorded thumbnails already take.
/// - version is EMPTY. The GraphQL search selection carries no version at all, and an
///   empty version is what suppresses false update prompts in useModData, so a Nexus mod
///   still cannot report updates. Fixing that needs a per-mod detail call, not this one.
///
/// has_download is true because every Nexus search result is downloadable; the download
/// itself is null since acquisition goes through the nxm handoff, not a direct URL.
fn nexus_node_to_summary(w: WireNexusNode) -> ModSummary {
    let summary = w.summary.unwrap_or_default();
    ModSummary {
        id: w.mod_id,
        name: w.name,
        desc: summary.clone(),
        short_desc: summary,
        version: String::new(),
        downloads: w.downloads,
        likes: w.endorsements,
        views: 0,
        published_at: String::new(),
        bumped_at: w.updated_at.unwrap_or_default(),
        category_id: 0,
        has_download: true,
        disable_mod_managers: None,
        thumbnail: w.picture_url.map(|file| ModThumbnail {
            file,
            has_thumb: None,
        }),
        download: None,
        user: ModUser {
            id: None,
            name: w.author.unwrap_or_default(),
            donation_url: None,
            avatar: None,
            avatar_has_thumb: None,
        },
    }
}

/// Parses a Nexus GraphQL mods payload into the neutral page shape. Nexus pages by offset
/// rather than page number, so the caller supplies the page it asked for.
pub fn parse_nexus_page(
    value: serde_json::Value,
    page: i64,
    per_page: i64,
) -> Result<ModPage, String> {
    let wire: WireNexusPage =
        serde_json::from_value(value).map_err(|e| format!("nexus search did not parse: {e}"))?;
    let last_page = if per_page > 0 {
        (wire.total_count + per_page - 1) / per_page
    } else {
        0
    };
    Ok(ModPage {
        data: wire.nodes.into_iter().map(nexus_node_to_summary).collect(),
        meta: PageMeta {
            current_page: page,
            last_page,
            per_page,
            total: wire.total_count,
        },
    })
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

    // serde(flatten) is what lets the detail response reuse the summary wire struct. If it
    // ever stops merging, the summary half silently comes back as defaults, so this asserts
    // both halves land from one payload.
    #[test]
    fn detail_carries_both_summary_and_detail_fields() {
        let detail = parse_mod_detail(
            serde_json::from_str(
                r##"{"id":42,"name":"Full Mod","version":"3.0","has_download":true,
                "user":{"id":8,"name":"Author"},
                "changelog":"notes","license":"MIT","repo_url":"https://example.test/r",
                "images":[{"id":1,"file":"a.png","type":"image/png","visible":true}],
                "tags":[{"id":5,"name":"Weapons","color":"#fff"}],
                "members":[{"id":2,"name":"Helper","level":"contributor","accepted":true}]}"##,
            )
            .expect("json"),
        )
        .expect("detail");
        assert_eq!(detail.id, 42, "summary half must survive the flatten");
        assert_eq!(detail.version, "3.0");
        assert_eq!(detail.user.name, "Author");
        assert_eq!(detail.changelog.as_deref(), Some("notes"));
        assert_eq!(detail.images.len(), 1);
        assert_eq!(detail.images[0].kind, "image/png");
        assert_eq!(detail.tags[0].name, "Weapons");
        assert_eq!(detail.members[0].level, "contributor");
    }

    // A dependency nests the LISTING shape under "mod", and offsite dependencies have no
    // mod at all. Both must survive, since the deps tab keys off exactly this.
    #[test]
    fn dependencies_keep_their_nested_summary_and_offsite_form() {
        let detail = parse_mod_detail(
            serde_json::from_str(
                r#"{"id":1,"name":"M","dependencies":[
                {"id":10,"mod_id":55,"optional":false,"order":1,
                 "mod":{"id":55,"name":"Required Dep","version":"1.1"}},
                {"id":11,"mod_id":null,"optional":true,"name":"SuperBLT",
                 "url":"https://superblt.znix.xyz"}]}"#,
            )
            .expect("json"),
        )
        .expect("detail");
        assert_eq!(detail.dependencies.len(), 2);
        let hosted = &detail.dependencies[0];
        assert_eq!(hosted.mod_id, Some(55));
        assert_eq!(
            hosted.target.as_ref().expect("nested mod").name,
            "Required Dep"
        );
        let offsite = &detail.dependencies[1];
        assert!(offsite.mod_id.is_none());
        assert!(offsite.target.is_none());
        assert_eq!(offsite.url.as_deref(), Some("https://superblt.znix.xyz"));
    }

    // Collections are required on the public type, so a response omitting them entirely
    // must normalize to empty rather than failing or producing null.
    #[test]
    fn a_detail_without_collections_normalizes_to_empty() {
        let detail =
            parse_mod_detail(serde_json::from_str(r#"{"id":2,"name":"Bare"}"#).expect("json"))
                .expect("detail");
        assert!(detail.images.is_empty());
        assert!(detail.dependencies.is_empty());
        assert!(detail.tags.is_empty());
        assert!(detail.members.is_empty());
        assert!(detail.banner.is_none());
        assert!(detail.instructs_template.is_none());
    }

    #[test]
    fn instructs_template_dependencies_parse() {
        let detail = parse_mod_detail(
            serde_json::from_str(
                r#"{"id":3,"name":"T","instructs_template":{"id":9,"name":"BLT",
                "instructions":"do this","dependencies":[{"id":12,"mod_id":49744,"optional":false}]}}"#,
            )
            .expect("json"),
        )
        .expect("detail");
        let tpl = detail.instructs_template.as_ref().expect("template");
        assert_eq!(tpl.instructions, "do this");
        assert_eq!(tpl.dependencies[0].mod_id, Some(49744));
    }

    #[test]
    fn nexus_nodes_map_onto_the_shared_summary_shape() {
        let page = parse_nexus_page(
            serde_json::from_str(
                r#"{"totalCount":50,"nodes":[{"modId":900,"name":"Nexus Mod",
                "summary":"does things","pictureUrl":"https://cdn.nexus.test/a.png",
                "author":"Someone","downloads":12,"endorsements":3,
                "updatedAt":"2026-01-01"}]}"#,
            )
            .expect("json"),
            2,
            24,
        )
        .expect("page");
        let m = &page.data[0];
        assert_eq!(m.id, 900);
        assert_eq!(m.user.name, "Someone");
        assert_eq!(m.likes, 3, "endorsements stand in for likes");
        assert_eq!(m.bumped_at, "2026-01-01");
        assert_eq!(
            m.thumbnail.as_ref().expect("thumbnail").file,
            "https://cdn.nexus.test/a.png",
            "an absolute URL rides the thumbnail field, as locally recorded ones already do"
        );
        // No version in the search selection. Empty is what stops useModData reporting a
        // false update, so this is load-bearing rather than incidental.
        assert_eq!(m.version, "");
        assert!(m.has_download);
        assert!(m.download.is_none());
    }

    #[test]
    fn nexus_paging_converts_offset_totals_into_page_counts() {
        let page = parse_nexus_page(
            serde_json::from_str(r#"{"totalCount":50,"nodes":[]}"#).expect("json"),
            2,
            24,
        )
        .expect("page");
        assert_eq!(page.meta.current_page, 2);
        assert_eq!(page.meta.total, 50);
        assert_eq!(page.meta.last_page, 3, "50 over 24 rounds up to 3 pages");
    }

    #[test]
    fn a_nexus_node_missing_optional_fields_still_parses() {
        let page = parse_nexus_page(
            serde_json::from_str(r#"{"totalCount":1,"nodes":[{"modId":5,"name":"Bare"}]}"#)
                .expect("json"),
            1,
            24,
        )
        .expect("page");
        let m = &page.data[0];
        assert_eq!(m.name, "Bare");
        assert_eq!(m.user.name, "");
        assert!(m.thumbnail.is_none());
    }
}
