//! The one table a mod source registers in: which games it serves and the id it
//! knows each game by. Sources differ per game (modworkshop covers all five, Nexus
//! only the two with a domain), and each names games in its own way - modworkshop by
//! numeric game id, Nexus by domain slug - so the mapping is the data both sides need
//! and neither should restate. nexus_domain and its reverse derive from this.

pub struct SourceGame {
    pub game_id: &'static str,
    /// What this source calls the game: modworkshop's numeric game id, Nexus's
    /// domain slug. Stored as a string because the two are not the same kind of id.
    pub native_id: &'static str,
}

pub struct SourceSpec {
    pub id: &'static str,
    pub games: &'static [SourceGame],
}

pub static SOURCE_REGISTRY: &[SourceSpec] = &[
    SourceSpec {
        id: "modworkshop",
        games: &[
            SourceGame {
                game_id: "pd3",
                native_id: "853",
            },
            SourceGame {
                game_id: "pd2",
                native_id: "1",
            },
            SourceGame {
                game_id: "pdth",
                native_id: "2",
            },
            SourceGame {
                game_id: "cb",
                native_id: "857",
            },
            SourceGame {
                game_id: "raid",
                native_id: "543",
            },
        ],
    },
    SourceSpec {
        id: "nexus",
        games: &[
            SourceGame {
                game_id: "pd3",
                native_id: "payday3",
            },
            SourceGame {
                game_id: "cb",
                native_id: "crimebossrockaycity",
            },
        ],
    },
];

pub fn source_spec(source_id: &str) -> Option<&'static SourceSpec> {
    SOURCE_REGISTRY.iter().find(|s| s.id == source_id)
}

/// What the source calls this game, or None when the source does not serve it.
pub fn native_id(source_id: &str, game_id: &str) -> Option<&'static str> {
    source_spec(source_id)?
        .games
        .iter()
        .find(|g| g.game_id == game_id)
        .map(|g| g.native_id)
}

/// The reverse, for callbacks where a source hands us its own id (an nxm:// link
/// carries the Nexus domain) and the internal game id is what routes the work.
pub fn game_id_for_native(source_id: &str, native_id: &str) -> Option<&'static str> {
    source_spec(source_id)?
        .games
        .iter()
        .find(|g| g.native_id == native_id)
        .map(|g| g.game_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::games::GAME_REGISTRY;

    #[test]
    fn source_ids_are_unique() {
        let mut ids: Vec<&str> = SOURCE_REGISTRY.iter().map(|s| s.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), SOURCE_REGISTRY.len());
    }

    #[test]
    fn every_source_serves_only_registered_games() {
        for source in SOURCE_REGISTRY {
            assert!(
                !source.games.is_empty(),
                "source {} serves no game",
                source.id
            );
            for game in source.games {
                assert!(
                    GAME_REGISTRY.iter().any(|s| s.id == game.game_id),
                    "source {} names game '{}', which is not in GAME_REGISTRY",
                    source.id,
                    game.game_id
                );
            }
        }
    }

    #[test]
    fn a_source_names_each_game_once() {
        for source in SOURCE_REGISTRY {
            let mut ids: Vec<&str> = source.games.iter().map(|g| g.game_id).collect();
            ids.sort_unstable();
            ids.dedup();
            assert_eq!(
                ids.len(),
                source.games.len(),
                "source {} lists a game twice, so native_id would never reach the second",
                source.id
            );
        }
    }

    #[test]
    fn native_ids_are_unique_within_a_source() {
        for source in SOURCE_REGISTRY {
            let mut ids: Vec<&str> = source.games.iter().map(|g| g.native_id).collect();
            ids.sort_unstable();
            ids.dedup();
            assert_eq!(
                ids.len(),
                source.games.len(),
                "source {} reuses a native id, so game_id_for_native is ambiguous",
                source.id
            );
        }
    }

    #[test]
    fn native_id_round_trips_for_every_registered_pair() {
        for source in SOURCE_REGISTRY {
            for game in source.games {
                let native = native_id(source.id, game.game_id).expect("native id");
                assert_eq!(native, game.native_id);
                assert_eq!(
                    game_id_for_native(source.id, native),
                    Some(game.game_id),
                    "{}:{} does not round trip",
                    source.id,
                    game.game_id
                );
            }
        }
    }

    #[test]
    fn unknown_source_or_game_resolves_to_nothing() {
        assert_eq!(native_id("no-such-source", "pd3"), None);
        assert_eq!(native_id("nexus", "no-such-game"), None);
        // Nexus has no PD2/PDTH/RAID presence, so those must not resolve.
        assert_eq!(native_id("nexus", "pd2"), None);
        assert_eq!(native_id("nexus", "pdth"), None);
        assert_eq!(native_id("nexus", "raid"), None);
    }
}
