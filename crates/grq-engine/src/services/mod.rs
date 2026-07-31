// src-tauri/src/services/mod.rs

pub mod game_service;
pub mod account_service;
pub mod level_service;
pub mod purchase_event_service;
pub mod progress_service;
pub mod telegram_service;
pub mod history_service;

#[cfg(test)]
pub mod account_service_tests;

#[cfg(test)]
pub mod progress_service_tests;
