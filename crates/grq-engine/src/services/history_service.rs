// crates/grq-engine/src/services/history_service.rs

use crate::models::history::{AddCompletedTaskRequest, CompletedDailyTask};
use rusqlite::{params, Connection};

pub struct HistoryService;

impl HistoryService {
    pub fn new() -> Self {
        HistoryService
    }

    pub fn upsert_completed_task(
        &self,
        conn: &Connection,
        request: AddCompletedTaskRequest,
    ) -> Result<(), String> {
        conn.execute(
            "INSERT OR REPLACE INTO completed_daily_tasks (
                id, account_id, account_name, game_id, game_name, event_token, 
                time_spent, completion_time, completion_date, completed_at,
                level_id, level_name, request_type, is_purchase
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now', 'localtime'), ?10, ?11, ?12, ?13)",
            params![
                request.id,
                request.account_id,
                request.account_name,
                request.game_id,
                request.game_name,
                request.event_token,
                request.time_spent,
                request.completion_time,
                request.completion_date,
                request.level_id,
                request.level_name,
                request.request_type,
                if request.is_purchase { 1 } else { 0 },
            ],
        )
        .map_err(|e| format!("Failed to upsert completed task: {}", e))?;

        Ok(())
    }

    pub fn get_task_history(
        &self,
        conn: &Connection,
        limit: Option<u32>,
        account_id: Option<i64>,
    ) -> Result<Vec<CompletedDailyTask>, String> {
        let mut query = "SELECT id, account_id, account_name, game_id, game_name, event_token, 
                         time_spent, completion_time, completion_date, completed_at,
                         level_id, level_name, request_type, is_purchase 
                         FROM completed_daily_tasks".to_string();
        
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(aid) = account_id {
            query.push_str(" WHERE account_id = ?1");
            params_vec.push(Box::new(aid));
        }

        query.push_str(" ORDER BY completed_at DESC");

        if let Some(l) = limit {
            query.push_str(&format!(" LIMIT {}", l));
        }

        let mut stmt = conn.prepare(&query)
            .map_err(|e| format!("Failed to prepare history query: {}", e))?;

        let history_iter = stmt.query_map(rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())), |row| {
            Ok(CompletedDailyTask {
                id: row.get(0)?,
                account_id: row.get(1)?,
                account_name: row.get(2)?,
                game_id: row.get(3)?,
                game_name: row.get(4)?,
                event_token: row.get(5)?,
                time_spent: row.get(6)?,
                completion_time: row.get(7)?,
                completion_date: row.get(8)?,
                completed_at: row.get(9)?,
                level_id: row.get(10)?,
                level_name: row.get(11)?,
                request_type: row.get(12)?,
                is_purchase: row.get::<_, i32>(13)? == 1,
            })
        }).map_err(|e| format!("Failed to execute history query: {}", e))?;

        let mut results = Vec::new();
        for item in history_iter {
            results.push(item.map_err(|e| format!("Failed to map history item: {}", e))?);
        }

        Ok(results)
    }

    pub fn delete_completed_task(
        &self,
        conn: &Connection,
        id: String,
    ) -> Result<(), String> {
        conn.execute(
            "DELETE FROM completed_daily_tasks WHERE id = ?1",
            params![id],
        )
        .map_err(|e| format!("Failed to delete completed task: {}", e))?;
        Ok(())
    }

    pub fn clear_history(&self, conn: &Connection) -> Result<(), String> {
        conn.execute("DELETE FROM completed_daily_tasks", [])
            .map_err(|e| format!("Failed to clear history: {}", e))?;
        Ok(())
    }
}
