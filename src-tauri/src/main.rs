// src-tauri/src/main.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod models;
mod services;

use chrono::Datelike;
use db::Database;
use services::account_service::AccountService;
use services::game_service::GameService;
use services::level_service::LevelService;
use services::progress_service::ProgressService;
use services::purchase_event_service::PurchaseEventService;
use tauri::Manager;

use crate::models::account::{Account, CreateAccountRequest, UpdateAccountRequest};
use crate::models::game::{CreateGameRequest, Game, UpdateGameRequest};
use crate::models::level::{CreateLevelRequest, Level, UpdateLevelRequest};
use crate::models::progress::{
    AccountLevelProgress, AccountPurchaseEventProgress, CreateAccountLevelProgressRequest,
    CreateAccountPurchaseEventProgressRequest, UpdateAccountLevelProgressRequest,
    UpdateAccountPurchaseEventProgressRequest,
};
use crate::models::purchase_event::{
    CreatePurchaseEventRequest, PurchaseEvent, UpdatePurchaseEventRequest,
};

struct AppState {
    db: Database,
}

fn main() {
    dotenv::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle();

            // Async implementation for SQLx setup
            tauri::async_runtime::block_on(async move {
                let db = Database::new()
                    .await
                    .expect("Failed to connect to Supabase");
                handle.manage(AppState { db });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // الألعاب
            add_game,
            get_games,
            get_game_by_id,
            update_game,
            delete_game,
            // المستويات
            add_level,
            get_game_levels,
            get_level_by_id,
            update_level,
            delete_level,
            // الحسابات
            add_account,
            get_accounts,
            get_account_by_id,
            update_account,
            delete_account,
            // أحداث الشراء
            add_purchase_event,
            get_game_purchase_events,
            get_purchase_event_by_id,
            update_purchase_event,
            delete_purchase_event,
            // تقدم المستويات
            create_level_progress,
            update_level_progress,
            get_account_level_progress,
            // تقدم أحداث الشراء
            create_purchase_event_progress,
            update_purchase_event_progress,
            get_account_purchase_event_progress,
            // الطلبات اليومية
            get_daily_requests,
            // استيراد القوالب
            import_request_templates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ==================== أوامر الألعاب ====================
#[tauri::command]
async fn add_game(
    state: tauri::State<'_, AppState>,
    request: CreateGameRequest,
) -> Result<i64, String> {
    let pool = state.db.get_pool();
    let service = GameService::new();
    service.create_game(pool, request).await
}

#[tauri::command]
async fn get_games(state: tauri::State<'_, AppState>) -> Result<Vec<Game>, String> {
    let pool = state.db.get_pool();
    let service = GameService::new();
    service.get_games(pool).await
}

#[tauri::command]
async fn get_game_by_id(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> Result<Option<Game>, String> {
    let pool = state.db.get_pool();
    let service = GameService::new();
    service.get_game_by_id(pool, id).await
}

#[tauri::command]
async fn update_game(
    state: tauri::State<'_, AppState>,
    request: UpdateGameRequest,
) -> Result<bool, String> {
    let pool = state.db.get_pool();
    let service = GameService::new();
    service.update_game(pool, request).await
}

#[tauri::command]
async fn delete_game(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.get_pool();
    let service = GameService::new();
    service.delete_game(pool, id).await
}

// ==================== أوامر المستويات ====================
#[tauri::command]
async fn add_level(
    state: tauri::State<'_, AppState>,
    request: CreateLevelRequest,
) -> Result<i64, String> {
    let pool = state.db.get_pool();
    let service = LevelService::new();
    service.create_level(pool, request).await
}

#[tauri::command]
async fn get_game_levels(
    state: tauri::State<'_, AppState>,
    game_id: i64,
) -> Result<Vec<Level>, String> {
    let pool = state.db.get_pool();
    let service = LevelService::new();
    service.get_levels_by_game(pool, game_id).await
}

#[tauri::command]
async fn get_level_by_id(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> Result<Option<Level>, String> {
    let pool = state.db.get_pool();
    let service = LevelService::new();
    service.get_level_by_id(pool, id).await
}

#[tauri::command]
async fn update_level(
    state: tauri::State<'_, AppState>,
    request: UpdateLevelRequest,
) -> Result<bool, String> {
    let pool = state.db.get_pool();
    let service = LevelService::new();
    service.update_level(pool, request).await
}

#[tauri::command]
async fn delete_level(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.get_pool();
    let service = LevelService::new();
    service.delete_level(pool, id).await
}

// ==================== أوامر الحسابات ====================
#[tauri::command]
async fn add_account(
    state: tauri::State<'_, AppState>,
    request: CreateAccountRequest,
) -> Result<i64, String> {
    let pool = state.db.get_pool();
    let service = AccountService::new();
    service.create_account(pool, request).await
}

#[tauri::command]
async fn get_accounts(
    state: tauri::State<'_, AppState>,
    game_id: i64,
) -> Result<Vec<Account>, String> {
    let pool = state.db.get_pool();
    let service = AccountService::new();
    service.get_accounts_by_game(pool, game_id).await
}

#[tauri::command]
async fn get_account_by_id(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> Result<Option<Account>, String> {
    let pool = state.db.get_pool();
    let service = AccountService::new();
    service.get_account_by_id(pool, id).await
}

#[tauri::command]
async fn update_account(
    state: tauri::State<'_, AppState>,
    request: UpdateAccountRequest,
) -> Result<bool, String> {
    let pool = state.db.get_pool();
    let service = AccountService::new();
    service.update_account(pool, request).await
}

#[tauri::command]
async fn delete_account(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.get_pool();
    let service = AccountService::new();
    service.delete_account(pool, id).await
}

// ==================== أوامر أحداث الشراء ====================
#[tauri::command]
async fn add_purchase_event(
    state: tauri::State<'_, AppState>,
    request: CreatePurchaseEventRequest,
) -> Result<i64, String> {
    let pool = state.db.get_pool();
    let service = PurchaseEventService::new();
    service.create_purchase_event(pool, request).await
}

#[tauri::command]
async fn get_game_purchase_events(
    state: tauri::State<'_, AppState>,
    game_id: i64,
) -> Result<Vec<PurchaseEvent>, String> {
    let pool = state.db.get_pool();
    let service = PurchaseEventService::new();
    service.get_purchase_events_by_game(pool, game_id).await
}

#[tauri::command]
async fn get_purchase_event_by_id(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> Result<Option<PurchaseEvent>, String> {
    let pool = state.db.get_pool();
    let service = PurchaseEventService::new();
    service.get_purchase_event_by_id(pool, id).await
}

#[tauri::command]
async fn update_purchase_event(
    state: tauri::State<'_, AppState>,
    request: UpdatePurchaseEventRequest,
) -> Result<bool, String> {
    let pool = state.db.get_pool();
    let service = PurchaseEventService::new();
    service.update_purchase_event(pool, request).await
}

#[tauri::command]
async fn delete_purchase_event(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.get_pool();
    let service = PurchaseEventService::new();
    service.delete_purchase_event(pool, id).await
}

// ==================== أوامر تقدم المستويات ====================
#[tauri::command]
async fn create_level_progress(
    state: tauri::State<'_, AppState>,
    request: CreateAccountLevelProgressRequest,
) -> Result<(), String> {
    let pool = state.db.get_pool();
    let service = ProgressService::new();
    service.create_or_update_level_progress(pool, request).await
}

#[tauri::command]
async fn update_level_progress(
    state: tauri::State<'_, AppState>,
    request: UpdateAccountLevelProgressRequest,
) -> Result<bool, String> {
    let pool = state.db.get_pool();
    let service = ProgressService::new();
    service.update_level_progress(pool, request).await
}

#[tauri::command]
async fn get_account_level_progress(
    state: tauri::State<'_, AppState>,
    account_id: i64,
) -> Result<Vec<AccountLevelProgress>, String> {
    let pool = state.db.get_pool();
    let service = ProgressService::new();
    service.get_account_level_progress(pool, account_id).await
}

// ==================== أوامر تقدم أحداث الشراء ====================
#[tauri::command]
async fn create_purchase_event_progress(
    state: tauri::State<'_, AppState>,
    request: CreateAccountPurchaseEventProgressRequest,
) -> Result<(), String> {
    let pool = state.db.get_pool();
    let service = ProgressService::new();
    service
        .create_or_update_purchase_event_progress(pool, request)
        .await
}

#[tauri::command]
async fn update_purchase_event_progress(
    state: tauri::State<'_, AppState>,
    request: UpdateAccountPurchaseEventProgressRequest,
) -> Result<bool, String> {
    let pool = state.db.get_pool();
    let service = ProgressService::new();
    service.update_purchase_event_progress(pool, request).await
}

#[tauri::command]
async fn get_account_purchase_event_progress(
    state: tauri::State<'_, AppState>,
    account_id: i64,
) -> Result<Vec<AccountPurchaseEventProgress>, String> {
    let pool = state.db.get_pool();
    let service = ProgressService::new();
    service
        .get_account_purchase_event_progress(pool, account_id)
        .await
}

// ==================== أوامر الطلبات اليومية ====================
#[tauri::command]
async fn get_daily_requests(
    state: tauri::State<'_, AppState>,
    account_id: i64,
    target_date: String,
) -> Result<serde_json::Value, String> {
    let pool = state.db.get_pool();

    // Get account details
    let account_service = AccountService::new();
    let account = account_service
        .get_account_by_id(pool, account_id)
        .await
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
        .get_levels_by_game(pool, account.game_id)
        .await
        .map_err(|_| "Failed to get game levels".to_string())?;

    // Get existing progress
    let progress_service = ProgressService::new();
    let level_progress = progress_service
        .get_account_level_progress(pool, account_id)
        .await
        .map_err(|_| "Failed to get level progress".to_string())?;

    let completed_level_ids: std::collections::HashSet<i64> = level_progress
        .into_iter()
        .filter(|p| p.is_completed)
        .map(|p| p.level_id)
        .collect();

    // Generate synthetic sessions for all missing days within the observed range
    let mut all_levels = levels.clone();
    let numeric_levels: Vec<&models::level::Level> = levels.iter().collect();
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
                // Find the next real level after this day
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

                    // Check if this synthetic level appears before any real level in the dataset
                    let first_real_day = *existing_days.iter().min().unwrap();
                    let is_before_first_real = day < first_real_day;

                    if is_before_first_real {
                        // Apply cumulative percentage to the first level event: (target_time - 0) / (first_real_day - (-1)) = target_time / (first_real_day + 1)
                        let increment = next_level.time_spent as f64 / (first_real_day + 1) as f64;
                        time = (day + 1) as f64 * increment;
                    } else {
                        // Normal interpolation between adjacent real levels
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

                    // Create a synthetic level
                    let synthetic_level = models::level::Level {
                        id: -(day as i64), // Use negative ID to indicate synthetic
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

    // Find levels due today (including synthetic ones)
    let mut due_levels = Vec::new();
    for level in all_levels {
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
            event_request_content =
                event_request_content.replace("{event_token}", &clean_event_token);
            event_request_content =
                event_request_content.replace("{time_spent}", &time_spent.to_string());

            // Additional placeholders
            event_request_content = event_request_content.replace("{account_name}", &account.name);
            event_request_content =
                event_request_content.replace("{game_id}", &account.game_id.to_string());
            event_request_content =
                event_request_content.replace("{level_name}", &level.level_name);
            event_request_content =
                event_request_content.replace("{days_offset}", &level.days_offset.to_string());

            // Change POST /session to POST /event if needed
            event_request_content = event_request_content.replace("POST /session", "POST /event");

            // If the template doesn't contain Content-Length header, calculate it
            if !event_request_content.contains("Content-Length:")
                && event_request_content.contains("\n\n")
            {
                let parts: Vec<&str> = event_request_content.split("\n\n").collect();
                if parts.len() >= 2 {
                    let headers = parts[0];
                    let body = parts[1];
                    let content_length_line = format!("Content-Length: {}", body.len());

                    // Insert Content-Length header before the body
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

    // Get purchase events
    let purchase_event_service = PurchaseEventService::new();
    let purchase_events = purchase_event_service
        .get_purchase_events_by_game(pool, account.game_id)
        .await
        .map_err(|_| "Failed to get purchase events".to_string())?;

    // Get purchase event progress
    let purchase_progress = progress_service
        .get_account_purchase_event_progress(pool, account_id)
        .await
        .map_err(|_| "Failed to get purchase event progress".to_string())?;

    // Create a map of progress for quick lookup
    let progress_map: std::collections::HashMap<
        i64,
        &models::progress::AccountPurchaseEventProgress,
    > = purchase_progress
        .iter()
        .map(|p| (p.purchase_event_id, p))
        .collect();

    for event in purchase_events {
        // Determine the effective days_offset (from progress override or event default)
        // If progress exists, use its days_offset (whether it's completed or not, though completed are filtered later)
        // If no progress, use event default

        let effective_offset = if let Some(prog) = progress_map.get(&event.id) {
            Some(prog.days_offset)
        } else {
            event.days_offset
        };

        // Check if the event is scheduled for today (matches days_passed)
        if let Some(event_day_offset) = effective_offset {
            // Check if completed
            let is_completed = if let Some(prog) = progress_map.get(&event.id) {
                prog.is_completed
            } else {
                false
            };

            if event_day_offset as i64 == days_passed && !is_completed {
                // Calculate time_spent dynamically based on adjacent levels
                // Logic mirrors frontend GameDetailPage.tsx calculation
                let mut calculated_time: i32 = 0;

                // Filter real levels (ignore synthetic ones if any were mixed in, though 'levels' here are from DB)
                let mut sorted_levels = levels.clone();
                sorted_levels.sort_by_key(|l| l.days_offset);

                // Find all levels on the same day
                let same_day_levels: Vec<&models::level::Level> = sorted_levels
                    .iter()
                    .filter(|l| l.days_offset == event_day_offset)
                    .collect();

                // Find the next level after this day
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

                // If calculation failed (e.g. no levels), fallback to some default or 0?
                // The prompt implies it should be automatic based on position.
                // If there are no levels, we might default to a non-zero value or kept 0.
                if calculated_time == 0 {
                    calculated_time = 243; // Default fallback similar to frontend
                }

                // Apply randomized multiplier (Logic from level events)
                use rand::Rng;
                let mut rng = rand::thread_rng();
                let offset = rng.gen_range(-1..=1); // -1, 0, or 1
                let adjusted_time = calculated_time + offset;
                let multiplied_time = adjusted_time * 1000;
                let random_addition = rng.gen_range(0..1000);
                let time_spent = multiplied_time + random_addition;

                let clean_event_token = &event.event_token;

                // Use the account's request template for purchase events
                let mut purchase_request_content = account.request_template.clone();

                // Replace placeholders for purchase event
                purchase_request_content =
                    purchase_request_content.replace("{event_token}", clean_event_token);
                purchase_request_content =
                    purchase_request_content.replace("{time_spent}", &time_spent.to_string());

                // Additional placeholders
                purchase_request_content =
                    purchase_request_content.replace("{account_name}", &account.name);
                purchase_request_content =
                    purchase_request_content.replace("{game_id}", &account.game_id.to_string());
                purchase_request_content =
                    purchase_request_content.replace("{level_name}", &event.event_token); // Use event token as level name for purchase events
                purchase_request_content = purchase_request_content
                    .replace("{days_offset}", &event_day_offset.to_string());

                // If the template doesn't contain Content-Length header, calculate it
                if !purchase_request_content.contains("Content-Length:")
                    && purchase_request_content.contains("\n\n")
                {
                    let parts: Vec<&str> = purchase_request_content.split("\n\n").collect();
                    if parts.len() >= 2 {
                        let headers = parts[0];
                        let body = parts[1];
                        let content_length_line = format!("Content-Length: {}", body.len());

                        // Insert Content-Length header before the body
                        purchase_request_content =
                            format!("{}\n{}\n\n{}", headers, content_length_line, body);
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
                purchase_event_request_content =
                    purchase_event_request_content.replace("POST /session", "POST /event");

                // Recalculate Content-Length for event request as well if body changed (it shouldn't here really, but good practice)
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

    // Open file dialog to select multiple .txt files
    let files = app
        .dialog()
        .file()
        .add_filter("Text", &["txt"])
        .blocking_pick_files();

    if let Some(files) = files {
        let pool = state.db.get_pool();
        let account_service = AccountService::new();
        let mut results = serde_json::Map::new();

        // Get all accounts for the game to match filenames
        let accounts = account_service
            .get_accounts_by_game(pool, game_id)
            .await
            .map_err(|e| format!("Failed to get accounts: {}", e))?;

        for file_path in files {
            // Read file content
            let path = file_path
                .as_path()
                .ok_or("Failed to get file path".to_string())?;
            let content =
                std::fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;

            // Extract filename without extension (to match account name)
            let filename = path
                .file_stem()
                .and_then(|s: &std::ffi::OsStr| s.to_str())
                .ok_or("Invalid filename")?;

            // Find matching account
            if let Some(account) = accounts
                .iter()
                .find(|a| a.name.eq_ignore_ascii_case(filename))
            {
                // Update account with request template
                let update_request = UpdateAccountRequest {
                    id: account.id,
                    name: None,
                    start_date: None,
                    start_time: None,
                    request_template: Some(content),
                };

                match account_service.update_account(pool, update_request).await {
                    Ok(_) => {
                        results.insert(
                            filename.to_string(),
                            serde_json::Value::String("Success".to_string()),
                        );
                    }
                    Err(e) => {
                        results.insert(
                            filename.to_string(),
                            serde_json::Value::String(format!("Error: {}", e)),
                        );
                    }
                }
            } else {
                results.insert(
                    filename.to_string(),
                    serde_json::Value::String("Skipped: Account not found".to_string()),
                );
            }
        }

        Ok(serde_json::Value::Object(results))
    } else {
        Ok(serde_json::Value::Null)
    }
}
