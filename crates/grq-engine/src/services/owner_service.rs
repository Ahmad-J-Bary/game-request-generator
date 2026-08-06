// src-tauri/src/services/owner_service.rs

use crate::models::owner::{CreateOwnerRequest, Owner, UpdateOwnerRequest};
use rusqlite::{params, Connection, OptionalExtension};

pub struct OwnerService;

impl OwnerService {
    pub fn new() -> Self {
        OwnerService
    }

    pub fn list(&self, conn: &Connection) -> Result<Vec<Owner>, String> {
        let mut stmt = conn
            .prepare("SELECT id, name FROM owners ORDER BY lower(name), id")
            .map_err(|e| format!("Failed to prepare owners query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Owner {
                    id: row.get(0)?,
                    name: row.get(1)?,
                })
            })
            .map_err(|e| format!("Failed to query owners: {}", e))?;

        let mut owners = Vec::new();
        for row in rows {
            owners.push(row.map_err(|e| format!("Failed to map owner: {}", e))?);
        }
        Ok(owners)
    }

    pub fn create(&self, conn: &Connection, request: CreateOwnerRequest) -> Result<i64, String> {
        let name = request.name.trim().to_string();
        if name.is_empty() {
            return Err("Owner name cannot be empty".to_string());
        }

        let existing: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM owners WHERE lower(name) = lower(?1)",
                params![name],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check owner uniqueness: {}", e))?;
        if existing > 0 {
            return Err("An owner with this name already exists".to_string());
        }

        conn.execute(
            "INSERT INTO owners (name) VALUES (?1)",
            params![name],
        )
        .map_err(|e| format!("Failed to create owner: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn update(&self, conn: &Connection, request: UpdateOwnerRequest) -> Result<bool, String> {
        let name = request.name.as_deref().map(str::trim).unwrap_or("").to_string();
        if name.is_empty() {
            return Err("Owner name cannot be empty".to_string());
        }

        // Resolve old name (accounts store the owner name, not id).
        let old_name: Option<String> = conn
            .query_row(
                "SELECT name FROM owners WHERE id = ?1",
                params![request.id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to find owner: {}", e))?;
        let old_name = match old_name {
            Some(n) => n,
            None => return Err("Owner not found".to_string()),
        };

        let existing: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM owners WHERE lower(name) = lower(?1) AND id != ?2",
                params![name, request.id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check owner uniqueness: {}", e))?;
        if existing > 0 {
            return Err("An owner with this name already exists".to_string());
        }

        conn.execute("UPDATE owners SET name = ?1 WHERE id = ?2", params![name, request.id])
            .map_err(|e| format!("Failed to update owner: {}", e))?;
        // Keep account owner references in sync with the renamed owner.
        conn.execute(
            "UPDATE accounts SET owner = ?1 WHERE owner = ?2",
            params![name, old_name],
        )
        .map_err(|e| format!("Failed to sync accounts owner: {}", e))?;

        Ok(true)
    }

    pub fn delete(&self, conn: &Connection, id: i64) -> Result<bool, String> {
        let name: Option<String> = conn
            .query_row(
                "SELECT name FROM owners WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to find owner: {}", e))?;
        let name = match name {
            Some(n) => n,
            None => return Ok(false),
        };

        // Clearing the owner from its accounts happens best-effort; the owner
        // row is removed regardless.
        let _ = conn.execute(
            "UPDATE accounts SET owner = NULL WHERE owner = ?1",
            params![name],
        );

        let deleted = conn
            .execute("DELETE FROM owners WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete owner: {}", e))?;
        Ok(deleted > 0)
    }

    /// Assigns every account to a single owner (used when the very first owner
    /// is created). Returns the number of affected accounts.
    pub fn claim_all_accounts(&self, conn: &Connection, owner_id: i64) -> Result<usize, String> {
        let name = self.owner_name(conn, owner_id)?;
        let affected = conn
            .execute("UPDATE accounts SET owner = ?1", params![name])
            .map_err(|e| format!("Failed to assign owner to all accounts: {}", e))?;
        Ok(affected)
    }

    /// Assigns a set of specific accounts to an owner. Returns the number of
    /// affected accounts.
    pub fn transfer_accounts_to_owner(
        &self,
        conn: &Connection,
        owner_id: i64,
        account_ids: &[i64],
    ) -> Result<usize, String> {
        if account_ids.is_empty() {
            return Ok(0);
        }
        let name = self.owner_name(conn, owner_id)?;

        let placeholders = account_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");

        let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        values.push(Box::new(name));
        for id in account_ids {
            values.push(Box::new(*id));
        }
        let refs: Vec<&dyn rusqlite::ToSql> = values.iter().map(|b| b.as_ref()).collect();

        let sql = format!(
            "UPDATE accounts SET owner = ?1 WHERE id IN ({})",
            placeholders
        );
        let affected = conn
            .execute(&sql, refs.as_slice())
            .map_err(|e| format!("Failed to transfer accounts: {}", e))?;
        Ok(affected)
    }

    fn owner_name(&self, conn: &Connection, owner_id: i64) -> Result<String, String> {
        conn.query_row(
            "SELECT name FROM owners WHERE id = ?1",
            params![owner_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Owner not found: {}", e))
    }
}