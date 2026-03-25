// src-tauri/src/models/purchase_event.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PurchaseEvent {
    pub id: i64,
    pub game_id: i64,
    pub event_token: String,
    pub is_restricted: bool,
    pub max_days_offset: Option<i32>,
    pub days_offset: Option<i32>,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePurchaseEventRequest {
    pub game_id: i64,
    pub event_token: String,
    pub is_restricted: bool,
    pub max_days_offset: Option<i32>,
    pub days_offset: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePurchaseEventRequest {
    pub id: i64,
    pub event_token: Option<String>,
    pub is_restricted: Option<bool>,
    pub max_days_offset: Option<i32>,
    pub days_offset: Option<i32>,
}
