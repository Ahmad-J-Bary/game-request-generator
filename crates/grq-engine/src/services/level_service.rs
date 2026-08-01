// src-tauri/src/services/level_service.rs

use rusqlite::{params, OptionalExtension, Connection};
use crate::models::level::{Level, CreateLevelRequest, UpdateLevelRequest};
use crate::services::maintenance_log_service::MaintenanceLogService;

pub struct LevelService;

impl LevelService {
    pub fn new() -> Self {
        LevelService
    }

    pub fn create_level(&self, conn: &Connection, request: CreateLevelRequest) -> Result<i64, String> {
        // Check if an identical '-' level already exists to avoid exact duplicates
        if request.level_name == "-" {
            let existing_synthetic_id: Option<i64> = conn
                .query_row(
                    "SELECT id FROM levels WHERE branch_id = ?1 AND days_offset = ?2 AND level_name = '-' AND event_token = ?3 LIMIT 1",
                    params![request.branch_id, request.days_offset, request.event_token],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| format!("Failed to check for existing synthetic level: {}", e))?;
            
            if let Some(id) = existing_synthetic_id {
                return Ok(id);
            }

            // Per-token rule: a standalone Session must never coexist with a real
            // Level Event carrying the SAME base token on the SAME day. When a real
            // event already exists for (branch, day, base), reuse it instead of
            // creating the invalid '-' level.
            let base = base_token_of(&request.event_token);
            let existing_event_id: Option<i64> = conn
                .query_row(
                    "SELECT id FROM levels
                     WHERE branch_id = ?1 AND days_offset = ?2 AND level_name != '-'
                       AND (
                            CASE
                                WHEN instr(event_token, '_day') > 0 THEN substr(event_token, 1, instr(event_token, '_day') - 1)
                                ELSE event_token
                            END
                           ) = ?3
                     LIMIT 1",
                    params![request.branch_id, request.days_offset, base],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| format!("Failed to check for existing real level: {}", e))?;

            if let Some(id) = existing_event_id {
                let _ = MaintenanceLogService::new().log(
                    conn,
                    "session_reused",
                    Some(request.branch_id),
                    Some(id),
                    Some(&request.event_token),
                    None,
                    Some(request.days_offset),
                    Some("real Level Event with same Event Token exists on same day"),
                    Some("standalone Session creation skipped; real event reused"),
                );
                return Ok(id);
            }
        }

        conn.execute(
            "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset, time_spent, is_bonus)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                request.game_id,
                request.branch_id,
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

    pub fn get_levels_by_branch(&self, conn: &Connection, branch_id: i64) -> Result<Vec<Level>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, game_id, branch_id, event_token, level_name, days_offset, time_spent, is_bonus
                 FROM levels WHERE branch_id = ?1 ORDER BY days_offset",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let levels_iter = stmt
            .query_map(params![branch_id], |row| {
                Ok(Level {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    branch_id: row.get(2).ok(),
                    event_token: row.get(3)?,
                    level_name: row.get(4)?,
                    days_offset: row.get(5)?,
                    time_spent: row.get(6)?,
                    is_bonus: row.get::<_, i32>(7)? != 0,
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
            "SELECT id, game_id, branch_id, event_token, level_name, days_offset, time_spent, is_bonus 
             FROM levels WHERE id = ?1",
            params![id],
            |row| {
                Ok(Level {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    branch_id: row.get(2).ok(),
                    event_token: row.get(3)?,
                    level_name: row.get(4)?,
                    days_offset: row.get(5)?,
                    time_spent: row.get(6)?,
                    is_bonus: row.get::<_, i32>(7)? != 0,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to get level: {}", e))
    }

    pub fn update_level(&self, conn: &Connection, request: UpdateLevelRequest) -> Result<bool, String> {
        // Fetch the current level to determine what cascade cleanup is needed
        let current_row = conn
            .query_row(
                "SELECT event_token, days_offset, branch_id FROM levels WHERE id = ?1",
                params![request.id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?, row.get::<_, Option<i64>>(2)?)),
            )
            .optional()
            .map_err(|e| format!("Failed to fetch current level: {}", e))?;

        let (old_token, old_days_offset, old_branch_id) = match current_row {
            Some(row) => row,
            None => return Ok(false), // Level not found
        };

        let new_days_offset = request.days_offset.unwrap_or(old_days_offset);
        let new_token = request.event_token.as_deref().unwrap_or(&old_token);

        // If days_offset is changing, clear completion records so accounts redo it on the new day
        if old_days_offset != new_days_offset {
            conn.execute(
                "DELETE FROM account_level_progress WHERE level_id = ?1",
                params![request.id],
            )
            .map_err(|e| format!("Failed to reset level progress on days_offset change: {}", e))?;
        }

        // Synthetic sessions derived from this level have level_name = '-'
        // and event_token like '{base_token}_day{N}'.
        // When any key field changes, delete them so they recompute correctly.
        let any_key_changed = old_days_offset != new_days_offset
            || new_token != old_token
            || request.time_spent.is_some();

        if any_key_changed {
            // Extract the base token (part before the first '_day')
            let old_base = old_token
                .split("_day")
                .next()
                .unwrap_or(&old_token)
                .to_string();
            let like_pattern = format!("{}\\_%", old_base);

            conn.execute(
                "DELETE FROM levels WHERE level_name = '-' AND event_token LIKE ?1 ESCAPE '\\' AND branch_id = ?2",
                params![like_pattern, old_branch_id],
            )
            .map_err(|e| format!("Failed to delete synthetic child sessions: {}", e))?;

            // If event_token changed, also clean up any synthetics with the NEW base
            // (in case partial synthetics from a previous run exist with that token)
            if new_token != old_token {
                let new_base = new_token
                    .split("_day")
                    .next()
                    .unwrap_or(new_token)
                    .to_string();
                if new_base != old_base {
                    let new_like = format!("{}\\_%", new_base);
                    conn.execute(
                        "DELETE FROM levels WHERE level_name = '-' AND event_token LIKE ?1 ESCAPE '\\' AND branch_id = ?2",
                        params![new_like, old_branch_id],
                    )
                    .map_err(|e| format!("Failed to delete synthetic child sessions (new token): {}", e))?;
                }
            }
        }

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

        if let Some(branch_id) = request.branch_id {
            updates.push("branch_id = ?");
            values.push(Box::new(branch_id));

            // If branch is changing, clear progress
            if let Some(old_id) = old_branch_id {
                if old_id != branch_id {
                    conn.execute(
                        "DELETE FROM account_level_progress WHERE level_id = ?1",
                        params![request.id],
                    )
                    .map_err(|e| format!("Failed to reset level progress on branch change: {}", e))?;
                }
            }
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
        // Fetch the event_token and branch_id to find and delete derived synthetic sessions
        let level_info: Option<(String, Option<i64>)> = conn
            .query_row(
                "SELECT event_token, branch_id FROM levels WHERE id = ?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| format!("Failed to fetch level info for cascade: {}", e))?;

        if let Some((token, branch_id)) = level_info {
            // Delete all synthetic sessions derived from this level's base token.
            // Synthetic sessions have level_name = '-' and event_token like 'base_dayN'.
            let base = token
                .split("_day")
                .next()
                .unwrap_or(&token)
                .to_string();
            let like_pattern = format!("{}\\_%", base);
            conn.execute(
                "DELETE FROM levels WHERE level_name = '-' AND event_token LIKE ?1 ESCAPE '\\' AND branch_id = ?2",
                params![like_pattern, branch_id],
            )
            .map_err(|e| format!("Failed to delete synthetic child sessions: {}", e))?;
        }

        // Cascade: delete all progress records referencing this level
        conn.execute(
            "DELETE FROM account_level_progress WHERE level_id = ?1",
            params![id],
        )
        .map_err(|e| format!("Failed to delete level progress records: {}", e))?;

        // Delete the level itself
        conn.execute("DELETE FROM levels WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete level: {}", e))?;

        Ok(conn.changes() > 0)
    }
}

/// يُقصّ جزء "_dayN" فيبقى معرّف الحدث الأساسي (مثل connection.rs::base_token_of).
fn base_token_of(token: &str) -> String {
    match token.find("_day") {
        Some(idx) => token[..idx].to_string(),
        None => token.to_string(),
    }
}
