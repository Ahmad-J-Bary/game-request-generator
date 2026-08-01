//! Shared types for the request generation engine.
//!
//! The planner (`plan::plan_daily_requests`) is the single source of truth for
//! deciding the final type of every request; this module only defines the
//! vocabulary it emits.

use serde::Serialize;

/// Strip the `_day{N}` suffix from an event token, yielding its base token.
pub fn base_token_of(token: &str) -> &str {
    match token.find("_day") {
        Some(idx) => &token[..idx],
        None => token,
    }
}

/// Final request type, decided once per (token, day) group by the planner.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestType {
    SessionOnly,
    LevelSession,
    LevelEvent,
    PurchaseSession,
    PurchaseEvent,
}

impl RequestType {
    pub fn as_str(self) -> &'static str {
        match self {
            RequestType::SessionOnly => "Session Only",
            RequestType::LevelSession => "Level Session",
            RequestType::LevelEvent => "Level Event",
            RequestType::PurchaseSession => "Purchase Session",
            RequestType::PurchaseEvent => "Purchase Event",
        }
    }
}

/// A single generated request in its final, normalized form. Mirrors the
/// `DailyRequest` shape consumed by the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct DailyRequest {
    pub request_type: String,
    pub content: String,
    pub event_token: String,
    pub level_id: Option<i64>,
    pub time_spent: i64,
    pub timestamp: String,
}
