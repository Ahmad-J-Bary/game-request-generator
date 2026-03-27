// src-tauri/src/db/connection.rs

use rusqlite::{params, Connection, Result as SqlResult};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Wrapper حول rusqlite::Connection مع وظائف إعداد الجداول
pub struct Database {
    connection: Connection,
}

impl Database {
    /// افتح أو أنشئ ملف قاعدة البيانات داخل app data directory
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        use super::config::ConfigService;
        let config = ConfigService::load(app);

        let db_path = if let Some(custom_path) = config.db_path {
            PathBuf::from(custom_path)
        } else {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;

            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("Failed to create app data dir: {}", e))?;

            data_dir.join("database.sqlite")
        };

        println!("Database path: {:?}", db_path);

        let conn =
            Connection::open(db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        // Enable foreign key support (required for ON DELETE CASCADE to work in SQLite)
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

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

            -- جدول الأفرع (جديد)
            CREATE TABLE IF NOT EXISTS game_branches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
            );

            -- جدول الحسابات
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                branch_id INTEGER,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                request_template TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                package_id INTEGER,
                proxy_state TEXT,
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                FOREIGN KEY (branch_id) REFERENCES game_branches(id) ON DELETE SET NULL
            );

            -- جدول المستويات
            CREATE TABLE IF NOT EXISTS levels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                branch_id INTEGER,
                event_token TEXT NOT NULL,
                level_name TEXT NOT NULL,
                days_offset INTEGER NOT NULL DEFAULT 0,
                time_spent INTEGER NOT NULL DEFAULT 0,
                is_bonus INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                FOREIGN KEY (branch_id) REFERENCES game_branches(id) ON DELETE CASCADE
            );

            -- جدول التقدم
            CREATE TABLE IF NOT EXISTS account_level_progress (
                account_id INTEGER NOT NULL,
                level_id INTEGER NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0,
                completed_at TIMESTAMP,
                PRIMARY KEY (account_id, level_id),
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE CASCADE
            );

            -- جدول أحداث الشراء (إن لم يكن موجوداً)
            CREATE TABLE IF NOT EXISTS purchase_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                branch_id INTEGER,
                event_token TEXT NOT NULL,
                is_restricted INTEGER NOT NULL DEFAULT 0,
                max_days_offset INTEGER,
                days_offset INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                FOREIGN KEY (branch_id) REFERENCES game_branches(id) ON DELETE CASCADE
            );

            -- جدول تقدم أحداث الشراء
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
            let mut stmt = self
                .connection
                .prepare(&format!("PRAGMA table_info({})", table))?;
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
            "SELECT name FROM sqlite_master WHERE type='table' AND name='purchase_events'",
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
                    days_offset INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                    UNIQUE(game_id, event_token)
                );
                ",
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
            if !column_exists("purchase_events", "days_offset")? {
                self.connection.execute(
                    "ALTER TABLE purchase_events ADD COLUMN days_offset INTEGER",
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
        let mut levels_tbl_stmt = self
            .connection
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='levels'")?;
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

            // Migration: Update unique constraint to include days_offset
            // First drop the old constraint (if it exists), then add the new one
            // Note: SQLite doesn't support DROP CONSTRAINT directly, so we recreate the table
            // But for simplicity, we'll try to add the new constraint and ignore if it fails
            let _ = self.connection.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_levels_unique ON levels(game_id, event_token, days_offset)",
                [],
            );
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

        // Ensure accounts has package_id and proxy_state
        if !column_exists("accounts", "package_id")? {
            let _ = self
                .connection
                .execute("ALTER TABLE accounts ADD COLUMN package_id INTEGER", []);
        }
        if !column_exists("accounts", "proxy_state")? {
            let _ = self
                .connection
                .execute("ALTER TABLE accounts ADD COLUMN proxy_state TEXT", []);
        }

        // --- NEW: Branching Migration ---
        self.migrate_branches()?;

        // Migrate existing accounts if they don't have package data
        let _ = self.migrate_account_packages();

        Ok(())
    }

    /// Migration to initialize branches for existing games
    fn migrate_branches(&self) -> SqlResult<()> {
        let column_exists = |table: &str, column: &str| -> SqlResult<bool> {
            let mut stmt = self
                .connection
                .prepare(&format!("PRAGMA table_info({})", table))?;
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                if name == column {
                    return Ok(true);
                }
            }
            Ok(false)
        };

        // 1. Add branch_id columns if they don't exist
        for table in &["accounts", "levels", "purchase_events"] {
            if !column_exists(table, "branch_id")? {
                self.connection.execute(
                    &format!("ALTER TABLE {} ADD COLUMN branch_id INTEGER", table),
                    [],
                )?;
            }
        }

        // 2. For each game, ensure it has at least one default branch
        let mut stmt = self.connection.prepare("SELECT id FROM games")?;
        let game_ids: Vec<i64> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<SqlResult<Vec<_>>>()?;

        for game_id in game_ids {
            // Check if game has a default branch
            let has_default: bool = self.connection.query_row(
                "SELECT EXISTS(SELECT 1 FROM game_branches WHERE game_id = ?1 AND is_default = 1)",
                params![game_id],
                |row| row.get(0),
            )?;

            if !has_default {
                self.connection.execute(
                    "INSERT INTO game_branches (game_id, name, is_default) VALUES (?1, ?2, ?3)",
                    params![game_id, "Default", 1],
                )?;
                let branch_id = self.connection.last_insert_rowid();

                // 3. Link existing data to this new default branch
                self.connection.execute(
                    "UPDATE accounts SET branch_id = ?1 WHERE game_id = ?2 AND branch_id IS NULL",
                    params![branch_id, game_id],
                )?;
                self.connection.execute(
                    "UPDATE levels SET branch_id = ?1 WHERE game_id = ?2 AND branch_id IS NULL",
                    params![branch_id, game_id],
                )?;
                self.connection.execute(
                    "UPDATE purchase_events SET branch_id = ?1 WHERE game_id = ?2 AND branch_id IS NULL",
                    params![branch_id, game_id],
                )?;
            }
        }

        Ok(())
    }

    /// Migrate existing accounts to have a package_id and proxy_state
    fn migrate_account_packages(&self) -> SqlResult<()> {
        let mut stmt = self
            .connection
            .prepare("SELECT id, game_id FROM accounts WHERE package_id IS NULL")?;
        let accounts: Vec<(i64, i64)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<SqlResult<Vec<_>>>()?;

        if accounts.is_empty() {
            return Ok(());
        }

        use crate::models::account::PROXY_STATES;

        // Group by game_id to assign them sequentially to packages
        // This is a simple migration:
        // 1st account of game A -> package 1
        // 2nd account of game A -> package 2
        // etc.

        let mut game_counters: HashMap<i64, i32> = HashMap::new();

        for (id, game_id) in accounts {
            let counter = game_counters.entry(game_id).or_insert(0);
            *counter += 1;
            let package_id = *counter;
            let state_idx = (package_id - 1) as usize % PROXY_STATES.len();
            let proxy_state = PROXY_STATES[state_idx];

            self.connection.execute(
                "UPDATE accounts SET package_id = ?1, proxy_state = ?2 WHERE id = ?3",
                params![package_id, proxy_state, id],
            )?;
        }

        Ok(())
    }
}
