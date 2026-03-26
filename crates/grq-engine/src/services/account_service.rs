// src-tauri/src/services/account_service.rs

use rusqlite::{params, OptionalExtension, Connection};
use crate::models::account::{Account, CreateAccountRequest, UpdateAccountRequest};

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
}

pub struct AccountService;

impl AccountService {
    pub fn new() -> Self {
        AccountService
    }

    pub fn create_account(&self, conn: &Connection, request: CreateAccountRequest) -> Result<i64, String> {
        // التحقق من وجود اللعبة
        let game_exists: i64 = conn.query_row(
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

        conn.execute(
            "INSERT INTO accounts (game_id, name, start_date, start_time, request_template)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                request.game_id,
                request.name,
                request.start_date,
                request.start_time,
                request.request_template,
            ],
        )
        .map_err(|e| format!("Failed to create account: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_accounts_by_game(&self, conn: &Connection, game_id: i64) -> Result<Vec<Account>, String> {
        let mut stmt = conn.prepare(
            "SELECT id, game_id, name, start_date, start_time, request_template, created_at
             FROM accounts WHERE game_id = ?1 ORDER BY created_at"
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let accounts_iter = stmt.query_map(params![game_id], |row| {
            Ok(Account {
                id: row.get(0)?,
                game_id: row.get(1)?,
                name: row.get(2)?,
                start_date: row.get(3)?,
                start_time: row.get(4)?,
                request_template: row.get(5)?,
                created_at: row.get(6).ok(),
            })
        })
        .map_err(|e| format!("Failed to query accounts: {}", e))?;

        let mut accounts = Vec::new();
        for account in accounts_iter {
            accounts.push(account.map_err(|e| format!("Failed to map account: {}", e))?);
        }

        Ok(accounts)
    }

    pub fn get_completed_accounts(&self, conn: &Connection) -> Result<Vec<CompletedAccount>, String> {
        let mut stmt = conn.prepare("
            SELECT a.id, a.game_id, a.name, a.start_date, a.start_time, a.request_template, a.created_at, g.name
            FROM accounts a
            JOIN games g ON a.game_id = g.id
            WHERE 
                (SELECT COUNT(*) FROM levels l WHERE l.game_id = a.game_id) > 0
                AND 
                (SELECT COUNT(*) FROM levels l WHERE l.game_id = a.game_id) = 
                (SELECT COUNT(*) FROM account_level_progress alp 
                 JOIN levels l ON alp.level_id = l.id 
                 WHERE alp.account_id = a.id AND alp.is_completed = 1)
                AND
                (SELECT COUNT(*) FROM purchase_events pe WHERE pe.game_id = a.game_id) =
                (SELECT COUNT(*) FROM account_purchase_event_progress apep
                 JOIN purchase_events pe ON apep.purchase_event_id = pe.id
                 WHERE apep.account_id = a.id AND apep.is_completed = 1)
            ORDER BY a.created_at DESC
        ").map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let accounts_iter = stmt.query_map([], |row| {
            Ok(CompletedAccount {
                id: row.get(0)?,
                game_id: row.get(1)?,
                name: row.get(2)?,
                start_date: row.get(3)?,
                start_time: row.get(4)?,
                request_template: row.get(5)?,
                created_at: row.get(6).ok(),
                game_name: row.get(7)?,
            })
        }).map_err(|e| format!("Failed to query completed accounts: {}", e))?;

        let mut accounts = Vec::new();
        for account in accounts_iter {
            accounts.push(account.map_err(|e| format!("Failed to map completed account: {}", e))?);
        }

        Ok(accounts)
    }

    pub fn get_account_by_id(&self, conn: &Connection, id: i64) -> Result<Option<Account>, String> {
        conn.query_row(
            "SELECT id, game_id, name, start_date, start_time, request_template, created_at
             FROM accounts WHERE id = ?1",
            params![id],
            |row| {
                Ok(Account {
                    id: row.get(0)?,
                    game_id: row.get(1)?,
                    name: row.get(2)?,
                    start_date: row.get(3)?,
                    start_time: row.get(4)?,
                    request_template: row.get(5)?,
                    created_at: row.get(6).ok(),
                })
            }
        )
        .optional()
        .map_err(|e| format!("Failed to get account: {}", e))
    }

    pub fn update_account(&self, conn: &Connection, request: UpdateAccountRequest) -> Result<bool, String> {
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
}
