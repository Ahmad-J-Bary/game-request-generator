// src-tauri/src/services/game_service.rs

use rusqlite::{params, OptionalExtension, Connection};
use crate::models::game::{Game, CreateGameRequest, UpdateGameRequest};

pub struct GameService;

impl GameService {
    pub fn new() -> Self {
        GameService
    }

    pub fn create_game(&self, conn: &Connection, request: CreateGameRequest) -> Result<i64, String> {
        conn.execute(
            "INSERT INTO games (name) VALUES (?1)",
            params![request.name],
        )
        .map_err(|e| format!("Failed to create game: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_games(&self, conn: &Connection) -> Result<Vec<Game>, String> {
        let mut stmt = conn
            .prepare("SELECT id, name, created_at FROM games ORDER BY name")
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let games_iter = stmt
            .query_map([], |row| {
                Ok(Game {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2).ok(),
                })
            })
            .map_err(|e| format!("Failed to query games: {}", e))?;

        let mut games = Vec::new();
        for game in games_iter {
            games.push(game.map_err(|e| format!("Failed to map game: {}", e))?);
        }

        Ok(games)
    }

    pub fn get_game_by_id(&self, conn: &Connection, id: i64) -> Result<Option<Game>, String> {
        conn.query_row(
            "SELECT id, name, created_at FROM games WHERE id = ?1",
            params![id],
            |row| {
                Ok(Game {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2).ok(),
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to get game: {}", e))
    }

    pub fn update_game(&self, conn: &Connection, request: UpdateGameRequest) -> Result<bool, String> {
        if let Some(name) = request.name {
            conn.execute(
                "UPDATE games SET name = ?1 WHERE id = ?2",
                params![name, request.id],
            )
            .map_err(|e| format!("Failed to update game: {}", e))?;

            return Ok(conn.changes() > 0);
        }
        Ok(false)
    }

    pub fn delete_game(&self, conn: &Connection, id: i64) -> Result<bool, String> {
        conn.execute("DELETE FROM games WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete game: {}", e))?;

        Ok(conn.changes() > 0)
    }
}
