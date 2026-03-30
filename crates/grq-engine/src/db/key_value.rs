use rusqlite::params;
use tauri::AppHandle;
use crate::db::connection::Database;

pub struct KeyValueService;

impl KeyValueService {
    pub fn get_value(app: &AppHandle, key: &str) -> Result<Option<String>, String> {
        let db = Database::new(app)?;
        let mut stmt = db.get_connection()
            .prepare("SELECT value FROM key_value_store WHERE key = ?1")
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let mut rows = stmt.query(params![key]).map_err(|e| format!("Query error: {}", e))?;

        if let Some(row) = rows.next().map_err(|e| format!("Row error: {}", e))? {
            let value: String = row.get(0).map_err(|e| format!("Get value error: {}", e))?;
            Ok(Some(value))
        } else {
            Ok(None)
        }
    }

    pub fn set_value(app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
        let db = Database::new(app)?;
        db.get_connection()
            .execute(
                "INSERT INTO key_value_store (key, value, updated_at) 
                 VALUES (?1, ?2, CURRENT_TIMESTAMP) 
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                params![key, value],
            )
            .map_err(|e| format!("Failed to set key_value: {}", e))?;
        Ok(())
    }

    pub fn delete_value(app: &AppHandle, key: &str) -> Result<(), String> {
        let db = Database::new(app)?;
        db.get_connection()
            .execute("DELETE FROM key_value_store WHERE key = ?1", params![key])
            .map_err(|e| format!("Failed to delete key_value: {}", e))?;
        Ok(())
    }
}
