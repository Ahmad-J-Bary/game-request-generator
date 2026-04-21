// src-tauri/src/lib.rs

use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

use chrono::Datelike;
use grq_engine::db::Database;
use serde::{Deserialize, Serialize};

use grq_engine::models::account::{Account, CreateAccountRequest, UpdateAccountRequest};
use grq_engine::models::game::{
    CreateBranchRequest, CreateGameRequest, Game, GameBranch, UpdateBranchRequest,
    UpdateGameRequest,
};
use grq_engine::models::history::{AddCompletedTaskRequest, CompletedDailyTask};
use grq_engine::models::level::{CreateLevelRequest, Level, UpdateLevelRequest};
use grq_engine::models::progress::{
    AccountLevelProgress, AccountPurchaseEventProgress, CreateAccountLevelProgressRequest,
    CreateAccountPurchaseEventProgressRequest, UpdateAccountLevelProgressRequest,
    UpdateAccountPurchaseEventProgressRequest,
};
use grq_engine::models::purchase_event::{
    CreatePurchaseEventRequest, PurchaseEvent, UpdatePurchaseEventRequest,
};

use grq_engine::services::account_service::{AccountService, CompletedAccount};
use grq_engine::services::game_service::GameService;
use grq_engine::services::history_service::HistoryService;
use grq_engine::services::level_service::LevelService;
use grq_engine::services::progress_service::ProgressService;
use grq_engine::services::purchase_event_service::PurchaseEventService;

use grq_engine::db::config::ConfigService;
use grq_engine::db::key_value::KeyValueService;
use grq_engine::services::repeater_service::{RepeaterResponse, RepeaterService};
use grq_engine::services::telegram_service::TelegramService;
use rusqlite::params;

// === حالة التطبيق ===
struct AppState {
    db: Mutex<Database>,
    db_backup_last_mtime: Mutex<Option<i64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
struct ExitMaintenancePlan {
    should_backup_db: bool,
    should_send_hall_of_fame: bool,
    created_at: Option<String>,
}

fn now_local_string() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn resolve_internal_db_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let config = ConfigService::load(app);
    if let Some(path) = config.db_path {
        Ok(std::path::PathBuf::from(path))
    } else {
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        Ok(data_dir.join("database.sqlite"))
    }
}

fn current_db_mtime_unix(app: &tauri::AppHandle) -> Result<Option<i64>, String> {
    let path = resolve_internal_db_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let metadata =
        std::fs::metadata(&path).map_err(|e| format!("Failed to read DB metadata: {}", e))?;
    let modified = metadata
        .modified()
        .map_err(|e| format!("Failed to read DB modified time: {}", e))?;
    let duration = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to convert DB modified time: {}", e))?;
    Ok(Some(duration.as_secs() as i64))
}

fn db_changed_since_last_backup(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let current = current_db_mtime_unix(app)?;
    let last = state.db_backup_last_mtime.lock().unwrap();
    match (current, *last) {
        (Some(c), Some(l)) => Ok(c > l),
        (Some(_), None) => Ok(true),
        (None, _) => Ok(false),
    }
}

fn mark_backup_mtime(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
) -> Result<(), String> {
    let current = current_db_mtime_unix(app)?;
    let mut last = state.db_backup_last_mtime.lock().unwrap();
    *last = current;
    Ok(())
}

fn get_exit_maintenance_plan(
    app: &tauri::AppHandle,
) -> Result<Option<ExitMaintenancePlan>, String> {
    let raw = KeyValueService::get_value(app, "exit_maintenance_plan")?;
    match raw {
        Some(json) => {
            let parsed = serde_json::from_str::<ExitMaintenancePlan>(&json)
                .map_err(|e| format!("Failed to parse exit maintenance plan: {}", e))?;
            Ok(Some(parsed))
        }
        None => Ok(None),
    }
}

fn set_exit_maintenance_plan(
    app: &tauri::AppHandle,
    plan: &ExitMaintenancePlan,
) -> Result<(), String> {
    let json = serde_json::to_string(plan)
        .map_err(|e| format!("Failed to serialize exit maintenance plan: {}", e))?;
    KeyValueService::set_value(app, "exit_maintenance_plan", &json)
}

fn clear_exit_maintenance_plan(app: &tauri::AppHandle) -> Result<(), String> {
    KeyValueService::delete_value(app, "exit_maintenance_plan")
}

async fn send_and_clear_hall_of_fame_impl(
    app: &tauri::AppHandle,
) -> Result<(usize, usize), String> {
    let completed_accounts: Vec<CompletedAccount> = {
        let db = Database::new(app)?;
        let conn = db.get_connection();
        let service = AccountService::new();
        service.get_completed_accounts(conn)?
    };

    if completed_accounts.is_empty() {
        return Ok((0, 0));
    }

    // 1) Send first. Any send failure aborts and prevents deletion.
    for account in &completed_accounts {
        let message = format!("{}", account.name);
        TelegramService::send_message(app, &message).await?;
    }

    // 2) Delete only after all sends succeed (transactional delete).
    let mut db = Database::new(app)?;
    let conn = db.get_connection_mut();
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    for account in &completed_accounts {
        tx.execute("DELETE FROM accounts WHERE id = ?1", params![account.id])
            .map_err(|e| format!("Failed to delete account {}: {}", account.id, e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit Hall of Fame cleanup: {}", e))?;

    Ok((completed_accounts.len(), completed_accounts.len()))
}

async fn run_deferred_exit_maintenance(app: tauri::AppHandle) -> Result<(), String> {
    let Some(plan) = get_exit_maintenance_plan(&app)? else {
        return Ok(());
    };

    // Enforce requested order:
    // 1) Hall of Fame send+delete
    // 2) Backup DB
    if plan.should_send_hall_of_fame {
        let _ = send_and_clear_hall_of_fame_impl(&app).await?;
    }

    if plan.should_backup_db {
        TelegramService::backup_db(&app).await?;
    }

    clear_exit_maintenance_plan(&app)?;
    Ok(())
}

#[tauri::command]
fn finalize_app_exit(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn run_exit_maintenance_in_background_and_quit(app: tauri::AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = run_deferred_exit_maintenance(app_handle.clone()).await;
        app_handle.exit(0);
    });
    Ok(())
}

#[tauri::command]
fn run_backup_if_changed_in_background_and_quit(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let app_handle = app.clone();

    let should_backup = db_changed_since_last_backup(&app_handle, &state)?;
    if !should_backup {
        app_handle.exit(0);
        return Ok(());
    }

    tauri::async_runtime::spawn(async move {
        if TelegramService::backup_db(&app_handle).await.is_ok() {
            let app_state = app_handle.state::<AppState>();
            let _ = mark_backup_mtime(&app_handle, &app_state);
        }
        app_handle.exit(0);
    });

    Ok(())
}

#[derive(Debug, Deserialize, Clone)]
struct BulkLevelProgressUpdate {
    account_id: i64,
    level_id: i64,
    is_completed: bool,
    time_spent: Option<i32>,
    target_date: Option<String>,
    bypass_cooldown: Option<bool>,
}

#[derive(Debug, Deserialize, Clone)]
struct BulkPurchaseEventProgressUpdate {
    account_id: i64,
    purchase_event_id: i64,
    is_completed: bool,
    days_offset: i32,
    time_spent: i32,
    target_date: Option<String>,
    bypass_cooldown: Option<bool>,
}

#[derive(Debug, Deserialize, Clone, Default)]
struct BulkProgressUpdateRequest {
    level_updates: Vec<BulkLevelProgressUpdate>,
    purchase_updates: Vec<BulkPurchaseEventProgressUpdate>,
}

fn spawn_proxy_reminder_worker(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600)); // Every 1 hour
        loop {
            interval.tick().await;

            let config = ConfigService::load(&app);
            if !config.proxy_enabled || !config.telegram_enabled || config.proxy_reminder_sent {
                continue;
            }

            if let Some(expiry_str) = &config.proxy_expiry {
                // Try to parse the expiry date
                // Expected formats: "2026-04-05 11:23:49" or "2026-04-05"
                let expiry_result =
                    chrono::NaiveDateTime::parse_from_str(expiry_str, "%Y-%m-%d %H:%M:%S").or_else(
                        |_| {
                            chrono::NaiveDate::parse_from_str(expiry_str, "%Y-%m-%d")
                                .map(|d| d.and_hms_opt(0, 0, 0).unwrap())
                        },
                    );

                if let Ok(expiry_dt) = expiry_result {
                    let now = chrono::Utc::now().naive_utc();
                    let duration = expiry_dt.signed_duration_since(now);
                    let hours_left = duration.num_hours();

                    // If expiring within 24 hours (and not already expired long ago)
                    if hours_left > 0 && hours_left <= 24 {
                        let _hours = hours_left % 24;

                        let message = "⚠️ <b>باقي يوم واحد لانتهاء صلاحية البروكسي</b>".to_string();

                        if let Ok(_) = TelegramService::send_message(&app, &message).await {
                            let mut new_config = ConfigService::load(&app);
                            new_config.proxy_reminder_sent = true;
                            let _ = ConfigService::save(&app, &new_config);
                            println!("Proxy expiry reminder sent to Telegram");
                        }
                    }
                }
            }
        }
    });
}

#[tauri::command]
fn get_db_path(app: tauri::AppHandle) -> Result<String, String> {
    let config = ConfigService::load(&app);
    if let Some(path) = config.db_path {
        Ok(path)
    } else {
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        Ok(data_dir
            .join("database.sqlite")
            .to_string_lossy()
            .to_string())
    }
}

#[tauri::command]
fn set_db_path(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    let mut config = ConfigService::load(&app);
    config.db_path = path;
    ConfigService::save(&app, &config)
}

/// Import: copies the given file over the internal DB (DB path stays the same, only contents change)
#[tauri::command]
fn import_database(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    source_path: String,
) -> Result<(), String> {
    // Get the current (internal) DB path
    let config = ConfigService::load(&app);
    let internal_db_path = if let Some(path) = config.db_path {
        path
    } else {
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        data_dir
            .join("database.sqlite")
            .to_string_lossy()
            .to_string()
    };

    // Validate source file exists
    let source = std::path::Path::new(&source_path);
    if !source.exists() {
        return Err(format!("Source file does not exist: {}", source_path));
    }

    // Close existing DB connections before replacing the file
    let _guard = state.db.lock().unwrap();

    // Copy source file over the internal DB path
    std::fs::copy(&source_path, &internal_db_path)
        .map_err(|e| format!("Failed to import database: {}", e))?;

    Ok(())
}

/// Export: copies the internal DB to a given destination path
#[tauri::command]
fn export_database(app: tauri::AppHandle, dest_path: String) -> Result<(), String> {
    let config = ConfigService::load(&app);
    let internal_db_path = if let Some(path) = config.db_path {
        path
    } else {
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        data_dir
            .join("database.sqlite")
            .to_string_lossy()
            .to_string()
    };

    std::fs::copy(&internal_db_path, &dest_path)
        .map_err(|e| format!("Failed to export database: {}", e))?;

    Ok(())
}

#[tauri::command]
fn import_database_from_bytes(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let config = ConfigService::load(&app);
    let internal_db_path = if let Some(path) = config.db_path {
        path
    } else {
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        data_dir
            .join("database.sqlite")
            .to_string_lossy()
            .to_string()
    };

    // Close existing DB connections before replacing the file
    let _guard = state.db.lock().unwrap();

    std::fs::write(&internal_db_path, bytes)
        .map_err(|e| format!("Failed to write imported database: {}", e))?;

    Ok(())
}

#[tauri::command]
fn export_database_to_bytes(app: tauri::AppHandle) -> Result<Vec<u8>, String> {
    let config = ConfigService::load(&app);
    let internal_db_path = if let Some(path) = config.db_path {
        path
    } else {
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        data_dir
            .join("database.sqlite")
            .to_string_lossy()
            .to_string()
    };

    std::fs::read(&internal_db_path).map_err(|e| format!("Failed to read internal database: {}", e))
}

// ==================== أوامر تيليجرام ====================
#[tauri::command]
async fn get_telegram_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config = ConfigService::load(&app);
    Ok(serde_json::json!({
        "bot_token": config.telegram_bot_token,
        "chat_id": config.telegram_chat_id,
        "enabled": config.telegram_enabled,
        "auto_send": config.telegram_auto_send,
        "last_offset": config.telegram_last_offset,
    }))
}

#[tauri::command]
async fn set_telegram_config(
    app: tauri::AppHandle,
    bot_token: Option<String>,
    chat_id: Option<String>,
    enabled: bool,
    auto_send: bool,
) -> Result<(), String> {
    let mut config = ConfigService::load(&app);
    let bot_token = bot_token
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let chat_id = chat_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let telegram_enabled = enabled && bot_token.is_some() && chat_id.is_some();

    // Reset offset if tracking a completely new chat or bot to ensure we don't skip unread queues
    if config.telegram_chat_id != chat_id || config.telegram_bot_token != bot_token {
        config.telegram_last_offset = None;
    }

    config.telegram_bot_token = bot_token;
    config.telegram_chat_id = chat_id;
    config.telegram_enabled = telegram_enabled;
    config.telegram_auto_send = telegram_enabled && auto_send;

    ConfigService::save(&app, &config)
}

#[tauri::command]
async fn test_telegram_connection(
    app: tauri::AppHandle,
    bot_token: String,
    chat_id: String,
) -> Result<(), String> {
    TelegramService::test_connection(&app, &bot_token, &chat_id).await
}

#[tauri::command]
async fn send_to_telegram(app: tauri::AppHandle, message: String) -> Result<(), String> {
    TelegramService::send_message(&app, &message).await
}

#[tauri::command]
fn schedule_exit_maintenance(
    app: tauri::AppHandle,
    should_backup_db: bool,
    should_send_hall_of_fame: bool,
) -> Result<(), String> {
    let plan = ExitMaintenancePlan {
        should_backup_db,
        should_send_hall_of_fame,
        created_at: Some(now_local_string()),
    };
    set_exit_maintenance_plan(&app, &plan)
}

#[tauri::command]
async fn send_and_clear_hall_of_fame(
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (sent, deleted) = send_and_clear_hall_of_fame_impl(&app).await?;

    if sent == 0 {
        return Ok(serde_json::json!({
            "sent": 0,
            "deleted": 0,
            "message": "No completed Hall of Fame accounts to process."
        }));
    }

    Ok(serde_json::json!({
        "sent": sent,
        "deleted": deleted,
        "message": "Completed accounts sent to Telegram and removed successfully."
    }))
}

#[tauri::command]
async fn send_excel_to_telegram(
    app: tauri::AppHandle,
    bytes: Vec<u8>,
    filename: String,
    caption: Option<String>,
) -> Result<(), String> {
    TelegramService::send_document(&app, bytes, filename, caption).await
}

#[tauri::command]
async fn get_telegram_updates(
    app: tauri::AppHandle,
) -> Result<Vec<grq_engine::services::telegram_service::TelegramImportPreview>, String> {
    let config = ConfigService::load(&app);
    TelegramService::get_updates(&app, config.telegram_last_offset).await
}

#[tauri::command]
async fn download_telegram_file(app: tauri::AppHandle, file_id: String) -> Result<String, String> {
    TelegramService::download_file(&app, &file_id).await
}

#[tauri::command]
async fn update_telegram_offset(app: tauri::AppHandle, offset: i64) -> Result<(), String> {
    let mut config = ConfigService::load(&app);
    config.telegram_last_offset = Some(offset);
    ConfigService::save(&app, &config)
}

// ==================== أوامر المزامنة (Sync) ====================
#[tauri::command]
async fn get_sync_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config = ConfigService::load(&app);
    Ok(serde_json::json!({
        "bot_token": config.telegram_sync_bot_token,
        "chat_id": config.telegram_sync_chat_id,
        "enabled": config.telegram_sync_enabled,
    }))
}

#[tauri::command]
async fn set_sync_config(
    app: tauri::AppHandle,
    bot_token: Option<String>,
    chat_id: Option<String>,
    enabled: bool,
) -> Result<(), String> {
    let mut config = ConfigService::load(&app);
    config.telegram_sync_bot_token = bot_token;
    config.telegram_sync_chat_id = chat_id;
    config.telegram_sync_enabled = enabled;
    ConfigService::save(&app, &config)
}

#[tauri::command]
async fn backup_database_now(app: tauri::AppHandle) -> Result<(), String> {
    TelegramService::backup_db(&app).await
}

#[tauri::command]
async fn restore_database_from_telegram(app: tauri::AppHandle) -> Result<(), String> {
    TelegramService::restore_db_from_telegram(&app).await
}

// ==================== أوامر الإعدادات للبروكسي ====================
#[tauri::command]
async fn get_proxy_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config = ConfigService::load(&app);
    Ok(serde_json::json!({
        "enabled": config.proxy_enabled,
        "type": config.proxy_type,
        "host": config.proxy_host,
        "port": config.proxy_port,
        "username": config.proxy_username,
        "password": config.proxy_password,
        "secret": config.proxy_secret,
        "package_name": config.proxy_package_name,
        "expiry": config.proxy_expiry,
        "created": config.proxy_created,
        "status": config.proxy_status,
        "country": config.proxy_country,
        "provider": config.proxy_provider,
        "rotation_time": config.proxy_rotation_time,
        "remaining_time": config.proxy_remaining_time,
    }))
}

#[tauri::command]
async fn set_proxy_config(
    app: tauri::AppHandle,
    enabled: bool,
    proxy_type: Option<String>,
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
    secret: Option<String>,
    package_name: Option<String>,
    expiry: Option<String>,
    created: Option<String>,
    status: Option<String>,
    country: Option<String>,
    provider: Option<String>,
    rotation_time: Option<String>,
    remaining_time: Option<String>,
) -> Result<(), String> {
    let mut config = ConfigService::load(&app);
    config.proxy_enabled = enabled;
    config.proxy_type = proxy_type;
    config.proxy_host = host;
    config.proxy_port = port;
    config.proxy_username = username;
    config.proxy_password = password;
    config.proxy_secret = secret;
    config.proxy_package_name = package_name;
    config.proxy_expiry = expiry;
    config.proxy_created = created;
    config.proxy_status = status;
    config.proxy_country = country;
    config.proxy_provider = provider;
    config.proxy_rotation_time = rotation_time;
    config.proxy_remaining_time = remaining_time;

    // Reset reminder flag when settings are changed
    config.proxy_reminder_sent = false;

    ConfigService::save(&app, &config)
}

#[tauri::command]
async fn send_proxy_details_to_telegram(app: tauri::AppHandle) -> Result<(), String> {
    let config = ConfigService::load(&app);

    if !config.telegram_enabled {
        return Err("Telegram integration is disabled in settings".to_string());
    }

    let message = "🌐 <b>باقي يوم واحد لانتهاء صلاحية البروكسي</b>".to_string();

    TelegramService::send_message(&app, &message).await
}

#[tauri::command]
fn parse_proxy_link(link: String) -> Result<serde_json::Value, String> {
    let mut proxy_type = "http".to_string(); // default fallback
    let mut host: Option<String> = None;
    let mut port: Option<u16> = None;
    let mut username: Option<String> = None;
    let mut password: Option<String> = None;
    let mut secret: Option<String> = None;
    let mut package_name: Option<String> = None;
    let mut expiry: Option<String> = None;
    let mut created: Option<String> = None;
    let mut status: Option<String> = None;
    let mut country: Option<String> = None;
    let mut provider: Option<String> = None;
    let mut rotation_time: Option<String> = None;
    let mut remaining_time_str: Option<String> = None;

    if let Ok(parsed_url) = tauri::Url::parse(&link) {
        if parsed_url.scheme() == "tg" || parsed_url.host_str() == Some("t.me") {
            let path = parsed_url.path();
            if path.ends_with("proxy") || path.contains("proxy") {
                proxy_type = "mtproxy".to_string();
            } else if path.ends_with("socks") || path.contains("socks") {
                proxy_type = "socks5".to_string();
            }
        }
        for (k, v) in parsed_url.query_pairs() {
            match k.as_ref() {
                "server" => host = Some(v.to_string()),
                "port" => port = v.parse::<u16>().ok(),
                "user" => username = Some(v.to_string()),
                "pass" => password = Some(v.to_string()),
                "secret" => secret = Some(v.to_string()),
                _ => {}
            }
        }
    }

    if host.is_none() || port.is_none() {
        // Build a robust parsing strategy:
        // 1. Line-by-line is most reliable for provider bot messages.
        // 2. Smart word-based extraction as fallback for single-line text.

        let find_val = |target_prefix: &str, source_text: &str| -> Option<String> {
            let target_lower = target_prefix.to_lowercase();

            // Try line-by-line first (maintains field boundaries best)
            for line in source_text.lines() {
                let trimmed = line.trim();
                if trimmed.to_lowercase().starts_with(&target_lower) {
                    let val = trimmed[target_prefix.len()..].trim();
                    if !val.is_empty() {
                        return Some(val.to_string());
                    }
                }
            }

            // Fallback for single line (e.g. when copied text lost formatting)
            let cleaned = source_text.replace(['\n', '\r'], " ");
            if let Some(start_idx) = cleaned.to_lowercase().find(&target_lower) {
                let rest = cleaned[start_idx + target_prefix.len()..].trim_start();
                let mut words = Vec::new();
                for word in rest.split_whitespace() {
                    // Check if word looks like a new key (ends with ":")
                    // Exception: we only check for new keys AFTER capturing at least one word,
                    // unless the current target is an IP/Port and we already have it.
                    if word.ends_with(':') && !words.is_empty() {
                        break;
                    }

                    words.push(word);

                    // IP/Port, User, Pass, Type are typically single-word values
                    if matches!(
                        target_prefix,
                        "IP/Port:" | "User:" | "Pass:" | "Type:" | "Status:"
                    ) {
                        break;
                    }
                }

                if !words.is_empty() {
                    return Some(words.join(" "));
                }
            }
            None
        };

        if let Some(ip_port) = find_val("IP/Port:", &link) {
            let parts: Vec<&str> = ip_port.split(':').collect();
            if parts.len() >= 2 {
                host = Some(parts[0].to_string());
                port = parts[1].parse::<u16>().ok();
            }
        }

        if let Some(u) = find_val("User:", &link) {
            username = Some(u);
        }
        if let Some(p) = find_val("Pass:", &link) {
            password = Some(p);
        }
        if let Some(s) = find_val("Secret:", &link) {
            secret = Some(s);
        }
        if let Some(e) = find_val("Expiry:", &link) {
            expiry = Some(e);
        }
        if let Some(c) = find_val("Created:", &link) {
            created = Some(c);
        }
        if let Some(st) = find_val("Status:", &link) {
            status = Some(st);
        }
        if let Some(co) = find_val("Country:", &link) {
            country = Some(co);
        }
        if let Some(pr) = find_val("Provider:", &link) {
            provider = Some(pr);
        }
        if let Some(rt) = find_val("Rotation Time:", &link) {
            rotation_time = Some(rt);
        }
        remaining_time_str = find_val("Remaining Time:", &link);

        if let Some(t) = find_val("Type:", &link) {
            let ptype = t.to_lowercase();
            if ptype.contains("socks") {
                proxy_type = "socks5".to_string();
            } else if ptype.contains("http") {
                proxy_type = "http".to_string();
            }
        }

        // Handle common bot headers like "Golden Package" (first line if it doesn't have a label)
        if package_name.is_none() {
            if let Some(first_line) = link.lines().next() {
                let first_line = first_line.trim();
                if !first_line.is_empty() && !first_line.contains(':') && first_line.len() < 50 {
                    package_name = Some(first_line.to_string());
                }
            }
        }
    }

    if host.is_none() || port.is_none() {
        return Err("Could not extract host or port from the provided text".to_string());
    }

    Ok(serde_json::json!({
        "type": proxy_type,
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "secret": secret,
        "package_name": package_name,
        "expiry": expiry,
        "created": created,
        "status": status,
        "country": country,
        "provider": provider,
        "rotation_time": rotation_time,
        "remaining_time": remaining_time_str,
        "reminder_sent": false
    }))
}

#[tauri::command]
async fn test_proxy_connection(
    proxy_type: Option<String>,
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
) -> Result<String, String> {
    TelegramService::test_proxy(proxy_type, host, port, username, password).await
}

#[tauri::command]
async fn send_raw_request(
    app: tauri::AppHandle,
    raw_request: String,
) -> Result<RepeaterResponse, String> {
    let config = ConfigService::load(&app);
    RepeaterService::send_raw_request(&raw_request, &config).await
}

#[tauri::command]
fn add_game(state: tauri::State<AppState>, request: CreateGameRequest) -> Result<i64, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = GameService::new();
    service.create_game(conn, request)
}

#[tauri::command]
fn get_games(state: tauri::State<AppState>) -> Result<Vec<Game>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = GameService::new();
    service.get_games(conn)
}

#[tauri::command]
fn get_game_by_id(state: tauri::State<AppState>, id: i64) -> Result<Option<Game>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = GameService::new();
    service.get_game_by_id(conn, id)
}

#[tauri::command]
fn update_game(state: tauri::State<AppState>, request: UpdateGameRequest) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = GameService::new();
    service.update_game(conn, request)
}

#[tauri::command]
fn delete_game(state: tauri::State<AppState>, id: i64) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = GameService::new();
    service.delete_game(conn, id)
}

// ==================== أوامر الأفرع ====================
#[tauri::command]
fn get_game_branches(
    state: tauri::State<AppState>,
    game_id: i64,
) -> Result<Vec<GameBranch>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = GameService::new();
    service.get_branches(conn, game_id)
}

#[tauri::command]
fn add_branch(state: tauri::State<AppState>, request: CreateBranchRequest) -> Result<i64, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = GameService::new();
    service.create_branch(conn, request)
}

#[tauri::command]
fn update_branch(
    state: tauri::State<AppState>,
    request: UpdateBranchRequest,
) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = GameService::new();
    service.update_branch(conn, request)
}

#[tauri::command]
fn delete_branch(state: tauri::State<AppState>, id: i64) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = GameService::new();
    service.delete_branch(conn, id)
}

// ==================== أوامر المستويات ====================
#[tauri::command]
fn add_level(state: tauri::State<AppState>, request: CreateLevelRequest) -> Result<i64, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();

    let service = LevelService::new();
    service.create_level(conn, request)
}

#[tauri::command]
fn get_game_levels(state: tauri::State<AppState>, branch_id: i64) -> Result<Vec<Level>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = LevelService::new();
    service.get_levels_by_branch(conn, branch_id)
}

#[tauri::command]
fn get_level_by_id(state: tauri::State<AppState>, id: i64) -> Result<Option<Level>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = LevelService::new();
    service.get_level_by_id(conn, id)
}

#[tauri::command]
fn update_level(
    state: tauri::State<AppState>,
    request: UpdateLevelRequest,
) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();

    // Get current level info to check for redundancy
    let (branch_id, level_name, days_offset, time_spent) = conn.query_row(
        "SELECT branch_id, level_name, days_offset, time_spent FROM levels WHERE id = ?1",
        params![request.id],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, i32>(2)?, row.get::<_, i32>(3)?))
    ).map_err(|e| e.to_string())?;

    let target_name = request.level_name.as_ref().unwrap_or(&level_name);
    let target_days = request.days_offset.unwrap_or(days_offset);
    let target_time = request.time_spent.unwrap_or(time_spent);

    let service = LevelService::new();
    service.update_level(conn, request)
}

#[tauri::command]
fn delete_level(state: tauri::State<AppState>, id: i64) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = LevelService::new();
    service.delete_level(conn, id)
}

// ==================== أوامر الحسابات ====================
#[tauri::command]
fn add_account(
    state: tauri::State<AppState>,
    request: CreateAccountRequest,
) -> Result<i64, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = AccountService::new();
    service.create_account(conn, request)
}

#[tauri::command]
fn get_accounts(state: tauri::State<AppState>, game_id: i64) -> Result<Vec<Account>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = AccountService::new();
    service.get_accounts_by_game(conn, game_id)
}

#[tauri::command]
fn get_all_accounts(state: tauri::State<AppState>) -> Result<Vec<Account>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = AccountService::new();
    service.get_all_accounts(conn)
}

#[tauri::command]
fn get_completed_accounts(state: tauri::State<AppState>) -> Result<Vec<CompletedAccount>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = AccountService::new();
    service.get_completed_accounts(conn)
}

#[tauri::command]
fn get_account_by_id(state: tauri::State<AppState>, id: i64) -> Result<Option<Account>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = AccountService::new();
    service.get_account_by_id(conn, id)
}

#[tauri::command]
fn update_account(
    state: tauri::State<AppState>,
    request: UpdateAccountRequest,
) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = AccountService::new();
    service.update_account(conn, request)
}

#[tauri::command]
fn delete_account(state: tauri::State<AppState>, id: i64) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = AccountService::new();
    service.delete_account(conn, id)
}

// ==================== أوامر أحداث الشراء ====================
#[tauri::command]
fn add_purchase_event(
    state: tauri::State<AppState>,
    request: CreatePurchaseEventRequest,
) -> Result<i64, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = PurchaseEventService::new();
    service.create_purchase_event(conn, request)
}

#[tauri::command]
fn get_game_purchase_events(
    state: tauri::State<AppState>,
    branch_id: i64,
) -> Result<Vec<PurchaseEvent>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = PurchaseEventService::new();
    service.get_purchase_events_by_branch(conn, branch_id)
}

#[tauri::command]
fn get_purchase_event_by_id(
    state: tauri::State<AppState>,
    id: i64,
) -> Result<Option<PurchaseEvent>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = PurchaseEventService::new();
    service.get_purchase_event_by_id(conn, id)
}

#[tauri::command]
fn update_purchase_event(
    state: tauri::State<AppState>,
    request: UpdatePurchaseEventRequest,
) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = PurchaseEventService::new();
    service.update_purchase_event(conn, request)
}

#[tauri::command]
fn delete_purchase_event(state: tauri::State<AppState>, id: i64) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = PurchaseEventService::new();
    service.delete_purchase_event(conn, id)
}

// ==================== أوامر تقدم المستويات ====================
#[tauri::command]
fn create_level_progress(
    state: tauri::State<AppState>,
    request: CreateAccountLevelProgressRequest,
) -> Result<(), String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = ProgressService::new();
    service.create_or_update_level_progress(conn, request)
}

#[tauri::command]
fn save_bulk_progress_updates(
    state: tauri::State<AppState>,
    request: BulkProgressUpdateRequest,
) -> Result<(), String> {
    if request.level_updates.is_empty() && request.purchase_updates.is_empty() {
        return Ok(());
    }

    let mut db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection_mut();
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to start progress transaction: {}", e))?;
    let service = ProgressService::new();

    for level_update in &request.level_updates {
        // De-duplication check: Skip synthetic levels ("-") if a real level is at the same time
        let level_name: String = tx
            .query_row(
                "SELECT level_name FROM levels WHERE id = ?1",
                params![level_update.level_id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "".to_string());

        if level_name == "-" {
            // Check if any other level in this BATCH is a real one at the same time
            let redundant_in_batch = request.level_updates.iter().any(|other| {
                if other.account_id == level_update.account_id
                    && other.time_spent == level_update.time_spent
                    && other.target_date == level_update.target_date
                    && other.level_id != level_update.level_id
                {
                    // Check if the other level is real
                    let other_name: String = tx
                        .query_row(
                            "SELECT level_name FROM levels WHERE id = ?1",
                            params![other.level_id],
                            |row| row.get(0),
                        )
                        .unwrap_or_else(|_| "".to_string());
                    other_name != "-"
                } else {
                    false
                }
            });

            if redundant_in_batch {
                continue;
            }

            // Check if any real level already exists in the DATABASE at the same time
            let redundant_in_db: bool = tx
                .query_row(
                    "SELECT 1 FROM account_level_progress alp 
                     JOIN levels l ON alp.level_id = l.id 
                     WHERE alp.account_id = ?1 AND alp.time_spent = ?2 AND alp.target_date = ?3 
                     AND l.level_name != '-' LIMIT 1",
                    params![
                        level_update.account_id,
                        level_update.time_spent,
                        level_update.target_date
                    ],
                    |_| Ok(true),
                )
                .unwrap_or(false);

            if redundant_in_db {
                continue;
            }
        }

        service.create_or_update_level_progress(
            &tx,
            CreateAccountLevelProgressRequest {
                account_id: level_update.account_id,
                level_id: level_update.level_id,
                time_spent: level_update.time_spent,
                target_date: level_update.target_date.clone(),
            },
        )?;

        service.update_level_progress(
            &tx,
            UpdateAccountLevelProgressRequest {
                account_id: level_update.account_id,
                level_id: level_update.level_id,
                is_completed: level_update.is_completed,
                time_spent: level_update.time_spent,
                target_date: level_update.target_date.clone(),
                bypass_cooldown: level_update.bypass_cooldown,
            },
        )?;
    }

    for purchase_update in request.purchase_updates {
        service.create_or_update_purchase_event_progress(
            &tx,
            CreateAccountPurchaseEventProgressRequest {
                account_id: purchase_update.account_id,
                purchase_event_id: purchase_update.purchase_event_id,
                days_offset: purchase_update.days_offset,
                time_spent: purchase_update.time_spent,
                target_date: purchase_update.target_date.clone(),
            },
        )?;

        service.update_purchase_event_progress(
            &tx,
            UpdateAccountPurchaseEventProgressRequest {
                account_id: purchase_update.account_id,
                purchase_event_id: purchase_update.purchase_event_id,
                is_completed: Some(purchase_update.is_completed),
                days_offset: Some(purchase_update.days_offset),
                time_spent: Some(purchase_update.time_spent),
                target_date: purchase_update.target_date,
                bypass_cooldown: purchase_update.bypass_cooldown,
            },
        )?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit progress transaction: {}", e))?;

    Ok(())
}

#[tauri::command]
fn update_level_progress(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    request: UpdateAccountLevelProgressRequest,
) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = ProgressService::new();
    let result = service.update_level_progress(conn, request.clone())?;

    if result && request.is_completed {
        let account_service = AccountService::new();
        if account_service.is_account_completed(conn, request.account_id)? {
            let config = ConfigService::load(&app);
            if config.telegram_enabled && config.telegram_auto_send {
                if let Some(account) =
                    account_service.get_account_by_id(conn, request.account_id)?
                {
                    let game_service = GameService::new();
                    let game_name = game_service
                        .get_game_by_id(conn, account.game_id)?
                        .map(|g| g.name)
                        .unwrap_or_else(|| "Unknown".to_string());

                    let message = format!("<b>🏆 Account Name:</b> {}\n<b>Game:</b> {}\n<b>Status:</b> 100% COMPLETED ✅\n\n<i>Reported via Game Request Generator</i>", account.name, game_name);
                    let handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = TelegramService::send_message(&handle, &message).await;
                    });
                }
            }
        }
    }

    Ok(result)
}

#[tauri::command]
fn get_account_level_progress(
    state: tauri::State<AppState>,
    account_id: i64,
) -> Result<Vec<AccountLevelProgress>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = ProgressService::new();
    service.get_account_level_progress(conn, account_id)
}

// ==================== أوامر تقدم أحداث الشراء ====================
#[tauri::command]
fn create_purchase_event_progress(
    state: tauri::State<AppState>,
    request: CreateAccountPurchaseEventProgressRequest,
) -> Result<(), String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = ProgressService::new();
    service.create_or_update_purchase_event_progress(conn, request)
}

#[tauri::command]
fn update_purchase_event_progress(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    request: UpdateAccountPurchaseEventProgressRequest,
) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = ProgressService::new();
    let result = service.update_purchase_event_progress(conn, request.clone())?;

    if result && request.is_completed.unwrap_or(false) {
        let account_service = AccountService::new();
        if account_service.is_account_completed(conn, request.account_id)? {
            let config = ConfigService::load(&app);
            if config.telegram_enabled && config.telegram_auto_send {
                if let Some(account) =
                    account_service.get_account_by_id(conn, request.account_id)?
                {
                    let game_service = GameService::new();
                    let game_name = game_service
                        .get_game_by_id(conn, account.game_id)?
                        .map(|g| g.name)
                        .unwrap_or_else(|| "Unknown".to_string());

                    let message = format!("<b>🏆 Account Name:</b> {}\n<b>Game:</b> {}\n<b>Status:</b> 100% COMPLETED ✅\n\n<i>Reported via Game Request Generator</i>", account.name, game_name);
                    let handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = TelegramService::send_message(&handle, &message).await;
                    });
                }
            }
        }
    }

    Ok(result)
}

#[tauri::command]
fn get_account_purchase_event_progress(
    state: tauri::State<AppState>,
    account_id: i64,
) -> Result<Vec<AccountPurchaseEventProgress>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = ProgressService::new();
    service.get_account_purchase_event_progress(conn, account_id)
}

// ==================== أوامر الطلبات اليومية ====================
#[tauri::command]
fn get_daily_requests(
    state: tauri::State<AppState>,
    account_id: i64,
    target_date: String,
) -> Result<serde_json::Value, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();

    let account_service = AccountService::new();
    let account = account_service
        .get_account_by_id(conn, account_id)
        .map_err(|_| "Account not found".to_string())?
        .ok_or("Account not found".to_string())?;

    let account_start_date = if account.start_date.contains('-') && account.start_date.len() <= 6 {
        let current_year = chrono::Utc::now().year();
        chrono::NaiveDate::parse_from_str(
            &format!("{}-{}", current_year, account.start_date),
            "%Y-%d-%b",
        )
    } else {
        chrono::NaiveDate::parse_from_str(&account.start_date, "%Y-%m-%d")
    }
    .map_err(|_| format!("Invalid account start date format: {}", account.start_date))?;

    let target_date_parsed = chrono::NaiveDate::parse_from_str(&target_date, "%Y-%m-%d")
        .map_err(|_| "Invalid target date format".to_string())?;

    let days_passed = (target_date_parsed - account_start_date).num_days();
    if days_passed < 0 {
        return Err("Target date is before account start date".to_string());
    }

    let level_service = LevelService::new();
    let levels = level_service
        .get_levels_by_branch(conn, account.branch_id.unwrap_or(0))
        .map_err(|e| format!("Failed to get levels: {}", e))?;

    let progress_service = ProgressService::new();
    let level_progress = progress_service
        .get_account_level_progress(conn, account_id)
        .map_err(|_| "Failed to get level progress".to_string())?;

    let level_progress_map: std::collections::HashMap<i64, &AccountLevelProgress> =
        level_progress.iter().map(|p| (p.level_id, p)).collect();

    let mut all_levels = levels.clone();
    let numeric_levels: Vec<&Level> = levels.iter().collect();
    if !numeric_levels.is_empty() {
        let existing_days: std::collections::HashSet<i32> = numeric_levels
            .iter()
            .map(|l| l.days_offset as i32)
            .collect();

        let min_day = *existing_days.iter().min().unwrap();
        let max_day = *existing_days.iter().max().unwrap();
        let start_day = if min_day > 0 { 0 } else { min_day };

        for day in start_day..=max_day {
            if !existing_days.contains(&day) {
                let next_real_level = levels
                    .iter()
                    .filter(|l| l.days_offset > day)
                    .min_by_key(|l| l.days_offset);

                if let Some(next_level) = next_real_level {
                    let time: f64;
                    let token = next_level
                        .event_token
                        .split("_day")
                        .next()
                        .unwrap_or(&next_level.event_token)
                        .to_string();

                    let first_real_day = *existing_days.iter().min().unwrap();
                    let is_before_first_real = day < first_real_day;

                    if is_before_first_real {
                        let increment = next_level.time_spent as f64 / (first_real_day + 1) as f64;
                        time = (day + 1) as f64 * increment;
                    } else {
                        let prev_real_level = levels
                            .iter()
                            .filter(|l| l.days_offset < day)
                            .max_by_key(|l| l.days_offset);

                        if let Some(prev_level) = prev_real_level {
                            let ratio = (day - prev_level.days_offset) as f64
                                / (next_level.days_offset - prev_level.days_offset) as f64;
                            time = prev_level.time_spent as f64
                                + ratio * (next_level.time_spent - prev_level.time_spent) as f64;
                        } else {
                            time = (next_level.time_spent / 2) as f64;
                        }
                    }

                    let synthetic_level = Level {
                        id: -(day as i64),
                        game_id: account.game_id,
                        branch_id: account.branch_id,
                        level_name: "-".to_string(),
                        event_token: format!("{}_day{}", token, day),
                        days_offset: day,
                        time_spent: time.round() as i32,
                        is_bonus: false,
                    };
                    all_levels.push(synthetic_level);
                }
            }
        }
    }

    // Group all levels (real and synthetic) by (base_token, day)
    let mut levels_by_group: std::collections::HashMap<(String, i32), Vec<Level>> =
        std::collections::HashMap::new();
    for l in &all_levels {
        let base_token = l
            .event_token
            .split("_day")
            .next()
            .unwrap_or(&l.event_token)
            .to_string();
        levels_by_group
            .entry((base_token, l.days_offset))
            .or_default()
            .push(l.clone());
    }

    let mut requests = Vec::new();
    let template = account.request_template.clone();

    // Process only the groups that have levels for the current day
    let mut processed_groups = std::collections::HashSet::new();

    for level in &all_levels {
        if level.days_offset as i64 != days_passed {
            continue;
        }

        let clean_event_token = level
            .event_token
            .split("_day")
            .next()
            .unwrap_or(&level.event_token)
            .to_string();
        let group_key = (clean_event_token.clone(), level.days_offset);

        if processed_groups.contains(&group_key) {
            continue;
        }
        processed_groups.insert(group_key.clone());

        let group_levels = levels_by_group.get(&group_key).unwrap();

        // 1. Determine if anything in this group is completed and get locked time
        let mut locked_time: Option<i64> = None;
        let mut group_fully_completed = true;
        for l in group_levels {
            if let Some(prog) = level_progress_map.get(&l.id) {
                if prog.is_completed && prog.target_date == Some(target_date.clone()) {
                    locked_time = Some(prog.time_spent as i64);
                } else {
                    group_fully_completed = false;
                }
            } else {
                group_fully_completed = false;
            }
        }

        // Also check if this exact group (token + date) was completed today in the NEW tracking table
        if locked_time.is_none() {
            locked_time = conn
                .query_row(
                    "SELECT time_spent FROM completed_daily_tasks
                 WHERE account_id = ?1 AND event_token = ?2 AND completion_date = ?3 LIMIT 1",
                    params![account_id, clean_event_token, target_date],
                    |row| row.get(0),
                )
                .ok();
        }

        // If the whole group is completed, skip it
        if group_fully_completed {
            continue;
        }

        // 2. Pre-calculate time for this whole group
        let time_spent = if let Some(t) = locked_time {
            t
        } else {
            use rand::Rng;
            let mut rng = rand::thread_rng();
            // Use the first level in the group to get base_time
            let base_time = group_levels[0].time_spent;
            let jitter = if base_time < 25 {
                rng.gen_range(-100..=500)
            } else {
                rng.gen_range(-750..=1500)
            };
            (base_time as i64 * 1000) + jitter as i64
        };

        // 3. Helper for processing content length
        let process_content_length = |content: String| -> String {
            if !content.contains("Content-Length:") && content.contains("\n\n") {
                let parts: Vec<&str> = content.splitn(2, "\n\n").collect();
                if parts.len() == 2 {
                    let headers = parts[0];
                    let body = parts[1];
                    let content_length_line = format!("Content-Length: {}", body.len());
                    return format!("{}\n{}\n\n{}", headers, content_length_line, body);
                }
            }
            content
        };

        // 4. Generate requests for this group
        let mut has_real_level = false;
        let mut has_synthetic_level = false;

        // Sort levels within the group: Session (-) then Event (actual names)
        let mut sorted_group_levels = group_levels.clone();
        sorted_group_levels.sort_by(|a, b| {
            if a.level_name == "-" && b.level_name != "-" {
                std::cmp::Ordering::Less
            } else if a.level_name != "-" && b.level_name == "-" {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        });

        for l in sorted_group_levels {
            if l.level_name == "-" {
                has_synthetic_level = true;
            } else {
                has_real_level = true;
            }

            // We no longer skip completed individual levels here to keep the group intact in the UI

            let mut base_request_content = template.clone();
            base_request_content =
                base_request_content.replace("{event_token}", &clean_event_token);
            base_request_content =
                base_request_content.replace("{time_spent}", &time_spent.to_string());
            base_request_content = base_request_content.replace("{account_name}", &account.name);
            base_request_content =
                base_request_content.replace("{game_id}", &account.game_id.to_string());
            base_request_content = base_request_content.replace("{level_name}", &l.level_name);
            base_request_content =
                base_request_content.replace("{days_offset}", &l.days_offset.to_string());

            if l.level_name == "-" {
                // Generate ONLY Session
                let session_content = process_content_length(base_request_content);
                requests.push(serde_json::json!({
                    "request_type": "session",
                    "content": session_content,
                    "event_token": clean_event_token.clone(),
                    "level_id": l.id,
                    "time_spent": time_spent,
                    "timestamp": target_date.clone()
                }));
            } else {
                // Generate ONLY Event
                let event_content = process_content_length(
                    base_request_content.replace("POST /session", "POST /event"),
                );
                requests.push(serde_json::json!({
                    "request_type": "event",
                    "content": event_content,
                    "event_token": clean_event_token.clone(),
                    "level_id": l.id,
                    "time_spent": time_spent,
                    "timestamp": target_date.clone()
                }));
            }
        }

        // 5. If day has real levels but no synthetic session level exists yet, add a virtual session.
        // Guard: do NOT add a fallback session if a real '-' level already exists in all_levels
        // for the same base token + day (to avoid duplicate sessions).
        let has_db_session_for_token = all_levels.iter().any(|l| {
            l.level_name == "-"
                && l.event_token
                    .split("_day")
                    .next()
                    .unwrap_or("")
                    == clean_event_token
                && l.days_offset == level.days_offset
        });

        if has_real_level && !has_synthetic_level && !has_db_session_for_token {
            let mut base_request_content = template.clone();
            base_request_content =
                base_request_content.replace("{event_token}", &clean_event_token);
            base_request_content =
                base_request_content.replace("{time_spent}", &time_spent.to_string());
            base_request_content = base_request_content.replace("{account_name}", &account.name);
            base_request_content =
                base_request_content.replace("{game_id}", &account.game_id.to_string());
            base_request_content = base_request_content.replace("{level_name}", "-");
            base_request_content =
                base_request_content.replace("{days_offset}", &days_passed.to_string());

            let session_content = process_content_length(base_request_content);
            requests.push(serde_json::json!({
                "request_type": "session",
                "content": session_content,
                "event_token": clean_event_token.clone(),
                "level_id": null,
                "time_spent": time_spent,
                "timestamp": target_date.clone()
            }));
        }
    }

    let purchase_event_service = PurchaseEventService::new();
    let purchase_events = purchase_event_service
        .get_purchase_events_by_branch(conn, account.branch_id.unwrap_or(0))
        .map_err(|e| format!("Failed to get purchase events: {}", e))?;

    let purchase_progress = progress_service
        .get_account_purchase_event_progress(conn, account_id)
        .map_err(|_| "Failed to get purchase event progress".to_string())?;

    let purchase_progress_map: std::collections::HashMap<i64, &AccountPurchaseEventProgress> =
        purchase_progress
            .iter()
            .map(|p| (p.purchase_event_id, p))
            .collect();

    for event in purchase_events {
        let prog = purchase_progress_map.get(&event.id);
        let effective_offset = prog.map(|p| p.days_offset).or(event.days_offset);

        if let Some(event_day_offset) = effective_offset {
            let is_completed = prog.map(|p| p.is_completed).unwrap_or(false);

            if event_day_offset as i64 == days_passed && !is_completed {
                let time_spent = if let Some(p) =
                    prog.filter(|p| p.is_completed && p.target_date == Some(target_date.clone()))
                {
                    // Standardize: if progress is stored in seconds, convert to milliseconds
                    if p.time_spent < 10000 { // Heuristic: likely seconds if very small
                         p.time_spent as i64 * 1000
                    } else {
                         p.time_spent as i64
                    }
                } else {
                    // Generate time using averaging logic.
                    // IMPORTANT: Use only REAL levels (level_name != "-") to avoid
                    // inflating the average with synthetic session levels.
                    let mut real_sorted_levels: Vec<&Level> = levels
                        .iter()
                        .filter(|l| l.level_name != "-")
                        .collect();
                    real_sorted_levels.sort_by_key(|l| l.days_offset);

                    let base_time = {
                        let prev_level = real_sorted_levels
                            .iter()
                            .filter(|l| l.days_offset <= event_day_offset)
                            .last();

                        let next_level = real_sorted_levels
                            .iter()
                            .find(|l| l.days_offset > event_day_offset);

                        match (prev_level, next_level) {
                            (Some(p), Some(n)) => ((p.time_spent + n.time_spent) as f64 / 2.0).round() as i32,
                            (Some(p), None) => p.time_spent,
                            (None, Some(n)) => n.time_spent,
                            (None, None) => 243,
                        }
                    };

                    use rand::Rng;
                    let mut rng = rand::thread_rng();
                    let jitter = if base_time < 25 {
                        rng.gen_range(-100..=500)
                    } else {
                        rng.gen_range(-750..=1500)
                    };
                    (base_time as i64 * 1000) + jitter as i64
                };

                let clean_event_token = &event.event_token;
                let mut purchase_base_content = template.clone();
                purchase_base_content =
                    purchase_base_content.replace("{event_token}", clean_event_token);
                purchase_base_content =
                    purchase_base_content.replace("{time_spent}", &time_spent.to_string());
                purchase_base_content =
                    purchase_base_content.replace("{account_name}", &account.name);
                purchase_base_content =
                    purchase_base_content.replace("{game_id}", &account.game_id.to_string());
                purchase_base_content =
                    purchase_base_content.replace("{level_name}", &event.event_token);
                purchase_base_content =
                    purchase_base_content.replace("{days_offset}", &event_day_offset.to_string());

                let process_content_length = |content: String| -> String {
                    if !content.contains("Content-Length:") && content.contains("\n\n") {
                        let parts: Vec<&str> = content.splitn(2, "\n\n").collect();
                        if parts.len() == 2 {
                            let headers = parts[0];
                            let body = parts[1];
                            let content_length_line = format!("Content-Length: {}", body.len());
                            return format!("{}\n{}\n\n{}", headers, content_length_line, body);
                        }
                    }
                    content
                };

                let purchase_session_content =
                    process_content_length(purchase_base_content.clone());

                requests.push(serde_json::json!({
                    "request_type": "session",
                    "content": purchase_session_content,
                    "event_token": clean_event_token,
                    "level_id": null,
                    "time_spent": time_spent,
                    "timestamp": target_date.clone()
                }));

                let purchase_event_content = process_content_length(
                    purchase_base_content.replace("POST /session", "POST /event"),
                );

                requests.push(serde_json::json!({
                    "request_type": "event",
                    "content": purchase_event_content,
                    "event_token": clean_event_token,
                    "level_id": null,
                    "time_spent": time_spent,
                    "timestamp": target_date.clone()
                }));
            }
        }
    }

    // De-duplication: Delete "Session Only" requests if there's a "Session + Event" task at the same time
    // A task is "Session + Event" if it has an event at that time/timestamp.
    // If such a task exists at a given time, any session request without a corresponding event is redundant.
    let mut final_requests = Vec::new();

    // Group requests by (time_spent, timestamp) to analyze snapshots in time
    let mut time_groups: std::collections::HashMap<(i64, String), Vec<serde_json::Value>> =
        std::collections::HashMap::new();
    for req in requests {
        let time = req["time_spent"].as_i64().unwrap_or(0);
        let ts = req["timestamp"].as_str().unwrap_or("").to_string();
        time_groups.entry((time, ts)).or_default().push(req);
    }

    for ((_time, _ts), mut group_reqs) in time_groups {
        let has_any_event = group_reqs.iter().any(|r| r["request_type"] == "event");

        if has_any_event {
            // Identify tokens that have events at this moment in current list
            let tokens_with_events: std::collections::HashSet<String> = group_reqs
                .iter()
                .filter(|r| r["request_type"] == "event")
                .map(|r| r["event_token"].as_str().unwrap_or("").to_string())
                .collect();

            // Keep only one session for this moment.
            // Prioritize the session for a token that has an event.
            let mut session_to_keep_index = None;
            
            // First pass: try to find a session matching an event token
            for (idx, r) in group_reqs.iter().enumerate() {
                if r["request_type"] == "session" {
                    let token = r["event_token"].as_str().unwrap_or("");
                    if tokens_with_events.contains(token) {
                        session_to_keep_index = Some(idx);
                        break;
                    }
                }
            }
            
            // Second pass: if no matching session found, just take the first session
            if session_to_keep_index.is_none() {
                for (idx, r) in group_reqs.iter().enumerate() {
                    if r["request_type"] == "session" {
                        session_to_keep_index = Some(idx);
                        break;
                    }
                }
            }

            let mut final_group = Vec::new();
            for (idx, r) in group_reqs.into_iter().enumerate() {
                if r["request_type"] == "session" {
                    if Some(idx) == session_to_keep_index {
                        final_group.push(r);
                    }
                } else {
                    final_group.push(r);
                }
            }
            group_reqs = final_group;
        } else {
            // No event in current list, check if a REAL level or purchase exists in DB at this time
            let real_activity_exists_in_db: bool = conn
                .query_row(
                    "SELECT 1 FROM (
                        SELECT alp.account_id, alp.time_spent, alp.target_date 
                        FROM account_level_progress alp 
                        JOIN levels l ON alp.level_id = l.id 
                        WHERE l.level_name != '-'
                        UNION ALL
                        SELECT apep.account_id, apep.time_spent, apep.target_date 
                        FROM account_purchase_event_progress apep
                    ) AS combined_activity
                    WHERE account_id = ?1 AND time_spent = ?2 AND target_date = ?3 LIMIT 1",
                    params![account_id, _time, target_date],
                    |_| Ok(true),
                )
                .unwrap_or(false);

            if real_activity_exists_in_db {
                // If real activity exists in DB at this time, any standalone session is redundant
                group_reqs.retain(|r| r["request_type"] != "session");
            }
        }

        final_requests.extend(group_reqs);
    }

    Ok(serde_json::json!({
        "account_id": account_id,
        "account_name": account.name,
        "target_date": target_date,
        "days_passed": days_passed,
        "requests": final_requests
    }))
}

// ==================== أوامر تاريخ المهام اليومية ====================
#[tauri::command]
fn add_completed_task(
    state: tauri::State<AppState>,
    request: AddCompletedTaskRequest,
) -> Result<(), String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = HistoryService::new();
    service.insert_completed_task(conn, request)
}

#[tauri::command]
fn get_task_history(
    state: tauri::State<AppState>,
    limit: Option<u32>,
    account_id: Option<i64>,
) -> Result<Vec<CompletedDailyTask>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = HistoryService::new();
    service.get_task_history(conn, limit, account_id)
}

#[tauri::command]
fn clear_task_history(state: tauri::State<AppState>) -> Result<(), String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = HistoryService::new();
    service.clear_history(conn)
}

#[tauri::command]
async fn import_request_templates(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    game_id: i64,
) -> Result<serde_json::Value, String> {
    use tauri_plugin_dialog::DialogExt;

    let files = app
        .dialog()
        .file()
        .add_filter("Text Files", &["txt"])
        .blocking_pick_files();

    let file_paths = match files {
        Some(paths) => paths,
        None => return Ok(serde_json::json!({"cancelled": true})),
    };

    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let account_service = AccountService::new();

    let accounts = account_service
        .get_accounts_by_game(conn, game_id)
        .map_err(|e| format!("Failed to get accounts: {}", e))?;

    let total_processed = file_paths.len();
    let mut imported_templates = Vec::new();
    let mut errors = Vec::new();

    for file_path in file_paths {
        let path_str = file_path.to_string();
        let path_buf = std::path::PathBuf::from(&path_str);
        let path = Path::new(&path_buf);

        let filename = path
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or_else(|| format!("Invalid filename: {}", path_str))?;

        let content = std::fs::read_to_string(&path_buf)
            .map_err(|e| format!("Failed to read file {}: {}", path_str, e))?;

        let matching_account = accounts.iter().find(|account| account.name == filename);

        if let Some(account) = matching_account {
            let update_request = UpdateAccountRequest {
                id: account.id,
                request_template: Some(content.clone()),
                ..Default::default()
            };

            match account_service.update_account(conn, update_request) {
                Ok(_) => {
                    imported_templates.push(serde_json::json!({
                        "account_name": account.name,
                        "filename": filename,
                        "status": "success"
                    }));
                }
                Err(e) => {
                    errors.push(format!("Failed to update account {}: {}", account.name, e));
                }
            }
        } else {
            errors.push(format!("No account found matching filename: {}", filename));
        }
    }

    Ok(serde_json::json!({
        "imported_templates": imported_templates,
        "errors": errors,
        "total_processed": total_processed,
        "successful_imports": imported_templates.len()
    }))
}

#[tauri::command]
fn get_store_value(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    KeyValueService::get_value(&app, &key)
}

#[tauri::command]
fn set_store_value(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    KeyValueService::set_value(&app, &key, &value)
}

#[tauri::command]
fn delete_store_value(app: tauri::AppHandle, key: String) -> Result<(), String> {
    KeyValueService::delete_value(&app, &key)
}

#[tauri::command]
fn get_config_version(app: tauri::AppHandle) -> Result<Option<i64>, String> {
    ConfigService::get_config_version(&app)
}

#[tauri::command]
fn run_legacy_config_cleanup_once(app: tauri::AppHandle) -> Result<(), String> {
    ConfigService::cleanup_legacy_config_once(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle();
            let db = Database::new(&handle)?;
            db.init()?;

            let initial_mtime = current_db_mtime_unix(&handle).ok().flatten();
            app.manage(AppState {
                db: Mutex::new(db),
                db_backup_last_mtime: Mutex::new(initial_mtime),
            });

            // Run deferred exit maintenance from previous close request (best effort).
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if run_deferred_exit_maintenance(app_handle.clone())
                        .await
                        .is_ok()
                    {
                        let app_state = app_handle.state::<AppState>();
                        let _ = mark_backup_mtime(&app_handle, &app_state);
                    }
                });
            }

            // Start the proxy expiry reminder worker
            spawn_proxy_reminder_worker(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_db_path,
            set_db_path,
            add_game,
            get_games,
            get_game_by_id,
            update_game,
            delete_game,
            add_level,
            get_game_levels,
            get_level_by_id,
            update_level,
            delete_level,
            add_account,
            get_accounts,
            get_all_accounts,
            get_completed_accounts,
            get_account_by_id,
            update_account,
            delete_account,
            add_purchase_event,
            get_game_purchase_events,
            get_purchase_event_by_id,
            update_purchase_event,
            delete_purchase_event,
            create_level_progress,
            save_bulk_progress_updates,
            update_level_progress,
            get_account_level_progress,
            create_purchase_event_progress,
            update_purchase_event_progress,
            get_account_purchase_event_progress,
            get_daily_requests,
            import_request_templates,
            import_database,
            export_database,
            import_database_from_bytes,
            export_database_to_bytes,
            get_telegram_config,
            set_telegram_config,
            test_telegram_connection,
            send_to_telegram,
            send_and_clear_hall_of_fame,
            schedule_exit_maintenance,
            finalize_app_exit,
            run_exit_maintenance_in_background_and_quit,
            run_backup_if_changed_in_background_and_quit,
            get_game_branches,
            add_branch,
            update_branch,
            delete_branch,
            get_proxy_config,
            set_proxy_config,
            parse_proxy_link,
            test_proxy_connection,
            send_proxy_details_to_telegram,
            send_excel_to_telegram,
            get_telegram_updates,
            download_telegram_file,
            update_telegram_offset,
            get_sync_config,
            set_sync_config,
            backup_database_now,
            restore_database_from_telegram,
            send_raw_request,
            get_store_value,
            set_store_value,
            delete_store_value,
            get_config_version,
            run_legacy_config_cleanup_once,
            add_completed_task,
            get_task_history,
            clear_task_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
