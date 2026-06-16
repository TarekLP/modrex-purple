//! Registry of "host mods" — mods whose add-on content packs install *inside another mod's*
//! folder rather than at a scan-target root. The canonical case is Menu Backgrounds (modworkshop
//! 17160): a background set is a folder of images that belongs in `mods/Menu Backgrounds/Assets/`,
//! not in `mods/` or `assets/mod_overrides/`. Such packs carry no marker and no asset-DB structure,
//! so the normal target classification can't route them; we recognize them here by content
//! signature instead. The set of host mods is small and stable (PAYDAY 2 is long frozen), so a
//! hardcoded table is the pragmatic fit. The host's on-disk folder is resolved from installed
//! state by `host_mod_id` — never assumed from the name.

/// A host mod that accepts nested content packs, plus how to recognize a pack for it.
pub struct HostTarget {
    /// modworkshop id of the host mod; its on-disk folder is resolved from installed state by this.
    pub host_mod_id: i64,
    /// Human-readable host name, for user-facing messages.
    pub host_name: &'static str,
    /// Where inside the host mod's folder packs are placed, e.g. `["Assets"]`.
    pub subpath: &'static [&'static str],
    /// Filename stems (no extension, lowercase) that identify a pack for this host.
    pub signature: &'static [&'static str],
    /// How many distinct signature files a directory must contain to qualify as a pack.
    pub min_matches: usize,
}

pub static HOST_TARGETS: &[HostTarget] = &[HostTarget {
    host_mod_id: 17160,
    host_name: "Menu Backgrounds",
    subpath: &["Assets"],
    // PAYDAY 2 menu-screen background names the Menu Backgrounds mod looks for.
    signature: &[
        "standard",
        "crimenet",
        "briefing",
        "loading",
        "loadingscreen",
        "endscreen",
        "victoryscreen",
        "lostscreen",
        "loot",
        "blackmarket",
        "jobpaymentscreen",
        "result",
    ],
    min_matches: 3,
}];

/// Image/movie extensions a background-set file may use.
const PACK_IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "dds", "texture", "bik", "movie"];

/// A recognized host-mod content pack: the host it targets and the pack directories found inside
/// the archive (each becomes one set installed under the host's subpath).
pub struct HostPackMatch {
    pub host: &'static HostTarget,
    pub dirs: Vec<String>,
}

/// The registered host with this modworkshop id, if any.
pub fn host_target_by_id(id: i64) -> Option<&'static HostTarget> {
    HOST_TARGETS.iter().find(|h| h.host_mod_id == id)
}

/// Parses an `InstalledMod.location` of the form `host:<id>:<subpath>` into `(host_id, subpath)`.
pub fn parse_host_location(loc: &str) -> Option<(i64, String)> {
    let rest = loc.strip_prefix("host:")?;
    let (id, subpath) = rest.split_once(':')?;
    Some((id.parse().ok()?, subpath.to_string()))
}

/// Recognizes whether an archive (given its `/`-separated entry names) is a content pack for a
/// known host mod. Returns the matching host and its pack directories, or `None`.
pub fn detect_host_pack(names: &[String]) -> Option<HostPackMatch> {
    // A real mod carries a loader marker; never treat those as host packs.
    if names.iter().any(|n| {
        n.ends_with("/mod.txt") || n.ends_with("/main.xml") || n == "mod.txt" || n == "main.xml"
    }) {
        return None;
    }
    for host in HOST_TARGETS {
        let dirs = signature_dirs(names, host);
        if !dirs.is_empty() {
            return Some(HostPackMatch { host, dirs });
        }
    }
    None
}

/// Directories whose immediate child files include at least `host.min_matches` distinct signature
/// stems (with a pack-image extension). Each such directory is one content set.
fn signature_dirs(names: &[String], host: &HostTarget) -> Vec<String> {
    use std::collections::{BTreeMap, BTreeSet};
    let mut hits: BTreeMap<String, BTreeSet<&'static str>> = BTreeMap::new();
    for name in names {
        if name.ends_with('/') {
            continue;
        }
        let (dir, file) = match name.rfind('/') {
            Some(i) => (&name[..i], &name[i + 1..]),
            None => continue, // a bare top-level file has no set folder to install into
        };
        let Some(dot) = file.rfind('.') else { continue };
        let stem = file[..dot].to_ascii_lowercase();
        let ext = file[dot + 1..].to_ascii_lowercase();
        if !PACK_IMAGE_EXTS.contains(&ext.as_str()) {
            continue;
        }
        if let Some(&sig) = host.signature.iter().find(|&&s| s == stem) {
            hits.entry(dir.to_string()).or_default().insert(sig);
        }
    }
    hits.into_iter()
        .filter(|(_, set)| set.len() >= host.min_matches)
        .map(|(dir, _)| dir)
        .collect()
}
