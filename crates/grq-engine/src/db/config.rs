// src-tauri/src/db/config.rs

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

use crate::db::key_value::KeyValueService;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(default)]
pub struct AppConfig {
    pub db_path: Option<String>,
    pub telegram_bot_token: Option<String>,
    pub telegram_chat_id: Option<String>,
    pub telegram_enabled: bool,
    pub telegram_auto_send: bool,
    pub telegram_last_offset: Option<i64>,

    // Database Sync Telegram Bot
    pub telegram_sync_bot_token: Option<String>,
    pub telegram_sync_chat_id: Option<String>,
    pub telegram_sync_enabled: bool,

    // Proxy Settings
    pub proxy_enabled: bool,
    pub proxy_type: Option<String>, // "http", "socks5", "mtproxy"
    pub proxy_host: Option<String>,
    pub proxy_port: Option<u16>,
    pub proxy_username: Option<String>,
    pub proxy_password: Option<String>,
    pub proxy_secret: Option<String>,

    // Proxy Metadata (for reminders/display)
    pub proxy_package_name: Option<String>,
    pub proxy_expiry: Option<String>,
    pub proxy_created: Option<String>,
    pub proxy_status: Option<String>,
    pub proxy_country: Option<String>,
    pub proxy_provider: Option<String>,
    pub proxy_rotation_time: Option<String>,
    pub proxy_remaining_time: Option<String>,
    pub proxy_reminder_sent: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            db_path: None,
            telegram_bot_token: None,
            telegram_chat_id: None,
            telegram_enabled: false,
            telegram_auto_send: false,
            telegram_last_offset: None,
            telegram_sync_bot_token: None,
            telegram_sync_chat_id: None,
            telegram_sync_enabled: false,
            proxy_enabled: false,
            proxy_type: None,
            proxy_host: None,
            proxy_port: None,
            proxy_username: None,
            proxy_password: None,
            proxy_secret: None,
            proxy_package_name: None,
            proxy_expiry: None,
            proxy_created: None,
            proxy_status: None,
            proxy_country: None,
            proxy_provider: None,
            proxy_rotation_time: None,
            proxy_remaining_time: None,
            proxy_reminder_sent: false,
        }
    }
}

pub struct ConfigService;

impl ConfigService {
    /// Main config blob stored in DB key-value table.
    const CONFIG_DB_KEY: &'static str = "app_config_json";

    /// Config schema/version marker to track future config migrations.
    const CONFIG_VERSION_DB_KEY: &'static str = "config_version";
    const CURRENT_CONFIG_VERSION: i64 = 2;

    /// One-time marker for legacy cleanup.
    const LEGACY_CLEANUP_DONE_DB_KEY: &'static str = "legacy_config_cleanup_done";

    /// Lightweight bootstrap file (non-sensitive) used only to locate DB if user moved it.
    /// This avoids recursion: Database::new -> ConfigService::load_for_db_init -> read bootstrap only.
    const BOOTSTRAP_FILE_NAME: &'static str = "config.bootstrap.json";

    /// Legacy file from old versions. Read-only fallback for migration.
    const LEGACY_FILE_NAME: &'static str = "config.json";

    fn app_data_dir(app: &AppHandle) -> PathBuf {
        let dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let _ = fs::create_dir_all(&dir);
        dir
    }

    fn legacy_config_path(app: &AppHandle) -> PathBuf {
        let mut p = Self::app_data_dir(app);
        p.push(Self::LEGACY_FILE_NAME);
        p
    }

    fn bootstrap_path(app: &AppHandle) -> PathBuf {
        let mut p = Self::app_data_dir(app);
        p.push(Self::BOOTSTRAP_FILE_NAME);
        p
    }

    /// Load config for normal runtime usage.
    /// Order:
    /// 1) DB key-value (`app_config_json`) as source of truth.
    /// 2) Legacy `config.json` fallback (auto-migrate to DB).
    /// 3) Defaults.
    pub fn load(app: &AppHandle) -> AppConfig {
        Self::load_internal(app, true)
    }

    /// Special load for DB initialization path.
    /// Must not touch DB to avoid recursive initialization.
    /// Only reads bootstrap (`db_path`) and legacy fallback.
    pub fn load_for_db_init(app: &AppHandle) -> AppConfig {
        Self::load_internal(app, false)
    }

    fn load_internal(app: &AppHandle, use_db: bool) -> AppConfig {
        // 1) DB source of truth in normal mode
        if use_db {
            if let Ok(Some(db_config_str)) = KeyValueService::get_value(app, Self::CONFIG_DB_KEY) {
                if let Ok(cfg) = serde_json::from_str::<AppConfig>(&db_config_str) {
                    // Keep config version in sync and trigger one-time cleanup in background flow.
                    let _ = Self::ensure_config_version_and_cleanup(app);
                    return cfg;
                }
            }
        }

        // 2) DB init mode: bootstrap first (db_path only)
        if !use_db {
            if let Some(cfg) = Self::load_from_bootstrap(app) {
                return cfg;
            }
        }

        // 3) Legacy migration fallback
        if let Some(legacy_cfg) = Self::load_from_legacy_file(app) {
            // Auto-migrate to DB in normal mode (best effort; never wipe legacy data on failure)
            if use_db {
                println!("[ConfigService] Legacy config.json detected. Starting one-time migration to DB...");
                let _ = Self::save(app, &legacy_cfg);
                println!("[ConfigService] Legacy config migrated to DB successfully.");
                let _ = Self::mark_legacy_cleanup_pending(app);
                let _ = Self::cleanup_legacy_config_once(app);
            } else {
                // For DB init path, persist bootstrap for future starts.
                println!("[ConfigService] Legacy config.json detected during DB init. Writing bootstrap metadata...");
                let _ = Self::save_bootstrap(app, &legacy_cfg);
            }
            return legacy_cfg;
        }

        if use_db {
            // Ensure version key exists even when starting from defaults.
            let _ = Self::set_config_version(app, Self::CURRENT_CONFIG_VERSION);
        }

        AppConfig::default()
    }

    /// Save config:
    /// - DB key-value is authoritative storage.
    /// - Bootstrap file keeps only db_path to help DB startup when DB is relocated.
    /// - No full config file writes (legacy path retired).
    pub fn save(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
        let content = serde_json::to_string(config).map_err(|e| e.to_string())?;

        // 1) Save to DB (main storage)
        KeyValueService::set_value(app, Self::CONFIG_DB_KEY, &content)?;

        // 2) Save bootstrap metadata (non-sensitive)
        Self::save_bootstrap(app, config)?;

        // 3) Update config version key
        Self::set_config_version(app, Self::CURRENT_CONFIG_VERSION)?;

        // 4) Attempt one-time legacy cleanup once we know DB has the config safely.
        let _ = Self::cleanup_legacy_config_once(app);

        Ok(())
    }

    pub fn get_config_version(app: &AppHandle) -> Result<Option<i64>, String> {
        let raw = KeyValueService::get_value(app, Self::CONFIG_VERSION_DB_KEY)?;
        match raw {
            Some(v) => v
                .trim()
                .parse::<i64>()
                .map(Some)
                .map_err(|e| format!("Invalid config_version value: {}", e)),
            None => Ok(None),
        }
    }

    pub fn set_config_version(app: &AppHandle, version: i64) -> Result<(), String> {
        KeyValueService::set_value(app, Self::CONFIG_VERSION_DB_KEY, &version.to_string())
    }

    /// Ensures config_version exists and performs one-time cleanup when applicable.
    fn ensure_config_version_and_cleanup(app: &AppHandle) -> Result<(), String> {
        let current = Self::get_config_version(app)?;
        if current.is_none() {
            println!(
                "[ConfigService] config_version not found. Initializing to version {}.",
                Self::CURRENT_CONFIG_VERSION
            );
            Self::set_config_version(app, Self::CURRENT_CONFIG_VERSION)?;
        }
        let _ = Self::cleanup_legacy_config_once(app);
        Ok(())
    }

    /// Marks that cleanup should be attempted at next normal run.
    fn mark_legacy_cleanup_pending(app: &AppHandle) -> Result<(), String> {
        // "0" = pending, "1" = done
        println!("[ConfigService] Marking legacy config cleanup as pending.");
        KeyValueService::set_value(app, Self::LEGACY_CLEANUP_DONE_DB_KEY, "0")
    }

    /// One-time maintenance:
    /// Delete legacy `config.json` only after successful DB migration/write.
    /// Uses a DB flag so we only attempt once.
    pub fn cleanup_legacy_config_once(app: &AppHandle) -> Result<(), String> {
        let done_flag =
            KeyValueService::get_value(app, Self::LEGACY_CLEANUP_DONE_DB_KEY)?.unwrap_or_default();

        if done_flag == "1" {
            return Ok(());
        }

        // Safety gate: only cleanup if config is definitely present in DB.
        let has_db_config = KeyValueService::get_value(app, Self::CONFIG_DB_KEY)?.is_some();
        if !has_db_config {
            println!(
                "[ConfigService] Legacy cleanup skipped: DB config key '{}' not found yet.",
                Self::CONFIG_DB_KEY
            );
            return Ok(());
        }

        let legacy_path = Self::legacy_config_path(app);
        if legacy_path.exists() {
            println!(
                "[ConfigService] Running one-time cleanup: deleting legacy file at {:?}.",
                legacy_path
            );
            fs::remove_file(&legacy_path)
                .map_err(|e| format!("Failed to remove legacy config.json: {}", e))?;
            println!("[ConfigService] One-time legacy cleanup completed.");
        } else {
            println!(
                "[ConfigService] One-time cleanup: legacy config.json already absent. Marking as done."
            );
        }

        KeyValueService::set_value(app, Self::LEGACY_CLEANUP_DONE_DB_KEY, "1")
    }

    fn load_from_legacy_file(app: &AppHandle) -> Option<AppConfig> {
        let path = Self::legacy_config_path(app);
        if !path.exists() {
            return None;
        }

        let content = fs::read_to_string(path).ok()?;
        serde_json::from_str::<AppConfig>(&content).ok()
    }

    fn load_from_bootstrap(app: &AppHandle) -> Option<AppConfig> {
        #[derive(Serialize, Deserialize, Debug, Clone, Default)]
        #[serde(default)]
        struct BootstrapConfig {
            db_path: Option<String>,
        }

        let path = Self::bootstrap_path(app);
        if !path.exists() {
            return None;
        }

        let content = fs::read_to_string(path).ok()?;
        let bootstrap = serde_json::from_str::<BootstrapConfig>(&content).ok()?;

        // Return minimal config needed for DB initialization.
        Some(AppConfig {
            db_path: bootstrap.db_path,
            ..AppConfig::default()
        })
    }

    fn save_bootstrap(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
        #[derive(Serialize, Deserialize, Debug, Clone, Default)]
        struct BootstrapConfig {
            db_path: Option<String>,
        }

        let path = Self::bootstrap_path(app);
        let payload = BootstrapConfig {
            db_path: config.db_path.clone(),
        };

        let content = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
        fs::write(path, content).map_err(|e| e.to_string())
    }
}
