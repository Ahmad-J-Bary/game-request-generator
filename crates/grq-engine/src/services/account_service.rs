// src-tauri/src/services/account_service.rs

use crate::models::account::{Account, CreateAccountRequest, UpdateAccountRequest};
use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct CompletedAccount {
    pub id: i64,
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

        use crate::models::account::PROXY_STATES;

        // 1. Find a package_id that doesn't have this game_id yet
        let package_info: Option<(i32, String)> = conn
            .query_row(
                "SELECT DISTINCT package_id, proxy_state FROM accounts 
             WHERE package_id NOT IN (SELECT package_id FROM accounts WHERE game_id = ?1)
             ORDER BY package_id LIMIT 1",
                params![request.game_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| format!("Failed to find available package: {}", e))?;

        let (package_id, proxy_state) = match package_info {
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

                // Find a state that hasn't been used today for this game if possible
                let mut chosen_state =
                    PROXY_STATES[(next_id - 1) as usize % PROXY_STATES.len()].to_string();

                if used_states.contains(&chosen_state) {
                    for state in PROXY_STATES {
                        if !used_states.contains(&(*state).to_string()) {
                            chosen_state = (*state).to_string();
                            break;
                        }
                    }
                }

                (next_id, chosen_state)
            }
        };

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
            "SELECT id, game_id, branch_id, name, start_date, start_time, request_template, created_at, package_id, proxy_state
             FROM accounts WHERE game_id = ?1 ORDER BY created_at"
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
            SELECT a.id, a.game_id, a.name, a.start_date, a.start_time, a.request_template, a.created_at, g.name, a.package_id, a.proxy_state
            FROM accounts a
            JOIN games g ON a.game_id = g.id
            WHERE 
                (SELECT COUNT(*) FROM levels l WHERE l.branch_id = a.branch_id) > 0
                AND 
                (SELECT COUNT(*) FROM levels l WHERE l.branch_id = a.branch_id) = 
                (SELECT COUNT(*) FROM account_level_progress alp 
                 JOIN levels l ON alp.level_id = l.id 
                 WHERE alp.account_id = a.id AND alp.is_completed = 1)
                AND
                (SELECT COUNT(*) FROM purchase_events pe WHERE pe.branch_id = a.branch_id) =
                (SELECT COUNT(*) FROM account_purchase_event_progress apep
                 JOIN purchase_events pe ON apep.purchase_event_id = pe.id
                 WHERE apep.account_id = a.id AND apep.is_completed = 1)
            ORDER BY a.created_at DESC
        ").map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let accounts_iter = stmt
            .query_map([], |row| {
                Ok(CompletedAccount {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    name: row.get(2)?,
                    start_date: row.get(3)?,
                    start_time: row.get(4)?,
                    request_template: row.get(5)?,
                    created_at: row.get(6).ok(),
                    game_name: row.get(7)?,
                    package_id: row.get(8).ok(),
                    proxy_state: row.get(9).ok(),
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
            "SELECT id, game_id, branch_id, name, start_date, start_time, request_template, created_at, package_id, proxy_state
             FROM accounts WHERE id = ?1",
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
                })
            }
        )
        .optional()
        .map_err(|e| format!("Failed to get account: {}", e))
    }

    pub fn get_all_accounts(&self, conn: &Connection) -> Result<Vec<Account>, String> {
        let mut stmt = conn.prepare(
            "SELECT id, game_id, branch_id, name, start_date, start_time, request_template, created_at, package_id, proxy_state
             FROM accounts ORDER BY package_id"
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
