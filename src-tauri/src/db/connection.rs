// src-tauri/src/db/connection.rs

use rusqlite::{Connection, Result as SqlResult};
use tauri::{AppHandle, Manager};
use std::path::PathBuf;

/// Wrapper حول rusqlite::Connection مع وظائف إعداد الجداول
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
        // إنشاء الجداول الأساسية (IF NOT EXISTS)
        self.connection.execute_batch(
            "
            -- جدول الألعاب
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- جدول الحسابات
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

            -- جدول المستويات (مع is_bonus) — سينجح إن لم يكن موجوداً؛ إذا كان موجوداً بدون العمود سنضيفه لاحقاً
            CREATE TABLE IF NOT EXISTS levels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                event_token TEXT NOT NULL,
                level_name TEXT NOT NULL,
                days_offset INTEGER NOT NULL DEFAULT 0,
                time_spent INTEGER NOT NULL DEFAULT 0,
                is_bonus INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                UNIQUE(game_id, event_token)
            );

            -- جدول تقدم الحسابات في المستويات
            CREATE TABLE IF NOT EXISTS account_level_progress (
                account_id INTEGER NOT NULL,
                level_id INTEGER NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0,
                completed_at TIMESTAMP,
                PRIMARY KEY (account_id, level_id),
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE CASCADE
            );

            -- جدول تقدم الحسابات في أحداث الشراء
            CREATE TABLE IF NOT EXISTS account_purchase_event_progress (
                account_id INTEGER NOT NULL,
                purchase_event_id INTEGER NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0,
                days_offset INTEGER NOT NULL DEFAULT 0,
                time_spent INTEGER NOT NULL DEFAULT 0,
                completed_at TIMESTAMP,
                PRIMARY KEY (account_id, purchase_event_id),
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY (purchase_event_id) REFERENCES purchase_events(id) ON DELETE CASCADE
            );
            "
        )?;

        // small helper to check column existence
        let column_exists = |table: &str, column: &str| -> SqlResult<bool> {
            let mut stmt = self.connection.prepare(&format!("PRAGMA table_info({})", table))?;
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                if name == column {
                    return Ok(true);
                }
            }
            Ok(false)
        };

        // Ensure purchase_events table exists and has expected columns (handled previously)
        // create table if missing
        let mut tbl_stmt = self.connection.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='purchase_events'"
        )?;
        let mut tbl_rows = tbl_stmt.query([])?;
        let purchase_events_exists = tbl_rows.next()?.is_some();

        if !purchase_events_exists {
            self.connection.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS purchase_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id INTEGER NOT NULL,
                    event_token TEXT NOT NULL,
                    is_restricted INTEGER NOT NULL DEFAULT 0,
                    max_days_offset INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                    UNIQUE(game_id, event_token)
                );
                "
            )?;
        } else {
            if !column_exists("purchase_events", "game_id")? {
                self.connection.execute(
                    "ALTER TABLE purchase_events ADD COLUMN game_id INTEGER NOT NULL DEFAULT 0",
                    [],
                )?;
            }
            if !column_exists("purchase_events", "is_restricted")? {
                self.connection.execute(
                    "ALTER TABLE purchase_events ADD COLUMN is_restricted INTEGER NOT NULL DEFAULT 0",
                    [],
                )?;
            }
            if !column_exists("purchase_events", "max_days_offset")? {
                self.connection.execute(
                    "ALTER TABLE purchase_events ADD COLUMN max_days_offset INTEGER",
                    [],
                )?;
            }
            if !column_exists("purchase_events", "created_at")? {
                self.connection.execute(
                    "ALTER TABLE purchase_events ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
                    [],
                )?;
            }
        }

        // --- NEW: ensure levels.has is_bonus column exists (migration for older DBs) ---
        let mut levels_tbl_stmt = self.connection.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='levels'"
        )?;
        let mut levels_tbl_rows = levels_tbl_stmt.query([])?;
        let levels_exists = levels_tbl_rows.next()?.is_some();

        if levels_exists {
            if !column_exists("levels", "is_bonus")? {
                // add column with default 0
                self.connection.execute(
                    "ALTER TABLE levels ADD COLUMN is_bonus INTEGER NOT NULL DEFAULT 0",
                    [],
                )?;
            }
        } else {
            // if levels table somehow missing, create (already created above with CREATE TABLE IF NOT EXISTS)
            // nothing more to do
        }

        // الآن نُنشئ الفهارس بأمان
        self.connection.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_levels_game_id ON levels(game_id);
            CREATE INDEX IF NOT EXISTS idx_accounts_game_id ON accounts(game_id);
            CREATE INDEX IF NOT EXISTS idx_purchase_events_game_id ON purchase_events(game_id);
            CREATE INDEX IF NOT EXISTS idx_account_level_progress_account ON account_level_progress(account_id);
            CREATE INDEX IF NOT EXISTS idx_account_level_progress_level ON account_level_progress(level_id);
            CREATE INDEX IF NOT EXISTS idx_account_purchase_progress_account ON account_purchase_event_progress(account_id);
            CREATE INDEX IF NOT EXISTS idx_account_purchase_progress_event ON account_purchase_event_progress(purchase_event_id);
            "
        )?;

        Ok(())
    }

}
