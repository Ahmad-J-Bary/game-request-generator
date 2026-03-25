// src-tauri/src/services/level_service.rs

use rusqlite::{params, OptionalExtension, Connection};
use crate::models::level::{Level, CreateLevelRequest, UpdateLevelRequest};

pub struct LevelService;

impl LevelService {
    pub fn new() -> Self {
        LevelService
    }

    pub fn create_level(&self, conn: &Connection, request: CreateLevelRequest) -> Result<i64, String> {
        // تحقق من وجود اللعبة
        let game_exists: i64 = conn
            .query_row(
                "SELECT 1 FROM games WHERE id = ?1",
                params![request.game_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to check game existence: {}", e))?
            .unwrap_or(0);

        if game_exists == 0 {
            return Err(format!("Game with ID {} not found", request.game_id));
        }

        conn.execute(
            "INSERT INTO levels (game_id, event_token, level_name, days_offset, time_spent, is_bonus)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                request.game_id,
                request.event_token,
                request.level_name,
                request.days_offset,
                request.time_spent,
                if request.is_bonus { 1 } else { 0 },
            ],
        )
        .map_err(|e| format!("Failed to create level: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_levels_by_game(&self, conn: &Connection, game_id: i64) -> Result<Vec<Level>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, game_id, event_token, level_name, days_offset, time_spent, is_bonus
                 FROM levels WHERE game_id = ?1 ORDER BY days_offset",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let levels_iter = stmt
            .query_map(params![game_id], |row| {
                Ok(Level {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    event_token: row.get(2)?,
                    level_name: row.get(3)?,
                    days_offset: row.get(4)?,
                    time_spent: row.get(5)?,
                    is_bonus: row.get::<_, i32>(6)? != 0,
                })
            })
            .map_err(|e| format!("Failed to query levels: {}", e))?;

        let mut levels = Vec::new();
        for level in levels_iter {
            levels.push(level.map_err(|e| format!("Failed to map level: {}", e))?);
        }

        Ok(levels)
    }

    pub fn get_level_by_id(&self, conn: &Connection, id: i64) -> Result<Option<Level>, String> {
        conn.query_row(
            "SELECT id, game_id, event_token, level_name, days_offset, time_spent, is_bonus 
             FROM levels WHERE id = ?1",
            params![id],
            |row| {
                Ok(Level {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    event_token: row.get(2)?,
                    level_name: row.get(3)?,
                    days_offset: row.get(4)?,
                    time_spent: row.get(5)?,
                    is_bonus: row.get::<_, i32>(6)? != 0,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to get level: {}", e))
    }

    pub fn update_level(&self, conn: &Connection, request: UpdateLevelRequest) -> Result<bool, String> {
        let mut updates = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(game_id) = request.game_id {
            updates.push("game_id = ?");
            values.push(Box::new(game_id));
        }

        if let Some(event_token) = request.event_token {
            updates.push("event_token = ?");
            values.push(Box::new(event_token));
        }

        if let Some(level_name) = request.level_name {
            updates.push("level_name = ?");
            values.push(Box::new(level_name));
        }

        if let Some(days_offset) = request.days_offset {
            updates.push("days_offset = ?");
            values.push(Box::new(days_offset));
        }

        if let Some(time_spent) = request.time_spent {
            updates.push("time_spent = ?");
            values.push(Box::new(time_spent));
        }

        if let Some(is_bonus) = request.is_bonus {
            updates.push("is_bonus = ?");
            values.push(Box::new(if is_bonus { 1 } else { 0 }));
        }

        if updates.is_empty() {
            return Ok(false);
        }

        let sql = format!("UPDATE levels SET {} WHERE id = ?", updates.join(", "));
        values.push(Box::new(request.id));

        let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| &**v).collect();

        conn.execute(&sql, params.as_slice())
            .map_err(|e| format!("Failed to update level: {}", e))?;

        Ok(conn.changes() > 0)
    }

    pub fn delete_level(&self, conn: &Connection, id: i64) -> Result<bool, String> {
        conn.execute("DELETE FROM levels WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete level: {}", e))?;

        Ok(conn.changes() > 0)
    }
}
