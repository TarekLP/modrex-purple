use std::path::PathBuf;
use std::process::Command;

use scraper::{Html, Selector};
use tauri::{AppHandle, Manager};

const MAX_AGE_SECS: u64 = 3600;

/// A normal browser UA, sent purely so the site's own analytics see a
/// plausible visitor — curl's TLS/HTTP2 fingerprint is what actually gets
/// through Cloudflare here, not this string (see `curl_fetch`).
const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub title: String,
    pub url: String,
    pub date: String,
    pub excerpt: String,
    pub image: Option<String>,
    pub categories: Vec<String>,
}

fn category_slug(game_id: &str) -> &'static str {
    match game_id {
        "pd2" => "payday2",
        "pdth" => "theheist",
        _ => "payday3",
    }
}

fn category_url(game_id: &str) -> String {
    format!(
        "https://www.paydaythegame.com/news/category/{}/",
        category_slug(game_id)
    )
}

fn cache_path(app: &AppHandle, game_id: &str) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
        .join(format!("news-{}.json", category_slug(game_id)))
}

/// Picks the 700w variant from a srcset when present (matches the card's
/// thumbnail rendering size), falling back to the plain `src`.
fn pick_image(img: &scraper::ElementRef) -> Option<String> {
    if let Some(srcset) = img.value().attr("srcset") {
        for part in srcset.split(',') {
            let part = part.trim();
            if part.ends_with("700w") {
                if let Some(url) = part.split_whitespace().next() {
                    return Some(url.to_string());
                }
            }
        }
    }
    img.value().attr("src").map(|s| s.to_string())
}

fn text_of(el: &scraper::ElementRef) -> String {
    el.text().collect::<String>().trim().to_string()
}

/// Pure parser over a `paydaythegame.com` news category page. Kept free of
/// any I/O so it's directly unit-testable against a saved HTML fixture.
pub fn parse_news_html(html: &str) -> Vec<NewsItem> {
    let document = Html::parse_document(html);
    let article_sel = Selector::parse("article.post-linkxd").unwrap();
    let title_sel = Selector::parse("h3 a").unwrap();
    let date_sel = Selector::parse(".date").unwrap();
    let excerpt_sel = Selector::parse("p.blogexcerptx").unwrap();
    let image_sel = Selector::parse(".post-img img").unwrap();
    let category_sel = Selector::parse(".categories a").unwrap();

    document
        .select(&article_sel)
        .filter_map(|article| {
            let title_link = article.select(&title_sel).next()?;
            let title = text_of(&title_link);
            let url = article
                .value()
                .attr("data-linkxd")
                .map(|s| s.to_string())
                .or_else(|| title_link.value().attr("href").map(|s| s.to_string()))?;
            let date = article
                .select(&date_sel)
                .next()
                .map(|el| text_of(&el))
                .unwrap_or_default();
            let excerpt = article
                .select(&excerpt_sel)
                .next()
                .map(|el| text_of(&el))
                .unwrap_or_default();
            let image = article
                .select(&image_sel)
                .next()
                .and_then(|el| pick_image(&el));
            let categories = article
                .select(&category_sel)
                .map(|el| text_of(&el))
                .filter(|s| !s.is_empty())
                .collect();

            Some(NewsItem {
                title,
                url,
                date,
                excerpt,
                image,
                categories,
            })
        })
        .collect()
}

fn read_cache(path: &std::path::Path) -> Option<Vec<NewsItem>> {
    let bytes = std::fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_cache(path: &std::path::Path, items: &[NewsItem]) -> Result<(), String> {
    let bytes = serde_json::to_vec(items).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn cache_age_secs(path: &std::path::Path) -> Option<u64> {
    std::fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .elapsed()
        .ok()
        .map(|e| e.as_secs())
}

/// paydaythegame.com sits behind Cloudflare bot management that 403s every
/// library HTTP client tried (verified live: reqwest and .NET HttpClient
/// both blocked regardless of UA/headers — a TLS/HTTP2 fingerprint check).
/// A renderer-side `fetch()` doesn't work either: the site sends no
/// `Access-Control-Allow-Origin` header, so the browser's CORS policy blocks
/// the response before JS ever sees it. curl.exe is the one client that
/// passed in testing, so we shell out to it — matching the existing pattern
/// of shelling out to system binaries elsewhere in this codebase (steam.rs's
/// `reg query`, xbox.rs's `powershell`).
fn curl_fetch(url: &str) -> Result<String, String> {
    let mut cmd = Command::new("curl");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = cmd
        .args(["-sL", "--max-time", "15", "-A", BROWSER_UA, url])
        .output()
        .map_err(|e| format!("curl unavailable: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "curl exited with status {:?}",
            output.status.code()
        ));
    }
    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}

async fn download_news(game_id: &str) -> Result<Vec<NewsItem>, String> {
    let url = category_url(game_id);
    let html = tokio::task::spawn_blocking(move || curl_fetch(&url))
        .await
        .map_err(|e| e.to_string())??;
    Ok(parse_news_html(&html))
}

#[tauri::command]
pub async fn fetch_news(app: AppHandle, game_id: Option<String>) -> Result<Vec<NewsItem>, String> {
    let game_id = game_id.unwrap_or_else(|| "pd3".to_string());
    let path = cache_path(&app, &game_id);
    if cache_age_secs(&path).is_some_and(|age| age < MAX_AGE_SECS) {
        if let Some(items) = read_cache(&path) {
            return Ok(items);
        }
    }
    let items = download_news(&game_id).await?;
    let _ = write_cache(&path, &items);
    Ok(items)
}

#[tauri::command]
pub async fn refresh_news(
    app: AppHandle,
    game_id: Option<String>,
) -> Result<Vec<NewsItem>, String> {
    let game_id = game_id.unwrap_or_else(|| "pd3".to_string());
    let items = download_news(&game_id).await?;
    let _ = write_cache(&cache_path(&app, &game_id), &items);
    Ok(items)
}

#[cfg(test)]
#[path = "news_tests.rs"]
mod tests;
