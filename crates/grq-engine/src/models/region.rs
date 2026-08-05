// src-tauri/src/models/region.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Region {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub is_primary: bool,
    pub sort_order: i64,
    pub emoji: Option<String>,
    pub color: Option<String>,
    pub created_at: Option<String>,
}

/// Color keys used across the app (badges, cards, dashboard). The frontend maps
/// each key to concrete Tailwind classes; new regions auto-assign from here in
/// sort order so user-created regions stay styled.
pub const REGION_PALETTE: &[&str] = &[
    "orange", "blue", "red", "purple", "teal", "green", "pink", "yellow", "indigo", "cyan",
];

#[derive(Debug, Deserialize)]
pub struct CreateRegionRequest {
    pub name: String,
    pub parent_id: Option<i64>,
    pub emoji: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct UpdateRegionRequest {
    pub id: i64,
    pub name: Option<String>,
    pub parent_id: Option<i64>,
    pub emoji: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<i64>,
}
