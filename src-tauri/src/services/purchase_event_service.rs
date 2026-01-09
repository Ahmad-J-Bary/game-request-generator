use crate::models::purchase_event::{
    CreatePurchaseEventRequest, PurchaseEvent, UpdatePurchaseEventRequest,
};
use sqlx::{Pool, Postgres, Row};

pub struct PurchaseEventService;

impl PurchaseEventService {
    pub fn new() -> Self {
        PurchaseEventService
    }

    pub async fn create_purchase_event(
        &self,
        pool: &Pool<Postgres>,
        request: CreatePurchaseEventRequest,
    ) -> Result<i64, String> {
        let game_exists = sqlx::query("SELECT 1 FROM games WHERE id = $1")
            .bind(request.game_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to check game existence: {}", e))?;

        if game_exists.is_none() {
            return Err(format!("Game with ID {} not found", request.game_id));
        }

        let rec = sqlx::query(
            "INSERT INTO purchase_events (game_id, event_token, is_restricted, max_days_offset, days_offset)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id",
        )
        .bind(request.game_id)
        .bind(&request.event_token)
        .bind(request.is_restricted)
        .bind(request.max_days_offset)
        .bind(request.days_offset)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to create purchase event: {}", e))?;

        Ok(rec.get("id"))
    }

    pub async fn get_purchase_events_by_game(
        &self,
        pool: &Pool<Postgres>,
        game_id: i64,
    ) -> Result<Vec<PurchaseEvent>, String> {
        let rows = sqlx::query(
            "SELECT id, game_id, event_token, is_restricted, max_days_offset, days_offset, created_at
             FROM purchase_events WHERE game_id = $1 ORDER BY id",
        )
        .bind(game_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to query purchase events: {}", e))?;

        let mut events = Vec::new();
        for row in rows {
            let is_restricted: bool = row.get("is_restricted");
            events.push(PurchaseEvent {
                id: row.get("id"),
                game_id: row.get("game_id"),
                event_token: row.get("event_token"),
                is_restricted,
                max_days_offset: row.get("max_days_offset"),
                days_offset: row.get("days_offset"),
                created_at: row.get("created_at"),
            });
        }

        Ok(events)
    }

    pub async fn get_purchase_event_by_id(
        &self,
        pool: &Pool<Postgres>,
        id: i64,
    ) -> Result<Option<PurchaseEvent>, String> {
        let row = sqlx::query(
            "SELECT id, game_id, event_token, is_restricted, max_days_offset, days_offset, created_at 
             FROM purchase_events WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to get purchase event: {}", e))?;

        if let Some(row) = row {
            let is_restricted: bool = row.get("is_restricted");
            Ok(Some(PurchaseEvent {
                id: row.get("id"),
                game_id: row.get("game_id"),
                event_token: row.get("event_token"),
                is_restricted,
                max_days_offset: row.get("max_days_offset"),
                days_offset: row.get("days_offset"),
                created_at: row.get("created_at"),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn update_purchase_event(
        &self,
        pool: &Pool<Postgres>,
        request: UpdatePurchaseEventRequest,
    ) -> Result<bool, String> {
        let mut query_builder = sqlx::QueryBuilder::new("UPDATE purchase_events SET ");
        let mut first = true;

        if let Some(event_token) = &request.event_token {
            query_builder.push("event_token = ");
            query_builder.push_bind(event_token);
            first = false;
        }

        if let Some(is_restricted) = request.is_restricted {
            if !first {
                query_builder.push(", ");
            }
            query_builder.push("is_restricted = ");
            query_builder.push_bind(is_restricted);
            first = false;
        }

        if let Some(max_days_offset) = request.max_days_offset {
            if !first {
                query_builder.push(", ");
            }
            query_builder.push("max_days_offset = ");
            query_builder.push_bind(max_days_offset);
            first = false;
        }

        if let Some(days_offset) = request.days_offset {
            if !first {
                query_builder.push(", ");
            }
            query_builder.push("days_offset = ");
            query_builder.push_bind(days_offset);
            first = false;
        }

        if first {
            return Ok(false);
        }

        query_builder.push(" WHERE id = ");
        query_builder.push_bind(request.id);

        let result = query_builder
            .build()
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update purchase event: {}", e))?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn delete_purchase_event(
        &self,
        pool: &Pool<Postgres>,
        id: i64,
    ) -> Result<bool, String> {
        let result = sqlx::query("DELETE FROM purchase_events WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to delete purchase event: {}", e))?;

        Ok(result.rows_affected() > 0)
    }
}
