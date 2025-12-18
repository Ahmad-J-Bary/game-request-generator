// src-tauri/src/models/game.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Game {
    pub id: i64,
    pub name: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGameRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGameRequest {
    pub id: i64,
    pub name: Option<String>,
}