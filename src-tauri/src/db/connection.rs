use rusqlite::{Connection, Result as SqlResult};
use tauri::{AppHandle, Manager};
use std::path::PathBuf;

/// Wrapper بسيط حول rusqlite::Connection مع وظائف إعداد الجداول
pub struct Database {
    connection: Connection,
}

impl Database {
    /// افتح أو أنشئ ملف قاعدة البيانات داخل app data directory
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let data_dir = app.path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;

        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;

        let db_path: PathBuf = data_dir.join("database.sqlite");

        println!("Database path: {:?}", db_path);

        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        Ok(Database { connection: conn })
    }

    /// إنشاء الجداول اللازمة إن لم تكن موجودة
    pub fn init(&self) -> Result<(), String> {
        self.create_tables()
            .map_err(|e| format!("Failed to create tables: {}", e))
    }

    /// المرجع غير المتغير للاتصال
    pub fn get_connection(&self) -> &Connection {
        &self.connection
    }

    /// وظيفة داخلية لإنشاء جداول المشروع
    fn create_tables(&self) -> SqlResult<()> {
        self.connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                request_template TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS levels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                event_token TEXT NOT NULL,
                level_name TEXT NOT NULL,
                days_offset INTEGER NOT NULL DEFAULT 0,
                time_spent INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                UNIQUE(game_id, event_token)
            );

            CREATE TABLE IF NOT EXISTS purchase_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL,
                event_token TEXT NOT NULL,
                event_name TEXT NOT NULL,
                target_date TEXT NOT NULL,
                time_spent INTEGER NOT NULL DEFAULT 0,
                is_completed INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                UNIQUE(account_id, event_token, target_date)
            );

            CREATE INDEX IF NOT EXISTS idx_levels_game_id ON levels(game_id);
            CREATE INDEX IF NOT EXISTS idx_accounts_game_id ON accounts(game_id);
            CREATE INDEX IF NOT EXISTS idx_purchase_events_account_id ON purchase_events(account_id);
            CREATE INDEX IF NOT EXISTS idx_purchase_events_target_date ON purchase_events(target_date);
            "
        )
    }
}
