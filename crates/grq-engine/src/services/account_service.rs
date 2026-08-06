// src-tauri/src/services/account_service.rs

use crate::models::account::{
    Account, AccountBranchTransferResult, CreateAccountRequest, TransferPreview,
    UpdateAccountRequest,
};
use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct CompletedAccount {
    pub id: i64,
    pub branch_id: Option<i64>,
    pub game_id: i64,
    pub name: String,
    pub start_date: String,
    pub start_time: String,
    pub request_template: String,
    pub created_at: Option<String>,
    pub game_name: String,
    pub package_id: Option<i32>,
    pub proxy_state: Option<String>,
}

pub struct AccountService;

impl AccountService {
    pub fn new() -> Self {
        AccountService
    }

    pub fn create_account(
        &self,
        conn: &Connection,
        request: CreateAccountRequest,
    ) -> Result<i64, String> {
        // التحقق من وجود اللعبة
        let game_exists: i64 = conn
            .query_row(
                "SELECT 1 FROM games WHERE id = ?1",
                params![request.game_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to check game existence: {}", e))?
            .unwrap_or(0);

        if game_exists == 0 {
            return Err(format!("Game with ID {} not found", request.game_id));
        }

        use crate::services::region_service::RegionService;
        let sub_regions = RegionService::new().sub_region_names(conn)?;

        // 1. Find a package_id that doesn't have this game_id yet. Legacy
        // 'UK' packages (from before the region was removed) are never reused,
        // and neither are frozen sub-regions (they must not receive new accounts).
        let frozen_names = RegionService::new().frozen_names(conn)?;
        let mut proxy_state_condition = "AND proxy_state != 'UK'".to_string();
        if !frozen_names.is_empty() {
            let placeholders = frozen_names
                .iter()
                .map(|_| "?")
                .collect::<Vec<_>>()
                .join(", ");
            proxy_state_condition.push_str(&format!(
                " AND proxy_state NOT IN ({})",
                placeholders
            ));
        }

        let query = format!(
            "SELECT DISTINCT package_id, proxy_state FROM accounts 
             WHERE package_id NOT IN (SELECT package_id FROM accounts WHERE game_id = ?1)
             {}
             ORDER BY package_id LIMIT 1",
            proxy_state_condition
        );

        let package_info: Option<(i32, String)> = {
            let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
            values.push(Box::new(request.game_id));
            for name in &frozen_names {
                values.push(Box::new(name.as_str()));
            }
            let ref_values: Vec<&dyn rusqlite::ToSql> =
                values.iter().map(|b| b.as_ref()).collect();
            conn.query_row(
                &query,
                ref_values.as_slice(),
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| format!("Failed to find available package: {}", e))?
        };

        let (package_id, mut proxy_state) = match package_info {
            Some((pid, state)) => (pid, state),
            None => {
                // If no package is available, create a new one
                let max_id: i32 = conn
                    .query_row(
                        "SELECT COALESCE(MAX(package_id), 0) FROM accounts",
                        [],
                        |row| row.get(0),
                    )
                    .map_err(|e| format!("Failed to get max package_id: {}", e))?;

                let next_id = max_id + 1;

                // Get states already used by this game today
                let mut stmt = conn
                    .prepare(
                        "SELECT DISTINCT proxy_state FROM accounts 
                     WHERE game_id = ?1 AND date(created_at) = date('now')",
                    )
                    .map_err(|e| format!("Failed to prepare state check: {}", e))?;

                let used_states: Vec<String> = stmt
                    .query_map(params![request.game_id], |row| row.get(0))
                    .map_err(|e| format!("Failed to query used states: {}", e))?
                    .collect::<Result<Vec<String>, _>>()
                    .map_err(|e| format!("Failed to collect used states: {}", e))?;

                // Find a sub-region that hasn't been used today for this game if possible
                if sub_regions.is_empty() {
                    return Err(
                        "Unable to assign a sub-region: all sub-regions are frozen".to_string(),
                    );
                }
                let mut chosen =
                    sub_regions[(next_id - 1) as usize % sub_regions.len()].clone();

                if used_states.contains(&chosen) {
                    for state in &sub_regions {
                        if !used_states.contains(state) {
                            chosen = state.clone();
                            break;
                        }
                    }
                }

                (next_id, chosen)
            }
        };

        // Respect an explicitly chosen sub-region (from the UI region selector)
        // over the automatic round-robin assignment.
        if let Some(picked) = request.proxy_state.as_deref().map(str::trim) {
            if !picked.is_empty() {
                proxy_state = picked.to_string();
            }
        }

        conn.execute(
            "INSERT INTO accounts (game_id, branch_id, name, start_date, start_time, request_template, package_id, proxy_state)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                request.game_id,
                request.branch_id.or_else(|| {
                    // Try to find default branch if not provided
                    conn.query_row(
                        "SELECT id FROM game_branches WHERE game_id = ?1 AND is_default = 1",
                        params![request.game_id],
                        |row| row.get::<_, i64>(0),
                    ).ok()
                }),
                request.name,
                request.start_date,
                request.start_time,
                request.request_template,
                package_id,
                proxy_state,
            ],
        )
        .map_err(|e| format!("Failed to create account: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_accounts_by_game(
        &self,
        conn: &Connection,
        game_id: i64,
    ) -> Result<Vec<Account>, String> {
        let mut stmt = conn.prepare(
            "SELECT a.id, a.game_id, a.branch_id, a.name, a.start_date, a.start_time, a.request_template, a.created_at, a.package_id, a.proxy_state, b.name as branch_name
             FROM accounts a
             LEFT JOIN game_branches b ON a.branch_id = b.id
             WHERE a.game_id = ?1 ORDER BY a.created_at"
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let accounts_iter = stmt
            .query_map(params![game_id], |row| {
                Ok(Account {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    branch_id: row.get(2).ok(),
                    name: row.get(3)?,
                    start_date: row.get(4)?,
                    start_time: row.get(5)?,
                    request_template: row.get(6)?,
                    created_at: row.get(7).ok(),
                    package_id: row.get(8).ok(),
                    proxy_state: row.get(9).ok(),
                    branch_name: row.get(10).ok(),
                })
            })
            .map_err(|e| format!("Failed to query accounts: {}", e))?;

        let mut accounts = Vec::new();
        for account in accounts_iter {
            accounts.push(account.map_err(|e| format!("Failed to map account: {}", e))?);
        }

        Ok(accounts)
    }

    pub fn get_completed_accounts(
        &self,
        conn: &Connection,
    ) -> Result<Vec<CompletedAccount>, String> {
        let mut stmt = conn.prepare("
            SELECT a.id, a.branch_id, a.game_id, a.name, a.start_date, a.start_time,
                   a.request_template, a.created_at, g.name, a.package_id, a.proxy_state
            FROM accounts a
            JOIN games g ON a.game_id = g.id
            WHERE a.branch_id IS NULL
               OR (
                   COALESCE((SELECT COUNT(*) FROM levels l WHERE l.branch_id = a.branch_id), 0)
                   =
                   COALESCE((SELECT COUNT(*) FROM account_level_progress alp
                             JOIN levels l ON alp.level_id = l.id
                             WHERE alp.account_id = a.id AND l.branch_id = a.branch_id AND alp.is_completed = 1), 0)
                   AND
                   COALESCE((SELECT COUNT(*) FROM purchase_events pe WHERE pe.branch_id = a.branch_id), 0)
                   =
                   COALESCE((SELECT COUNT(*) FROM account_purchase_event_progress apep
                             JOIN purchase_events pe ON apep.purchase_event_id = pe.id
                             WHERE apep.account_id = a.id AND pe.branch_id = a.branch_id AND apep.is_completed = 1), 0)
               )
            ORDER BY a.created_at DESC
        ").map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let accounts_iter = stmt
            .query_map([], |row| {
                Ok(CompletedAccount {
                    id: row.get(0)?,
                    branch_id: row.get(1).ok(),
                    game_id: row.get(2)?,
                    name: row.get(3)?,
                    start_date: row.get(4)?,
                    start_time: row.get(5)?,
                    request_template: row.get(6)?,
                    created_at: row.get(7).ok(),
                    game_name: row.get(8)?,
                    package_id: row.get(9).ok(),
                    proxy_state: row.get(10).ok(),
                })
            })
            .map_err(|e| format!("Failed to query completed accounts: {}", e))?;

        let mut accounts = Vec::new();
        for account in accounts_iter {
            accounts.push(account.map_err(|e| format!("Failed to map completed account: {}", e))?);
        }

        Ok(accounts)
    }

    pub fn get_account_by_id(&self, conn: &Connection, id: i64) -> Result<Option<Account>, String> {
        conn.query_row(
            "SELECT a.id, a.game_id, a.branch_id, a.name, a.start_date, a.start_time, a.request_template, a.created_at, a.package_id, a.proxy_state, b.name as branch_name
             FROM accounts a
             LEFT JOIN game_branches b ON a.branch_id = b.id
             WHERE a.id = ?1",
            params![id],
            |row| {
                Ok(Account {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    branch_id: row.get(2).ok(),
                    name: row.get(3)?,
                    start_date: row.get(4)?,
                    start_time: row.get(5)?,
                    request_template: row.get(6)?,
                    created_at: row.get(7).ok(),
                    package_id: row.get(8).ok(),
                    proxy_state: row.get(9).ok(),
                    branch_name: row.get(10).ok(),
                })
            }
        )
        .optional()
        .map_err(|e| format!("Failed to get account: {}", e))
    }

    pub fn get_all_accounts(&self, conn: &Connection) -> Result<Vec<Account>, String> {
        let mut stmt = conn.prepare(
            "SELECT a.id, a.game_id, a.branch_id, a.name, a.start_date, a.start_time, a.request_template, a.created_at, a.package_id, a.proxy_state, b.name as branch_name
             FROM accounts a
             LEFT JOIN game_branches b ON a.branch_id = b.id
             ORDER BY a.package_id"
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let accounts_iter = stmt
            .query_map([], |row| {
                Ok(Account {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    branch_id: row.get(2).ok(),
                    name: row.get(3)?,
                    start_date: row.get(4)?,
                    start_time: row.get(5)?,
                    request_template: row.get(6)?,
                    created_at: row.get(7).ok(),
                    package_id: row.get(8).ok(),
                    proxy_state: row.get(9).ok(),
                    branch_name: row.get(10).ok(),
                })
            })
            .map_err(|e| format!("Failed to query all accounts: {}", e))?;

        let mut accounts = Vec::new();
        for account in accounts_iter {
            accounts.push(account.map_err(|e| format!("Failed to map account: {}", e))?);
        }

        Ok(accounts)
    }

    pub fn update_account(
        &self,
        conn: &Connection,
        request: UpdateAccountRequest,
    ) -> Result<bool, String> {
        let mut updates = Vec::new();
        let mut values = Vec::new();

        if let Some(name) = &request.name {
            updates.push("name = ?");
            values.push(name as &dyn rusqlite::ToSql);
        }

        if let Some(start_date) = &request.start_date {
            updates.push("start_date = ?");
            values.push(start_date as &dyn rusqlite::ToSql);
        }

        if let Some(start_time) = &request.start_time {
            updates.push("start_time = ?");
            values.push(start_time as &dyn rusqlite::ToSql);
        }

        if let Some(branch_id) = &request.branch_id {
            updates.push("branch_id = ?");
            values.push(branch_id as &dyn rusqlite::ToSql);
        }

        if let Some(proxy_state) = &request.proxy_state {
            updates.push("proxy_state = ?");
            values.push(proxy_state as &dyn rusqlite::ToSql);
        }

        if let Some(request_template) = &request.request_template {
            updates.push("request_template = ?");
            values.push(request_template as &dyn rusqlite::ToSql);
        }

        if updates.is_empty() {
            return Ok(false);
        }

        let sql = format!("UPDATE accounts SET {} WHERE id = ?", updates.join(", "));
        values.push(&request.id as &dyn rusqlite::ToSql);

        conn.execute(&sql, values.as_slice())
            .map_err(|e| format!("Failed to update account: {}", e))?;

        Ok(conn.changes() > 0)
    }

    pub fn delete_account(&self, conn: &Connection, id: i64) -> Result<bool, String> {
        conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete account: {}", e))?;

        Ok(conn.changes() > 0)
    }

    // ── helpers ──────────────────────────────────────────────────────────

    pub(crate) fn get_branch_levels(
        conn: &Connection,
        branch_id: i64,
    ) -> Result<Vec<(i64, String)>, String> {
        let mut stmt = conn
            .prepare("SELECT id, event_token FROM levels WHERE branch_id = ?1")
            .map_err(|e| format!("Failed to prepare levels query: {}", e))?;
        let rows = stmt
            .query_map(params![branch_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("Failed to query levels: {}", e))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("Failed to map level: {}", e))?);
        }
        Ok(out)
    }

    pub(crate) fn get_branch_purchase_events(
        conn: &Connection,
        branch_id: i64,
    ) -> Result<Vec<(i64, String)>, String> {
        let mut stmt = conn
            .prepare("SELECT id, event_token FROM purchase_events WHERE branch_id = ?1")
            .map_err(|e| format!("Failed to prepare purchase events query: {}", e))?;
        let rows = stmt
            .query_map(params![branch_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("Failed to query purchase events: {}", e))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("Failed to map purchase event: {}", e))?);
        }
        Ok(out)
    }

    fn get_branch_name(
        conn: &Connection,
        branch_id: i64,
    ) -> Result<(String, i64), String> {
        conn.query_row(
            "SELECT name, game_id FROM game_branches WHERE id = ?1",
            params![branch_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Branch not found: {}", e))
    }

    // ── preview ──────────────────────────────────────────────────────────

    pub fn preview_transfer_account_branch(
        &self,
        conn: &Connection,
        account_id: i64,
        target_branch_id: i64,
    ) -> Result<TransferPreview, String> {
        let account = self
            .get_account_by_id(conn, account_id)?
            .ok_or_else(|| format!("Account with ID {} not found", account_id))?;

        let (_target_branch_name, target_game_id): (String, i64) =
            Self::get_branch_name(conn, target_branch_id)?;

        if let Some(source_branch_id) = account.branch_id {
            if source_branch_id == target_branch_id {
                return Err("Account is already in this branch".to_string());
            }
            let (_source_name, source_game_id) = Self::get_branch_name(conn, source_branch_id)?;
            if source_game_id != target_game_id {
                return Err("Cannot transfer account to a branch of a different game".to_string());
            }
        }

        let target_levels = Self::get_branch_levels(conn, target_branch_id)?;
        let target_purchase_events = Self::get_branch_purchase_events(conn, target_branch_id)?;

        let target_level_tokens: std::collections::HashSet<&str> =
            target_levels.iter().map(|(_, t)| t.as_str()).collect();
        let target_pe_tokens: std::collections::HashSet<&str> =
            target_purchase_events.iter().map(|(_, t)| t.as_str()).collect();

        // Get source branch data if account has a branch
        let (source_levels, source_purchase_events) = if let Some(sb_id) = account.branch_id {
            (
                Self::get_branch_levels(conn, sb_id)?,
                Self::get_branch_purchase_events(conn, sb_id)?,
            )
        } else {
            (vec![], vec![])
        };

        let mut matched_levels = Vec::new();
        let mut missing_levels = Vec::new();
        for (_id, token) in &source_levels {
            if target_level_tokens.contains(token.as_str()) {
                matched_levels.push(token.clone());
            } else {
                missing_levels.push(token.clone());
            }
        }

        let mut matched_purchase_events = Vec::new();
        let mut missing_purchase_events = Vec::new();
        for (_id, token) in &source_purchase_events {
            if target_pe_tokens.contains(token.as_str()) {
                matched_purchase_events.push(token.clone());
            } else {
                missing_purchase_events.push(token.clone());
            }
        }

        Ok(TransferPreview {
            matched_levels,
            missing_levels,
            matched_purchase_events,
            missing_purchase_events,
            total_source_levels: source_levels.len(),
            total_target_levels: target_levels.len(),
            total_source_purchase_events: source_purchase_events.len(),
            total_target_purchase_events: target_purchase_events.len(),
        })
    }

    // ── transfer ──────────────────────────────────────────────────────────

    pub fn transfer_account_branch(
        &self,
        conn: &Connection,
        account_id: i64,
        target_branch_id: i64,
    ) -> Result<AccountBranchTransferResult, String> {
        let account = self
            .get_account_by_id(conn, account_id)?
            .ok_or_else(|| format!("Account with ID {} not found", account_id))?;

        let source_branch_id = account.branch_id;

        // If account has no branch, this is a first-time assignment
        if source_branch_id == Some(target_branch_id) {
            return Err("Account is already in this branch".to_string());
        }

        let (target_branch_name, target_game_id): (String, i64) =
            Self::get_branch_name(conn, target_branch_id)?;

        if let Some(sb_id) = source_branch_id {
            let (_source_name, source_game_id) = Self::get_branch_name(conn, sb_id)?;
            if source_game_id != target_game_id {
                return Err("Cannot transfer account to a branch of a different game".to_string());
            }
        }

        // If account had no branch, simple assignment
        if source_branch_id.is_none() {
            conn.execute(
                "UPDATE accounts SET branch_id = ?1 WHERE id = ?2",
                params![target_branch_id, account_id],
            )
            .map_err(|e| format!("Failed to update account branch: {}", e))?;

            return Ok(AccountBranchTransferResult {
                account_id,
                account_name: account.name,
                source_branch_id: None,
                source_branch_name: None,
                target_branch_id,
                target_branch_name,
                transferred_levels: 0,
                transferred_purchase_events: 0,
                warnings: vec![],
            });
        }

        let sb_id = source_branch_id.unwrap();
        let (source_branch_name, _source_game_id) = Self::get_branch_name(conn, sb_id)?;

        let source_levels = Self::get_branch_levels(conn, sb_id)?;
        let target_levels = Self::get_branch_levels(conn, target_branch_id)?;
        let source_purchase_events = Self::get_branch_purchase_events(conn, sb_id)?;
        let target_purchase_events = Self::get_branch_purchase_events(conn, target_branch_id)?;

        // Build token → id maps for target branch
        let target_level_map: std::collections::HashMap<&str, i64> = target_levels
            .iter()
            .map(|(id, token)| (token.as_str(), *id))
            .collect();

        let target_pe_map: std::collections::HashMap<&str, i64> = target_purchase_events
            .iter()
            .map(|(id, token)| (token.as_str(), *id))
            .collect();

        // Get current progress
        let level_progress: Vec<(i64, i32, bool, Option<String>, Option<String>)> = {
            let mut stmt = conn
                .prepare(
                    "SELECT level_id, time_spent, is_completed, target_date, completed_at
                     FROM account_level_progress WHERE account_id = ?1",
                )
                .map_err(|e| format!("Failed to prepare level progress query: {}", e))?;
            let rows = stmt
                .query_map(params![account_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i32>(1)?,
                        row.get::<_, i32>(2)? != 0,
                        row.get::<_, Option<String>>(3).ok().flatten(),
                        row.get::<_, Option<String>>(4).ok().flatten(),
                    ))
                })
                .map_err(|e| format!("Failed to query level progress: {}", e))?;
            let mut out = Vec::new();
            for row in rows {
                out.push(row.map_err(|e| format!("Failed to map level progress: {}", e))?);
            }
            out
        };

        let purchase_progress: Vec<(i64, i32, i32, bool, Option<String>, Option<String>)> = {
            let mut stmt = conn
                .prepare(
                    "SELECT purchase_event_id, days_offset, time_spent, is_completed, target_date, completed_at
                     FROM account_purchase_event_progress WHERE account_id = ?1",
                )
                .map_err(|e| format!("Failed to prepare purchase progress query: {}", e))?;
            let rows = stmt
                .query_map(params![account_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i32>(1)?,
                        row.get::<_, i32>(2)?,
                        row.get::<_, i32>(3)? != 0,
                        row.get::<_, Option<String>>(4).ok().flatten(),
                        row.get::<_, Option<String>>(5).ok().flatten(),
                    ))
                })
                .map_err(|e| format!("Failed to query purchase progress: {}", e))?;
            let mut out = Vec::new();
            for row in rows {
                out.push(row.map_err(|e| format!("Failed to map purchase progress: {}", e))?);
            }
            out
        };

        // Build source level_id → event_token map
        let source_level_token_map: std::collections::HashMap<i64, &str> = source_levels
            .iter()
            .map(|(id, token)| (*id, token.as_str()))
            .collect();

        let source_pe_token_map: std::collections::HashMap<i64, &str> = source_purchase_events
            .iter()
            .map(|(id, token)| (*id, token.as_str()))
            .collect();

        let mut warnings: Vec<String> = Vec::new();
        let mut transferred_levels: usize = 0;
        let mut transferred_purchase_events: usize = 0;

        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("Failed to start transaction: {}", e))?;

        // Transfer level progress
        for (old_level_id, time_spent, is_completed, target_date, completed_at) in &level_progress
        {
            let token = match source_level_token_map.get(old_level_id) {
                Some(t) => *t,
                None => {
                    warnings.push(format!(
                        "Level ID {} not found in source branch, skipping",
                        old_level_id
                    ));
                    continue;
                }
            };

            match target_level_map.get(token) {
                Some(&new_level_id) => {
                    tx.execute(
                        "INSERT INTO account_level_progress (account_id, level_id, is_completed, time_spent, target_date, completed_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                         ON CONFLICT(account_id, level_id) DO UPDATE SET
                           is_completed = excluded.is_completed,
                           time_spent = excluded.time_spent,
                           target_date = excluded.target_date,
                           completed_at = COALESCE(excluded.completed_at, account_level_progress.completed_at)",
                        params![
                            account_id,
                            new_level_id,
                            if *is_completed { 1 } else { 0 },
                            time_spent,
                            target_date,
                            completed_at,
                        ],
                    )
                    .map_err(|e| format!("Failed to upsert level progress: {}", e))?;

                    tx.execute(
                        "DELETE FROM account_level_progress WHERE account_id = ?1 AND level_id = ?2",
                        params![account_id, old_level_id],
                    )
                    .map_err(|e| format!("Failed to delete old level progress: {}", e))?;

                    transferred_levels += 1;
                }
                None => {
                    warnings.push(format!(
                        "No matching level found in target branch for event token '{}'",
                        token
                    ));
                }
            }
        }

        // Transfer purchase event progress
        for (
            old_pe_id,
            days_offset,
            time_spent,
            is_completed,
            target_date,
            completed_at,
        ) in &purchase_progress
        {
            let token = match source_pe_token_map.get(old_pe_id) {
                Some(t) => *t,
                None => {
                    warnings.push(format!(
                        "Purchase event ID {} not found in source branch, skipping",
                        old_pe_id
                    ));
                    continue;
                }
            };

            match target_pe_map.get(token) {
                Some(&new_pe_id) => {
                    tx.execute(
                        "INSERT INTO account_purchase_event_progress (account_id, purchase_event_id, days_offset, time_spent, is_completed, target_date, completed_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                         ON CONFLICT(account_id, purchase_event_id) DO UPDATE SET
                           days_offset = excluded.days_offset,
                           time_spent = excluded.time_spent,
                           is_completed = excluded.is_completed,
                           target_date = excluded.target_date,
                           completed_at = COALESCE(excluded.completed_at, account_purchase_event_progress.completed_at)",
                        params![
                            account_id,
                            new_pe_id,
                            days_offset,
                            time_spent,
                            if *is_completed { 1 } else { 0 },
                            target_date,
                            completed_at,
                        ],
                    )
                    .map_err(|e| format!("Failed to upsert purchase event progress: {}", e))?;

                    tx.execute(
                        "DELETE FROM account_purchase_event_progress WHERE account_id = ?1 AND purchase_event_id = ?2",
                        params![account_id, old_pe_id],
                    )
                    .map_err(|e| format!("Failed to delete old purchase event progress: {}", e))?;

                    transferred_purchase_events += 1;
                }
                None => {
                    warnings.push(format!(
                        "No matching purchase event found in target branch for event token '{}'",
                        token
                    ));
                }
            }
        }

        // Update account's branch
        tx.execute(
            "UPDATE accounts SET branch_id = ?1 WHERE id = ?2",
            params![target_branch_id, account_id],
        )
        .map_err(|e| format!("Failed to update account branch: {}", e))?;

        tx.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;

        Ok(AccountBranchTransferResult {
            account_id,
            account_name: account.name,
            source_branch_id: Some(sb_id),
            source_branch_name: Some(source_branch_name),
            target_branch_id,
            target_branch_name,
            transferred_levels,
            transferred_purchase_events,
            warnings,
        })
    }

    pub fn is_account_completed(&self, conn: &Connection, account_id: i64) -> Result<bool, String> {
        let is_completed: bool = conn
            .query_row(
                "SELECT 
                ((SELECT COUNT(*) FROM levels l WHERE l.branch_id = a.branch_id) > 0
                AND 
                (SELECT COUNT(*) FROM levels l WHERE l.branch_id = a.branch_id) = 
                (SELECT COUNT(*) FROM account_level_progress alp 
                 JOIN levels l ON alp.level_id = l.id 
                 WHERE alp.account_id = a.id AND alp.is_completed = 1)
                AND
                (SELECT COUNT(*) FROM purchase_events pe WHERE pe.branch_id = a.branch_id) =
                (SELECT COUNT(*) FROM account_purchase_event_progress apep
                 JOIN purchase_events pe ON apep.purchase_event_id = pe.id
                 WHERE apep.account_id = a.id AND apep.is_completed = 1)) as is_comp
            FROM accounts a
            WHERE a.id = ?1",
                params![account_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check account completion: {}", e))?;

        Ok(is_completed)
    }
}
