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

        let content = format!("country=US&api_level=32&hardware_name=star2qltechn-user+12+PQ3B.190801.10101846+1201240816+release-keys&partner_params=%7B%22refid%22%3A%22MKIyV-dDvZ%22%2C%22gid%22%3A%229%22%2C%22cli%22%3A%220%22%2C%22b%22%3A%22710%22%2C%22evty%22%3A%22install%22%2C%22dtflag%22%3A%22false%22%7D&app_version=1.710.0&app_token=brmx7fdxeakg&wait_total=0.0&device_type=tablet&language=en&gps_adid=9bfd8c4a-88ef-43a9-879a-9962c8762d9e&foreground=1&connectivity_type=1&mcc=310&os_build=PQ3B.190801.10101846&cpu_type=x86_64&retry_count=0&screen_size=large&gps_adid_src=service&subsession_count=1&wait_time=0.0&first_error=0&sent_at=2025-12-14T08%3A08%3A02.716Z-0800&offline_mode_enabled=0&screen_density=high&session_count=1&ui_mode=1&enqueue_size=1&gps_adid_attempt=1&event_count=3&session_length=13&created_at=2025-12-14T08%3A08%3A02.582Z-0800&device_manufacturer=samsung&display_width=1080&event_token={}&time_spent={}&google_app_set_id=f4abf4a9-1d63-9101-c9fa-cdd013eab7da&device_name=SM-S9180&needs_response_details=1&screen_format=long&last_error=0&mnc=02&queue_size=1&os_version=12&android_uuid=dc6c341f-f08c-43b9-9c94-40ee3241fcad&environment=production&attribution_deeplink=1&display_height=1920&package_name=in.playsimple.wordtrip&os_name=android&tracking_enabled=1", clean_event_token, time_spent);

        // Create Session HTTP request
        let session_content = format!("POST /session HTTP/2\nHost: app.adjust.net.in\nClient-Sdk: android5.1.0\nAuthorization: Signature signature=\"3B5462966501B95D3037E13F55DDCC99C35EC36DD39EBEEE9EDFA996407E7A9BA045107CCE5E47C96BCB0199994E4BD6474969FB10CE7E052E99736AC25437212AF027C3D2D4A7AEA5F78B5C273948B0C0DDF32BD292C26515E77753D0D82E27172F0F89145615A8C19FC39825521BBCDD6697C406B1452FDDA3BF65D1D6CF2AF21D12FA0A58FF8998189FCC6A613E64F49E55FBDE66113A8C0BBA357018977844F4EBF824C1C5B66F5B59764FD307186741C180D5934683791A7CDB9E10D9D8E8971C040B9C3EBEA3E63583F8E5680C\"\nContent-Type: application/x-www-form-urlencoded\nUser-Agent: Dalvik/2.1.0 (Linux; U; Android 12; SM-S9180 Build/PQ3B.190801.10101846)\nConnection: Keep-Alive\nAccept-Encoding: gzip, deflate, br\nContent-Length: {}\n\n{}", content.len(), content);

        requests.push(serde_json::json!({
            "request_type": "session",
            "content": session_content,
            "event_token": clean_event_token,
            "level_id": level.id,
            "time_spent": time_spent,
            "timestamp": target_date
        }));

        // Create Event HTTP request (only for regular levels)
        if level.level_name != "-" {
            let event_content = format!("POST /event HTTP/2\nHost: app.adjust.net.in\nClient-Sdk: android5.1.0\nAuthorization: Signature signature=\"3B5462966501B95D3037E13F55DDCC99C35EC36DD39EBEEE9EDFA996407E7A9BA045107CCE5E47C96BCB0199994E4BD6474969FB10CE7E052E99736AC25437212AF027C3D2D4A7AEA5F78B5C273948B0C0DDF32BD292C26515E77753D0D82E27172F0F89145615A8C19FC39825521BBCDD6697C406B1452FDDA3BF65D1D6CF2AF21D12FA0A58FF8998189FCC6A613E64F49E55FBDE66113A8C0BBA357018977844F4EBF824C1C5B66F5B59764FD307186741C180D5934683791A7CDB9E10D9D8E8971C040B9C3EBEA3E63583F8E5680C\"\nContent-Type: application/x-www-form-urlencoded\nUser-Agent: Dalvik/2.1.0 (Linux; U; Android 12; SM-S9180 Build/PQ3B.190801.10101846)\nConnection: Keep-Alive\nAccept-Encoding: gzip, deflate, br\nContent-Length: {}\n\n{}", content.len(), content);

            requests.push(serde_json::json!({
                "request_type": "event",
                "content": event_content,
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

                let content = format!("country=US&api_level=32&hardware_name=star2qltechn-user+12+PQ3B.190801.10101846+1201240816+release-keys&partner_params=%7B%22refid%22%3A%22MKIyV-dDvZ%22%2C%22gid%22%3A%229%22%2C%22cli%22%3A%220%22%2C%22b%22%3A%22710%22%2C%22evty%22%3A%22install%22%2C%22dtflag%22%3A%22false%22%7D&app_version=1.710.0&app_token=brmx7fdxeakg&wait_total=0.0&device_type=tablet&language=en&gps_adid=9bfd8c4a-88ef-43a9-879a-9962c8762d9e&foreground=1&connectivity_type=1&mcc=310&os_build=PQ3B.190801.10101846&cpu_type=x86_64&retry_count=0&screen_size=large&gps_adid_src=service&subsession_count=1&wait_time=0.0&first_error=0&sent_at=2025-12-14T08%3A08%3A02.716Z-0800&offline_mode_enabled=0&screen_density=high&session_count=1&ui_mode=1&enqueue_size=1&gps_adid_attempt=1&event_count=3&session_length=13&created_at=2025-12-14T08%3A08%3A02.582Z-0800&device_manufacturer=samsung&display_width=1080&event_token={}&time_spent={}&google_app_set_id=f4abf4a9-1d63-9101-c9fa-cdd013eab7da&device_name=SM-S9180&needs_response_details=1&screen_format=long&last_error=0&mnc=02&queue_size=1&os_version=12&android_uuid=dc6c341f-f08c-43b9-9c94-40ee3241fcad&environment=production&attribution_deeplink=1&display_height=1920&package_name=in.playsimple.wordtrip&os_name=android&tracking_enabled=1", clean_event_token, time_spent);

                // Create Session HTTP request
                let session_content = format!("POST /session HTTP/2\nHost: app.adjust.net.in\nClient-Sdk: android5.1.0\nAuthorization: Signature signature=\"3B5462966501B95D3037E13F55DDCC99C35EC36DD39EBEEE9EDFA996407E7A9BA045107CCE5E47C96BCB0199994E4BD6474969FB10CE7E052E99736AC25437212AF027C3D2D4A7AEA5F78B5C273948B0C0DDF32BD292C26515E77753D0D82E27172F0F89145615A8C19FC39825521BBCDD6697C406B1452FDDA3BF65D1D6CF2AF21D12FA0A58FF8998189FCC6A613E64F49E55FBDE66113A8C0BBA357018977844F4EBF824C1C5B66F5B59764FD307186741C180D5934683791A7CDB9E10D9D8E8971C040B9C3EBEA3E63583F8E5680C\"\nContent-Type: application/x-www-form-urlencoded\nUser-Agent: Dalvik/2.1.0 (Linux; U; Android 12; SM-S9180 Build/PQ3B.190801.10101846)\nConnection: Keep-Alive\nAccept-Encoding: gzip, deflate, br\nContent-Length: {}\n\n{}", content.len(), content);

                requests.push(serde_json::json!({
                    "request_type": "session",
                    "content": session_content,
                    "event_token": clean_event_token,
                    "level_id": null, // No level ID for purchase events
                    "time_spent": time_spent,
                    "timestamp": target_date
                }));

                // Create Event HTTP request
                let event_content = format!("POST /event HTTP/2\nHost: app.adjust.net.in\nClient-Sdk: android5.1.0\nAuthorization: Signature signature=\"3B5462966501B95D3037E13F55DDCC99C35EC36DD39EBEEE9EDFA996407E7A9BA045107CCE5E47C96BCB0199994E4BD6474969FB10CE7E052E99736AC25437212AF027C3D2D4A7AEA5F78B5C273948B0C0DDF32BD292C26515E77753D0D82E27172F0F89145615A8C19FC39825521BBCDD6697C406B1452FDDA3BF65D1D6CF2AF21D12FA0A58FF8998189FCC6A613E64F49E55FBDE66113A8C0BBA357018977844F4EBF824C1C5B66F5B59764FD307186741C180D5934683791A7CDB9E10D9D8E8971C040B9C3EBEA3E63583F8E5680C\"\nContent-Type: application/x-www-form-urlencoded\nUser-Agent: Dalvik/2.1.0 (Linux; U; Android 12; SM-S9180 Build/PQ3B.190801.10101846)\nConnection: Keep-Alive\nAccept-Encoding: gzip, deflate, br\nContent-Length: {}\n\n{}", content.len(), content);

                requests.push(serde_json::json!({
                    "request_type": "event",
                    "content": event_content,
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
