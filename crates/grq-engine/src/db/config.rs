// src-tauri/src/db/config.rs

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppConfig {
    pub db_path: Option<String>,
    pub telegram_bot_token: Option<String>,
    pub telegram_chat_id: Option<String>,
    pub telegram_enabled: bool,
    pub telegram_auto_send: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self { 
            db_path: None,
            telegram_bot_token: None,
            telegram_chat_id: None,
            telegram_enabled: false,
            telegram_auto_send: false,
        }
    }
}

pub struct ConfigService;

impl ConfigService {
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
        let config_path = Self::get_config_path(app);
        if config_path.exists() {
            let content = fs::read_to_string(config_path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AppConfig::default()
        }
    }

    pub fn save(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
        let config_path = Self::get_config_path(app);
        let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        fs::write(config_path, content).map_err(|e| e.to_string())?;
        Ok(())
    }
}
