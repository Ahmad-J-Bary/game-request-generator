// src-tauri/src/services/purchase_event_service.rs

use rusqlite::{params, OptionalExtension, Connection};
use crate::models::purchase_event::{PurchaseEvent, CreatePurchaseEventRequest, UpdatePurchaseEventRequest};

pub struct PurchaseEventService;

impl PurchaseEventService {
    pub fn new() -> Self {
        PurchaseEventService
    }

    pub fn create_purchase_event(&self, conn: &Connection, request: CreatePurchaseEventRequest) -> Result<i64, String> {
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
            "INSERT INTO purchase_events (game_id, event_token, is_restricted, max_days_offset)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                request.game_id,
                request.event_token,
                if request.is_restricted { 1 } else { 0 },
                request.max_days_offset,
            ],
        )
        .map_err(|e| format!("Failed to create purchase event: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_purchase_events_by_game(&self, conn: &Connection, game_id: i64) -> Result<Vec<PurchaseEvent>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, game_id, event_token, is_restricted, max_days_offset, created_at
                 FROM purchase_events WHERE game_id = ?1 ORDER BY id",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let events_iter = stmt
            .query_map(params![game_id], |row| {
                Ok(PurchaseEvent {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    event_token: row.get(2)?,
                    is_restricted: row.get::<_, i32>(3)? != 0,
                    max_days_offset: row.get(4).ok(),
                    created_at: row.get(5).ok(),
                })
            })
            .map_err(|e| format!("Failed to query purchase events: {}", e))?;

        let mut events = Vec::new();
        for event in events_iter {
            events.push(event.map_err(|e| format!("Failed to map purchase event: {}", e))?);
        }

        Ok(events)
    }

    pub fn get_purchase_event_by_id(&self, conn: &Connection, id: i64) -> Result<Option<PurchaseEvent>, String> {
        conn.query_row(
            "SELECT id, game_id, event_token, is_restricted, max_days_offset, created_at 
             FROM purchase_events WHERE id = ?1",
            params![id],
            |row| {
                Ok(PurchaseEvent {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    event_token: row.get(2)?,
                    is_restricted: row.get::<_, i32>(3)? != 0,
                    max_days_offset: row.get(4).ok(),
                    created_at: row.get(5).ok(),
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to get purchase event: {}", e))
    }

    pub fn update_purchase_event(&self, conn: &Connection, request: UpdatePurchaseEventRequest) -> Result<bool, String> {
        let mut updates = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(event_token) = request.event_token {
            updates.push("event_token = ?");
            values.push(Box::new(event_token));
        }

        if let Some(is_restricted) = request.is_restricted {
            updates.push("is_restricted = ?");
            values.push(Box::new(if is_restricted { 1 } else { 0 }));
        }

        if let Some(max_days_offset) = request.max_days_offset {
            updates.push("max_days_offset = ?");
            values.push(Box::new(max_days_offset));
        }

        if updates.is_empty() {
            return Ok(false);
        }

        let sql = format!("UPDATE purchase_events SET {} WHERE id = ?", updates.join(", "));
        values.push(Box::new(request.id));

        let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| &**v).collect();

        conn.execute(&sql, params.as_slice())
            .map_err(|e| format!("Failed to update purchase event: {}", e))?;

        Ok(conn.changes() > 0)
    }

    pub fn delete_purchase_event(&self, conn: &Connection, id: i64) -> Result<bool, String> {
        conn.execute("DELETE FROM purchase_events WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete purchase event: {}", e))?;

        Ok(conn.changes() > 0)
    }
}
