// src-tauri/src/lib.rs

use std::sync::Mutex;
use tauri::Manager;
use std::path::Path;

use grq_engine::db::Database;
use chrono::Datelike;

use grq_engine::models::account::{Account, CreateAccountRequest, UpdateAccountRequest};
use grq_engine::models::game::{CreateGameRequest, Game, UpdateGameRequest};
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
use grq_engine::services::level_service::LevelService;
use grq_engine::services::progress_service::ProgressService;
use grq_engine::services::purchase_event_service::PurchaseEventService;

use grq_engine::db::config::ConfigService;

// === حالة التطبيق ===
struct AppState {
    db: Mutex<Database>,
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
        data_dir.join("database.sqlite").to_string_lossy().to_string()
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
fn export_database(
    app: tauri::AppHandle,
    dest_path: String,
) -> Result<(), String> {
    let config = ConfigService::load(&app);
    let internal_db_path = if let Some(path) = config.db_path {
        path
    } else {
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        data_dir.join("database.sqlite").to_string_lossy().to_string()
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
        data_dir.join("database.sqlite").to_string_lossy().to_string()
    };

    // Close existing DB connections before replacing the file
    let _guard = state.db.lock().unwrap();

    std::fs::write(&internal_db_path, bytes)
        .map_err(|e| format!("Failed to write imported database: {}", e))?;

    Ok(())
}

#[tauri::command]
fn export_database_to_bytes(
    app: tauri::AppHandle,
) -> Result<Vec<u8>, String> {
    let config = ConfigService::load(&app);
    let internal_db_path = if let Some(path) = config.db_path {
        path
    } else {
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        data_dir.join("database.sqlite").to_string_lossy().to_string()
    };

    std::fs::read(&internal_db_path)
        .map_err(|e| format!("Failed to read internal database: {}", e))
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

// ==================== أوامر المستويات ====================
#[tauri::command]
fn add_level(state: tauri::State<AppState>, request: CreateLevelRequest) -> Result<i64, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = LevelService::new();
    service.create_level(conn, request)
}

#[tauri::command]
fn get_game_levels(state: tauri::State<AppState>, game_id: i64) -> Result<Vec<Level>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = LevelService::new();
    service.get_levels_by_game(conn, game_id)
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
    game_id: i64,
) -> Result<Vec<PurchaseEvent>, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = PurchaseEventService::new();
    service.get_purchase_events_by_game(conn, game_id)
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
fn update_level_progress(
    state: tauri::State<AppState>,
    request: UpdateAccountLevelProgressRequest,
) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = ProgressService::new();
    service.update_level_progress(conn, request)
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
    state: tauri::State<AppState>,
    request: UpdateAccountPurchaseEventProgressRequest,
) -> Result<bool, String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.get_connection();
    let service = ProgressService::new();
    service.update_purchase_event_progress(conn, request)
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
        .get_levels_by_game(conn, account.game_id)
        .map_err(|_| "Failed to get game levels".to_string())?;

    let progress_service = ProgressService::new();
    let level_progress = progress_service
        .get_account_level_progress(conn, account_id)
        .map_err(|_| "Failed to get level progress".to_string())?;

    let completed_level_ids: std::collections::HashSet<i64> = level_progress
        .into_iter()
        .filter(|p| p.is_completed)
        .map(|p| p.level_id)
        .collect();

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

    let mut due_levels = Vec::new();
    for level in all_levels {
        if level.days_offset as i64 == days_passed && !completed_level_ids.contains(&level.id) {
            due_levels.push(level);
        }
    }

    let mut requests = Vec::new();

    for level in due_levels {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let base_time = level.time_spent;
        let jitter = if base_time < 25 {
            rng.gen_range(-100..=500)
        } else {
            rng.gen_range(-750..=1500)
        };
        let time_spent = (base_time as i64 * 1000) + jitter as i64;

        let game_service = GameService::new();
        let _game = game_service
            .get_game_by_id(conn, account.game_id)
            .map_err(|_| "Failed to get game".to_string())?
            .ok_or("Game not found".to_string())?;

        let clean_event_token = level
            .event_token
            .split("_day")
            .next()
            .unwrap_or(&level.event_token);

        let mut request_content = account.request_template.clone();

        request_content = request_content.replace("{event_token}", &clean_event_token);
        request_content = request_content.replace("{time_spent}", &time_spent.to_string());
        request_content = request_content.replace("{account_name}", &account.name);
        request_content = request_content.replace("{game_id}", &account.game_id.to_string());
        request_content = request_content.replace("{level_name}", &level.level_name);
        request_content = request_content.replace("{days_offset}", &level.days_offset.to_string());

        if !request_content.contains("Content-Length:") && request_content.contains("\n\n") {
            let parts: Vec<&str> = request_content.split("\n\n").collect();
            if parts.len() >= 2 {
                let headers = parts[0];
                let body = parts[1];
                let content_length_line = format!("Content-Length: {}", body.len());
                request_content = format!("{}\n{}\n\n{}", headers, content_length_line, body);
            }
        }

        requests.push(serde_json::json!({
            "request_type": "session",
            "content": request_content,
            "event_token": clean_event_token,
            "level_id": level.id,
            "time_spent": time_spent,
            "timestamp": target_date
        }));

        if level.level_name != "-" {
            let mut event_request_content = account.request_template.clone();
            event_request_content =
                event_request_content.replace("{event_token}", &clean_event_token);
            event_request_content =
                event_request_content.replace("{time_spent}", &time_spent.to_string());
            event_request_content = event_request_content.replace("{account_name}", &account.name);
            event_request_content =
                event_request_content.replace("{game_id}", &account.game_id.to_string());
            event_request_content =
                event_request_content.replace("{level_name}", &level.level_name);
            event_request_content =
                event_request_content.replace("{days_offset}", &level.days_offset.to_string());

            event_request_content = event_request_content.replace("POST /session", "POST /event");

            if !event_request_content.contains("Content-Length:")
                && event_request_content.contains("\n\n")
            {
                let parts: Vec<&str> = event_request_content.split("\n\n").collect();
                if parts.len() >= 2 {
                    let headers = parts[0];
                    let body = parts[1];
                    let content_length_line = format!("Content-Length: {}", body.len());
                    event_request_content =
                        format!("{}\n{}\n\n{}", headers, content_length_line, body);
                }
            }

            requests.push(serde_json::json!({
                "request_type": "event",
                "content": event_request_content,
                "event_token": clean_event_token,
                "level_id": level.id,
                "time_spent": time_spent,
                "timestamp": target_date
            }));
        }
    }

    let purchase_event_service = PurchaseEventService::new();
    let purchase_events = purchase_event_service
        .get_purchase_events_by_game(conn, account.game_id)
        .map_err(|_| "Failed to get purchase events".to_string())?;

    let purchase_progress = progress_service
        .get_account_purchase_event_progress(conn, account_id)
        .map_err(|_| "Failed to get purchase event progress".to_string())?;

    let progress_map: std::collections::HashMap<i64, &AccountPurchaseEventProgress> =
        purchase_progress
            .iter()
            .map(|p| (p.purchase_event_id, p))
            .collect();

    for event in purchase_events {
        let effective_offset = if let Some(prog) = progress_map.get(&event.id) {
            Some(prog.days_offset)
        } else {
            event.days_offset
        };

        if let Some(event_day_offset) = effective_offset {
            let is_completed = if let Some(prog) = progress_map.get(&event.id) {
                prog.is_completed
            } else {
                false
            };

            if event_day_offset as i64 == days_passed && !is_completed {
                let mut calculated_time: i32 = 0;
                let mut sorted_levels = levels.clone();
                sorted_levels.sort_by_key(|l| l.days_offset);

                let same_day_levels: Vec<&Level> = sorted_levels
                    .iter()
                    .filter(|l| l.days_offset == event_day_offset)
                    .collect();

                let next_level = sorted_levels
                    .iter()
                    .find(|l| l.days_offset > event_day_offset);

                let mut levels_to_average = Vec::new();
                levels_to_average.extend(same_day_levels);
                if let Some(nl) = next_level {
                    levels_to_average.push(nl);
                }

                if !levels_to_average.is_empty() {
                    let total_time: i32 = levels_to_average.iter().map(|l| l.time_spent).sum();
                    calculated_time =
                        (total_time as f64 / levels_to_average.len() as f64).round() as i32;
                }

                if calculated_time == 0 {
                    calculated_time = 243;
                }

                use rand::Rng;
                let mut rng = rand::thread_rng();
                let base_time = calculated_time;
                let jitter = if base_time < 25 {
                    rng.gen_range(-100..=500)
                } else {
                    rng.gen_range(-750..=1500)
                };
                let time_spent = (base_time as i64 * 1000) + jitter as i64;

                let clean_event_token = &event.event_token;

                let mut purchase_request_content = account.request_template.clone();

                purchase_request_content =
                    purchase_request_content.replace("{event_token}", clean_event_token);
                purchase_request_content =
                    purchase_request_content.replace("{time_spent}", &time_spent.to_string());
                purchase_request_content =
                    purchase_request_content.replace("{account_name}", &account.name);
                purchase_request_content =
                    purchase_request_content.replace("{game_id}", &account.game_id.to_string());
                purchase_request_content =
                    purchase_request_content.replace("{level_name}", &event.event_token);
                purchase_request_content = purchase_request_content
                    .replace("{days_offset}", &event_day_offset.to_string());

                if !purchase_request_content.contains("Content-Length:")
                    && purchase_request_content.contains("\n\n")
                {
                    let parts: Vec<&str> = purchase_request_content.split("\n\n").collect();
                    if parts.len() >= 2 {
                        let headers = parts[0];
                        let body = parts[1];
                        let content_length_line = format!("Content-Length: {}", body.len());
                        purchase_request_content =
                            format!("{}\n{}\n\n{}", headers, content_length_line, body);
                    }
                }

                requests.push(serde_json::json!({
                    "request_type": "session",
                    "content": purchase_request_content.clone(),
                    "event_token": clean_event_token,
                    "level_id": null,
                    "time_spent": time_spent,
                    "timestamp": target_date
                }));

                let mut purchase_event_request_content = purchase_request_content.clone();
                purchase_event_request_content =
                    purchase_event_request_content.replace("POST /session", "POST /event");

                if !purchase_event_request_content.contains("Content-Length:")
                    && purchase_event_request_content.contains("\n\n")
                {
                    let parts: Vec<&str> = purchase_event_request_content.split("\n\n").collect();
                    if parts.len() >= 2 {
                        let headers = parts[0];
                        let body = parts[1];
                        let content_length_line = format!("Content-Length: {}", body.len());
                        purchase_event_request_content =
                            format!("{}\n{}\n\n{}", headers, content_length_line, body);
                    }
                }

                requests.push(serde_json::json!({
                    "request_type": "event",
                    "content": purchase_event_request_content,
                    "event_token": clean_event_token,
                    "level_id": null,
                    "time_spent": time_spent,
                    "timestamp": target_date
                }));
            }
        }
    }

    let response = serde_json::json!({
        "account_id": account_id,
        "account_name": account.name,
        "target_date": target_date,
        "days_passed": days_passed,
        "requests": requests
    });

    Ok(response)
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
