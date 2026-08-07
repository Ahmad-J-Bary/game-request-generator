// src-tauri/src/services/game_service.rs

use rusqlite::{params, OptionalExtension, Connection};
use crate::models::game::{Game, CreateGameRequest, UpdateGameRequest, GameBranch, CreateBranchRequest, UpdateBranchRequest};

pub struct GameService;

impl GameService {
    pub fn new() -> Self {
        GameService
    }

    pub fn create_game(&self, conn: &Connection, request: CreateGameRequest) -> Result<i64, String> {
        let package_name = request
            .package_name
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .ok_or_else(|| "Package name is required. Please enter the game's package name.".to_string())?;

        Self::ensure_package_unique(conn, &package_name, None)?;

        // Use a transaction to ensure both game and default branch are created
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

        tx.execute(
            "INSERT INTO games (name, package_name) VALUES (?1, ?2)",
            params![request.name, package_name],
        )
        .map_err(|e| format!("Failed to create game: {}", e))?;

        let game_id = tx.last_insert_rowid();

        // Create the default branch for the new game
        tx.execute(
            "INSERT INTO game_branches (game_id, name, is_default) VALUES (?1, ?2, ?3)",
            params![game_id, "Default", 1],
        )
        .map_err(|e| format!("Failed to create default branch: {}", e))?;

        tx.commit().map_err(|e| e.to_string())?;

        Ok(game_id)
    }

    pub fn get_games(&self, conn: &Connection) -> Result<Vec<Game>, String> {
        let mut stmt = conn
            .prepare("SELECT id, name, package_name, created_at FROM games ORDER BY name")
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let games_iter = stmt
            .query_map([], |row| {
                Ok(Game {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    package_name: row.get(2).ok(),
                    created_at: row.get(3).ok(),
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
            "SELECT id, name, package_name, created_at FROM games WHERE id = ?1",
            params![id],
            |row| {
                Ok(Game {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    package_name: row.get(2).ok(),
                    created_at: row.get(3).ok(),
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to get game: {}", e))
    }

    pub fn update_game(&self, conn: &Connection, request: UpdateGameRequest) -> Result<bool, String> {
        let mut changed = false;

        if let Some(name) = request.name {
            conn.execute(
                "UPDATE games SET name = ?1 WHERE id = ?2",
                params![name, request.id],
            )
            .map_err(|e| format!("Failed to update game name: {}", e))?;
            changed = true;
        }

        if let Some(package_name) = request.package_name {
            let package_name = package_name.trim().to_string();

            // The stored package is authoritative once set: it may only be
            // assigned to a game that does not have one yet (legacy games).
            // It can never be changed or cleared afterwards.
            let current: Option<String> = conn
                .query_row(
                    "SELECT package_name FROM games WHERE id = ?1",
                    params![request.id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| format!("Failed to read game package_name: {}", e))?
                .flatten();

            if package_name.is_empty() {
                if current.is_some() {
                    return Err(
                        "The game's package name is locked and cannot be removed.".to_string(),
                    );
                }
                return Ok(changed);
            }

            if let Some(existing) = current {
                if existing.trim().eq_ignore_ascii_case(&package_name) {
                    return Ok(changed);
                }
                return Err(format!(
                    "The game's package name (\"{}\") is locked and cannot be changed.",
                    existing.trim()
                ));
            }

            Self::ensure_package_unique(conn, &package_name, Some(request.id))?;

            conn.execute(
                "UPDATE games SET package_name = ?1 WHERE id = ?2",
                params![package_name, request.id],
            )
            .map_err(|e| format!("Failed to update game package_name: {}", e))?;
            changed = true;
        }

        Ok(changed)
    }

    pub fn delete_game(&self, conn: &Connection, id: i64) -> Result<bool, String> {
        conn.execute("DELETE FROM games WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete game: {}", e))?;

        Ok(conn.changes() > 0)
    }

    /// Ensures no other game already stores the same package_name
    /// (case-insensitive). `exclude_id` is the game being updated, if any.
    fn ensure_package_unique(
        conn: &Connection,
        package_name: &str,
        exclude_id: Option<i64>,
    ) -> Result<(), String> {
        let duplicate: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, name FROM games
                 WHERE lower(trim(package_name)) = lower(trim(?1))
                   AND (?2 IS NULL OR id != ?2)
                 LIMIT 1",
                params![package_name, exclude_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| format!("Failed to check package uniqueness: {}", e))?;

        if let Some((_, game_name)) = duplicate {
            return Err(format!(
                "Package name \"{}\" is already in use by game \"{}\".",
                package_name, game_name
            ));
        }

        Ok(())
    }

    // --- Branch Methods ---

    pub fn get_branches(&self, conn: &Connection, game_id: i64) -> Result<Vec<GameBranch>, String> {
        let mut stmt = conn
            .prepare("SELECT id, game_id, name, is_default, created_at FROM game_branches WHERE game_id = ?1 ORDER BY is_default DESC, name")
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let branches_iter = stmt
            .query_map(params![game_id], |row| {
                Ok(GameBranch {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    name: row.get(2)?,
                    is_default: row.get::<_, i32>(3)? != 0,
                    created_at: row.get(4).ok(),
                })
            })
            .map_err(|e| format!("Failed to query branches: {}", e))?;

        let mut branches = Vec::new();
        for branch in branches_iter {
            branches.push(branch.map_err(|e| format!("Failed to map branch: {}", e))?);
        }

        Ok(branches)
    }

    pub fn create_branch(&self, conn: &Connection, request: CreateBranchRequest) -> Result<i64, String> {
        // 1. Create the branch
        conn.execute(
            "INSERT INTO game_branches (game_id, name, is_default) VALUES (?1, ?2, ?3)",
            params![request.game_id, request.name, 0],
        )
        .map_err(|e| format!("Failed to create branch: {}", e))?;

        let new_branch_id = conn.last_insert_rowid();

        // 2. Duplicate data if requested
        if let Some(source_branch_id) = request.copy_from_branch_id {
            // Duplicate levels
            conn.execute(
                "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset, time_spent, is_bonus)
                 SELECT game_id, ?1, event_token, level_name, days_offset, time_spent, is_bonus
                 FROM levels WHERE branch_id = ?2",
                params![new_branch_id, source_branch_id],
            )
            .map_err(|e| format!("Failed to duplicate levels: {}", e))?;

            // Duplicate purchase events
            conn.execute(
                "INSERT INTO purchase_events (game_id, branch_id, event_token, is_restricted, max_days_offset, days_offset)
                 SELECT game_id, ?1, event_token, is_restricted, max_days_offset, days_offset
                 FROM purchase_events WHERE branch_id = ?2",
                params![new_branch_id, source_branch_id],
            )
            .map_err(|e| format!("Failed to duplicate purchase events: {}", e))?;

            // Per-token rule: a copied standalone Session ('-') must never coexist
            // with a copied Level Event sharing the same base token on the same day.
            crate::db::connection::cleanup_branch_session_levels(conn, new_branch_id)
                .map_err(|e| format!("Failed to clean up copied branch sessions: {}", e))?;
        }

        Ok(new_branch_id)
    }

    pub fn update_branch(&self, conn: &Connection, request: UpdateBranchRequest) -> Result<bool, String> {
        if let Some(name) = request.name {
            conn.execute(
                "UPDATE game_branches SET name = ?1 WHERE id = ?2",
                params![name, request.id],
            )
            .map_err(|e| format!("Failed to update branch: {}", e))?;

            return Ok(conn.changes() > 0);
        }
        Ok(false)
    }

    pub fn delete_branch(&self, conn: &Connection, id: i64) -> Result<bool, String> {
        // Check if it's a default branch
        let is_default: bool = conn.query_row(
            "SELECT is_default FROM game_branches WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check branch type: {}", e))?;

        if is_default {
            return Err("Cannot delete the default branch".to_string());
        }

        // Before deleting, find the default branch for this game to move accounts to
        let game_id: i64 = conn.query_row(
            "SELECT game_id FROM game_branches WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

        let default_branch_id: i64 = conn.query_row(
            "SELECT id FROM game_branches WHERE game_id = ?1 AND is_default = 1",
            params![game_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

        // Move accounts back to default branch
        conn.execute(
            "UPDATE accounts SET branch_id = ?1 WHERE branch_id = ?2",
            params![default_branch_id, id],
        )
        .map_err(|e| e.to_string())?;

        // Delete the branch (cascade will take care of levels and purchase events)
        conn.execute("DELETE FROM game_branches WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete branch: {}", e))?;

        Ok(conn.changes() > 0)
    }
}
