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
        let config = ConfigService::load_for_db_init(app);

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

        // Enable incremental auto_vacuum so pages freed by DELETE are automatically reclaimed.
        // INCREMENTAL (1) avoids the overhead of a full VACUUM while still allowing the
        // file to shrink over time.
        conn.execute_batch("PRAGMA auto_vacuum = 1;")
            .map_err(|e| format!("Failed to set auto_vacuum: {}", e))?;

        Ok(Database { connection: conn })
    }

    /// إنشاء الجداول اللازمة إن لم تكن موجودة
    pub fn init(&self) -> Result<(), String> {
        self.create_tables()
            .map_err(|e| format!("Failed to create tables: {}", e))?;

        // One-time VACUUM to reclaim any free pages that accumulated before
        // auto_vacuum was enabled. After this, incremental_vacuum handles it.
        let freelist: i64 = self
            .connection
            .pragma_query_value(None, "freelist_count", |row| row.get(0))
            .map_err(|e| format!("Failed to freelist_count for startup VACUUM: {}", e))?;

        if freelist > 0 {
            println!("[DB] Running startup VACUUM ({} free pages)...", freelist);
            self.connection
                .execute_batch("VACUUM")
                .map_err(|e| format!("Failed to startup VACUUM: {}", e))?;
        }

        Ok(())
    }

    /// المرجع غير المتغير للاتصال
    pub fn get_connection(&self) -> &Connection {
        &self.connection
    }

    pub fn get_connection_mut(&mut self) -> &mut Connection {
        &mut self.connection
    }

    /// Reclaim ALL free pages from the database file using incremental vacuum.
    /// Always runs if freelist has any pages. Returns the number of pages reclaimed.
    pub fn reclaim_space(&self) -> Result<i64, String> {
        let freelist: i64 = self
            .connection
            .pragma_query_value(None, "freelist_count", |row| row.get(0))
            .map_err(|e| format!("Failed to check freelist_count: {}", e))?;

        if freelist == 0 {
            return Ok(0);
        }

        self.connection
            .execute_batch("PRAGMA incremental_vacuum(0)")
            .map_err(|e| format!("Failed to reclaim space: {}", e))?;

        Ok(freelist)
    }

    /// Full VACUUM — rewrites the entire database file to reclaim all free pages.
    /// Expensive but thorough. Should only be called during maintenance operations
    /// (e.g., backup/export), not on the hot path of individual deletes.
    pub fn vacuum(&self) -> Result<(), String> {
        self.connection
            .execute_batch("VACUUM")
            .map_err(|e| format!("Failed to vacuum database: {}", e))
    }

    /// وظيفة داخلية لإنشاء جداول المشروع
    fn create_tables(&self) -> SqlResult<()> {
        // Disable foreign keys temporarily during structural migrations
        self.connection
            .execute_batch("PRAGMA foreign_keys = OFF;")?;

        let result = self.perform_migrations();

        // Re-enable foreign keys
        self.connection.execute_batch("PRAGMA foreign_keys = ON;")?;

        result
    }

    fn perform_migrations(&self) -> SqlResult<()> {
        // Start a transaction for all initialization and migrations
        // Using unchecked_transaction because we might be doing complex DDL
        let tx = self.connection.unchecked_transaction()?;

        // 1. إنشاء الجداول الأساسية (IF NOT EXISTS)
        tx.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS game_branches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
            );

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

            CREATE TABLE IF NOT EXISTS account_level_progress (
                account_id INTEGER NOT NULL,
                level_id INTEGER NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0,
                time_spent INTEGER NOT NULL DEFAULT 0,
                target_date TEXT,
                completed_at TIMESTAMP,
                PRIMARY KEY (account_id, level_id),
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE CASCADE
            );

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

            CREATE TABLE IF NOT EXISTS account_purchase_event_progress (
                account_id INTEGER NOT NULL,
                purchase_event_id INTEGER NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0,
                days_offset INTEGER NOT NULL DEFAULT 0,
                time_spent INTEGER NOT NULL DEFAULT 0,
                target_date TEXT,
                completed_at TIMESTAMP,
                PRIMARY KEY (account_id, purchase_event_id),
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY (purchase_event_id) REFERENCES purchase_events(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS key_value_store (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS completed_daily_tasks (
                id TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL,
                account_name TEXT NOT NULL,
                game_id INTEGER NOT NULL,
                game_name TEXT NOT NULL,
                event_token TEXT NOT NULL,
                time_spent INTEGER NOT NULL,
                completion_time INTEGER NOT NULL,
                completion_date TEXT NOT NULL,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                level_id INTEGER,
                level_name TEXT,
                request_type TEXT NOT NULL,
                is_purchase INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
            );
            ",
        )?;

        // Create indexes for completed tasks
        tx.execute_batch("
            CREATE INDEX IF NOT EXISTS idx_completed_tasks_account ON completed_daily_tasks(account_id);
            CREATE INDEX IF NOT EXISTS idx_completed_tasks_date ON completed_daily_tasks(completion_date);
        ")?;

        // Helper to check column existence within transaction
        let column_exists = |table: &str, column: &str| -> SqlResult<bool> {
            let mut stmt = tx.prepare(&format!("PRAGMA table_info({})", table))?;
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                if name == column {
                    return Ok(true);
                }
            }
            Ok(false)
        };

        // 2. Incremental column migrations
        if !column_exists("purchase_events", "game_id")? {
            tx.execute(
                "ALTER TABLE purchase_events ADD COLUMN game_id INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        if !column_exists("purchase_events", "is_restricted")? {
            tx.execute(
                "ALTER TABLE purchase_events ADD COLUMN is_restricted INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        if !column_exists("purchase_events", "max_days_offset")? {
            tx.execute(
                "ALTER TABLE purchase_events ADD COLUMN max_days_offset INTEGER",
                [],
            )?;
        }
        if !column_exists("purchase_events", "days_offset")? {
            tx.execute(
                "ALTER TABLE purchase_events ADD COLUMN days_offset INTEGER",
                [],
            )?;
        }
        if !column_exists("purchase_events", "created_at")? {
            tx.execute("ALTER TABLE purchase_events ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP", [])?;
        }
        if !column_exists("levels", "is_bonus")? {
            tx.execute(
                "ALTER TABLE levels ADD COLUMN is_bonus INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        if !column_exists("accounts", "package_id")? {
            tx.execute("ALTER TABLE accounts ADD COLUMN package_id INTEGER", [])?;
        }
        if !column_exists("accounts", "proxy_state")? {
            tx.execute("ALTER TABLE accounts ADD COLUMN proxy_state TEXT", [])?;
        }
        if !column_exists("accounts", "branch_id")? {
            tx.execute("ALTER TABLE accounts ADD COLUMN branch_id INTEGER", [])?;
        }
        if !column_exists("levels", "branch_id")? {
            tx.execute("ALTER TABLE levels ADD COLUMN branch_id INTEGER", [])?;
        }
        if !column_exists("purchase_events", "branch_id")? {
            tx.execute(
                "ALTER TABLE purchase_events ADD COLUMN branch_id INTEGER",
                [],
            )?;
        }
        if !column_exists("account_level_progress", "time_spent")? {
            tx.execute("ALTER TABLE account_level_progress ADD COLUMN time_spent INTEGER NOT NULL DEFAULT 0", [])?;
        }
        if !column_exists("account_level_progress", "target_date")? {
            tx.execute(
                "ALTER TABLE account_level_progress ADD COLUMN target_date TEXT",
                [],
            )?;
        }
        if !column_exists("account_purchase_event_progress", "target_date")? {
            tx.execute(
                "ALTER TABLE account_purchase_event_progress ADD COLUMN target_date TEXT",
                [],
            )?;
        }
        if !column_exists("completed_daily_tasks", "completed_at")? {
            tx.execute(
                "ALTER TABLE completed_daily_tasks ADD COLUMN completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
                [],
            )?;
        }

        // 3. Structural migration for UNIQUE constraints (Table Recreation)
        // Check if levels table has the new branch-aware UNIQUE constraint inline
        // If it has a UNIQUE constraint but NOT for branch_id, it must be recreated
        let levels_needs_recreate: bool = tx.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='levels' AND sql LIKE '%UNIQUE%' AND sql NOT LIKE '%UNIQUE%branch_id%'",
            [],
            |row| row.get(0),
        ).unwrap_or(0) > 0;

        if levels_needs_recreate {
            println!("Recreating levels table for structural migration...");
            tx.execute_batch("
                CREATE TABLE levels_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id INTEGER NOT NULL,
                    branch_id INTEGER,
                    event_token TEXT NOT NULL,
                    level_name TEXT NOT NULL,
                    days_offset INTEGER NOT NULL DEFAULT 0,
                    time_spent INTEGER NOT NULL DEFAULT 0,
                    is_bonus INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                    FOREIGN KEY (branch_id) REFERENCES game_branches(id) ON DELETE CASCADE,
                    UNIQUE(game_id, branch_id, event_token, days_offset)
                );
                INSERT OR IGNORE INTO levels_new (id, game_id, branch_id, event_token, level_name, days_offset, time_spent, is_bonus)
                SELECT id, game_id, branch_id, event_token, level_name, days_offset, time_spent, is_bonus FROM levels;
                DROP TABLE levels;
                ALTER TABLE levels_new RENAME TO levels;
            ")?;
        }

        let pe_needs_recreate: bool = tx.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='purchase_events' AND sql LIKE '%UNIQUE%' AND sql NOT LIKE '%UNIQUE%branch_id%'",
            [],
            |row| row.get(0),
        ).unwrap_or(0) > 0;

        if pe_needs_recreate {
            println!("Recreating purchase_events table for structural migration...");
            tx.execute_batch("
                CREATE TABLE purchase_events_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id INTEGER NOT NULL,
                    branch_id INTEGER,
                    event_token TEXT NOT NULL,
                    is_restricted INTEGER NOT NULL DEFAULT 0,
                    max_days_offset INTEGER,
                    days_offset INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                    FOREIGN KEY (branch_id) REFERENCES game_branches(id) ON DELETE CASCADE,
                    UNIQUE(game_id, branch_id, event_token)
                );
                INSERT OR IGNORE INTO purchase_events_new (id, game_id, branch_id, event_token, is_restricted, max_days_offset, days_offset, created_at)
                SELECT id, game_id, branch_id, event_token, is_restricted, max_days_offset, days_offset, created_at FROM purchase_events;
                DROP TABLE purchase_events;
                ALTER TABLE purchase_events_new RENAME TO purchase_events;
            ")?;
        }

        // 4. Create proper indexes
        tx.execute_batch("
            CREATE INDEX IF NOT EXISTS idx_levels_game_id ON levels(game_id);
            CREATE INDEX IF NOT EXISTS idx_levels_branch_id ON levels(branch_id);
            CREATE INDEX IF NOT EXISTS idx_accounts_game_id ON accounts(game_id);
            CREATE INDEX IF NOT EXISTS idx_purchase_events_game_id ON purchase_events(game_id);
            CREATE INDEX IF NOT EXISTS idx_purchase_events_branch_id ON purchase_events(branch_id);
            CREATE INDEX IF NOT EXISTS idx_account_level_progress_account ON account_level_progress(account_id);
            CREATE INDEX IF NOT EXISTS idx_account_level_progress_level ON account_level_progress(level_id);
            CREATE INDEX IF NOT EXISTS idx_account_purchase_progress_account ON account_purchase_event_progress(account_id);
            CREATE INDEX IF NOT EXISTS idx_account_purchase_progress_event ON account_purchase_event_progress(purchase_event_id);

            -- Ensure any remaining old style unique index is gone
            DROP INDEX IF EXISTS idx_levels_unique;
            DROP INDEX IF EXISTS idx_purchase_events_unique;

            -- Create formal unique indexes if not already handled by table recreation
            CREATE UNIQUE INDEX IF NOT EXISTS idx_levels_unique_v2 ON levels(game_id, branch_id, event_token, days_offset);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_events_unique_v2 ON purchase_events(game_id, branch_id, event_token);
        ")?;

        // 5. Data Migration: Default Branches
        let game_ids: Vec<i64> = {
            let mut stmt = tx.prepare("SELECT id FROM games")?;
            let ids = stmt
                .query_map([], |row| row.get(0))?
                .collect::<SqlResult<Vec<i64>>>()?;
            ids
        };

        for game_id in game_ids {
            let has_default: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM game_branches WHERE game_id = ?1 AND is_default = 1)",
                params![game_id],
                |row| row.get(0),
            )?;

            if !has_default {
                tx.execute(
                    "INSERT INTO game_branches (game_id, name, is_default) VALUES (?1, ?2, ?3)",
                    params![game_id, "Default", 1],
                )?;
                let branch_id = tx.last_insert_rowid();

                tx.execute(
                    "UPDATE accounts SET branch_id = ?1 WHERE game_id = ?2 AND branch_id IS NULL",
                    params![branch_id, game_id],
                )?;
                tx.execute(
                    "UPDATE levels SET branch_id = ?1 WHERE game_id = ?2 AND branch_id IS NULL",
                    params![branch_id, game_id],
                )?;
                tx.execute("UPDATE purchase_events SET branch_id = ?1 WHERE game_id = ?2 AND branch_id IS NULL", params![branch_id, game_id])?;
            }
        }

        // 6. Data Migration: Account Packages
        let accounts: Vec<(i64, i64)> = {
            let mut stmt =
                tx.prepare("SELECT id, game_id FROM accounts WHERE package_id IS NULL")?;
            let accs = stmt
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<SqlResult<Vec<_>>>()?;
            accs
        };

        if !accounts.is_empty() {
            use crate::models::account::PROXY_STATES;
            let mut game_counters: HashMap<i64, i32> = HashMap::new();

            for (id, game_id) in accounts {
                let counter = game_counters.entry(game_id).or_insert(0);
                *counter += 1;
                let package_id = *counter;
                let state_idx = (package_id - 1) as usize % PROXY_STATES.len();
                let proxy_state = PROXY_STATES[state_idx];

                tx.execute(
                    "UPDATE accounts SET package_id = ?1, proxy_state = ?2 WHERE id = ?3",
                    params![package_id, proxy_state, id],
                )?;
            }
        }

        // 7. Data Migration: Legacy compatibility for split Session + Event progress
        // If an event level is completed but its paired session level ('-') for same branch/day/token is not,
        // auto-complete the session progress so old DB snapshots remain consistent in newer versions.
        tx.execute_batch("
            INSERT INTO account_level_progress (account_id, level_id, is_completed, time_spent, target_date, completed_at)
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
            WHERE alp.is_completed = 1
              AND le.level_name != '-'
              AND NOT EXISTS (
                  SELECT 1
                  FROM account_level_progress s
                  WHERE s.account_id = alp.account_id
                    AND s.level_id = ls.id
                    AND s.is_completed = 1
              );
        ")?;

        tx.commit()?;
        Ok(())
    }
}
