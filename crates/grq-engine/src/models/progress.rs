// src-tauri/src/models/progress.rs

use serde::{Deserialize, Serialize};

// ===== تقدم المستويات =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccountLevelProgress {
    pub account_id: i64,
    pub level_id: i64,
    pub is_completed: bool,
    pub completed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAccountLevelProgressRequest {
    pub account_id: i64,
    pub level_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAccountLevelProgressRequest {
    pub account_id: i64,
    pub level_id: i64,
    pub is_completed: bool,
}

// ===== تقدم أحداث الشراء =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccountPurchaseEventProgress {
    pub account_id: i64,
    pub purchase_event_id: i64,
    pub is_completed: bool,
    pub days_offset: i32,
    pub time_spent: i32,
    pub completed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAccountPurchaseEventProgressRequest {
    pub account_id: i64,
    pub purchase_event_id: i64,
    pub days_offset: i32,
    pub time_spent: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAccountPurchaseEventProgressRequest {
    pub account_id: i64,
    pub purchase_event_id: i64,
    pub is_completed: Option<bool>,
    pub days_offset: Option<i32>,
    pub time_spent: Option<i32>,
}
