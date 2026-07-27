use crate::db::config::{AppConfig, ConfigService};
use serde_json::json;
use tauri::{AppHandle, Manager};

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TelegramImportPreview {
    pub update_id: i64,
    pub message_id: i64,
    pub file_id: String,
    pub filename: String,
    pub sender_name: String,
    pub date: String,
    pub caption: Option<String>,
}

pub struct TelegramService;

impl TelegramService {
    fn build_client(_config: &AppConfig) -> reqwest::Client {
        reqwest::Client::builder()
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    }

    pub async fn send_message(app: &AppHandle, message: &str) -> Result<(), String> {
        let config = ConfigService::load(app);

        if !config.telegram_enabled {
            return Err("Telegram integration is disabled".to_string());
        }

        let token = config
            .telegram_bot_token
            .clone()
            .ok_or("Telegram Bot Token not configured")?;
        let chat_id = config
            .telegram_chat_id
            .clone()
            .ok_or("Telegram Chat ID not configured")?;

        let url = format!("https://api.telegram.org/bot{}/sendMessage", token);
        let client = Self::build_client(&config);

        let response = client
            .post(url)
            .json(&json!({
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "HTML"
            }))
            .send()
            .await
            .map_err(|e| format!("{:?}", e))?;

        if !response.status().is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Telegram API error: {}", error_text));
        }

        Ok(())
    }

    pub async fn send_document(
        app: &AppHandle,
        bytes: Vec<u8>,
        filename: String,
        caption: Option<String>,
    ) -> Result<(), String> {
        let config = ConfigService::load(app);

        if !config.telegram_enabled {
            return Err("Telegram integration is disabled".to_string());
        }

        let token = config
            .telegram_bot_token
            .clone()
            .ok_or("Telegram Bot Token not configured")?;
        let chat_id = config
            .telegram_chat_id
            .clone()
            .ok_or("Telegram Chat ID not configured")?;

        let url = format!("https://api.telegram.org/bot{}/sendDocument", token);
        let client = Self::build_client(&config);

        use reqwest::multipart;
        let mut form = multipart::Form::new().text("chat_id", chat_id).part(
            "document",
            multipart::Part::bytes(bytes).file_name(filename),
        );

        if let Some(cap) = caption {
            form = form.text("caption", cap);
            form = form.text("parse_mode", "HTML");
        }

        let response = client
            .post(url)
            .multipart(form)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Telegram API error: {}", error_text));
        }

        Ok(())
    }

    pub async fn test_connection(
        app: &AppHandle,
        bot_token: &str,
        chat_id: &str,
    ) -> Result<(), String> {
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
            .map_err(|e| format!("{:?}", e))?;

        if !response.status().is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Verification failed: {}", error_text));
        }

        Ok(())
    }

    pub async fn get_updates(
        app: &AppHandle,
        offset: Option<i64>,
    ) -> Result<Vec<TelegramImportPreview>, String> {
        let config = ConfigService::load(app);

        if !config.telegram_enabled {
            return Err("Telegram integration is disabled".to_string());
        }

        let token = config
            .telegram_bot_token
            .clone()
            .ok_or("Telegram Bot Token not configured")?;
        let chat_id = config
            .telegram_chat_id
            .clone()
            .ok_or("Telegram Chat ID not configured")?;

        let url = format!("https://api.telegram.org/bot{}/getUpdates", token);
        let client = Self::build_client(&config);

        let mut query = vec![("timeout", "0".to_string())];
        if let Some(off) = offset {
            query.push(("offset", (off + 1).to_string()));
        }

        let response = client
            .get(url)
            .query(&query)
            .send()
            .await
            .map_err(|e| format!("{:?}", e))?;

        if !response.status().is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Telegram API error: {}", error_text));
        }

        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let mut previews = Vec::new();

        if let Some(updates) = data["result"].as_array() {
            for update in updates {
                let update_id = update["update_id"].as_i64().unwrap_or(0);
                
                // Allow both regular messages and channel posts (important if bot is posting to a channel)
                let message = if !update["message"].is_null() {
                    &update["message"]
                } else if !update["channel_post"].is_null() {
                    &update["channel_post"]
                } else {
                    continue;
                };

                // Only process messages from the configured chat
                let msg_chat_id = message["chat"]["id"].as_i64().map(|id| id.to_string());
                if msg_chat_id != Some(chat_id.clone()) {
                    continue;
                }

                if let Some(doc) = message["document"].as_object() {
                    let filename = doc["file_name"].as_str().unwrap_or("unnamed.txt");
                    if filename.to_lowercase().ends_with(".txt") {
                        let file_id = doc["file_id"].as_str().unwrap_or("").to_string();
                        let sender_name = message["from"]["first_name"]
                            .as_str()
                            .unwrap_or("Unknown")
                            .to_string();
                        let unix_time = message["date"].as_i64().unwrap_or(0);

                        // If the bot hasn't read anything yet (offset is None), only fetch messages from the last 16 hours
                        // to prevent downloading too many old messages. Otherwise, fetch all unread updates.
                        if offset.is_none() {
                            let now_unix = chrono::Utc::now().timestamp();
                            if now_unix - unix_time > 16 * 60 * 60 {
                                continue; // Skip messages older than 16 hours
                            }
                        }

                        use chrono::TimeZone;
                        let date = chrono::Local
                            .timestamp_opt(unix_time, 0)
                            .single()
                            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                            .unwrap_or_default();

                        previews.push(TelegramImportPreview {
                            update_id,
                            message_id: message["message_id"].as_i64().unwrap_or(0),
                            file_id,
                            filename: filename.to_string(),
                            sender_name,
                            date,
                            caption: message["caption"].as_str().map(|s| s.to_string()),
                        });
                    }
                }
            }
        }

        Ok(previews)
    }

    pub async fn download_file(app: &AppHandle, file_id: &str) -> Result<String, String> {
        let config = ConfigService::load(app);
        let token = config
            .telegram_bot_token
            .clone()
            .ok_or("Telegram Bot Token not configured")?;

        let get_file_url = format!(
            "https://api.telegram.org/bot{}/getFile?file_id={}",
            token, file_id
        );
        let client = Self::build_client(&config);

        let response = client
            .get(get_file_url)
            .send()
            .await
            .map_err(|e| format!("{:?}", e))?;
        if !response.status().is_success() {
            return Err("Failed to get file path from Telegram".to_string());
        }

        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let file_path = data["result"]["file_path"]
            .as_str()
            .ok_or("File path not found in response")?;

        let download_url = format!("https://api.telegram.org/file/bot{}/{}", token, file_path);
        let content_res = client
            .get(download_url)
            .send()
            .await
            .map_err(|e| format!("{:?}", e))?;

        if !content_res.status().is_success() {
            return Err("Failed to download file content".to_string());
        }

        content_res.text().await.map_err(|e| e.to_string())
    }

    pub async fn backup_db(app: &AppHandle) -> Result<(), String> {
        let config = ConfigService::load(app);
        
        // Removed check for telegram_sync_enabled here to allow manual backup from the UI button.
        let token = config
            .telegram_sync_bot_token
            .clone()
            .ok_or("Sync Bot Token not configured")?;
        let chat_id = config
            .telegram_sync_chat_id
            .clone()
            .ok_or("Sync Chat ID not configured")?;

        // Determine DB path
        let db_path = if let Some(custom_path) = config.db_path.clone() {
            std::path::PathBuf::from(custom_path)
        } else {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            data_dir.join("database.sqlite")
        };

        if !db_path.exists() {
            return Err("Database file not found".to_string());
        }

        let bytes =
            std::fs::read(&db_path).map_err(|e| format!("Failed to read database file: {}", e))?;
        let filename = format!(
            "backup_{}.sqlite",
            chrono::Local::now().format("%Y%m%d_%H%M%S")
        );
        let caption = Some(format!(
            "📦 <b>Database Backup</b>\nTime: {}\nSize: {:.2} MB",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
            bytes.len() as f64 / (1024.0 * 1024.0)
        ));

        Self::send_document_with_token(app, &token, &chat_id, bytes, filename, caption).await
    }

    pub async fn send_document_with_token(
        app: &AppHandle,
        token: &str,
        chat_id: &str,
        bytes: Vec<u8>,
        filename: String,
        caption: Option<String>,
    ) -> Result<(), String> {
        let config = ConfigService::load(app);
        let client = Self::build_client(&config);

        let url = format!("https://api.telegram.org/bot{}/sendDocument", token);
        let part = reqwest::multipart::Part::bytes(bytes).file_name(filename);
        let mut form = reqwest::multipart::Form::new()
            .part("document", part)
            .text("chat_id", chat_id.to_string());

        if let Some(c) = caption {
            form = form.text("caption", c);
            form = form.text("parse_mode", "HTML");
        }

        let response = client
            .post(url)
            .multipart(form)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Telegram API error: {}", error_text));
        }

        Ok(())
    }

    pub async fn fetch_latest_backup_file_id(app: &AppHandle) -> Result<String, String> {
        let config = ConfigService::load(app);
        let token = config.telegram_sync_bot_token.clone().ok_or("Sync Bot Token not configured")?;
        let chat_id = config.telegram_sync_chat_id.clone().ok_or("Sync Chat ID not configured")?;

        let url = format!("https://api.telegram.org/bot{}/getUpdates", token);
        let client = Self::build_client(&config);

        let response = client.get(url).send().await.map_err(|e| format!("{:?}", e))?;
        if !response.status().is_success() {
            return Err(format!("Telegram API error: {}", response.status()));
        }

        let data: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let mut latest_file_id: Option<String> = None;

        if let Some(updates) = data["result"].as_array() {
            // We want the latest one, so we iterate from the end or just find the one with largest date/id
            for update in updates.iter().rev() {
                // Determine if this is a conventional message or a channel post
                let message = if !update["message"].is_null() {
                    &update["message"]
                } else if !update["channel_post"].is_null() {
                    &update["channel_post"]
                } else {
                    continue;
                };

                let msg_chat_id = message["chat"]["id"].as_i64().map(|id| id.to_string());
                
                if msg_chat_id == Some(chat_id.clone()) {
                    if let Some(doc) = message["document"].as_object() {
                        let filename = doc["file_name"].as_str().unwrap_or("");
                        if filename.to_lowercase().ends_with(".sqlite") {
                            latest_file_id = doc["file_id"].as_str().map(|s| s.to_string());
                            break;
                        }
                    }
                }
            }
        }

        latest_file_id.ok_or("No backup file found in the Telegram chat history. Please make sure you have uploaded at least one backup.".to_string())
    }

    pub async fn restore_db_from_telegram(app: &AppHandle) -> Result<(), String> {
        let file_id = Self::fetch_latest_backup_file_id(app).await?;
        let config = ConfigService::load(app);
        let token = config.telegram_sync_bot_token.clone().ok_or("Sync Bot Token not configured")?;
        
        // 1. Get file path
        let get_file_url = format!("https://api.telegram.org/bot{}/getFile?file_id={}", token, file_id);
        let client = Self::build_client(&config);
        let response = client.get(get_file_url).send().await.map_err(|e| format!("{:?}", e))?;
        let data: serde_json::Value = response.json().await.map_err(|e| format!("{:?}", e))?;
        let file_path = data["result"]["file_path"].as_str().ok_or("File path not found")?;

        // 2. Download bytes
        let download_url = format!("https://api.telegram.org/file/bot{}/{}", token, file_path);
        let content_res = client.get(download_url).send().await.map_err(|e| format!("{:?}", e))?;
        let bytes = content_res.bytes().await.map_err(|e| format!("{:?}", e))?;

        // 3. Determine DB path
        let db_path = if let Some(custom_path) = config.db_path.clone() {
            std::path::PathBuf::from(custom_path)
        } else {
            let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            data_dir.join("database.sqlite")
        };

        // 4. Create local backup before overwriting
        if db_path.exists() {
            let backup_path = db_path.with_extension("sqlite.bak");
            std::fs::copy(&db_path, &backup_path).map_err(|e| format!("Failed to create local safety backup: {}", e))?;
        }

        // 5. Write new DB file
        std::fs::write(&db_path, bytes).map_err(|e| format!("Failed to write restored database: {}", e))?;

        Ok(())
    }
}
