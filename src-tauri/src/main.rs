#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod models;
mod services;

use std::sync::Mutex;
use tauri::Manager;

use db::Database;

use models::game::{Game, CreateGameRequest, UpdateGameRequest};
use models::level::{Level, CreateLevelRequest, UpdateLevelRequest};
use models::account::{Account, CreateAccountRequest, UpdateAccountRequest};

use services::game_service::GameService;
use services::level_service::LevelService;
use services::account_service::AccountService;

// === حالة التطبيق ===
struct AppState {
    db: Mutex<Database>, // الآن نخزّن Database بدل Connection
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();

            // إنشاء أو فتح قاعدة البيانات عبر Database wrapper
            let db = Database::new(&handle)?;
            db.init()?; // ينشئ الجداول إن لم تكن موجودة

            app.manage(AppState {
                db: Mutex::new(db),
            });

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// === ألعاب ===
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

// === أوامر المستويات ===
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
fn update_level(state: tauri::State<AppState>, request: UpdateLevelRequest) -> Result<bool, String> {
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

// === أوامر الحسابات ===
#[tauri::command]
fn add_account(state: tauri::State<AppState>, request: CreateAccountRequest) -> Result<i64, String> {
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
fn update_account(state: tauri::State<AppState>, request: UpdateAccountRequest) -> Result<bool, String> {
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