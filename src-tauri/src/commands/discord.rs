use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const APP_ID: &str = "1520216355792490626";
const RETRY_INTERVAL: Duration = Duration::from_secs(15);
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(30);

fn build_activity(start_ts: i64) -> activity::Activity<'static> {
    activity::Activity::new()
        .state("Managing mods")
        .assets(
            activity::Assets::new()
                .large_image("logo")
                .large_text("Modrex"),
        )
        .buttons(vec![activity::Button::new("Get Modrex", "https://modrex.net")])
        .timestamps(activity::Timestamps::new().start(start_ts))
}

pub fn start(enabled: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let start_ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let mut client: Option<DiscordIpcClient> = None;

        loop {
            if !enabled.load(Ordering::Relaxed) {
                if let Some(ref mut c) = client {
                    let _ = c.clear_activity();
                    let _ = c.close();
                    client = None;
                }
                std::thread::sleep(KEEPALIVE_INTERVAL);
                continue;
            }

            if client.is_none() {
                match DiscordIpcClient::new(APP_ID) {
                    Ok(mut c) => match c.connect() {
                        Ok(()) => {
                            client = Some(c);
                        }
                        Err(_) => {
                            std::thread::sleep(RETRY_INTERVAL);
                            continue;
                        }
                    },
                    Err(_) => {
                        std::thread::sleep(RETRY_INTERVAL);
                        continue;
                    }
                }
            }

            if let Some(ref mut c) = client {
                if c.set_activity(build_activity(start_ts)).is_err() {
                    let _ = c.close();
                    client = None;
                    std::thread::sleep(RETRY_INTERVAL);
                    continue;
                }
            }

            std::thread::sleep(KEEPALIVE_INTERVAL);
        }
    });
}

pub fn make_enabled_flag(enabled: bool) -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(enabled))
}
