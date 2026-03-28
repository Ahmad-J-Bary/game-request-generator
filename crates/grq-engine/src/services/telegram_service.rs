use serde_json::json;
use crate::db::config::{ConfigService, AppConfig};
use tauri::AppHandle;

pub struct TelegramService;

impl TelegramService {
    fn build_client(config: &AppConfig) -> reqwest::Client {
        let mut builder = reqwest::Client::builder();

        if config.proxy_enabled {
            if let (Some(proxy_type), Some(host), Some(port)) = (&config.proxy_type, &config.proxy_host, config.proxy_port) {
                let proxy_scheme = if proxy_type == "socks5" { "socks5h" } else { "http" };
                let url = format!("{}://{}:{}", proxy_scheme, host, port);
                
                if let Ok(mut proxy) = reqwest::Proxy::all(&url) {
                    if let (Some(user), Some(pass)) = (&config.proxy_username, &config.proxy_password) {
                        proxy = proxy.basic_auth(user.as_str(), pass.as_str());
                    }
                    builder = builder.proxy(proxy);
                }
            }
        }

        builder.build().unwrap_or_else(|_| reqwest::Client::new())
    }

    pub async fn send_message(app: &AppHandle, message: &str) -> Result<(), String> {
        let config = ConfigService::load(app);
        
        if !config.telegram_enabled {
            return Err("Telegram integration is disabled".to_string());
        }

        let token = config.telegram_bot_token.clone().ok_or("Telegram Bot Token not configured")?;
        let chat_id = config.telegram_chat_id.clone().ok_or("Telegram Chat ID not configured")?;

        let url = format!("https://api.telegram.org/bot{}/sendMessage", token);
        let client = Self::build_client(&config);
        
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

    pub async fn test_connection(app: &AppHandle, bot_token: &str, chat_id: &str) -> Result<(), String> {
        let config = ConfigService::load(app);
        let url = format!("https://api.telegram.org/bot{}/sendMessage", bot_token);
        let client = Self::build_client(&config);
        
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
