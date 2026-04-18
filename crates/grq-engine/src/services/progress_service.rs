// src-tauri/src/services/progress_service.rs

use crate::models::progress::*;
use rusqlite::{params, Connection};

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
            "INSERT INTO account_level_progress (account_id, level_id, is_completed, time_spent, target_date)
             VALUES (?1, ?2, 0, ?3, ?4)
             ON CONFLICT(account_id, level_id)
             DO UPDATE SET time_spent = COALESCE(NULLIF(?3, 0), time_spent), target_date = COALESCE(?4, target_date)",
            params![
                request.account_id,
                request.level_id,
                request.time_spent.unwrap_or(0),
                request.target_date
            ],
        )
        .map_err(|e| format!("Failed to create level progress: {}", e))?;

        Ok(())
    }

    pub fn update_level_progress(
        &self,
        conn: &Connection,
        request: UpdateAccountLevelProgressRequest,
    ) -> Result<bool, String> {
        if request.is_completed && !request.bypass_cooldown.unwrap_or(false) {
            // Cooldown check: Has anyone else completed this SAME level in the last 1 hour?
            let cooldown_exists: bool = conn
                .query_row(
                    "SELECT EXISTS(
                    SELECT 1 FROM account_level_progress
                    WHERE level_id = ?1 AND is_completed = 1
                    AND account_id != ?2
                    AND datetime(completed_at) > datetime('now', '-1 hour')
                 )",
                    params![request.level_id, request.account_id],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Failed to check level cooldown: {}", e))?;

            if cooldown_exists {
                return Err(
                    "Cooldown: Same level completed by another account within 1 hour. Please wait."
                        .to_string(),
                );
            }
        }

        let completed_at = if request.is_completed {
            Some(chrono::Utc::now().to_rfc3339())
        } else {
            None
        };

        conn.execute(
            "UPDATE account_level_progress
             SET is_completed = ?1, completed_at = ?2, time_spent = COALESCE(?3, time_spent), target_date = COALESCE(?4, target_date)
             WHERE account_id = ?5 AND level_id = ?6",
            params![
                if request.is_completed { 1 } else { 0 },
                completed_at,
                request.time_spent,
                request.target_date,
                request.account_id,
                request.level_id
            ],
        )
        .map_err(|e| format!("Failed to update level progress: {}", e))?;

        let changed = conn.changes() > 0;

        // Compatibility rule:
        // If an event level is marked completed, auto-complete its paired session level
        // (level_name = '-') for the same account, same branch, same base event token, same day.
        // This helps old DB snapshots where session/event pairs may be incomplete.
        if request.is_completed {
            let paired_session_level_id: Option<i64> = conn
                .query_row(
                    "SELECT ls.id
                     FROM levels le
                     JOIN levels ls
                       ON ls.branch_id = le.branch_id
                      AND ls.days_offset = le.days_offset
                      AND ls.level_name = '-'
                      AND ls.id != le.id
                      AND (
                           CASE
                             WHEN instr(ls.event_token, '_day') > 0 THEN substr(ls.event_token, 1, instr(ls.event_token, '_day') - 1)
                             ELSE ls.event_token
                           END
                          ) = (
                           CASE
                             WHEN instr(le.event_token, '_day') > 0 THEN substr(le.event_token, 1, instr(le.event_token, '_day') - 1)
                             ELSE le.event_token
                           END
                          )
                     WHERE le.id = ?1
                       AND le.level_name != '-'
                     LIMIT 1",
                    params![request.level_id],
                    |row| row.get(0),
                )
                .ok();

            if let Some(session_level_id) = paired_session_level_id {
                // Ensure progress row exists for session level
                conn.execute(
                    "INSERT INTO account_level_progress (account_id, level_id, is_completed, time_spent, target_date)
                     VALUES (?1, ?2, 1, 0, NULL)
                     ON CONFLICT(account_id, level_id) DO NOTHING",
                    params![request.account_id, session_level_id],
                )
                .map_err(|e| format!("Failed to ensure paired session progress exists: {}", e))?;

                // Mark paired session as completed if not already
                conn.execute(
                    "UPDATE account_level_progress
                     SET is_completed = 1,
                         completed_at = COALESCE(completed_at, ?1)
                     WHERE account_id = ?2
                       AND level_id = ?3",
                    params![
                        chrono::Utc::now().to_rfc3339(),
                        request.account_id,
                        session_level_id
                    ],
                )
                .map_err(|e| format!("Failed to auto-complete paired session level: {}", e))?;
            }
        }

        Ok(changed)
    }

    pub fn get_account_level_progress(
        &self,
        conn: &Connection,
        account_id: i64,
    ) -> Result<Vec<AccountLevelProgress>, String> {
        // Legacy compatibility auto-heal on read:
        // If event level progress is completed, ensure paired session level ('-') is also completed.
        conn.execute(
            "INSERT INTO account_level_progress (account_id, level_id, is_completed, time_spent, target_date, completed_at)
             SELECT
                 alp.account_id,
                 ls.id AS session_level_id,
                 1,
                 COALESCE(alp.time_spent, 0),
                 alp.target_date,
                 COALESCE(alp.completed_at, CURRENT_TIMESTAMP)
             FROM account_level_progress alp
             JOIN levels le ON le.id = alp.level_id
             JOIN levels ls
               ON ls.branch_id = le.branch_id
              AND ls.days_offset = le.days_offset
              AND ls.level_name = '-'
              AND ls.id != le.id
              AND (
                   CASE
                     WHEN instr(ls.event_token, '_day') > 0 THEN substr(ls.event_token, 1, instr(ls.event_token, '_day') - 1)
                     ELSE ls.event_token
                   END
                  ) = (
                   CASE
                     WHEN instr(le.event_token, '_day') > 0 THEN substr(le.event_token, 1, instr(le.event_token, '_day') - 1)
                     ELSE le.event_token
                   END
                  )
             WHERE alp.account_id = ?1
               AND alp.is_completed = 1
               AND le.level_name != '-'
               AND NOT EXISTS (
                   SELECT 1
                   FROM account_level_progress s
                   WHERE s.account_id = alp.account_id
                     AND s.level_id = ls.id
                     AND s.is_completed = 1
               )",
            params![account_id],
        )
        .map_err(|e| format!("Failed to auto-heal legacy split progress: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT account_id, level_id, is_completed, time_spent, target_date, completed_at
                 FROM account_level_progress WHERE account_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let progress_iter = stmt
            .query_map(params![account_id], |row| {
                Ok(AccountLevelProgress {
                    account_id: row.get(0)?,
                    level_id: row.get(1)?,
                    is_completed: row.get::<_, i32>(2)? != 0,
                    time_spent: row.get(3)?,
                    target_date: row.get(4).ok(),
                    completed_at: row.get(5).ok(),
                })
            })
            .map_err(|e| format!("Failed to query level progress: {}", e))?;

        let mut progress_list = Vec::new();
        for progress in progress_iter {
            progress_list
                .push(progress.map_err(|e| format!("Failed to map level progress: {}", e))?);
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
             (account_id, purchase_event_id, is_completed, days_offset, time_spent, target_date)
             VALUES (?1, ?2, 0, ?3, ?4, ?5)
             ON CONFLICT(account_id, purchase_event_id)
             DO UPDATE SET days_offset = ?3, time_spent = ?4, target_date = COALESCE(?5, target_date)",
            params![
                request.account_id,
                request.purchase_event_id,
                request.days_offset,
                request.time_spent,
                request.target_date
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

        let requested_is_completed = request.is_completed;

        if let Some(is_completed) = requested_is_completed {
            updates.push("is_completed = ?");
            values.push(Box::new(if is_completed { 1 } else { 0 }));
        }

        if request.is_completed.unwrap_or(false) && !request.bypass_cooldown.unwrap_or(false) {
            // Cooldown check: Has anyone else completed this SAME event in the last 1 hour?
            let cooldown_exists: bool = conn
                .query_row(
                    "SELECT EXISTS(
                    SELECT 1 FROM account_purchase_event_progress
                    WHERE purchase_event_id = ?1 AND is_completed = 1
                    AND account_id != ?2
                    AND datetime(completed_at) > datetime('now', '-1 hour')
                 )",
                    params![request.purchase_event_id, request.account_id],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Failed to check purchase event cooldown: {}", e))?;

            if cooldown_exists {
                return Err("Cooldown: Same purchase event completed by another account within 1 hour. Please wait.".to_string());
            }

            updates.push("completed_at = ?");
            values.push(Box::new(chrono::Utc::now().to_rfc3339()));
        } else if request.is_completed.unwrap_or(false) {
            // If completed but bypassing cooldown, we still need to set completed_at
            updates.push("completed_at = ?");
            values.push(Box::new(chrono::Utc::now().to_rfc3339()));
        }

        if let Some(days_offset) = request.days_offset {
            updates.push("days_offset = ?");
            values.push(Box::new(days_offset));
        }

        if let Some(time_spent) = request.time_spent {
            updates.push("time_spent = ?");
            values.push(Box::new(time_spent));
        }

        if let Some(target_date) = request.target_date {
            updates.push("target_date = ?");
            values.push(Box::new(target_date));
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

        let changed = conn.changes() > 0;

        // Compatibility rule:
        // If purchase event is marked completed, auto-complete paired session level(s)
        // for the same account and same branch/day/base token.
        if requested_is_completed.unwrap_or(false) {
            let pairs: Vec<(i64, i32)> = {
                let mut stmt = conn
                    .prepare(
                        "SELECT a.branch_id, pe.days_offset
                         FROM accounts a
                         JOIN purchase_events pe ON pe.id = ?1
                         WHERE a.id = ?2
                         LIMIT 1",
                    )
                    .map_err(|e| {
                        format!("Failed to prepare account/event branch/day query: {}", e)
                    })?;

                let rows = stmt
                    .query_map(
                        params![request.purchase_event_id, request.account_id],
                        |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, Option<i32>>(1)?)),
                    )
                    .map_err(|e| format!("Failed to query account/event branch/day: {}", e))?;

                let mut out = Vec::new();
                for row in rows {
                    let (branch_id_opt, day_opt) = row.map_err(|e| {
                        format!("Failed to map account/event branch/day row: {}", e)
                    })?;
                    if let (Some(branch_id), Some(day)) = (branch_id_opt, day_opt) {
                        out.push((branch_id, day));
                    }
                }
                out
            };

            if let Some((branch_id, day)) = pairs.first().copied() {
                // Find base token from purchase event
                let pe_token: Option<String> = conn
                    .query_row(
                        "SELECT event_token FROM purchase_events WHERE id = ?1 LIMIT 1",
                        params![request.purchase_event_id],
                        |row| row.get(0),
                    )
                    .ok();

                if let Some(token) = pe_token {
                    let session_level_id: Option<i64> = conn
                        .query_row(
                            "SELECT id
                             FROM levels
                             WHERE branch_id = ?1
                               AND days_offset = ?2
                               AND level_name = '-'
                               AND (
                                    CASE
                                      WHEN instr(event_token, '_day') > 0 THEN substr(event_token, 1, instr(event_token, '_day') - 1)
                                      ELSE event_token
                                    END
                                   ) = (
                                    CASE
                                      WHEN instr(?3, '_day') > 0 THEN substr(?3, 1, instr(?3, '_day') - 1)
                                      ELSE ?3
                                    END
                                   )
                             LIMIT 1",
                            params![branch_id, day, token],
                            |row| row.get(0),
                        )
                        .ok();

                    if let Some(level_id) = session_level_id {
                        conn.execute(
                            "INSERT INTO account_level_progress (account_id, level_id, is_completed, time_spent, target_date)
                             VALUES (?1, ?2, 1, 0, NULL)
                             ON CONFLICT(account_id, level_id) DO NOTHING",
                            params![request.account_id, level_id],
                        )
                        .map_err(|e| format!("Failed to ensure session progress for purchase completion: {}", e))?;

                        conn.execute(
                            "UPDATE account_level_progress
                             SET is_completed = 1,
                                 completed_at = COALESCE(completed_at, ?1)
                             WHERE account_id = ?2
                               AND level_id = ?3",
                            params![
                                chrono::Utc::now().to_rfc3339(),
                                request.account_id,
                                level_id
                            ],
                        )
                        .map_err(|e| {
                            format!(
                                "Failed to auto-complete paired session from purchase event: {}",
                                e
                            )
                        })?;
                    }
                }
            }
        }

        Ok(changed)
    }

    pub fn get_account_purchase_event_progress(
        &self,
        conn: &Connection,
        account_id: i64,
    ) -> Result<Vec<AccountPurchaseEventProgress>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT account_id, purchase_event_id, is_completed, days_offset, time_spent, target_date, completed_at
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
                    target_date: row.get(5).ok(),
                    completed_at: row.get(6).ok(),
                })
            })
            .map_err(|e| format!("Failed to query purchase event progress: {}", e))?;

        let mut progress_list = Vec::new();
        for progress in progress_iter {
            progress_list.push(
                progress.map_err(|e| format!("Failed to map purchase event progress: {}", e))?,
            );
        }

        Ok(progress_list)
    }
}
