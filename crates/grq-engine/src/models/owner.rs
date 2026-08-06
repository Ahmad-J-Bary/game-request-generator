// src-tauri/src/models/owner.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Owner {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateOwnerRequest {
    pub name: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct UpdateOwnerRequest {
    pub id: i64,
    pub name: Option<String>,
}