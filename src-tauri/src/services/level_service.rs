use crate::models::level::{CreateLevelRequest, Level, UpdateLevelRequest};
use sqlx::{Pool, Postgres, Row};

pub struct LevelService;

impl LevelService {
    pub fn new() -> Self {
        LevelService
    }

    pub async fn create_level(
        &self,
        pool: &Pool<Postgres>,
        request: CreateLevelRequest,
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
            "INSERT INTO levels (game_id, event_token, level_name, days_offset, time_spent, is_bonus)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id",
        )
        .bind(request.game_id)
        .bind(&request.event_token)
        .bind(&request.level_name)
        .bind(request.days_offset)
        .bind(request.time_spent)
        .bind(request.is_bonus)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to create level: {}", e))?;

        Ok(rec.get("id"))
    }

    pub async fn get_levels_by_game(
        &self,
        pool: &Pool<Postgres>,
        game_id: i64,
    ) -> Result<Vec<Level>, String> {
        let rows = sqlx::query(
            "SELECT id, game_id, event_token, level_name, days_offset, time_spent, is_bonus
             FROM levels WHERE game_id = $1 ORDER BY days_offset",
        )
        .bind(game_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to query levels: {}", e))?;

        let mut levels = Vec::new();
        for row in rows {
            let is_bonus: bool = row.get("is_bonus");
            levels.push(Level {
                id: row.get("id"),
                game_id: row.get("game_id"),
                event_token: row.get("event_token"),
                level_name: row.get("level_name"),
                days_offset: row.get("days_offset"),
                time_spent: row.get("time_spent"),
                is_bonus,
            });
        }

        Ok(levels)
    }

    pub async fn get_level_by_id(
        &self,
        pool: &Pool<Postgres>,
        id: i64,
    ) -> Result<Option<Level>, String> {
        let row = sqlx::query(
            "SELECT id, game_id, event_token, level_name, days_offset, time_spent, is_bonus
             FROM levels WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to get level: {}", e))?;

        if let Some(row) = row {
            let is_bonus: bool = row.get("is_bonus");
            Ok(Some(Level {
                id: row.get("id"),
                game_id: row.get("game_id"),
                event_token: row.get("event_token"),
                level_name: row.get("level_name"),
                days_offset: row.get("days_offset"),
                time_spent: row.get("time_spent"),
                is_bonus,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn update_level(
        &self,
        pool: &Pool<Postgres>,
        request: UpdateLevelRequest,
    ) -> Result<bool, String> {
        let mut query_builder = sqlx::QueryBuilder::new("UPDATE levels SET ");
        let mut first = true;

        if let Some(event_token) = &request.event_token {
            query_builder.push("event_token = ");
            query_builder.push_bind(event_token);
            first = false;
        }

        if let Some(level_name) = &request.level_name {
            if !first {
                query_builder.push(", ");
            }
            query_builder.push("level_name = ");
            query_builder.push_bind(level_name);
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

        if let Some(time_spent) = request.time_spent {
            if !first {
                query_builder.push(", ");
            }
            query_builder.push("time_spent = ");
            query_builder.push_bind(time_spent);
            first = false;
        }

        if let Some(is_bonus) = request.is_bonus {
            if !first {
                query_builder.push(", ");
            }
            query_builder.push("is_bonus = ");
            query_builder.push_bind(is_bonus);
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
            .map_err(|e| format!("Failed to update level: {}", e))?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn delete_level(&self, pool: &Pool<Postgres>, id: i64) -> Result<bool, String> {
        let result = sqlx::query("DELETE FROM levels WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to delete level: {}", e))?;

        Ok(result.rows_affected() > 0)
    }
}
