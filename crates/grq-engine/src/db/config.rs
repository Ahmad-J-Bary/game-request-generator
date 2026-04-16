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
    const CONFIG_DB_KEY: &'static str = "app_config_json";

    fn get_config_path(app: &AppHandle) -> PathBuf {
        let mut path = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        // Ensure directory exists
        let _ = fs::create_dir_all(&path);
        path.push("config.json");
        path
    }

    pub fn load(app: &AppHandle) -> AppConfig {
        Self::load_internal(app, true)
    }

    /// Special load for database initialization to avoid recursion
    pub fn load_for_db_init(app: &AppHandle) -> AppConfig {
        Self::load_internal(app, false)
    }

    fn load_internal(app: &AppHandle, use_db: bool) -> AppConfig {
        // 1. Try to load from Database first if allowed
        if use_db {
            if let Ok(Some(db_config_str)) = KeyValueService::get_value(app, Self::CONFIG_DB_KEY) {
                if let Ok(config) = serde_json::from_str::<AppConfig>(&db_config_str) {
                    return config;
                }
            }
        }

        // 2. Fallback to file (Migration/First run after update or DB init)
        let config_path = Self::get_config_path(app);
        if config_path.exists() {
            let content = fs::read_to_string(&config_path).unwrap_or_default();
            if let Ok(config) = serde_json::from_str::<AppConfig>(&content) {
                // Only save to DB if we are in a normal load (not DB init)
                if use_db {
                    let _ = Self::save(app, &config);
                }
                return config;
            }
        }

        AppConfig::default()
    }

    pub fn save(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
        let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        
        // 1. Save to Database (Main storage)
        KeyValueService::set_value(app, Self::CONFIG_DB_KEY, &content)?;

        // 2. Also save to file (For redundancy/fallback)
        let config_path = Self::get_config_path(app);
        fs::write(config_path, content).map_err(|e| e.to_string())?;
        
        Ok(())
    }
}
