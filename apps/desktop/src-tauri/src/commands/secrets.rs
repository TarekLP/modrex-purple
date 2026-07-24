// OS credential store access: Windows Credential Manager (windows-native-keyring-store)
// and the Linux Secret Service over D-Bus (zbus-secret-service-keyring-store) — the two
// backends keyring's default features already select, matched to the two platforms this
// app ships. Every entry lives under one service namespace so callers only pick a key
// name; nothing here is Nexus-specific, so a future OAuth source reuses it as-is.

use keyring::Entry;
use std::sync::OnceLock;

const SERVICE: &str = "modrex";
const PROBE_KEY: &str = "__probe__";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecretStoreStatus {
    Available,
    Unavailable,
}

static STORE_STATUS: OnceLock<SecretStoreStatus> = OnceLock::new();

// Entry::new can succeed even when the Linux Secret Service has no running provider —
// zbus only fails on the first real D-Bus call — so availability is only known by
// round-tripping a throwaway entry, not by constructing one.
fn probe_store() -> SecretStoreStatus {
    let entry = match Entry::new(SERVICE, PROBE_KEY) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("secrets: credential store unavailable: {e}");
            return SecretStoreStatus::Unavailable;
        }
    };
    if let Err(e) = entry.set_password("probe") {
        log::warn!("secrets: credential store unavailable: {e}");
        return SecretStoreStatus::Unavailable;
    }
    // Cleanup failure doesn't change the availability verdict — the store already
    // proved writable — but leaves a harmless stray probe entry, worth a log line.
    if let Err(e) = entry.delete_credential() {
        log::warn!("secrets: probe cleanup failed (non-fatal): {e}");
    }
    SecretStoreStatus::Available
}

fn probe_store_cached() -> SecretStoreStatus {
    *STORE_STATUS.get_or_init(probe_store)
}

// Cached for the process lifetime: a daemon installed mid-session is picked up on the
// next launch, not retroactively, matching how every other one-shot detection in this
// app behaves (e.g. launcher/loader presence checks).
pub async fn store_status() -> SecretStoreStatus {
    tauri::async_runtime::spawn_blocking(probe_store_cached)
        .await
        .unwrap_or(SecretStoreStatus::Unavailable)
}

pub async fn store_secret(key: &'static str, value: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        Entry::new(SERVICE, key)
            .and_then(|e| e.set_password(&value))
            .map_err(|e| format!("secrets: store {key}: {e}"))
    })
    .await
    .map_err(|e| format!("secrets: store {key}: task join error: {e}"))?
}

pub async fn get_secret(key: &'static str) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let entry = Entry::new(SERVICE, key).map_err(|e| format!("secrets: open {key}: {e}"))?;
        match entry.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("secrets: read {key}: {e}")),
        }
    })
    .await
    .map_err(|e| format!("secrets: read {key}: task join error: {e}"))?
}

pub async fn delete_secret(key: &'static str) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let entry = Entry::new(SERVICE, key).map_err(|e| format!("secrets: open {key}: {e}"))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("secrets: delete {key}: {e}")),
        }
    })
    .await
    .map_err(|e| format!("secrets: delete {key}: task join error: {e}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn secret_store_available() -> bool {
    store_status().await == SecretStoreStatus::Available
}
