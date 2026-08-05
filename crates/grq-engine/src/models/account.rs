// src-tauri/src/models/account.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub id: i64,
    pub game_id: i64,
    pub branch_id: Option<i64>,
    pub branch_name: Option<String>,
    pub name: String,
    pub start_date: String,
    pub start_time: String,
    pub request_template: String,
    pub created_at: Option<String>,
    pub package_id: Option<i32>,
    pub proxy_state: Option<String>,
}

pub const PROXY_STATES: &[&str] = &["FLORIDA", "CALIFORNIA", "TEXAS", "New York"];

#[derive(Debug, Deserialize)]
pub struct CreateAccountRequest {
    pub game_id: i64,
    pub branch_id: Option<i64>,
    pub name: String,
    pub start_date: String,
    pub start_time: String,
    pub request_template: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct UpdateAccountRequest {
    pub id: i64,
    pub branch_id: Option<i64>,
    pub name: Option<String>,
    pub start_date: Option<String>,
    pub start_time: Option<String>,
    pub request_template: Option<String>,
    pub proxy_state: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountBranchTransferResult {
    pub account_id: i64,
    pub account_name: String,
    pub source_branch_id: Option<i64>,
    pub source_branch_name: Option<String>,
    pub target_branch_id: i64,
    pub target_branch_name: String,
    pub transferred_levels: usize,
    pub transferred_purchase_events: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransferPreview {
    pub matched_levels: Vec<String>,
    pub missing_levels: Vec<String>,
    pub matched_purchase_events: Vec<String>,
    pub missing_purchase_events: Vec<String>,
    pub total_source_levels: usize,
    pub total_target_levels: usize,
    pub total_source_purchase_events: usize,
    pub total_target_purchase_events: usize,
}