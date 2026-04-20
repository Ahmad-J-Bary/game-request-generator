// crates/grq-engine/src/models/history.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompletedDailyTask {
    pub id: String,
    pub account_id: i64,
    pub account_name: String,
    pub game_id: i64,
    pub game_name: String,
    pub event_token: String,
    pub time_spent: i64,
    pub completion_time: i64, // Milliseconds since epoch
    pub completion_date: String, // YYYY-MM-DD
    pub completed_at: Option<String>, // Full timestamp
    pub level_id: Option<i64>,
    pub level_name: Option<String>,
    pub request_type: String,
    pub is_purchase: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddCompletedTaskRequest {
    pub id: String,
    pub account_id: i64,
    pub account_name: String,
    pub game_id: i64,
    pub game_name: String,
    pub event_token: String,
    pub time_spent: i64,
    pub completion_time: i64,
    pub completion_date: String,
    pub level_id: Option<i64>,
    pub level_name: Option<String>,
    pub request_type: String,
    pub is_purchase: bool,
}
