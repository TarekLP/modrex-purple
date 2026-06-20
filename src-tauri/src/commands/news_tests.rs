use super::*;

const FIXTURE: &str = include_str!("fixtures/news_payday3.html");

#[test]
fn parses_articles_from_category_page() {
    let items = parse_news_html(FIXTURE);
    assert_eq!(items.len(), 2);

    let first = &items[0];
    assert_eq!(first.title, "PAYDAY 3: Update 3.5.1 Changelog");
    assert_eq!(
        first.url,
        "https://www.paydaythegame.com/news/payday3/2026/05/update-3-5-1/"
    );
    assert_eq!(first.date, "May 22, 2026");
    assert!(first
        .excerpt
        .starts_with("We are now rolling out a new Hotfix"));
    assert_eq!(
        first.image,
        Some(
            "https://www.paydaythegame.com/ovk-media/2024/01/ce5d314722538299cf263548b8e3b8165ec9144e-700x394.png"
                .to_string()
        )
    );
    assert_eq!(first.categories, vec!["PAYDAY 3".to_string()]);
}

#[test]
fn category_slug_maps_known_games() {
    assert_eq!(category_slug("pd2"), "payday2");
    assert_eq!(category_slug("pdth"), "theheist");
    assert_eq!(category_slug("pd3"), "payday3");
    assert_eq!(category_slug("unknown"), "payday3");
}
