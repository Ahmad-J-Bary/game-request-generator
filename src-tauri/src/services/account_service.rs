use crate::models::account::{Account, CreateAccountRequest, UpdateAccountRequest};
use sqlx::{Pool, Postgres, Row};

pub struct AccountService;

impl AccountService {
    pub fn new() -> Self {
        AccountService
    }

    pub async fn create_account(
        &self,
        pool: &Pool<Postgres>,
        request: CreateAccountRequest,
    ) -> Result<i64, String> {
        // Verify game exists
        let game_exists = sqlx::query("SELECT 1 FROM games WHERE id = $1")
            .bind(request.game_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to check game existence: {}", e))?;

        if game_exists.is_none() {
            return Err(format!("Game with ID {} not found", request.game_id));
        }

        let rec = sqlx::query(
            "INSERT INTO accounts (game_id, name, start_date, start_time, request_template)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id",
        )
        .bind(request.game_id)
        .bind(&request.name)
        .bind(&request.start_date)
        .bind(&request.start_time)
        .bind(&request.request_template)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to create account: {}", e))?;

        Ok(rec.get("id"))
    }

    pub async fn get_accounts_by_game(
        &self,
        pool: &Pool<Postgres>,
        game_id: i64,
    ) -> Result<Vec<Account>, String> {
        let rows = sqlx::query(
            "SELECT id, game_id, name, start_date, start_time, request_template, created_at
             FROM accounts WHERE game_id = $1 ORDER BY created_at",
        )
        .bind(game_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to query accounts: {}", e))?;

        let mut accounts = Vec::new();
        for row in rows {
            accounts.push(Account {
                id: row.get("id"),
                game_id: row.get("game_id"),
                name: row.get("name"),
                start_date: row.get("start_date"),
                start_time: row.get("start_time"),
                request_template: row.get("request_template"),
                created_at: row.get("created_at"),
            });
        }

        Ok(accounts)
    }

    pub async fn get_account_by_id(
        &self,
        pool: &Pool<Postgres>,
        id: i64,
    ) -> Result<Option<Account>, String> {
        let row = sqlx::query(
            "SELECT id, game_id, name, start_date, start_time, request_template, created_at
             FROM accounts WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to get account: {}", e))?;

        if let Some(row) = row {
            Ok(Some(Account {
                id: row.get("id"),
                game_id: row.get("game_id"),
                name: row.get("name"),
                start_date: row.get("start_date"),
                start_time: row.get("start_time"),
                request_template: row.get("request_template"),
                created_at: row.get("created_at"),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn update_account(
        &self,
        pool: &Pool<Postgres>,
        request: UpdateAccountRequest,
    ) -> Result<bool, String> {
        let mut query_builder = sqlx::QueryBuilder::new("UPDATE accounts SET ");
        let mut first = true;

        if let Some(name) = &request.name {
            query_builder.push("name = ");
            query_builder.push_bind(name);
            first = false;
        }

        if let Some(start_date) = &request.start_date {
            if !first {
                query_builder.push(", ");
            }
            query_builder.push("start_date = ");
            query_builder.push_bind(start_date);
            first = false;
        }

        if let Some(start_time) = &request.start_time {
            if !first {
                query_builder.push(", ");
            }
            query_builder.push("start_time = ");
            query_builder.push_bind(start_time);
            first = false;
        }

        if let Some(request_template) = &request.request_template {
            if !first {
                query_builder.push(", ");
            }
            query_builder.push("request_template = ");
            query_builder.push_bind(request_template);
            first = false;
        }

        if first {
            return Ok(false); // No updates
        }

        query_builder.push(" WHERE id = ");
        query_builder.push_bind(request.id);

        let result = query_builder
            .build()
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update account: {}", e))?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn delete_account(&self, pool: &Pool<Postgres>, id: i64) -> Result<bool, String> {
        let result = sqlx::query("DELETE FROM accounts WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to delete account: {}", e))?;

        Ok(result.rows_affected() > 0)
    }
}
