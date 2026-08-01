// crates/grq-engine/src/services/history_service.rs

use crate::models::history::{AddCompletedTaskRequest, CompletedDailyTask};
use crate::services::maintenance_log_service::MaintenanceLogService;
use chrono::Datelike;
use rusqlite::{params, Connection, OptionalExtension};

/// نتيجة إصلاح سجل المهام اليومية (completed_daily_tasks).
#[derive(Debug, Clone, Default)]
pub struct HistoryRepairResult {
    pub deleted_same_day_session_only: usize,
    pub deleted_orphaned_session: usize,
}

/// قاعدة التوكن: يُقصّ جزء "_dayN" فيبقى معرّف الحدث الأساسي.
fn base_token_of(token: &str) -> String {
    match token.find("_day") {
        Some(idx) => token[..idx].to_string(),
        None => token.to_string(),
    }
}

/// يحلّل تاريخ بداية الحساب بنفس منطق get_daily_requests (يدعم صيغة قصيرة
/// مثل "01-Jul" وصيغة كاملة مثل "2023-07-01"، ويتجاهل جزء "T..." الزمني).
fn parse_account_start_date(s: &str) -> Option<chrono::NaiveDate> {
    let cleaned = s.split('T').next().unwrap_or(s).trim();
    if cleaned.contains('-') && cleaned.len() <= 6 {
        let year = chrono::Utc::now().year();
        chrono::NaiveDate::parse_from_str(&format!("{}-{}", year, cleaned), "%Y-%d-%b").ok()
    } else {
        chrono::NaiveDate::parse_from_str(cleaned, "%Y-%m-%d").ok()
    }
}

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

    /// قاعدة كل-توكن على سجل المهام: يفحص completed_daily_tasks ويزيل أي سطر
    /// "Session Only" مكتمل يحمل (Event Token, يوم) يوجد فيه مستوى حدث حقيقي
    /// بنفس التوكن في فرع الحساب. كما يزيل السطور اليتيمة لسشن منفرد ("-")
    /// أُزيل مستوىُه. كل عملية حذف تُسجَّل في maintenance_logs للتتبّع.
    /// Idempotent — آمن للتشغيل المتكرر (عند كل إقلاع أو عند الطلب).
    pub fn repair_invalid_sessions(
        &self,
        conn: &Connection,
    ) -> Result<HistoryRepairResult, String> {
        let mut result = HistoryRepairResult::default();

        // (أ) سطور "Session Only" الخالصة فقط (وليس Level Session / Purchase
        // Session — فهي أزواج صحيحة). نقارن التوكن واليوم مع مستويات الحدث الحقيقية.
        let mut stmt = conn
            .prepare(
                "SELECT id, account_id, event_token, completion_date, level_id, level_name
                 FROM completed_daily_tasks
                 WHERE is_purchase = 0
                   AND lower(trim(request_type)) IN ('session', 'session only')",
            )
            .map_err(|e| format!("Failed to prepare history repair query: {}", e))?;

        let rows: Vec<(String, i64, String, String, Option<i64>, Option<String>)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?, // id
                    row.get(1)?, // account_id
                    row.get(2)?, // event_token
                    row.get(3)?, // completion_date
                    row.get(4)?, // level_id
                    row.get(5)?, // level_name
                ))
            })
            .map_err(|e| format!("Failed to query history repair rows: {}", e))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| format!("Failed to map history repair rows: {}", e))?;

        for (id, account_id, event_token, completion_date, level_id, level_name) in rows {
            let base = base_token_of(&event_token);

            let account_info: Option<(String, Option<i64>)> = conn
                .query_row(
                    "SELECT start_date, branch_id FROM accounts WHERE id = ?1",
                    params![account_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|e| format!("Failed to query account for history repair: {}", e))?;

            let Some((start_date_str, branch_id)) = account_info else {
                continue;
            };
            let Some(branch_id) = branch_id else { continue; };

            // لا تخمين: نتجاهل أي صف لا يمكننا حساب يومه بشكل قاطع.
            let Some(start_date) = parse_account_start_date(&start_date_str) else {
                continue;
            };
            let Ok(completion_parsed) =
                chrono::NaiveDate::parse_from_str(&completion_date, "%Y-%m-%d")
            else {
                continue;
            };
            let day = (completion_parsed - start_date).num_days() as i32;
            if day < 0 {
                continue;
            }

            // هل يوجد مستوى حدث حقيقي بنفس base التوكن في نفس اليوم؟
            let same_day_event: bool = conn
                .query_row(
                    "SELECT 1 FROM levels
                     WHERE branch_id = ?1 AND days_offset = ?2 AND level_name != '-'
                       AND (
                           CASE
                               WHEN instr(event_token, '_day') > 0 THEN substr(event_token, 1, instr(event_token, '_day') - 1)
                               ELSE event_token
                           END
                       ) = ?3
                     LIMIT 1",
                    params![branch_id, day, base],
                    |_| Ok(true),
                )
                .optional()
                .map_err(|e| format!("Failed to check same-day event: {}", e))?
                == Some(true);

            if same_day_event {
                self.delete_completed_task(conn, id.clone())?;
                let _ = MaintenanceLogService::new().log(
                    conn,
                    "history_session_deleted",
                    Some(branch_id),
                    level_id,
                    Some(&event_token),
                    None,
                    Some(day),
                    Some("Session Only completed record shares day + base Event Token with a real Level Event"),
                    Some("deleted from completed_daily_tasks history to enforce the per-token rule"),
                );
                result.deleted_same_day_session_only += 1;
                continue;
            }

            // (ب) سطر يتيم لسشن منفرد: level_id يشير إلى مستوى '-' لم يعد موجودًا.
            if level_name.as_deref() == Some("-") {
                if let Some(lid) = level_id {
                    let exists: bool = conn
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM levels WHERE id = ?1)",
                            params![lid],
                            |r| r.get(0),
                        )
                        .map_err(|e| format!("Failed to check level existence: {}", e))?;
                    if !exists {
                        self.delete_completed_task(conn, id.clone())?;
                        let _ = MaintenanceLogService::new().log(
                            conn,
                            "history_session_deleted",
                            Some(branch_id),
                            Some(lid),
                            Some(&event_token),
                            None,
                            Some(day),
                            Some("completed record references a deleted standalone Session level"),
                            Some("deleted from completed_daily_tasks history to enforce the per-token rule"),
                        );
                        result.deleted_orphaned_session += 1;
                    }
                }
            }
        }

        let total = result.deleted_same_day_session_only + result.deleted_orphaned_session;
        if total > 0 {
            println!(
                "[MaintenanceLog] Deleted {} invalid Session Only completed history row(s) ({} same-day-event, {} orphaned '-' level).",
                total, result.deleted_same_day_session_only, result.deleted_orphaned_session,
            );
        }

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::HistoryService;
    use rusqlite::{params, Connection};

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                branch_id INTEGER,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                request_template TEXT NOT NULL
            );
            CREATE TABLE levels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                branch_id INTEGER,
                event_token TEXT NOT NULL,
                level_name TEXT NOT NULL,
                days_offset INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE completed_daily_tasks (
                id TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL,
                game_id INTEGER NOT NULL,
                event_token TEXT NOT NULL,
                completion_date TEXT NOT NULL,
                level_id INTEGER,
                level_name TEXT,
                request_type TEXT NOT NULL,
                is_purchase INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE maintenance_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                action TEXT NOT NULL,
                branch_id INTEGER,
                level_id INTEGER,
                event_token TEXT,
                new_event_token TEXT,
                days_offset INTEGER,
                reason TEXT,
                detail TEXT
            );
            ",
        )
        .unwrap();

        conn.execute(
            "INSERT INTO accounts (game_id, branch_id, name, start_date, start_time, request_template)
             VALUES (1, 10, 'acc', '2024-01-01', '00:00:00', 'tpl')",
            [],
        )
        .unwrap();
        conn
    }

    fn insert_level(conn: &Connection, event_token: &str, level_name: &str, days_offset: i32) -> i64 {
        conn.execute(
            "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset)
             VALUES (1, 10, ?1, ?2, ?3)",
            params![event_token, level_name, days_offset],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn insert_history(
        conn: &Connection,
        id: &str,
        token: &str,
        request_type: &str,
        completion_date: &str,
        level_name: Option<&str>,
        level_id: Option<i64>,
        is_purchase: bool,
    ) {
        conn.execute(
            "INSERT INTO completed_daily_tasks
                (id, account_id, game_id, event_token, completion_date, level_id, level_name, request_type, is_purchase)
             VALUES (?1, 1, 1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                token,
                completion_date,
                level_id,
                level_name,
                request_type,
                if is_purchase { 1 } else { 0 },
            ],
        )
        .unwrap();
    }

    fn history_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM completed_daily_tasks", [], |r| r.get(0))
            .unwrap()
    }

    fn log_actions(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT action FROM maintenance_logs ORDER BY id ASC")
            .unwrap();
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .collect::<Vec<_>>();
        rows.into_iter().map(|r| r.unwrap()).collect()
    }

    #[test]
    fn deletes_same_day_session_only_history_row() {
        let conn = setup_db();
        // start 2024-01-01, completion 2024-01-03 -> day 2, token abc
        insert_level(&conn, "abc_day2", "Level 1", 2);
        insert_history(&conn, "r1", "abc_day2", "Session Only", "2024-01-03", Some("-"), Some(99), false);

        let result = HistoryService::new().repair_invalid_sessions(&conn).unwrap();

        assert_eq!(result.deleted_same_day_session_only, 1);
        assert_eq!(history_count(&conn), 0, "invalid Session Only row must be deleted");
        assert_eq!(
            log_actions(&conn),
            vec!["history_session_deleted".to_string()],
            "deletion must be logged for tracking"
        );
    }

    #[test]
    fn keeps_session_only_when_no_event_same_day() {
        let conn = setup_db();
        // No level at all in the branch.
        insert_history(&conn, "r1", "abc_day2", "Session Only", "2024-01-03", Some("-"), Some(99), false);

        let result = HistoryService::new().repair_invalid_sessions(&conn).unwrap();

        assert_eq!(result.deleted_same_day_session_only, 0);
        assert_eq!(history_count(&conn), 1, "valid standalone session row stays");
        assert!(log_actions(&conn).is_empty());
    }

    #[test]
    fn keeps_session_only_when_event_is_on_another_day() {
        let conn = setup_db();
        // Real event on day 5, session completed on day 2.
        insert_level(&conn, "abc_day5", "Level 1", 5);
        insert_history(&conn, "r1", "abc_day2", "Session Only", "2024-01-03", Some("-"), Some(99), false);

        let result = HistoryService::new().repair_invalid_sessions(&conn).unwrap();

        assert_eq!(result.deleted_same_day_session_only, 0);
        assert_eq!(history_count(&conn), 1);
    }

    #[test]
    fn keeps_level_session_and_purchase_session_rows() {
        let conn = setup_db();
        insert_level(&conn, "abc_day2", "Level 1", 2);
        // Level Session is a legit compound pair row; Purchase Session has is_purchase = 1.
        insert_history(&conn, "r1", "abc_day2", "Level Session", "2024-01-03", Some("Level 1"), Some(1), false);
        insert_history(&conn, "r2", "pev1_day2", "Purchase Session", "2024-01-03", Some("$$$"), Some(5), true);

        let result = HistoryService::new().repair_invalid_sessions(&conn).unwrap();

        assert_eq!(result.deleted_same_day_session_only, 0);
        assert_eq!(history_count(&conn), 2, "compound and purchase rows are kept");
        assert!(log_actions(&conn).is_empty());
    }

    #[test]
    fn deletes_orphaned_session_level_history_row() {
        let conn = setup_db();
        // No real event same day (so rule (a) does not fire), but the referenced
        // '-' level was deleted -> the row is orphaned and must be removed.
        insert_history(&conn, "r1", "zzz_day2", "Session Only", "2024-01-03", Some("-"), Some(999), false);

        let result = HistoryService::new().repair_invalid_sessions(&conn).unwrap();

        assert_eq!(result.deleted_orphaned_session, 1);
        assert_eq!(history_count(&conn), 0);
        assert_eq!(log_actions(&conn), vec!["history_session_deleted".to_string()]);
    }

    #[test]
    fn ignores_row_without_parseable_start_date() {
        let conn = setup_db();
        // Break the account's start_date so the day cannot be computed safely.
        conn.execute("UPDATE accounts SET start_date = 'not-a-date' WHERE id = 1", [])
            .unwrap();
        insert_level(&conn, "abc_day2", "Level 1", 2);
        insert_history(&conn, "r1", "abc_day2", "Session Only", "2024-01-03", Some("-"), Some(99), false);

        let result = HistoryService::new().repair_invalid_sessions(&conn).unwrap();

        assert_eq!(result.deleted_same_day_session_only, 0);
        assert_eq!(history_count(&conn), 1, "unparseable rows are left untouched");
        assert!(log_actions(&conn).is_empty());
    }
}
