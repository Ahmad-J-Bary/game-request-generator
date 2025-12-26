// src-tauri/src/main.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod models;
mod services;

use std::sync::Mutex;
use tauri::Manager;

use db::Database;

use chrono::Datelike;

use models::account::{Account, CreateAccountRequest, UpdateAccountRequest};
use models::game::{CreateGameRequest, Game, UpdateGameRequest};
use models::level::{CreateLevelRequest, Level, UpdateLevelRequest};
use models::progress::*;
use models::purchase_event::{
    CreatePurchaseEventRequest, PurchaseEvent, UpdatePurchaseEventRequest,
};

use services::account_service::AccountService;
use services::game_service::GameService;
use services::level_service::LevelService;
use services::progress_service::ProgressService;
use services::purchase_event_service::PurchaseEventService;

// === حالة التطبيق ===
struct AppState {
    db: Mutex<Database>,
}

fn main() {
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
            // أوامر الألعاب
            add_game,
            get_games,
            get_game_by_id,
            update_game,
            delete_game,
            // أوامر المستويات
            add_level,
            get_game_levels,
            get_level_by_id,
            update_level,
            delete_level,
            // أوامر الحسابات
            add_account,
            get_accounts,
            get_account_by_id,
            update_account,
            delete_account,
            // أوامر أحداث الشراء
            add_purchase_event,
            get_game_purchase_events,
            get_purchase_event_by_id,
            update_purchase_event,
            delete_purchase_event,
            // أوامر تقدم المستويات
            create_level_progress,
            update_level_progress,
            get_account_level_progress,
            // أوامر تقدم أحداث الشراء
            create_purchase_event_progress,
            update_purchase_event_progress,
            get_account_purchase_event_progress,
            // أوامر الطلبات اليومية
            get_daily_requests,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ==================== أوامر الألعاب ====================
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

    // Get account details
    let account_service = AccountService::new();
    let account = account_service
        .get_account_by_id(conn, account_id)
        .map_err(|_| "Account not found".to_string())?
        .ok_or("Account not found".to_string())?;

    // Parse dates - try multiple formats
    let account_start_date = if account.start_date.contains('-') && account.start_date.len() <= 6 {
        // Handle DD-MMM format by assuming current year
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

    // Calculate days passed
    let days_passed = (target_date_parsed - account_start_date).num_days();
    if days_passed < 0 {
        return Err("Target date is before account start date".to_string());
    }

    // Get game levels
    let level_service = LevelService::new();
    let levels = level_service
        .get_levels_by_game(conn, account.game_id)
        .map_err(|_| "Failed to get game levels".to_string())?;

    // Get existing progress
    let progress_service = ProgressService::new();
    let level_progress = progress_service
        .get_account_level_progress(conn, account_id)
        .map_err(|_| "Failed to get level progress".to_string())?;

    let completed_level_ids: std::collections::HashSet<i64> = level_progress
        .into_iter()
        .filter(|p| p.is_completed)
        .map(|p| p.level_id)
        .collect();

    // Find levels due today
    let mut due_levels = Vec::new();
    for level in levels {
        if level.days_offset as i64 == days_passed && !completed_level_ids.contains(&level.id) {
            due_levels.push(level);
        }
    }

    // Generate requests
    let mut requests = Vec::new();

    for level in due_levels {
        // Calculate time_spent: (base_time + offset) * 1000 + random
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let offset = rng.gen_range(-1..=1); // -1, 0, or 1
        let adjusted_time = (level.time_spent as i32) + offset;
        let multiplied_time = adjusted_time * 1000;
        let random_addition = rng.gen_range(0..1000);
        let time_spent = multiplied_time + random_addition;

        // Get request template based on game
        let game_service = GameService::new();
        let _game = game_service
            .get_game_by_id(conn, account.game_id)
            .map_err(|_| "Failed to get game".to_string())?
            .ok_or("Game not found".to_string())?;

        // Generate complete HTTP request with correct event_token and time_spent
        // Generate complete HTTP request with correct event_token and time_spent
        // Sanitize event_token to remove any _day suffix
        let clean_event_token = level
            .event_token
            .split("_day")
            .next()
            .unwrap_or(&level.event_token);

        // Use the account's request template
        let mut request_content = account.request_template.clone();

        // Replace placeholders in the request template
        request_content = request_content.replace("{event_token}", &clean_event_token);
        request_content = request_content.replace("{time_spent}", &time_spent.to_string());

        // Additional placeholders that might be useful
        request_content = request_content.replace("{account_name}", &account.name);
        request_content = request_content.replace("{game_id}", &account.game_id.to_string());
        request_content = request_content.replace("{level_name}", &level.level_name);
        request_content = request_content.replace("{days_offset}", &level.days_offset.to_string());

        // If the template doesn't contain Content-Length header, calculate it
        if !request_content.contains("Content-Length:") && request_content.contains("\n\n") {
            let parts: Vec<&str> = request_content.split("\n\n").collect();
            if parts.len() >= 2 {
                let headers = parts[0];
                let body = parts[1];
                let content_length_line = format!("Content-Length: {}", body.len());

                // Insert Content-Length header before the body
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

        // Create Event HTTP request (only for regular levels)
        if level.level_name != "-" {
            // Use the same template but modify for event request
            let mut event_request_content = account.request_template.clone();

            // Replace placeholders for event request
            event_request_content = event_request_content.replace("{event_token}", &clean_event_token);
            event_request_content = event_request_content.replace("{time_spent}", &time_spent.to_string());

            // Additional placeholders
            event_request_content = event_request_content.replace("{account_name}", &account.name);
            event_request_content = event_request_content.replace("{game_id}", &account.game_id.to_string());
            event_request_content = event_request_content.replace("{level_name}", &level.level_name);
            event_request_content = event_request_content.replace("{days_offset}", &level.days_offset.to_string());

            // Change POST /session to POST /event if needed
            event_request_content = event_request_content.replace("POST /session", "POST /event");

            // If the template doesn't contain Content-Length header, calculate it
            if !event_request_content.contains("Content-Length:") && event_request_content.contains("\n\n") {
                let parts: Vec<&str> = event_request_content.split("\n\n").collect();
                if parts.len() >= 2 {
                    let headers = parts[0];
                    let body = parts[1];
                    let content_length_line = format!("Content-Length: {}", body.len());

                    // Insert Content-Length header before the body
                    event_request_content = format!("{}\n{}\n\n{}", headers, content_length_line, body);
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

    // Get purchase events
    let purchase_event_service = PurchaseEventService::new();
    let purchase_events = purchase_event_service
        .get_purchase_events_by_game(conn, account.game_id)
        .map_err(|_| "Failed to get purchase events".to_string())?;

    let purchase_events_map: std::collections::HashMap<i64, PurchaseEvent> =
        purchase_events.into_iter().map(|pe| (pe.id, pe)).collect();

    // Get purchase event progress
    let purchase_progress = progress_service
        .get_account_purchase_event_progress(conn, account_id)
        .map_err(|_| "Failed to get purchase event progress".to_string())?;

    for p in purchase_progress {
        if p.days_offset as i64 == days_passed && !p.is_completed {
            if let Some(event) = purchase_events_map.get(&p.purchase_event_id) {
                let time_spent = p.time_spent;
                let clean_event_token = &event.event_token;

                // Use the account's request template for purchase events
                let mut purchase_request_content = account.request_template.clone();

                // Replace placeholders for purchase event
                purchase_request_content = purchase_request_content.replace("{event_token}", clean_event_token);
                purchase_request_content = purchase_request_content.replace("{time_spent}", &time_spent.to_string());

                // Additional placeholders
                purchase_request_content = purchase_request_content.replace("{account_name}", &account.name);
                purchase_request_content = purchase_request_content.replace("{game_id}", &account.game_id.to_string());
                purchase_request_content = purchase_request_content.replace("{level_name}", &event.event_token); // Use event token as level name for purchase events
                purchase_request_content = purchase_request_content.replace("{days_offset}", &p.days_offset.to_string());

                // If the template doesn't contain Content-Length header, calculate it
                if !purchase_request_content.contains("Content-Length:") && purchase_request_content.contains("\n\n") {
                    let parts: Vec<&str> = purchase_request_content.split("\n\n").collect();
                    if parts.len() >= 2 {
                        let headers = parts[0];
                        let body = parts[1];
                        let content_length_line = format!("Content-Length: {}", body.len());

                        // Insert Content-Length header before the body
                        purchase_request_content = format!("{}\n{}\n\n{}", headers, content_length_line, body);
                    }
                }

                requests.push(serde_json::json!({
                    "request_type": "session",
                    "content": purchase_request_content.clone(),
                    "event_token": clean_event_token,
                    "level_id": null, // No level ID for purchase events
                    "time_spent": time_spent,
                    "timestamp": target_date
                }));

                // Create Event HTTP request for purchase events
                let mut purchase_event_request_content = purchase_request_content.clone();
                purchase_event_request_content = purchase_event_request_content.replace("POST /session", "POST /event");

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
