// src-tauri/src/main.rs

#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

fn main() {
    game_request_generator_lib::run();
}
