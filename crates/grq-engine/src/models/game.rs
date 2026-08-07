// src-tauri/src/models/game.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Game {
    pub id: i64,
    pub name: String,
    pub package_name: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameBranch {
    pub id: i64,
    pub game_id: i64,
    pub name: String,
    pub is_default: bool,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGameRequest {
    pub name: String,
    pub package_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGameRequest {
    pub id: i64,
    pub name: Option<String>,
    pub package_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBranchRequest {
    pub game_id: i64,
    pub name: String,
    pub copy_from_branch_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBranchRequest {
    pub id: i64,
    pub name: Option<String>,
}