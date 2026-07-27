#[cfg(test)]
mod tests {
    use crate::models::account::CreateAccountRequest;
    use crate::services::account_service::AccountService;
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
            "INSERT INTO game_branches (id, game_id, name) VALUES (1, 1, 'Branch A'), (2, 1, 'Branch B'), (3, 2, 'Wrong Game Branch')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO games (id, name) VALUES (2, 'Other Game')", [])
            .unwrap();

        conn
    }

    fn add_levels(conn: &Connection, branch_id: i64) {
        let is_branch_b = branch_id == 2;

        for (token, name, days_offset, time_spent) in &[
            ("eb5me1", "10 SC coins", if is_branch_b { 0 } else { 0 }, 4),
            ("adfgmg", "100 SC coins", if is_branch_b { 0 } else { 1 }, 16),
            ("e20jzt", "500 SC coins", 1, 34),
            ("z3m87u", "1000 SC coins", 2, 55),
            ("dh9eud", "500 Spins", 4, 95),
            ("4812tw", "1000 Spins", 5, 112),
            ("n7ne11", "2000 Spins", 8, 170),
            ("uqdlg6", "spin 5,000", 12, 245),
            ("ahllv1", "spin 10,000", 17, 340),
            ("unique_a", "Unique Level A", 3, 50),
        ] {
            conn.execute(
                "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset, time_spent)
                 VALUES (1, ?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![branch_id, token, name, days_offset, time_spent],
            )
            .unwrap();
        }
    }

    fn add_purchase_events(conn: &Connection, branch_id: i64) {
        for (token, days_offset, max_days_offset) in &[
            ("dfx4cx", 4, 5),
            ("v4nh8u", 6, 7),
            ("6jjp0o", 9, 10),
            ("57e4px", 11, 13),
            ("w7mis8", 14, 16),
        ] {
            conn.execute(
                "INSERT INTO purchase_events (game_id, branch_id, event_token, days_offset, max_days_offset, is_restricted)
                 VALUES (1, ?1, ?2, ?3, ?4, 1)",
                rusqlite::params![branch_id, token, days_offset, max_days_offset],
            )
            .unwrap();
        }
    }

    fn mark_level_complete(
        conn: &Connection,
        account_id: i64,
        level_id: i64,
        completed: bool,
    ) {
        conn.execute(
            "INSERT INTO account_level_progress (account_id, level_id, is_completed, time_spent, completed_at)
             VALUES (?1, ?2, ?3, ?4, datetime('now'))
             ON CONFLICT(account_id, level_id) DO UPDATE SET is_completed = excluded.is_completed",
            rusqlite::params![account_id, level_id, if completed { 1 } else { 0 }, 100],
        )
        .unwrap();
    }

    fn mark_purchase_complete(
        conn: &Connection,
        account_id: i64,
        pe_id: i64,
        completed: bool,
    ) {
        conn.execute(
            "INSERT INTO account_purchase_event_progress (account_id, purchase_event_id, is_completed, days_offset, time_spent, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
             ON CONFLICT(account_id, purchase_event_id) DO UPDATE SET is_completed = excluded.is_completed",
            rusqlite::params![
                account_id,
                pe_id,
                if completed { 1 } else { 0 },
                5,
                200
            ],
        )
        .unwrap();
    }

    // ── Tests ────────────────────────────────────────────────────────────

    #[test]
    fn test_basic_transfer_preserves_completion() {
        let conn = setup_db();
        let svc = AccountService::new();

        add_levels(&conn, 1); // Branch A
        add_levels(&conn, 2); // Branch B (same tokens)
        add_purchase_events(&conn, 1);
        add_purchase_events(&conn, 2);

        // Create account on Branch A
        let account_id = svc
            .create_account(
                &conn,
                CreateAccountRequest {
                    game_id: 1,
                    branch_id: Some(1),
                    name: "Test Account".into(),
                    start_date: "2024-01-01".into(),
                    start_time: "10:00:00".into(),
                    request_template: "template".into(),
                    country: "US".into(),
                },
            )
            .unwrap();

        // Get source level IDs (Branch A)
        let source_levels: Vec<(i64, String)> = AccountService::get_branch_levels(&conn, 1).unwrap();
        let source_pes: Vec<(i64, String)> =
            AccountService::get_branch_purchase_events(&conn, 1).unwrap();

        // Mark some levels and purchases as completed
        mark_level_complete(&conn, account_id, source_levels[0].0, true);
        mark_level_complete(&conn, account_id, source_levels[1].0, true);
        mark_level_complete(&conn, account_id, source_levels[2].0, false); // not completed
        mark_purchase_complete(&conn, account_id, source_pes[0].0, true);
        mark_purchase_complete(&conn, account_id, source_pes[1].0, false);

        // Transfer to Branch B
        let result = svc
            .transfer_account_branch(&conn, account_id, 2)
            .unwrap();

        assert_eq!(result.transferred_levels, 3);
        assert_eq!(result.transferred_purchase_events, 2);
        assert_eq!(result.source_branch_id, Some(1));
        assert_eq!(result.target_branch_id, 2);
        assert!(result.warnings.is_empty());

        // Verify account is now on Branch B
        let account = svc.get_account_by_id(&conn, account_id).unwrap().unwrap();
        assert_eq!(account.branch_id, Some(2));

        // Verify old progress records are gone
        let old_lp_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM account_level_progress WHERE account_id = ?1 AND level_id IN (SELECT id FROM levels WHERE branch_id = 1)",
                rusqlite::params![account_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(old_lp_count, 0, "Old source level progress should be deleted");

        // Verify new progress records exist on target levels
        let new_lp_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM account_level_progress WHERE account_id = ?1 AND level_id IN (SELECT id FROM levels WHERE branch_id = 2)",
                rusqlite::params![account_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(new_lp_count, 3, "Should have 3 level progress records on target");

        // Verify completion status preserved
        let completed_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM account_level_progress alp
                 JOIN levels l ON alp.level_id = l.id
                 WHERE alp.account_id = ?1 AND l.branch_id = 2 AND alp.is_completed = 1",
                rusqlite::params![account_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(completed_count, 2, "Should have 2 completed levels on target");
    }

    #[test]
    fn test_transfer_with_different_days_offset() {
        let conn = setup_db();
        let svc = AccountService::new();

        // Branch A: adfgmg at days_offset 1
        conn.execute(
            "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset, time_spent)
             VALUES (1, 1, 'adfgmg', '100 SC coins', 1, 16)",
            [],
        )
        .unwrap();

        // Branch B: adfgmg at days_offset 0 (different)
        conn.execute(
            "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset, time_spent)
             VALUES (1, 2, 'adfgmg', '100 SC coins', 0, 16)",
            [],
        )
        .unwrap();

        // Create account on Branch A
        let account_id = svc
            .create_account(
                &conn,
                CreateAccountRequest {
                    game_id: 1,
                    branch_id: Some(1),
                    name: "Test".into(),
                    start_date: "2024-01-01".into(),
                    start_time: "10:00:00".into(),
                    request_template: "t".into(),
                    country: "US".into(),
                },
            )
            .unwrap();

        let source_level = AccountService::get_branch_levels(&conn, 1).unwrap();
        mark_level_complete(&conn, account_id, source_level[0].0, true);

        // Transfer
        let result = svc.transfer_account_branch(&conn, account_id, 2).unwrap();
        assert_eq!(result.transferred_levels, 1);
        assert!(result.warnings.is_empty());

        // Verify completed_at and is_completed preserved on target
        let (is_completed, time_spent): (i32, i32) = conn
            .query_row(
                "SELECT alp.is_completed, alp.time_spent FROM account_level_progress alp
                 JOIN levels l ON alp.level_id = l.id
                 WHERE alp.account_id = ?1 AND l.branch_id = 2",
                rusqlite::params![account_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(is_completed, 1);
        assert_eq!(time_spent, 100);
    }

    #[test]
    fn test_transfer_with_missing_tokens() {
        let conn = setup_db();
        let svc = AccountService::new();

        // Branch A has a level with token 'missing_token'
        conn.execute(
            "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset, time_spent)
             VALUES (1, 1, 'missing_token', 'Missing Level', 1, 10)",
            [],
        )
        .unwrap();

        // Branch B has no such token
        conn.execute(
            "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset, time_spent)
             VALUES (1, 2, 'existing_token', 'Existing Level', 0, 5)",
            [],
        )
        .unwrap();

        let account_id = svc
            .create_account(
                &conn,
                CreateAccountRequest {
                    game_id: 1,
                    branch_id: Some(1),
                    name: "Test".into(),
                    start_date: "2024-01-01".into(),
                    start_time: "10:00:00".into(),
                    request_template: "t".into(),
                    country: "US".into(),
                },
            )
            .unwrap();

        let source_levels = AccountService::get_branch_levels(&conn, 1).unwrap();
        mark_level_complete(&conn, account_id, source_levels[0].0, true);

        let result = svc.transfer_account_branch(&conn, account_id, 2).unwrap();
        assert_eq!(result.transferred_levels, 0);
        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0].contains("missing_token"));
    }

    #[test]
    fn test_transfer_from_null_branch() {
        let conn = setup_db();
        let svc = AccountService::new();

        // Branch B has levels
        conn.execute(
            "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset, time_spent)
             VALUES (1, 2, 'tok1', 'Level 1', 0, 10)",
            [],
        )
        .unwrap();

        // Account with no branch (branch_id = NULL)
        let account_id = svc
            .create_account(
                &conn,
                CreateAccountRequest {
                    game_id: 1,
                    branch_id: None,
                    name: "No Branch".into(),
                    start_date: "2024-01-01".into(),
                    start_time: "10:00:00".into(),
                    request_template: "t".into(),
                    country: "US".into(),
                },
            )
            .unwrap();

        let result = svc.transfer_account_branch(&conn, account_id, 2).unwrap();
        assert_eq!(result.transferred_levels, 0);
        assert_eq!(result.transferred_purchase_events, 0);
        assert!(result.source_branch_id.is_none());
        assert!(result.source_branch_name.is_none());
        assert!(result.warnings.is_empty());

        let account = svc.get_account_by_id(&conn, account_id).unwrap().unwrap();
        assert_eq!(account.branch_id, Some(2));
    }

    #[test]
    fn test_transfer_to_same_branch_fails() {
        let conn = setup_db();
        let svc = AccountService::new();

        let account_id = svc
            .create_account(
                &conn,
                CreateAccountRequest {
                    game_id: 1,
                    branch_id: Some(1),
                    name: "Test".into(),
                    start_date: "2024-01-01".into(),
                    start_time: "10:00:00".into(),
                    request_template: "t".into(),
                    country: "US".into(),
                },
            )
            .unwrap();

        let result = svc.transfer_account_branch(&conn, account_id, 1);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already in this branch"));
    }

    #[test]
    fn test_transfer_to_different_game_fails() {
        let conn = setup_db();
        let svc = AccountService::new();

        let account_id = svc
            .create_account(
                &conn,
                CreateAccountRequest {
                    game_id: 1,
                    branch_id: Some(1),
                    name: "Test".into(),
                    start_date: "2024-01-01".into(),
                    start_time: "10:00:00".into(),
                    request_template: "t".into(),
                    country: "US".into(),
                },
            )
            .unwrap();

        // Branch 3 belongs to Game 2
        let result = svc.transfer_account_branch(&conn, account_id, 3);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("different game"));
    }

    #[test]
    fn test_preview_shows_matched_and_missing() {
        let conn = setup_db();
        let svc = AccountService::new();

        // Branch A
        conn.execute(
            "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset, time_spent)
             VALUES (1, 1, 'tok_a', 'A', 0, 10), (1, 1, 'tok_b', 'B', 1, 20)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO purchase_events (game_id, branch_id, event_token, days_offset)
             VALUES (1, 1, 'pe_a', 5)",
            [],
        )
        .unwrap();

        // Branch B - missing tok_b
        conn.execute(
            "INSERT INTO levels (game_id, branch_id, event_token, level_name, days_offset, time_spent)
             VALUES (1, 2, 'tok_a', 'A', 0, 10), (1, 2, 'tok_c', 'C', 2, 30)",
            [],
        )
        .unwrap();

        let account_id = svc
            .create_account(
                &conn,
                CreateAccountRequest {
                    game_id: 1,
                    branch_id: Some(1),
                    name: "Preview Test".into(),
                    start_date: "2024-01-01".into(),
                    start_time: "10:00:00".into(),
                    request_template: "t".into(),
                    country: "US".into(),
                },
            )
            .unwrap();

        let preview = svc
            .preview_transfer_account_branch(&conn, account_id, 2)
            .unwrap();

        assert_eq!(preview.matched_levels, vec!["tok_a"]);
        assert_eq!(preview.missing_levels, vec!["tok_b"]);
        assert!(preview.matched_purchase_events.is_empty());
        assert!(preview.missing_purchase_events.is_empty());
        assert_eq!(preview.total_source_levels, 2);
        assert_eq!(preview.total_target_levels, 2);
        assert_eq!(preview.total_source_purchase_events, 1);
        assert_eq!(preview.total_target_purchase_events, 0);
    }
}
