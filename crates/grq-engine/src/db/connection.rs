// src-tauri/src/db/connection.rs

use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::services::maintenance_log_service::MaintenanceLogService;

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

            CREATE TABLE IF NOT EXISTS maintenance_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                action TEXT NOT NULL,
                branch_id INTEGER,
                level_id INTEGER,
                event_token TEXT,
                new_event_token TEXT,
                days_offset INTEGER,
                reason TEXT,
                detail TEXT
            );

            CREATE TABLE IF NOT EXISTS regions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                parent_id INTEGER,
                is_primary INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                emoji TEXT,
                color TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_id) REFERENCES regions(id) ON DELETE CASCADE
            );
            ",
        )?;

        // Create indexes for completed tasks
        tx.execute_batch("
            CREATE INDEX IF NOT EXISTS idx_completed_tasks_account ON completed_daily_tasks(account_id);
            CREATE INDEX IF NOT EXISTS idx_completed_tasks_date ON completed_daily_tasks(completion_date);
            CREATE INDEX IF NOT EXISTS idx_maintenance_logs_action ON maintenance_logs(action);
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
        if !column_exists("purchase_events", "level_name")? {
            tx.execute("ALTER TABLE purchase_events ADD COLUMN level_name TEXT NOT NULL DEFAULT ''", [])?;
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

        // 5b. Data Migration: Seed default regions on first run (only when the
        // regions table is empty). UNITED STATES (US) is the default primary
        // with FLORIDA/CALIFORNIA/TEXAS/New York sub-regions. Primary regions
        // carry no color; each sub-region uses a distinct color (one color per
        // region) mirroring the account styling so visuals are preserved.
        let region_count: i64 = tx
            .query_row("SELECT COUNT(*) FROM regions", [], |row| row.get(0))
            .unwrap_or(0);

        if region_count == 0 {
            // Primary regions carry no color; each sub-region gets a distinct
            // color that mirrors the account styling so pre-existing visuals
            // are preserved.
            tx.execute(
                "INSERT INTO regions (name, parent_id, is_primary, sort_order, emoji, color)
                 VALUES (?1, NULL, 1, 0, ?2, NULL)",
                params!["UNITED STATES (US)", "🇺🇸"],
            )?;
            let us_id = tx.last_insert_rowid();

            let us_children: [(&str, &str); 4] = [
                ("FLORIDA", "orange"),
                ("CALIFORNIA", "blue"),
                ("TEXAS", "red"),
                ("New York", "purple"),
            ];
            for (i, (name, color)) in us_children.iter().enumerate() {
                tx.execute(
                    "INSERT INTO regions (name, parent_id, is_primary, sort_order, emoji, color)
                     VALUES (?1, ?2, 0, ?3, NULL, ?4)",
                    params![name, us_id, (i + 1) as i64, color],
                )?;
            }
        }

        // 5c. Data Migration: remove the legacy UNITED STATES/UNITED KINGDOM (UK)
        // primary and its 'UK' sub-region (ON DELETE CASCADE removes the child).
        tx.execute(
            "DELETE FROM regions WHERE name IN ('UNITED STATES (UK)', 'UNITED KINGDOM (UK)')",
            [],
        )?;

        // 5d. Data Migration: primary regions carry no color. Ensure each
        // sub-region has a unique color: keep the first occurrence and
        // reassign duplicates to the first free palette color.
        tx.execute("UPDATE regions SET color = NULL WHERE parent_id IS NULL", [])?;
        {
            use crate::models::region::REGION_PALETTE;
            let mut stmt = tx.prepare(
                "SELECT id, color FROM regions WHERE parent_id IS NOT NULL
                 AND color IS NOT NULL AND TRIM(color) != ''",
            )?;
            let rows = stmt
                .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))?
                .collect::<SqlResult<Vec<_>>>()?;

            let mut used: Vec<String> = Vec::new();
            let mut updates = Vec::new();
            for (id, color) in rows {
                if used.iter().any(|u| u == &color) {
                    let free = REGION_PALETTE
                        .iter()
                        .find(|p| !used.iter().any(|u| u.as_str() == **p))
                        .map(|s| s.to_string());
                    if let Some(f) = &free {
                        used.push(f.clone());
                        updates.push((id, f.clone()));
                    }
                } else {
                    used.push(color);
                }
            }
            for (rid, c) in updates {
                tx.execute(
                    "UPDATE regions SET color = ?1 WHERE id = ?2",
                    params![c, rid],
                )?;
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
            let mut sub_regions: Vec<String> = {
                let mut stmt = tx.prepare(
                    "SELECT name FROM regions WHERE parent_id IS NOT NULL ORDER BY sort_order, id",
                )?;
                let rows = stmt.query_map([], |row| row.get(0))?;
                let mut names = Vec::new();
                for row in rows {
                    names.push(row?);
                }
                names
            };
            if sub_regions.is_empty() {
                sub_regions = PROXY_STATES.iter().map(|s| s.to_string()).collect();
            }
            let mut game_counters: HashMap<i64, i32> = HashMap::new();

            for (id, game_id) in accounts {
                let counter = game_counters.entry(game_id).or_insert(0);
                *counter += 1;
                let package_id = *counter;
                let state_idx =
                    (package_id - 1) as usize % sub_regions.len();
                let proxy_state = sub_regions[state_idx].clone();

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

        // 8. Data Cleanup: enforce the Session-token rules on existing data.
        // Re-tokenizes standalone Sessions ('-') to their next Level Event's base
        // token and removes any Session that shares a day with its own token's
        // Level Event. Idempotent — safe to run on every startup.
        cleanup_session_levels(&tx)?;

        tx.commit()?;
        Ok(())
    }
}

/// قاعدة التوكن: يُقصّ جزء "_dayN" فيبقى معرّف الحدث الأساسي.
fn base_token_of(token: &str) -> String {
    token.split("_day").next().unwrap_or(token).to_string()
}

/// Session Cleanup Migration (Step 8)
///
/// Rule 1 (re-tokenize): a standalone Session (`level_name = '-'`) must carry the
/// base token of the NEXT Level Event in the same branch (falling back to the
/// previous Level Event when no event follows). Old sessions imported with a
/// wrong base (e.g. `levels[0]`) are re-tokenized to `{next_base}_day{offset}`.
///
/// Rule 2 (per token): a standalone Session must NOT coexist with a Level Event of
/// the SAME base token on the SAME day. Such sessions (and their progress) are
/// removed so the UI only ever shows the Event for that day.
///
/// Returns `(deleted, retokenized)` counts for reporting.
pub fn cleanup_session_levels(conn: &Connection) -> SqlResult<(usize, usize)> {
    cleanup_session_levels_filtered(conn, None)
}

/// Cleanup used when duplicating a branch (create_branch copy): applies the same
/// per-token rules to just the newly-created branch.
pub fn cleanup_branch_session_levels(conn: &Connection, branch_id: i64) -> SqlResult<()> {
    cleanup_session_levels_filtered(conn, Some(branch_id)).map(|_| ())
}

fn cleanup_session_levels_filtered(
    conn: &Connection,
    branch_id: Option<i64>,
) -> SqlResult<(usize, usize)> {
    let branch_filter = match branch_id {
        Some(b) => format!(" AND s.branch_id = {}", b),
        None => String::new(),
    };

    // Rule 2 (per token / same Event Token) FIRST: delete standalone Session
    // levels ('-') that share (branch, day, BASE token) with a real Level Event.
    // Runs before re-tokenization so a same-day event session is removed while it
    // still carries its own token. (Re-tokenizing first would re-point it to the
    // NEXT event and let it survive.) A Session with a different base token on an
    // event day is kept — it belongs to a different token.
    let doomed: Vec<(i64, i64, String, i32)> = {
        let mut stmt = conn.prepare(&format!(
            "SELECT s.id, s.branch_id, s.event_token, s.days_offset
             FROM levels s
             JOIN levels e
               ON e.branch_id = s.branch_id
              AND e.days_offset = s.days_offset
              AND e.level_name != '-'
              AND s.level_name = '-'
              AND (
                 CASE
                     WHEN instr(s.event_token, '_day') > 0 THEN substr(s.event_token, 1, instr(s.event_token, '_day') - 1)
                     ELSE s.event_token
                 END
              ) = (
                 CASE
                     WHEN instr(e.event_token, '_day') > 0 THEN substr(e.event_token, 1, instr(e.event_token, '_day') - 1)
                     ELSE e.event_token
                 END
              )
             WHERE 1=1{}",
            branch_filter
        ))?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        rows.collect::<SqlResult<Vec<_>>>()?
    };

    for (id, _, _, _) in &doomed {
        conn.execute(
            "DELETE FROM account_level_progress WHERE level_id = ?1",
            params![id],
        )?;
    }

    let log_service = MaintenanceLogService::new();
    for (id, branch, token, day) in &doomed {
        let deleted = conn.execute("DELETE FROM levels WHERE id = ?1", params![id])?;
        if deleted > 0 {
            if let Err(e) = log_service.log(
                conn,
                "session_deleted",
                Some(*branch),
                Some(*id),
                Some(token),
                None,
                Some(*day),
                Some("standalone Session shares day + base Event Token with a real Level Event"),
                Some("deleted automatically to enforce the per-token rule"),
            ) {
                eprintln!("[MaintenanceLog] failed to log session_deleted: {}", e);
            }
        }
    }

    if !doomed.is_empty() {
        println!(
            "[MaintenanceLog] Deleted {} invalid standalone Session level(s) sharing a day + base Event Token with a Level Event.",
            doomed.len()
        );
    }

    // Rule 1: re-tokenize the remaining standalone Sessions ('-') to the base
    // token of their NEXT Level Event (falling back to the previous one when no
    // event follows). Old sessions imported with a wrong base (e.g. `levels[0]`)
    // are re-tokenized to `{next_base}_day{offset}`.
    let mut session_sql =
        "SELECT id, branch_id, event_token, days_offset FROM levels WHERE level_name = '-'".to_string();
    if let Some(b) = branch_id {
        session_sql.push_str(&format!(" AND branch_id = {}", b));
    }

    let sessions: Vec<(i64, i64, String, i32)> = {
        let mut stmt = conn.prepare(&session_sql)?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        rows.collect::<SqlResult<Vec<_>>>()?
    };

    let mut retokenized_count: usize = 0;
    for (id, branch_id, token, day) in sessions {
        let next_base: Option<String> = conn
            .query_row(
                "SELECT event_token FROM levels
                 WHERE branch_id = ?1 AND level_name != '-' AND days_offset > ?2
                 ORDER BY days_offset ASC LIMIT 1",
                params![branch_id, day],
                |row| row.get(0),
            )
            .optional()?;

        let base = match next_base {
            Some(tok) => base_token_of(&tok),
            None => {
                let prev: Option<String> = conn
                    .query_row(
                        "SELECT event_token FROM levels
                         WHERE branch_id = ?1 AND level_name != '-' AND days_offset <= ?2
                         ORDER BY days_offset DESC LIMIT 1",
                        params![branch_id, day],
                        |row| row.get(0),
                    )
                    .optional()?;
                match prev {
                    Some(tok) => base_token_of(&tok),
                    None => continue,
                }
            }
        };

        let new_token = format!("{}_day{}", base, day);

        // Skip when the token is already correct (avoids pointless writes),
        // and guard against UNIQUE conflicts on (game_id, branch_id, event_token, days_offset).
        if new_token != token {
            let changed = conn.execute(
                "UPDATE levels SET event_token = ?1 WHERE id = ?2 AND NOT EXISTS (
                     SELECT 1 FROM levels
                     WHERE branch_id = ?3 AND event_token = ?1 AND days_offset = ?4 AND id != ?2
                 )",
                params![new_token, id, branch_id, day],
            )?;
            if changed > 0 {
                retokenized_count += 1;
                if let Err(e) = log_service.log(
                    conn,
                    "session_retokenized",
                    Some(branch_id),
                    Some(id),
                    Some(&token),
                    Some(&new_token),
                    Some(day),
                    Some("session re-tokenized to its next Level Event base"),
                    None,
                ) {
                    eprintln!("[MaintenanceLog] failed to log session_retokenized: {}", e);
                }
            }
        }
    }

    Ok((doomed.len(), retokenized_count))
}

#[cfg(test)]
mod tests {
    use super::{cleanup_branch_session_levels, cleanup_session_levels};
    use rusqlite::{params, Connection};

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE levels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                branch_id INTEGER,
                event_token TEXT NOT NULL,
                level_name TEXT NOT NULL,
                days_offset INTEGER NOT NULL DEFAULT 0,
                time_spent INTEGER NOT NULL DEFAULT 0,
                is_bonus INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE account_level_progress (
                account_id INTEGER NOT NULL,
                level_id INTEGER NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0,
                time_spent INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (account_id, level_id)
            );
            CREATE TABLE maintenance_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                action TEXT NOT NULL,
                branch_id INTEGER,
                level_id INTEGER,
                event_token TEXT,
                new_event_token TEXT,
                days_offset INTEGER,
                reason TEXT,
                detail TEXT
            );
            ",
        )
        .unwrap();
        conn
    }

    fn insert_level(
        conn: &Connection,
        branch_id: i64,
        event_token: &str,
        level_name: &str,
        days_offset: i32,
    ) -> i64 {
        conn.execute(
            "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset)
             VALUES (1, ?1, ?2, ?3, ?4)",
            params![branch_id, event_token, level_name, days_offset],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn token_of(conn: &Connection, id: i64) -> String {
        conn.query_row(
            "SELECT event_token FROM levels WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap()
    }

    fn count_rows(conn: &Connection, table: &str) -> i64 {
        conn.query_row(
            &format!("SELECT COUNT(*) FROM {}", table),
            [],
            |r| r.get(0),
        )
        .unwrap()
    }

    fn log_actions(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT action FROM maintenance_logs ORDER BY id ASC")
            .unwrap();
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .collect::<Vec<_>>();
        rows.into_iter().map(|r| r.unwrap()).collect()
    }

    #[test]
    fn deletes_session_sharing_day_with_own_token_event() {
        let conn = setup_db();
        let event_id = insert_level(&conn, 1, "abc_day0", "Level 1", 0);
        let session_id = insert_level(&conn, 1, "abc_day0", "-", 0);
        insert_level(&conn, 1, "abc_day1", "-", 1);

        cleanup_session_levels(&conn).unwrap();

        assert_eq!(token_of(&conn, event_id), "abc_day0");
        let gone: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM levels WHERE id = ?1",
                params![session_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(gone, 0, "event-day session should be deleted");
        assert_eq!(count_rows(&conn, "levels"), 2, "non-event-day session stays");
        assert_eq!(
            log_actions(&conn),
            vec!["session_deleted".to_string()],
            "deleted session must be logged for tracking"
        );
    }

    #[test]
    fn deletes_event_day_session_even_when_later_event_exists() {
        // Regression: re-tokenizing BEFORE deleting would re-point this session to
        // the LATER event and let it survive. Delete must run first.
        let conn = setup_db();
        let event_id = insert_level(&conn, 1, "abc_day0", "Level 1", 0);
        let session_id = insert_level(&conn, 1, "abc_day0", "-", 0);
        insert_level(&conn, 1, "def_day5", "Level 2", 5);

        cleanup_session_levels(&conn).unwrap();

        assert_eq!(token_of(&conn, event_id), "abc_day0");
        let gone: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM levels WHERE id = ?1",
                params![session_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(gone, 0, "same-day same-token session must be deleted");
        assert_eq!(count_rows(&conn, "levels"), 2);
    }

    #[test]
    fn deletes_progress_of_deleted_session() {
        let conn = setup_db();
        let event_id = insert_level(&conn, 1, "abc_day0", "Level 1", 0);
        let session_id = insert_level(&conn, 1, "abc_day0", "-", 0);
        conn.execute(
            "INSERT INTO account_level_progress (account_id, level_id, is_completed) VALUES (7, ?1, 1)",
            params![session_id],
        )
        .unwrap();
        let _ = event_id;

        cleanup_session_levels(&conn).unwrap();

        assert_eq!(count_rows(&conn, "account_level_progress"), 0);
    }

    #[test]
    fn retokenizes_session_to_next_event_base() {
        let conn = setup_db();
        insert_level(&conn, 1, "abc_day0", "Level 1", 0);
        insert_level(&conn, 1, "def_day5", "Level 2", 5);
        let session_id = insert_level(&conn, 1, "zzz_day2", "-", 2);

        cleanup_session_levels(&conn).unwrap();

        assert_eq!(token_of(&conn, session_id), "def_day2");
        assert_eq!(
            log_actions(&conn),
            vec!["session_retokenized".to_string()],
            "re-tokenized session must be logged for tracking"
        );
    }

    #[test]
    fn retokenizes_session_to_previous_event_when_no_next() {
        let conn = setup_db();
        insert_level(&conn, 1, "abc_day3", "Level 1", 3);
        let session_id = insert_level(&conn, 1, "zzz_day6", "-", 6);

        cleanup_session_levels(&conn).unwrap();

        assert_eq!(token_of(&conn, session_id), "abc_day6");
    }

    #[test]
    fn keeps_session_with_no_event_in_branch_unchanged() {
        let conn = setup_db();
        let session_id = insert_level(&conn, 1, "zzz_day2", "-", 2);

        cleanup_session_levels(&conn).unwrap();

        assert_eq!(token_of(&conn, session_id), "zzz_day2");
    }

    #[test]
    fn keeps_session_with_different_token_on_event_day() {
        // Per-token rule: a session whose base token differs from the day's event
        // is KEPT — it belongs to a different token. Re-tokenization points it at
        // the previous event base, but the UNIQUE guard keeps its old token.
        let conn = setup_db();
        let event_id = insert_level(&conn, 1, "abc_day0", "Level 1", 0);
        let session_id = insert_level(&conn, 1, "zzz_day0", "-", 0);

        cleanup_session_levels(&conn).unwrap();

        assert_eq!(token_of(&conn, event_id), "abc_day0");
        assert_eq!(token_of(&conn, session_id), "zzz_day0", "different-token session stays");
        assert_eq!(count_rows(&conn, "levels"), 2);
    }

    #[test]
    fn unique_conflict_does_not_error() {
        let conn = setup_db();
        let event_id = insert_level(&conn, 1, "abc_day0", "Level 1", 0);
        let session_id = insert_level(&conn, 1, "abc_day0", "-", 0);
        let second_session = insert_level(&conn, 1, "zzz_day0", "-", 0);

        cleanup_session_levels(&conn).unwrap();

        // Per-token rule: the same-token event-day session is deleted; the
        // different-token one stays (its re-tokenize is blocked by the UNIQUE guard).
        assert_eq!(token_of(&conn, event_id), "abc_day0");
        let gone: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM levels WHERE id = ?1",
                params![session_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(gone, 0, "same-token event-day session is deleted");
        assert_eq!(token_of(&conn, second_session), "zzz_day0");
        assert_eq!(count_rows(&conn, "levels"), 2);
    }

    #[test]
    fn branch_cleanup_only_affects_given_branch() {
        // cleanup_branch_session_levels must only touch the targeted branch:
        // branch 1 keeps its invalid event-day session, branch 2's is removed.
        let conn = setup_db();
        let _event1 = insert_level(&conn, 1, "abc_day0", "Level 1", 0);
        let session1 = insert_level(&conn, 1, "abc_day0", "-", 0);
        let _event2 = insert_level(&conn, 2, "abc_day0", "Level 1", 0);
        let session2 = insert_level(&conn, 2, "abc_day0", "-", 0);

        cleanup_branch_session_levels(&conn, 2).unwrap();

        let gone: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM levels WHERE id = ?1",
                params![session1],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(gone, 1, "branch 1 is untouched");

        let gone2: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM levels WHERE id = ?1",
                params![session2],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(gone2, 0, "branch 2 invalid session is deleted");
        assert_eq!(
            log_actions(&conn),
            vec!["session_deleted".to_string()],
            "only the targeted branch deletion is logged"
        );
    }
}
