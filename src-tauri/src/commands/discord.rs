use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::{self, RecvTimeoutError, Sender},
    Arc,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const APP_ID: &str = "1520216355792490626";
const RETRY_INTERVAL: Duration = Duration::from_secs(15);
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(30);

fn build_activity<'a>(game: &'a str, start_ts: i64) -> activity::Activity<'a> {
    let activity = activity::Activity::new()
        .details(if game.is_empty() {
            "Choosing a game"
        } else {
            game
        })
        .assets(
            activity::Assets::new()
                .large_image("logo")
                .large_text("Modrex"),
        )
        .buttons(vec![activity::Button::new(
            "Get Modrex",
            "https://modrex.net",
        )])
        .timestamps(activity::Timestamps::new().start(start_ts));
    if game.is_empty() {
        activity
    } else {
        activity.state("Managing mods")
    }
}

pub fn start(enabled: Arc<AtomicBool>, rx: mpsc::Receiver<String>) {
    std::thread::spawn(move || {
        let start_ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let mut current_game = String::new();
        let mut client: Option<DiscordIpcClient> = None;

        loop {
            if enabled.load(Ordering::Relaxed) {
                if client.is_none() {
                    let mut c = DiscordIpcClient::new(APP_ID);
                    if c.connect().is_ok() {
                        client = Some(c);
                    }
                }
                if let Some(ref mut c) = client {
                    if c.set_activity(build_activity(&current_game, start_ts))
                        .is_err()
                    {
                        let _ = c.close();
                        client = None;
                    }
                }
            } else if let Some(ref mut c) = client {
                let _ = c.clear_activity();
                let _ = c.close();
                client = None;
            }

            let timeout = if client.is_none() {
                RETRY_INTERVAL
            } else {
                KEEPALIVE_INTERVAL
            };
            match rx.recv_timeout(timeout) {
                Ok(new_state) => current_game = new_state,
                Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => {}
            }
        }
    });
}

pub struct DiscordState {
    pub enabled: Arc<AtomicBool>,
    pub game_tx: Sender<String>,
}

impl DiscordState {
    pub fn new(enabled: bool) -> (Self, mpsc::Receiver<String>) {
        let (tx, rx) = mpsc::channel();
        (
            DiscordState {
                enabled: Arc::new(AtomicBool::new(enabled)),
                game_tx: tx,
            },
            rx,
        )
    }
}

#[tauri::command]
pub fn set_discord_presence_enabled(
    app: AppHandle,
    state: tauri::State<DiscordState>,
    enabled: bool,
) {
    state.enabled.store(enabled, Ordering::Relaxed);
    crate::commands::settings::update_settings(&app, |s| {
        s.discord_rich_presence_enabled = Some(enabled);
    });
}

#[tauri::command]
pub fn update_discord_presence(state: tauri::State<DiscordState>, game: String) {
    let _ = state.game_tx.send(game);
}
