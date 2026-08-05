#[cfg(test)]
mod tests {
    use crate::models::progress::{
        CreateAccountLevelProgressRequest, CreateAccountPurchaseEventProgressRequest,
        UpdateAccountLevelProgressRequest, UpdateAccountPurchaseEventProgressRequest,
    };
    use crate::services::progress_service::ProgressService;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();

        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS game_branches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                name TEXT NOT NULL,
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
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                FOREIGN KEY (branch_id) REFERENCES game_branches(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS purchase_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                branch_id INTEGER,
                event_token TEXT NOT NULL,
                is_restricted INTEGER NOT NULL DEFAULT 0,
                max_days_offset INTEGER,
                days_offset INTEGER,
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
            ",
        )
        .unwrap();

        conn.execute("INSERT INTO games (id, name) VALUES (1, 'Test Game')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO game_branches (id, game_id, name) VALUES (1, 1, 'Branch A')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO levels (id, game_id, branch_id, event_token, level_name, days_offset, time_spent)
             VALUES (1, 1, 1, 'tok1', 'Level 1', 0, 10)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO purchase_events (id, game_id, branch_id, event_token, days_offset, max_days_offset, is_restricted)
             VALUES (1, 1, 1, 'pe1', 4, 5, 1)",
            [],
        )
        .unwrap();

        conn
    }

    fn add_account(conn: &Connection, name: &str) -> i64 {
        conn.execute(
            "INSERT INTO accounts (game_id, branch_id, name, start_date, start_time, request_template)
             VALUES (1, 1, ?1, '2026-07-01', '10:00:00', 'template')",
            rusqlite::params![name],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn add_account_with_start_date(conn: &Connection, name: &str, start_date: &str) -> i64 {
        conn.execute(
            "INSERT INTO accounts (game_id, branch_id, name, start_date, start_time, request_template)
             VALUES (1, 1, ?1, ?2, '10:00:00', 'template')",
            rusqlite::params![name, start_date],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    // ── Level cooldown ────────────────────────────────────────────────

    #[test]
    fn test_level_cooldown_blocks_second_account_without_bypass() {
        let conn = setup_db();
        let svc = ProgressService::new();
        let acc_a = add_account(&conn, "Acc A");
        let acc_b = add_account(&conn, "Acc B");

        svc.create_or_update_level_progress(
            &conn,
            CreateAccountLevelProgressRequest {
                account_id: acc_a,
                level_id: 1,
                time_spent: Some(10),
                target_date: None,
            },
        )
        .unwrap();
        svc.create_or_update_level_progress(
            &conn,
            CreateAccountLevelProgressRequest {
                account_id: acc_b,
                level_id: 1,
                time_spent: Some(10),
                target_date: None,
            },
        )
        .unwrap();

        // First account completes the level -> OK
        svc.update_level_progress(
            &conn,
            UpdateAccountLevelProgressRequest {
                account_id: acc_a,
                level_id: 1,
                is_completed: true,
                time_spent: Some(10),
                target_date: None,
                bypass_cooldown: None,
            },
        )
        .unwrap();

        // Second account completes the SAME level within 1 hour -> blocked
        let result = svc.update_level_progress(
            &conn,
            UpdateAccountLevelProgressRequest {
                account_id: acc_b,
                level_id: 1,
                is_completed: true,
                time_spent: Some(10),
                target_date: None,
                bypass_cooldown: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cooldown"));

        // Acc B must NOT be marked completed
        let is_completed: i32 = conn
            .query_row(
                "SELECT is_completed FROM account_level_progress WHERE account_id = ?1 AND level_id = 1",
                rusqlite::params![acc_b],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(is_completed, 0, "Acc B must remain incomplete without bypass");
    }

    #[test]
    fn test_level_cooldown_bypass_allows_second_account() {
        let conn = setup_db();
        let svc = ProgressService::new();
        let acc_a = add_account(&conn, "Acc A");
        let acc_b = add_account(&conn, "Acc B");

        svc.create_or_update_level_progress(
            &conn,
            CreateAccountLevelProgressRequest {
                account_id: acc_a,
                level_id: 1,
                time_spent: Some(10),
                target_date: None,
            },
        )
        .unwrap();
        svc.create_or_update_level_progress(
            &conn,
            CreateAccountLevelProgressRequest {
                account_id: acc_b,
                level_id: 1,
                time_spent: Some(10),
                target_date: None,
            },
        )
        .unwrap();

        // First account completes the level normally (no bypass)
        svc.update_level_progress(
            &conn,
            UpdateAccountLevelProgressRequest {
                account_id: acc_a,
                level_id: 1,
                is_completed: true,
                time_spent: Some(10),
                target_date: None,
                bypass_cooldown: None,
            },
        )
        .unwrap();

        // Second account completes the SAME level WITH bypass (import path)
        let result = svc.update_level_progress(
            &conn,
            UpdateAccountLevelProgressRequest {
                account_id: acc_b,
                level_id: 1,
                is_completed: true,
                time_spent: Some(10),
                target_date: None,
                bypass_cooldown: Some(true),
            },
        );
        assert!(result.is_ok(), "bypass_cooldown must allow the write: {:?}", result.err());

        // Acc B must now be completed
        let is_completed: i32 = conn
            .query_row(
                "SELECT is_completed FROM account_level_progress WHERE account_id = ?1 AND level_id = 1",
                rusqlite::params![acc_b],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(is_completed, 1, "Acc B must be completed with bypass_cooldown");
    }

    #[test]
    fn test_level_cooldown_skips_accounts_started_on_different_days() {
        let conn = setup_db();
        let svc = ProgressService::new();
        let acc_a = add_account(&conn, "Acc A");
        let acc_b = add_account_with_start_date(&conn, "Acc B", "2026-07-02");

        for acc in [acc_a, acc_b] {
            svc.create_or_update_level_progress(
                &conn,
                CreateAccountLevelProgressRequest {
                    account_id: acc,
                    level_id: 1,
                    time_spent: Some(10),
                    target_date: None,
                },
            )
            .unwrap();
        }

        svc.update_level_progress(
            &conn,
            UpdateAccountLevelProgressRequest {
                account_id: acc_a,
                level_id: 1,
                is_completed: true,
                time_spent: Some(10),
                target_date: None,
                bypass_cooldown: None,
            },
        )
        .unwrap();

        // Acc B started on a different day -> NOT a sibling -> no cooldown
        let result = svc.update_level_progress(
            &conn,
            UpdateAccountLevelProgressRequest {
                account_id: acc_b,
                level_id: 1,
                is_completed: true,
                time_spent: Some(10),
                target_date: None,
                bypass_cooldown: None,
            },
        );
        assert!(result.is_ok(), "different-day accounts must not be cooldown-blocked: {:?}", result.err());
    }

    // ── Purchase event cooldown ───────────────────────────────────────

    #[test]
    fn test_purchase_cooldown_blocks_second_account_without_bypass() {
        let conn = setup_db();
        let svc = ProgressService::new();
        let acc_a = add_account(&conn, "Acc A");
        let acc_b = add_account(&conn, "Acc B");

        for acc in [acc_a, acc_b] {
            svc.create_or_update_purchase_event_progress(
                &conn,
                CreateAccountPurchaseEventProgressRequest {
                    account_id: acc,
                    purchase_event_id: 1,
                    days_offset: 4,
                    time_spent: 0,
                    target_date: None,
                },
            )
            .unwrap();
        }

        svc.update_purchase_event_progress(
            &conn,
            UpdateAccountPurchaseEventProgressRequest {
                account_id: acc_a,
                purchase_event_id: 1,
                is_completed: Some(true),
                days_offset: Some(4),
                time_spent: Some(0),
                target_date: None,
                bypass_cooldown: None,
            },
        )
        .unwrap();

        let result = svc.update_purchase_event_progress(
            &conn,
            UpdateAccountPurchaseEventProgressRequest {
                account_id: acc_b,
                purchase_event_id: 1,
                is_completed: Some(true),
                days_offset: Some(4),
                time_spent: Some(0),
                target_date: None,
                bypass_cooldown: None,
            },
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cooldown"));
    }

    #[test]
    fn test_purchase_cooldown_bypass_allows_second_account() {
        let conn = setup_db();
        let svc = ProgressService::new();
        let acc_a = add_account(&conn, "Acc A");
        let acc_b = add_account(&conn, "Acc B");

        for acc in [acc_a, acc_b] {
            svc.create_or_update_purchase_event_progress(
                &conn,
                CreateAccountPurchaseEventProgressRequest {
                    account_id: acc,
                    purchase_event_id: 1,
                    days_offset: 4,
                    time_spent: 0,
                    target_date: None,
                },
            )
            .unwrap();
        }

        svc.update_purchase_event_progress(
            &conn,
            UpdateAccountPurchaseEventProgressRequest {
                account_id: acc_a,
                purchase_event_id: 1,
                is_completed: Some(true),
                days_offset: Some(4),
                time_spent: Some(0),
                target_date: None,
                bypass_cooldown: None,
            },
        )
        .unwrap();

        let result = svc.update_purchase_event_progress(
            &conn,
            UpdateAccountPurchaseEventProgressRequest {
                account_id: acc_b,
                purchase_event_id: 1,
                is_completed: Some(true),
                days_offset: Some(4),
                time_spent: Some(0),
                target_date: None,
                bypass_cooldown: Some(true),
            },
        );
        assert!(result.is_ok(), "bypass_cooldown must allow the write: {:?}", result.err());

        let is_completed: i32 = conn
            .query_row(
                "SELECT is_completed FROM account_purchase_event_progress WHERE account_id = ?1 AND purchase_event_id = 1",
                rusqlite::params![acc_b],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(is_completed, 1, "Acc B must be completed with bypass_cooldown");
    }

    #[test]
    fn test_purchase_cooldown_skips_accounts_started_on_different_days() {
        let conn = setup_db();
        let svc = ProgressService::new();
        let acc_a = add_account(&conn, "Acc A");
        let acc_b = add_account_with_start_date(&conn, "Acc B", "2026-07-02");

        for acc in [acc_a, acc_b] {
            svc.create_or_update_purchase_event_progress(
                &conn,
                CreateAccountPurchaseEventProgressRequest {
                    account_id: acc,
                    purchase_event_id: 1,
                    days_offset: 4,
                    time_spent: 0,
                    target_date: None,
                },
            )
            .unwrap();
        }

        svc.update_purchase_event_progress(
            &conn,
            UpdateAccountPurchaseEventProgressRequest {
                account_id: acc_a,
                purchase_event_id: 1,
                is_completed: Some(true),
                days_offset: Some(4),
                time_spent: Some(0),
                target_date: None,
                bypass_cooldown: None,
            },
        )
        .unwrap();

        // Acc B started on a different day -> NOT a sibling -> no cooldown
        let result = svc.update_purchase_event_progress(
            &conn,
            UpdateAccountPurchaseEventProgressRequest {
                account_id: acc_b,
                purchase_event_id: 1,
                is_completed: Some(true),
                days_offset: Some(4),
                time_spent: Some(0),
                target_date: None,
                bypass_cooldown: None,
            },
        );
        assert!(result.is_ok(), "different-day accounts must not be cooldown-blocked: {:?}", result.err());
    }
}
