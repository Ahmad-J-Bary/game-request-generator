// crates/grq-engine/src/services/maintenance_log_service.rs

use crate::models::maintenance_log::MaintenanceLog;
use rusqlite::{params, Connection};

pub struct MaintenanceLogService;

impl MaintenanceLogService {
    pub fn new() -> Self {
        MaintenanceLogService
    }

    pub fn log(
        &self,
        conn: &Connection,
        action: &str,
        branch_id: Option<i64>,
        level_id: Option<i64>,
        event_token: Option<&str>,
        new_event_token: Option<&str>,
        days_offset: Option<i32>,
        reason: Option<&str>,
        detail: Option<&str>,
    ) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO maintenance_logs (
                action, branch_id, level_id, event_token, new_event_token, days_offset, reason, detail
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                action,
                branch_id,
                level_id,
                event_token,
                new_event_token,
                days_offset,
                reason,
                detail,
            ],
        )?;
        Ok(())
    }

    pub fn get_logs(
        &self,
        conn: &Connection,
        limit: Option<u32>,
    ) -> rusqlite::Result<Vec<MaintenanceLog>> {
        let query = match limit {
            Some(l) => format!(
                "SELECT id, logged_at, action, branch_id, level_id, event_token, new_event_token, days_offset, reason, detail
                 FROM maintenance_logs ORDER BY id DESC LIMIT {}",
                l
            ),
            None => format!(
                "SELECT id, logged_at, action, branch_id, level_id, event_token, new_event_token, days_offset, reason, detail
                 FROM maintenance_logs ORDER BY id DESC"
            ),
        };

        let mut stmt = conn.prepare(&query)?;
        let rows = stmt.query_map([], |row| {
            Ok(MaintenanceLog {
                id: row.get(0)?,
                logged_at: row.get(1)?,
                action: row.get(2)?,
                branch_id: row.get(3)?,
                level_id: row.get(4)?,
                event_token: row.get(5)?,
                new_event_token: row.get(6)?,
                days_offset: row.get(7)?,
                reason: row.get(8)?,
                detail: row.get(9)?,
            })
        })?;

        let mut logs = Vec::new();
        for row in rows {
            logs.push(row?);
        }
        Ok(logs)
    }
}
