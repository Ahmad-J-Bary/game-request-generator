// src-tauri/src/services/progress_service.rs

use rusqlite::{params, Connection};
use crate::models::progress::*;

pub struct ProgressService;

impl ProgressService {
    pub fn new() -> Self {
        ProgressService
    }

    // ===== تقدم المستويات =====
    
    pub fn create_or_update_level_progress(
        &self,
        conn: &Connection,
        request: CreateAccountLevelProgressRequest,
    ) -> Result<(), String> {
        conn.execute(
            "INSERT INTO account_level_progress (account_id, level_id, is_completed)
             VALUES (?1, ?2, 0)
             ON CONFLICT(account_id, level_id) DO NOTHING",
            params![request.account_id, request.level_id],
        )
        .map_err(|e| format!("Failed to create level progress: {}", e))?;

        Ok(())
    }

    pub fn update_level_progress(
        &self,
        conn: &Connection,
        request: UpdateAccountLevelProgressRequest,
    ) -> Result<bool, String> {
        let completed_at = if request.is_completed {
            Some(chrono::Utc::now().to_rfc3339())
        } else {
            None
        };

        conn.execute(
            "UPDATE account_level_progress 
             SET is_completed = ?1, completed_at = ?2
             WHERE account_id = ?3 AND level_id = ?4",
            params![
                if request.is_completed { 1 } else { 0 },
                completed_at,
                request.account_id,
                request.level_id
            ],
        )
        .map_err(|e| format!("Failed to update level progress: {}", e))?;

        Ok(conn.changes() > 0)
    }

    pub fn get_account_level_progress(
        &self,
        conn: &Connection,
        account_id: i64,
    ) -> Result<Vec<AccountLevelProgress>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT account_id, level_id, is_completed, completed_at
                 FROM account_level_progress WHERE account_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let progress_iter = stmt
            .query_map(params![account_id], |row| {
                Ok(AccountLevelProgress {
                    account_id: row.get(0)?,
                    level_id: row.get(1)?,
                    is_completed: row.get::<_, i32>(2)? != 0,
                    completed_at: row.get(3).ok(),
                })
            })
            .map_err(|e| format!("Failed to query level progress: {}", e))?;

        let mut progress_list = Vec::new();
        for progress in progress_iter {
            progress_list.push(progress.map_err(|e| format!("Failed to map level progress: {}", e))?);
        }

        Ok(progress_list)
    }

    // ===== تقدم أحداث الشراء =====
    
    pub fn create_or_update_purchase_event_progress(
        &self,
        conn: &Connection,
        request: CreateAccountPurchaseEventProgressRequest,
    ) -> Result<(), String> {
        conn.execute(
            "INSERT INTO account_purchase_event_progress 
             (account_id, purchase_event_id, is_completed, days_offset, time_spent)
             VALUES (?1, ?2, 0, ?3, ?4)
             ON CONFLICT(account_id, purchase_event_id) 
             DO UPDATE SET days_offset = ?3, time_spent = ?4",
            params![
                request.account_id,
                request.purchase_event_id,
                request.days_offset,
                request.time_spent
            ],
        )
        .map_err(|e| format!("Failed to create/update purchase event progress: {}", e))?;

        Ok(())
    }

    pub fn update_purchase_event_progress(
        &self,
        conn: &Connection,
        request: UpdateAccountPurchaseEventProgressRequest,
    ) -> Result<bool, String> {
        let mut updates = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(is_completed) = request.is_completed {
            updates.push("is_completed = ?");
            values.push(Box::new(if is_completed { 1 } else { 0 }));
            
            if is_completed {
                updates.push("completed_at = ?");
                values.push(Box::new(chrono::Utc::now().to_rfc3339()));
            }
        }

        if let Some(days_offset) = request.days_offset {
            updates.push("days_offset = ?");
            values.push(Box::new(days_offset));
        }

        if let Some(time_spent) = request.time_spent {
            updates.push("time_spent = ?");
            values.push(Box::new(time_spent));
        }

        if updates.is_empty() {
            return Ok(false);
        }

        let sql = format!(
            "UPDATE account_purchase_event_progress SET {} WHERE account_id = ? AND purchase_event_id = ?",
            updates.join(", ")
        );
        values.push(Box::new(request.account_id));
        values.push(Box::new(request.purchase_event_id));

        let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| &**v).collect();

        conn.execute(&sql, params.as_slice())
            .map_err(|e| format!("Failed to update purchase event progress: {}", e))?;

        Ok(conn.changes() > 0)
    }

    pub fn get_account_purchase_event_progress(
        &self,
        conn: &Connection,
        account_id: i64,
    ) -> Result<Vec<AccountPurchaseEventProgress>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT account_id, purchase_event_id, is_completed, days_offset, time_spent, completed_at
                 FROM account_purchase_event_progress WHERE account_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let progress_iter = stmt
            .query_map(params![account_id], |row| {
                Ok(AccountPurchaseEventProgress {
                    account_id: row.get(0)?,
                    purchase_event_id: row.get(1)?,
                    is_completed: row.get::<_, i32>(2)? != 0,
                    days_offset: row.get(3)?,
                    time_spent: row.get(4)?,
                    completed_at: row.get(5).ok(),
                })
            })
            .map_err(|e| format!("Failed to query purchase event progress: {}", e))?;

        let mut progress_list = Vec::new();
        for progress in progress_iter {
            progress_list.push(progress.map_err(|e| format!("Failed to map purchase event progress: {}", e))?);
        }

        Ok(progress_list)
    }
}
