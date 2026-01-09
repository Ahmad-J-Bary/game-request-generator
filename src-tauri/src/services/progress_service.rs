use crate::models::progress::*;
use sqlx::{Pool, Postgres, Row};

pub struct ProgressService;

impl ProgressService {
    pub fn new() -> Self {
        ProgressService
    }

    // ===== Level Progress =====

    pub async fn create_or_update_level_progress(
        &self,
        pool: &Pool<Postgres>,
        request: CreateAccountLevelProgressRequest,
    ) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO account_level_progress (account_id, level_id, is_completed)
             VALUES ($1, $2, FALSE)
             ON CONFLICT(account_id, level_id) DO NOTHING",
        )
        .bind(request.account_id)
        .bind(request.level_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create level progress: {}", e))?;

        Ok(())
    }

    pub async fn update_level_progress(
        &self,
        pool: &Pool<Postgres>,
        request: UpdateAccountLevelProgressRequest,
    ) -> Result<bool, String> {
        let completed_at: Option<chrono::DateTime<chrono::Utc>> = if request.is_completed {
            Some(chrono::Utc::now())
        } else {
            None
        };

        let result = sqlx::query(
            "UPDATE account_level_progress 
             SET is_completed = $1, completed_at = $2
             WHERE account_id = $3 AND level_id = $4",
        )
        .bind(request.is_completed)
        .bind(completed_at)
        .bind(request.account_id)
        .bind(request.level_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to update level progress: {}", e))?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn get_account_level_progress(
        &self,
        pool: &Pool<Postgres>,
        account_id: i64,
    ) -> Result<Vec<AccountLevelProgress>, String> {
        let rows = sqlx::query(
            "SELECT account_id, level_id, is_completed, completed_at
             FROM account_level_progress WHERE account_id = $1",
        )
        .bind(account_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to query level progress: {}", e))?;

        let mut progress_list = Vec::new();
        for row in rows {
            let is_completed: bool = row.get("is_completed");
            progress_list.push(AccountLevelProgress {
                account_id: row.get("account_id"),
                level_id: row.get("level_id"),
                is_completed,
                completed_at: row.get("completed_at"),
            });
        }

        Ok(progress_list)
    }

    // ===== Purchase Event Progress =====

    pub async fn create_or_update_purchase_event_progress(
        &self,
        pool: &Pool<Postgres>,
        request: CreateAccountPurchaseEventProgressRequest,
    ) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO account_purchase_event_progress 
             (account_id, purchase_event_id, is_completed, days_offset, time_spent)
             VALUES ($1, $2, FALSE, $3, $4)
             ON CONFLICT(account_id, purchase_event_id) 
             DO UPDATE SET days_offset = $3, time_spent = $4",
        )
        .bind(request.account_id)
        .bind(request.purchase_event_id)
        .bind(request.days_offset)
        .bind(request.time_spent)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create/update purchase event progress: {}", e))?;

        Ok(())
    }

    pub async fn update_purchase_event_progress(
        &self,
        pool: &Pool<Postgres>,
        request: UpdateAccountPurchaseEventProgressRequest,
    ) -> Result<bool, String> {
        let mut query_builder =
            sqlx::QueryBuilder::new("UPDATE account_purchase_event_progress SET ");
        let mut first = true;

        if let Some(is_completed) = request.is_completed {
            query_builder.push("is_completed = ");
            query_builder.push_bind(is_completed);
            first = false;

            if is_completed {
                if !first {
                    query_builder.push(", ");
                }
                query_builder.push("completed_at = ");
                // Convert to DateTime<Utc> for sqlx, or just bind now() if supported.
                // Since sqlx map supports chrono, we can bind DateTime<Utc>
                query_builder.push_bind(chrono::Utc::now());
            }
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

        if first {
            return Ok(false);
        }

        query_builder.push(" WHERE account_id = ");
        query_builder.push_bind(request.account_id);
        query_builder.push(" AND purchase_event_id = ");
        query_builder.push_bind(request.purchase_event_id);

        let result = query_builder
            .build()
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update purchase event progress: {}", e))?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn get_account_purchase_event_progress(
        &self,
        pool: &Pool<Postgres>,
        account_id: i64,
    ) -> Result<Vec<AccountPurchaseEventProgress>, String> {
        let rows = sqlx::query(
            "SELECT account_id, purchase_event_id, is_completed, days_offset, time_spent, completed_at
             FROM account_purchase_event_progress WHERE account_id = $1",
        )
        .bind(account_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to query purchase event progress: {}", e))?;

        let mut progress_list = Vec::new();
        for row in rows {
            let is_completed: bool = row.get("is_completed");
            progress_list.push(AccountPurchaseEventProgress {
                account_id: row.get("account_id"),
                purchase_event_id: row.get("purchase_event_id"),
                is_completed,
                days_offset: row.get("days_offset"),
                time_spent: row.get("time_spent"),
                completed_at: row.get("completed_at"),
            });
        }

        Ok(progress_list)
    }
}
