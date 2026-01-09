// src-tauri/src/models/account.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub id: i64,
    pub game_id: i64,
    pub name: String,
    pub start_date: String,
    pub start_time: String,
    pub request_template: String,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAccountRequest {
    pub game_id: i64,
    pub name: String,
    pub start_date: String,
    pub start_time: String,
    pub request_template: String,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct UpdateAccountRequest {
    pub id: i64,
    pub name: Option<String>,
    pub start_date: Option<String>,
    pub start_time: Option<String>,
    pub request_template: Option<String>,
}
