// src-tauri/src/lib.rs

use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

use chrono::Datelike;
use grq_engine::db::Database;
use serde::Deserialize;

use grq_engine::models::account::{
    Account, AccountBranchTransferResult, CreateAccountRequest, TransferPreview,
    UpdateAccountRequest,
};
use grq_engine::models::game::{
    CreateBranchRequest, CreateGameRequest, Game, GameBranch, UpdateBranchRequest,
    UpdateGameRequest,
};
use grq_engine::models::history::{AddCompletedTaskRequest, CompletedDailyTask};
use grq_engine::models::level::{CreateLevelRequest, Level, UpdateLevelRequest};
use grq_engine::models::maintenance_log::MaintenanceLog;
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
use grq_engine::services::maintenance_log_service::MaintenanceLogService;
use grq_engine::services::progress_service::ProgressService;
use grq_engine::services::purchase_event_service::PurchaseEventService;

use grq_engine::db::config::ConfigService;
use grq_engine::db::key_value::KeyValueService;
use grq_engine::services::telegram_service::TelegramService;
use rusqlite::params;

// === حالة التطبيق ===
struct AppState {
    db: Mutex<Database>,
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

async fn execute_hall_of_fame_send_clear(app: &tauri::AppHandle) -> Result<(usize, usize), String> {
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

    let _ = db.reclaim_space()?;

    Ok((completed_accounts.len(), completed_accounts.len()))
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
async fn send_and_clear_hall_of_fame(
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (sent, deleted) = execute_hall_of_fame_send_clear(&app).await?;

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

// ==================== أوامر النسخ الاحتياطي المحلي ====================
fn resolve_backup_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let config = ConfigService::load(app);
    if config.backup_use_same_location || config.backup_custom_path.is_none() {
        let db_path = resolve_internal_db_path(app)?;
        let dir = db_path.parent().ok_or("DB path has no parent")?;
        Ok(dir.to_path_buf())
    } else {
        Ok(std::path::PathBuf::from(
            config.backup_custom_path.as_ref().unwrap(),
        ))
    }
}

fn files_identical(path1: &std::path::Path, path2: &std::path::Path) -> bool {
    let meta1 = match std::fs::metadata(path1) {
        Ok(m) => m,
        Err(_) => return false,
    };
    let meta2 = match std::fs::metadata(path2) {
        Ok(m) => m,
        Err(_) => return false,
    };
    if meta1.len() != meta2.len() {
        return false;
    }
    let content1 = match std::fs::read(path1) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let content2 = match std::fs::read(path2) {
        Ok(c) => c,
        Err(_) => return false,
    };
    content1 == content2
}

fn find_latest_backup(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut latest: Option<(chrono::NaiveDateTime, std::path::PathBuf)> = None;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if let Some(ts) = name
                        .strip_prefix("backup_")
                        .and_then(|s| s.strip_suffix(".sqlite"))
                    {
                        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(ts, "%Y%m%d_%H%M%S") {
                            if latest.as_ref().map_or(true, |(t, _)| dt > *t) {
                                latest = Some((dt, path));
                            }
                        }
                    }
                }
            }
        }
    }
    latest.map(|(_, p)| p)
}

fn cleanup_old_backups(dir: &std::path::Path) -> Result<(), String> {
    let today = chrono::Local::now().format("%Y%m%d").to_string();
    let today_date = chrono::NaiveDate::parse_from_str(&today, "%Y%m%d")
        .map_err(|e| format!("Failed to parse today date: {}", e))?;
    let cutoff = today_date - chrono::Duration::days(1);

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if let Some(date_str) = name.strip_prefix("backup_").and_then(|s| s.get(..8)) {
                        if let Ok(file_date) = chrono::NaiveDate::parse_from_str(date_str, "%Y%m%d")
                        {
                            if file_date < cutoff {
                                let _ = std::fs::remove_file(&path);
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

fn perform_backup_if_needed(app: &tauri::AppHandle) -> Result<(), String> {
    let config = ConfigService::load(app);
    let db_path = resolve_internal_db_path(app)?;
    if !db_path.exists() {
        return Ok(());
    }

    let backup_dir = resolve_backup_dir(app)?;
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup dir: {}", e))?;

    let latest = find_latest_backup(&backup_dir);

    let needs_backup = match &latest {
        Some(latest_path) => !files_identical(&db_path, latest_path),
        None => true,
    };

    if needs_backup {
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let backup_filename = format!("backup_{}.sqlite", timestamp);
        let backup_path = backup_dir.join(&backup_filename);
        std::fs::copy(&db_path, &backup_path).map_err(|e| format!("Failed to copy DB: {}", e))?;
    }

    // Cleanup old backups once per day (runs even if no new backup was needed).
    let today = chrono::Local::now().format("%Y%m%d").to_string();
    let last_cleanup = config.backup_last_cleanup_date.clone().unwrap_or_default();
    if last_cleanup != today {
        let _ = cleanup_old_backups(&backup_dir);
        let mut updated = config.clone();
        updated.backup_last_cleanup_date = Some(today);
        ConfigService::save(app, &updated)?;
    }

    Ok(())
}

#[tauri::command]
fn get_backup_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config = ConfigService::load(&app);
    let backup_dir = resolve_backup_dir(&app)
        .ok()
        .map(|p| p.to_string_lossy().to_string());
    let latest = backup_dir
        .as_ref()
        .and_then(|d| find_latest_backup(std::path::Path::new(d)));
    let latest_time = latest.as_ref().and_then(|p| {
        p.metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
    });

    Ok(serde_json::json!({
        "useSameLocation": config.backup_use_same_location,
        "customPath": config.backup_custom_path,
        "backupDir": backup_dir,
        "lastCleanupDate": config.backup_last_cleanup_date,
        "latestBackupTime": latest_time,
    }))
}

#[tauri::command]
fn set_backup_config(
    app: tauri::AppHandle,
    use_same_location: bool,
    custom_path: Option<String>,
) -> Result<(), String> {
    let mut config = ConfigService::load(&app);
    config.backup_use_same_location = use_same_location;
    config.backup_custom_path = if use_same_location { None } else { custom_path };
    ConfigService::save(&app, &config)
}

#[tauri::command]
fn backup_database_local_now(app: tauri::AppHandle) -> Result<(), String> {
    // Force backup even if identical â€” always create a new timestamped copy
    let db_path = resolve_internal_db_path(&app)?;
    let backup_dir = resolve_backup_dir(&app)?;
    std::fs::create_dir_all(&backup_dir).map_err(|_| format!("Failed to create backup dir"))?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("backup_{}.sqlite", timestamp);
    let backup_path = backup_dir.join(&backup_filename);
    std::fs::copy(&db_path, &backup_path).map_err(|e| format!("Failed to copy DB: {}", e))?;
    Ok(())
}

// ==================== أوامر المؤشر والاستيراد الذكي ====================
#[tauri::command]
fn import_database_with_pointer(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    source_path: String,
) -> Result<(), String> {
    let internal_db_path = resolve_internal_db_path(&app)?;
    let backup_dir = resolve_backup_dir(&app)?;
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup dir: {}", e))?;

    let mut config = ConfigService::load(&app);

    // Lock DB to prevent any operations during copy
    let _guard = state.db.lock().unwrap();

    // If no pointer exists, the current DB is the "live" original â€” auto-backup it first
    if config.db_pointer_path.is_none() && config.db_auto_backup_path.is_none() {
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let auto_backup_name = format!("backup_auto_{}.sqlite", timestamp);
        let auto_backup_path = backup_dir.join(&auto_backup_name);
        std::fs::copy(&internal_db_path, &auto_backup_path)
            .map_err(|e| format!("Failed to create auto-backup before import: {}", e))?;
        config.db_auto_backup_path = Some(auto_backup_path.to_string_lossy().to_string());
    }

    // Copy the selected source file over the internal DB
    std::fs::copy(&source_path, &internal_db_path)
        .map_err(|e| format!("Failed to import database from {}: {}", source_path, e))?;

    // Set pointer to the imported source file
    config.db_pointer_path = Some(source_path);
    ConfigService::save(&app, &config)?;

    Ok(())
}

#[tauri::command]
fn restore_from_auto_backup(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let config = ConfigService::load(&app);
    let auto_backup_path = config
        .db_auto_backup_path
        .as_ref()
        .ok_or("No auto-backup found. Import a backup file first.")?;

    let internal_db_path = resolve_internal_db_path(&app)?;
    let source = std::path::Path::new(auto_backup_path);
    if !source.exists() {
        return Err(format!(
            "Auto-backup file no longer exists at: {}",
            auto_backup_path
        ));
    }

    let _guard = state.db.lock().unwrap();
    std::fs::copy(source, &internal_db_path)
        .map_err(|e| format!("Failed to restore from auto-backup: {}", e))?;

    // Clear pointer after restore (DB is back to its pre-import state)
    let mut updated = config.clone();
    updated.db_pointer_path = None;
    updated.db_auto_backup_path = None;
    ConfigService::save(&app, &updated)?;

    Ok(())
}

#[tauri::command]
fn accept_current_as_latest(app: tauri::AppHandle) -> Result<(), String> {
    let mut config = ConfigService::load(&app);
    config.db_pointer_path = None;
    config.db_auto_backup_path = None;
    ConfigService::save(&app, &config)?;
    Ok(())
}

#[tauri::command]
fn get_pointer_info(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let config = ConfigService::load(&app);
    Ok(serde_json::json!({
        "pointerPath": config.db_pointer_path,
        "autoBackupPath": config.db_auto_backup_path,
    }))
}

#[tauri::command]
fn list_backup_files(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let backup_dir = resolve_backup_dir(&app)?;
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    let entries =
        std::fs::read_dir(&backup_dir).map_err(|e| format!("Failed to read backup dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("backup_") && name.ends_with(".sqlite") {
                    if let Some(ts) = name
                        .strip_prefix("backup_")
                        .and_then(|s| s.strip_suffix(".sqlite"))
                    {
                        let label = if let Ok(dt) =
                            chrono::NaiveDateTime::parse_from_str(ts, "%Y%m%d_%H%M%S")
                        {
                            dt.format("%Y-%m-%d %H:%M:%S").to_string()
                        } else {
                            ts.to_string()
                        };

                        if let Ok(meta) = path.metadata() {
                            files.push(serde_json::json!({
                                "name": name,
                                "path": path.to_string_lossy().to_string(),
                                "label": label,
                                "size": meta.len(),
                            }));
                        }
                    }
                }
            }
        }
    }

    // Sort newest first (by filename which starts with timestamp)
    files.sort_by(|a, b| {
        let a_name = a["name"].as_str().unwrap_or("");
        let b_name = b["name"].as_str().unwrap_or("");
        b_name.cmp(a_name)
    });

    Ok(files)
}

// ==================== أوامر المزامنة عن بُعد (Telegram) - ملغاة ====================

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
    let deleted = service.delete_game(conn, id)?;
    let _ = db_guard.reclaim_space()?;
    Ok(deleted)
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
    let deleted = service.delete_branch(conn, id)?;
    let _ = db_guard.reclaim_space()?;
    Ok(deleted)
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

    let service = LevelService::new();
    service.update_level(conn, request)
}

#[tauri::command]
fn delete_level(state: tauri::State<AppState>, id: i64) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = LevelService::new();
    let deleted = service.delete_level(conn, id)?;
    let _ = db_guard.reclaim_space()?;
    Ok(deleted)
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
    let deleted = service.delete_account(conn, id)?;
    let _ = db_guard.reclaim_space()?;
    Ok(deleted)
}

#[tauri::command]
fn transfer_account_branch(
    state: tauri::State<AppState>,
    account_id: i64,
    target_branch_id: i64,
) -> Result<AccountBranchTransferResult, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = AccountService::new();
    service.transfer_account_branch(conn, account_id, target_branch_id)
}

#[tauri::command]
fn preview_transfer_account_branch(
    state: tauri::State<AppState>,
    account_id: i64,
    target_branch_id: i64,
) -> Result<TransferPreview, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = AccountService::new();
    service.preview_transfer_account_branch(conn, account_id, target_branch_id)
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
    let deleted = service.delete_purchase_event(conn, id)?;
    let _ = db_guard.reclaim_space()?;
    Ok(deleted)
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

        // 1. Determine if the whole group is fully completed (then skip it below)
        let mut group_fully_completed = true;
        for l in group_levels {
            if let Some(prog) = level_progress_map.get(&l.id) {
                if !(prog.is_completed && prog.target_date == Some(target_date.clone())) {
                    group_fully_completed = false;
                }
            } else {
                group_fully_completed = false;
            }
        }

        // If the whole group is completed, skip it
        if group_fully_completed {
            continue;
        }

        // 2. RNG for the group's unified pacing time. ONE jitter is drawn per
        // (token, day) group and shared by the Session and its Event, so the two
        // requests always carry the exact same time_spent value.
        let mut rng = rand::thread_rng();

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

        // Compound pair rule: a day with a real Level Event must carry BOTH a
        // Level Session and a Level Event, exactly like a Purchase Event carries
        // a Purchase Session and a Purchase Event. Track whether the group has a
        // real event and/or a stored '-' session so a virtual Session can be
        // synthesized below when the event has no session row yet.
        let mut has_real_level = false;
        let mut has_synthetic_level = false;

        // Unified group pacing (ms): ONE fresh jitter per (token, day), anchored
        // on the first real (event) level so the Session and its Event never
        // show a difference (e.g. base 25s + jitter 441 => 25441 for both).
        let group_time_spent =
            request_time_spent_ms(group_anchor_time(&sorted_group_levels), &mut rng);

        for l in sorted_group_levels {
            // Group-unified time (ms): shared by the Session and its Event.
            let request_time_spent = group_time_spent;

            let mut base_request_content = template.clone();
            base_request_content =
                base_request_content.replace("{event_token}", &clean_event_token);
            base_request_content =
                base_request_content.replace("{time_spent}", &request_time_spent.to_string());
            base_request_content = base_request_content.replace("{account_name}", &account.name);
            base_request_content =
                base_request_content.replace("{game_id}", &account.game_id.to_string());
            base_request_content = base_request_content.replace("{level_name}", &l.level_name);
            base_request_content =
                base_request_content.replace("{days_offset}", &l.days_offset.to_string());

            if l.level_name == "-" {
                has_synthetic_level = true;

                // Generate ONLY Session
                let session_content = process_content_length(base_request_content);
                requests.push(serde_json::json!({
                    "request_type": "session",
                    "content": session_content,
                    "event_token": clean_event_token.clone(),
                    "level_id": l.id,
                    "time_spent": request_time_spent,
                    "timestamp": target_date.clone()
                }));
            } else {
                has_real_level = true;

                // Generate ONLY Event
                let event_content = process_content_length(
                    base_request_content.replace("POST /session", "POST /event"),
                );
                requests.push(serde_json::json!({
                    "request_type": "event",
                    "content": event_content,
                    "event_token": clean_event_token.clone(),
                    "level_id": l.id,
                    "time_spent": request_time_spent,
                    "timestamp": target_date.clone()
                }));
            }
        }

        // Compound pair: when this (token, day) has a real Level Event but no
        // stored '-' session row yet, synthesize a virtual Level Session that
        // shares the group's unified pacing time, so the day emits a compound
        // "Level Session + Level Event" card exactly like a Purchase Event emits
        // "Purchase Session + Purchase Event" (and never a bare Event alone).
        let has_db_session_for_token = all_levels.iter().any(|l| {
            l.level_name == "-"
                && l.event_token.split("_day").next().unwrap_or("") == clean_event_token
                && l.days_offset == level.days_offset
        });

        if has_real_level && !has_synthetic_level && !has_db_session_for_token {
            let mut virtual_content = template.clone();
            virtual_content =
                virtual_content.replace("{event_token}", &clean_event_token);
            virtual_content =
                virtual_content.replace("{time_spent}", &group_time_spent.to_string());
            virtual_content = virtual_content.replace("{account_name}", &account.name);
            virtual_content =
                virtual_content.replace("{game_id}", &account.game_id.to_string());
            virtual_content = virtual_content.replace("{level_name}", "-");
            virtual_content =
                virtual_content.replace("{days_offset}", &level.days_offset.to_string());

            let session_content = process_content_length(virtual_content);
            requests.push(serde_json::json!({
                "request_type": "session",
                "content": session_content,
                "event_token": clean_event_token.clone(),
                "level_id": null,
                "time_spent": group_time_spent,
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
                    if p.time_spent < 10000 {
                        // Heuristic: likely seconds if very small
                        p.time_spent as i64 * 1000
                    } else {
                        p.time_spent as i64
                    }
                } else {
                    // Generate time using timeline-aware averaging logic that includes
                    // session-only days (synthetic '-') between real event anchors.
                    // This matches frontend tables where missing days are represented
                    // by session-only timeline entries.
                    let mut real_sorted_levels: Vec<&Level> =
                        levels.iter().filter(|l| l.level_name != "-").collect();
                    real_sorted_levels.sort_by_key(|l| l.days_offset);

                    let base_time = {
                        if real_sorted_levels.is_empty() {
                            243
                        } else {
                            // Build a virtual timeline that includes missing days between min..max
                            // and assigns them interpolated session-only values.
                            let mut timeline_points: Vec<(i32, i32)> = real_sorted_levels
                                .iter()
                                .map(|l| (l.days_offset, l.time_spent))
                                .collect();

                            let min_day = std::cmp::min(
                                0,
                                timeline_points.first().map(|(d, _)| *d).unwrap_or(0),
                            );
                            let max_day = timeline_points.last().map(|(d, _)| *d).unwrap_or(0);

                            let existing_days: std::collections::HashSet<i32> =
                                timeline_points.iter().map(|(d, _)| *d).collect();

                            for day in min_day..=max_day {
                                if existing_days.contains(&day) {
                                    continue;
                                }

                                let prev = real_sorted_levels
                                    .iter()
                                    .filter(|l| l.days_offset < day)
                                    .max_by_key(|l| l.days_offset);

                                let next = real_sorted_levels
                                    .iter()
                                    .filter(|l| l.days_offset > day)
                                    .min_by_key(|l| l.days_offset);

                                let interpolated = match (prev, next) {
                                    (Some(p), Some(n)) => {
                                        let span = (n.days_offset - p.days_offset) as f64;
                                        if span <= 0.0 {
                                            p.time_spent
                                        } else {
                                            let ratio = (day - p.days_offset) as f64 / span;
                                            (p.time_spent as f64
                                                + ratio * (n.time_spent - p.time_spent) as f64)
                                                .round()
                                                as i32
                                        }
                                    }
                                    (None, Some(n)) => {
                                        // Before first real level: progressive ramp from day 0
                                        let first_real_day = n.days_offset;
                                        if first_real_day <= 0 {
                                            n.time_spent
                                        } else {
                                            ((day + 1) as f64
                                                * (n.time_spent as f64
                                                    / (first_real_day + 1) as f64))
                                                .round()
                                                as i32
                                        }
                                    }
                                    (Some(p), None) => p.time_spent,
                                    (None, None) => 243,
                                };

                                timeline_points.push((day, interpolated));
                            }

                            timeline_points.sort_by_key(|(d, _)| *d);

                            // For purchase day: average same-day timeline entries + next timeline entry.
                            let same_day_levels: Vec<i32> = timeline_points
                                .iter()
                                .filter(|(d, _)| *d == event_day_offset)
                                .map(|(_, t)| *t)
                                .collect();

                            let next_level = timeline_points
                                .iter()
                                .find(|(d, _)| *d > event_day_offset)
                                .map(|(_, t)| *t);

                            let mut levels_to_average = same_day_levels;
                            if let Some(n) = next_level {
                                levels_to_average.push(n);
                            }

                            if !levels_to_average.is_empty() {
                                let total: i32 = levels_to_average.iter().sum();
                                (total as f64 / levels_to_average.len() as f64).round() as i32
                            } else {
                                // Fallback to previous real anchor if no same/next timeline point exists.
                                let prev_level = real_sorted_levels
                                    .iter()
                                    .filter(|l| l.days_offset <= event_day_offset)
                                    .last();
                                prev_level.map(|p| p.time_spent).unwrap_or(243)
                            }
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

/// Interpolates the session-only time (in seconds) for a given day using the
/// surrounding REAL levels (`level_name != "-"`) as anchors. The day itself is
/// treated as missing, so the value is independent of any event that shares the
/// day. Mirrors the synthetic-level interpolation but only for real anchors.
///
/// No longer used by request generation (the virtual session now shares the
/// group's unified time), kept for the interpolation tests.
#[cfg(test)]
fn session_interpolated_time(day: i32, levels: &[Level]) -> i32 {
    let mut real_levels: Vec<&Level> = levels.iter().filter(|l| l.level_name != "-").collect();
    real_levels.sort_by_key(|l| l.days_offset);

    if real_levels.is_empty() {
        return 0;
    }

    let next_level = real_levels
        .iter()
        .filter(|l| l.days_offset > day)
        .min_by_key(|l| l.days_offset)
        .copied();
    let prev_level = real_levels
        .iter()
        .filter(|l| l.days_offset < day)
        .max_by_key(|l| l.days_offset)
        .copied();

    match (prev_level, next_level) {
        (Some(prev), Some(next)) => {
            let ratio =
                (day - prev.days_offset) as f64 / (next.days_offset - prev.days_offset) as f64;
            (prev.time_spent as f64 + ratio * (next.time_spent - prev.time_spent) as f64).round()
                as i32
        }
        (None, Some(next)) => {
            let first_real_day = next.days_offset;
            if first_real_day <= 0 {
                next.time_spent
            } else {
                let increment = next.time_spent as f64 / (first_real_day + 1) as f64;
                ((day + 1) as f64 * increment).round() as i32
            }
        }
        (Some(prev), None) => prev.time_spent,
        (None, None) => 0,
    }
}

/// Returns the allowed jitter range (in ms) for a base time in seconds.
fn jitter_range(base_seconds: i32) -> std::ops::RangeInclusive<i64> {
    if base_seconds < 25 {
        -100..=500
    } else {
        -750..=1500
    }
}

/// Compute a time_spent (in ms) from a base time in seconds plus a fresh random
/// jitter within the allowed range. Called ONCE per (token, day) group so the
/// Session and its Event share the exact same value.
fn request_time_spent_ms(base_seconds: i32, rng: &mut rand::rngs::ThreadRng) -> i64 {
    use rand::Rng;
    let jitter = rng.gen_range(jitter_range(base_seconds));
    (base_seconds as i64 * 1000) + jitter
}

/// Anchor base (seconds) for a request group: the first real (event) level's
/// time, falling back to the session level when the group has no event.
fn group_anchor_time(levels: &[Level]) -> i32 {
    levels
        .iter()
        .find(|l| l.level_name != "-")
        .map(|l| l.time_spent)
        .or_else(|| levels.first().map(|l| l.time_spent))
        .unwrap_or(243)
}

#[tauri::command]
fn add_completed_task(
    state: tauri::State<AppState>,
    request: AddCompletedTaskRequest,
) -> Result<(), String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = HistoryService::new();
    service.upsert_completed_task(conn, request)
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
fn delete_completed_task(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = HistoryService::new();
    service.delete_completed_task(conn, id)
}

#[tauri::command]
fn clear_task_history(state: tauri::State<AppState>) -> Result<(), String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = HistoryService::new();
    service.clear_history(conn)?;
    let _ = db_guard.reclaim_space()?;
    Ok(())
}

// ==================== سجلات صيانة البيانات (maintenance logs) ====================
#[tauri::command]
fn get_maintenance_logs(
    state: tauri::State<AppState>,
    limit: Option<u32>,
) -> Result<Vec<MaintenanceLog>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    MaintenanceLogService::new()
        .get_logs(conn, limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn log_maintenance_event(
    state: tauri::State<AppState>,
    action: String,
    branch_id: Option<i64>,
    level_id: Option<i64>,
    event_token: Option<String>,
    new_event_token: Option<String>,
    days_offset: Option<i32>,
    reason: Option<String>,
    detail: Option<String>,
) -> Result<(), String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    MaintenanceLogService::new()
        .log(
            conn,
            &action,
            branch_id,
            level_id,
            event_token.as_deref(),
            new_event_token.as_deref(),
            days_offset,
            reason.as_deref(),
            detail.as_deref(),
        )
        .map_err(|e| e.to_string())
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

#[tauri::command]
fn write_export_file(path: String, content: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    std::fs::write(&path, &content).map_err(|e| format!("Failed to write file: {e}"))
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

            app.manage(AppState { db: Mutex::new(db) });

            // Local backup check on startup (best effort, synchronous before window opens).
            if let Err(e) = perform_backup_if_needed(app.handle()) {
                eprintln!("⚠️ Startup backup failed: {e}");
            }

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
            transfer_account_branch,
            preview_transfer_account_branch,
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
            get_game_branches,
            add_branch,
            update_branch,
            delete_branch,
            send_excel_to_telegram,
            get_telegram_updates,
            download_telegram_file,
            update_telegram_offset,
            get_store_value,
            set_store_value,
            delete_store_value,
            get_config_version,
            run_legacy_config_cleanup_once,
            add_completed_task,
            get_task_history,
            clear_task_history,
            delete_completed_task,
            get_maintenance_logs,
            log_maintenance_event,
            get_backup_config,
            set_backup_config,
            backup_database_local_now,
            import_database_with_pointer,
            restore_from_auto_backup,
            accept_current_as_latest,
            get_pointer_info,
            list_backup_files,
            write_export_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
#[path = "backup_tests.rs"]
mod backup_tests;

#[cfg(test)]
#[path = "session_time_tests.rs"]
mod session_time_tests;
