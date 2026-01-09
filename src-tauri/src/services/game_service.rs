use crate::models::game::{CreateGameRequest, Game, UpdateGameRequest};
use sqlx::{Pool, Postgres, Row};

pub struct GameService;

impl GameService {
    pub fn new() -> Self {
        GameService
    }

    pub async fn create_game(
        &self,
        pool: &Pool<Postgres>,
        request: CreateGameRequest,
    ) -> Result<i64, String> {
        // Try to insert, ignoring conflicts on 'name'
        // If conflict, select the existing ID
        let row = sqlx::query(
            "WITH inserted AS (
                INSERT INTO games (name) VALUES ($1) 
                ON CONFLICT (name) DO NOTHING 
                RETURNING id
            )
            SELECT id FROM inserted
            UNION ALL
            SELECT id FROM games WHERE name = $1
            LIMIT 1",
        )
        .bind(&request.name)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to create/fetch game: {}", e))?;

        Ok(row.get("id"))
    }

    pub async fn get_games(&self, pool: &Pool<Postgres>) -> Result<Vec<Game>, String> {
        let rows = sqlx::query("SELECT id, name, created_at FROM games ORDER BY name")
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query games: {}", e))?;

        let mut games = Vec::new();
        for row in rows {
            games.push(Game {
                id: row.get("id"),
                name: row.get("name"),
                created_at: row.get("created_at"),
            });
        }
        Ok(games)
    }

    pub async fn get_game_by_id(
        &self,
        pool: &Pool<Postgres>,
        id: i64,
    ) -> Result<Option<Game>, String> {
        let row = sqlx::query("SELECT id, name, created_at FROM games WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to get game: {}", e))?;

        if let Some(row) = row {
            Ok(Some(Game {
                id: row.get("id"),
                name: row.get("name"),
                created_at: row.get("created_at"),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn update_game(
        &self,
        pool: &Pool<Postgres>,
        request: UpdateGameRequest,
    ) -> Result<bool, String> {
        if let Some(name) = request.name {
            let result = sqlx::query("UPDATE games SET name = $1 WHERE id = $2")
                .bind(name)
                .bind(request.id)
                .execute(pool)
                .await
                .map_err(|e| format!("Failed to update game: {}", e))?;

            return Ok(result.rows_affected() > 0);
        }
        Ok(false)
    }

    pub async fn delete_game(&self, pool: &Pool<Postgres>, id: i64) -> Result<bool, String> {
        let result = sqlx::query("DELETE FROM games WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to delete game: {}", e))?;

        Ok(result.rows_affected() > 0)
    }
}
