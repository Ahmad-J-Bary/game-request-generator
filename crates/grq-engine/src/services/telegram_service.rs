use serde_json::json;
use crate::db::config::{AppConfig, ConfigService};
use tauri::AppHandle;

pub struct TelegramService;

impl TelegramService {
    pub async fn send_message(app: &AppHandle, message: &str) -> Result<(), String> {
        let config = ConfigService::load(app);
        
        if !config.telegram_enabled {
            return Err("Telegram integration is disabled".to_string());
        }

        let token = config.telegram_bot_token.ok_or("Telegram Bot Token not configured")?;
        let chat_id = config.telegram_chat_id.ok_or("Telegram Chat ID not configured")?;

        let url = format!("https://api.telegram.org/bot{}/sendMessage", token);
        let client = reqwest::Client::new();
        
        let response = client.post(url)
            .json(&json!({
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "HTML"
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Telegram API error: {}", error_text));
        }

        Ok(())
    }

    pub async fn test_connection(bot_token: &str, chat_id: &str) -> Result<(), String> {
        let url = format!("https://api.telegram.org/bot{}/sendMessage", bot_token);
        let client = reqwest::Client::new();
        
        let response = client.post(url)
            .json(&json!({
                "chat_id": chat_id,
                "text": "✅ <b>Integration Test</b>\nConnection successful! This group is now linked to your Game Request Generator.",
                "parse_mode": "HTML"
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Verification failed: {}", error_text));
        }

        Ok(())
    }
}
