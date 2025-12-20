// src-tauri/src/models/level.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Level {
    pub id: i64,
    pub game_id: i64,
    pub event_token: String,
    pub level_name: String,
    pub days_offset: i32,
    pub time_spent: i32,
    pub is_bonus: bool,  // جديد: هل هو ليفل Bonus
}

#[derive(Debug, Deserialize)]
pub struct CreateLevelRequest {
    pub game_id: i64,
    pub event_token: String,
    pub level_name: String,
    pub days_offset: i32,
    pub time_spent: i32,
    pub is_bonus: bool,  // جديد
}

#[derive(Debug, Deserialize)]
pub struct UpdateLevelRequest {
    pub id: i64,
    pub game_id: Option<i64>,
    pub event_token: Option<String>,
    pub level_name: Option<String>,
    pub days_offset: Option<i32>,
    pub time_spent: Option<i32>,
    pub is_bonus: Option<bool>,  // جديد
}
