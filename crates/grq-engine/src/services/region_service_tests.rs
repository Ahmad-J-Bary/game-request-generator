#[cfg(test)]
mod tests {
    use crate::models::region::{
        CreateRegionRequest, DeleteRegionRequest, UpdateRegionRequest, REGION_PALETTE,
    };
    use crate::services::region_service::RegionService;
    use rusqlite::{params, Connection};

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS regions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                parent_id INTEGER,
                is_primary INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                emoji TEXT,
                color TEXT,
                frozen INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_id) REFERENCES regions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                request_template TEXT NOT NULL,
                proxy_state TEXT,
                package_id INTEGER
            );
            ",
        )
        .unwrap();
        conn
    }

    fn insert_account(conn: &Connection, name: &str, proxy_state: &str) -> i64 {
        conn.execute(
            "INSERT INTO accounts (game_id, name, start_date, start_time, request_template, proxy_state)
             VALUES (1, ?1, '2026-01-01', '00:00:00', 'x', ?2)",
            params![name, proxy_state],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn insert_account_with_package(
        conn: &Connection,
        name: &str,
        proxy_state: &str,
        package_id: i64,
    ) -> i64 {
        conn.execute(
            "INSERT INTO accounts (game_id, name, start_date, start_time, request_template, proxy_state, package_id)
             VALUES (1, ?1, '2026-01-01', '00:00:00', 'x', ?2, ?3)",
            params![name, proxy_state, package_id],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn make_primary(conn: &Connection, svc: &RegionService, name: &str) -> i64 {
        svc.create(
            &conn,
            CreateRegionRequest {
                name: name.into(),
                parent_id: None,
                emoji: None,
                color: None,
            },
        )
        .unwrap()
    }

    fn make_sub(
        conn: &Connection,
        svc: &RegionService,
        primary: i64,
        name: &str,
    ) -> i64 {
        svc.create(
            &conn,
            CreateRegionRequest {
                name: name.into(),
                parent_id: Some(primary),
                emoji: None,
                color: None,
            },
        )
        .unwrap()
    }

    #[test]
    fn creates_primary_and_sub_region_with_order() {
        let conn = setup_db();
        let svc = RegionService::new();

        let us = svc.create(&conn, CreateRegionRequest { name: "UNITED STATES (US)".into(), parent_id: None, emoji: Some("🇺🇸".into()), color: None }).unwrap();
        let fl = svc.create(&conn, CreateRegionRequest { name: "FLORIDA".into(), parent_id: Some(us), emoji: None, color: None }).unwrap();
        let ca = svc.create(&conn, CreateRegionRequest { name: "CALIFORNIA".into(), parent_id: Some(us), emoji: None, color: None }).unwrap();

        let regions = svc.list(&conn).unwrap();
        assert_eq!(regions.len(), 3);

        let fl_row = regions.iter().find(|r| r.id == fl).unwrap();
        assert!(!fl_row.is_primary);
        assert_eq!(fl_row.parent_id, Some(us));
        // Auto color from palette: first sub gets the first free color.
        assert_eq!(fl_row.color.as_deref(), Some("orange"));

        let ca_row = regions.iter().find(|r| r.id == ca).unwrap();
        assert!(ca_row.sort_order > fl_row.sort_order, "later sub-region sorts after");
    }

    #[test]
    fn rejects_duplicate_names() {
        let conn = setup_db();
        let svc = RegionService::new();
        svc.create(&conn, CreateRegionRequest { name: "FLORIDA".into(), parent_id: None, emoji: None, color: None }).unwrap();
        let err = svc.create(&conn, CreateRegionRequest { name: "FLORIDA".into(), parent_id: None, emoji: None, color: None }).unwrap_err();
        assert!(err.contains("already exists"), "got: {}", err);
    }

    #[test]
    fn rejects_sub_region_under_non_primary() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = svc.create(&conn, CreateRegionRequest { name: "UNITED STATES (US)".into(), parent_id: None, emoji: None, color: None }).unwrap();
        let fl = svc.create(&conn, CreateRegionRequest { name: "FLORIDA".into(), parent_id: Some(us), emoji: None, color: None }).unwrap();

        let err = svc.create(&conn, CreateRegionRequest { name: "ORLANDO".into(), parent_id: Some(fl), emoji: None, color: None }).unwrap_err();
        assert!(err.contains("primary"), "got: {}", err);
    }

    #[test]
    fn reorder_updates_sort_order_within_scope() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = svc.create(&conn, CreateRegionRequest { name: "UNITED STATES (US)".into(), parent_id: None, emoji: None, color: None }).unwrap();
        let fl = svc.create(&conn, CreateRegionRequest { name: "FLORIDA".into(), parent_id: Some(us), emoji: None, color: None }).unwrap();
        let ca = svc.create(&conn, CreateRegionRequest { name: "CALIFORNIA".into(), parent_id: Some(us), emoji: None, color: None }).unwrap();
        let tx = svc.create(&conn, CreateRegionRequest { name: "TEXAS".into(), parent_id: Some(us), emoji: None, color: None }).unwrap();

        // Move CALIFORNIA to the front.
        svc.reorder(&conn, Some(us), vec![ca, fl, tx]).unwrap();

        let regions = svc.list(&conn).unwrap();
        let ca_row = regions.iter().find(|r| r.id == ca).unwrap();
        let fl_row = regions.iter().find(|r| r.id == fl).unwrap();
        let tx_row = regions.iter().find(|r| r.id == tx).unwrap();
        assert_eq!(ca_row.sort_order, 0);
        assert_eq!(fl_row.sort_order, 1);
        assert_eq!(tx_row.sort_order, 2);

        let names = svc.sub_region_names(&conn).unwrap();
        assert_eq!(names, vec!["CALIFORNIA", "FLORIDA", "TEXAS"]);
    }

    #[test]
    fn delete_blocked_when_region_in_use() {
        let conn = setup_db();
        let svc = RegionService::new();
        let fl = svc.create(&conn, CreateRegionRequest { name: "FLORIDA".into(), parent_id: None, emoji: None, color: None }).unwrap();
        insert_account(&conn, "A", "FLORIDA");

        let err = svc.delete(&conn, fl).unwrap_err();
        assert!(err.contains("assigned"), "got: {}", err);
    }

    #[test]
    fn delete_blocked_when_primary_has_children() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = svc.create(&conn, CreateRegionRequest { name: "UNITED STATES (US)".into(), parent_id: None, emoji: None, color: None }).unwrap();
        svc.create(&conn, CreateRegionRequest { name: "FLORIDA".into(), parent_id: Some(us), emoji: None, color: None }).unwrap();

        let err = svc.delete(&conn, us).unwrap_err();
        assert!(err.contains("sub-regions"), "got: {}", err);
    }

    #[test]
    fn delete_succeeds_for_unused_sub_region() {
        let conn = setup_db();
        let svc = RegionService::new();
        let fl = svc.create(&conn, CreateRegionRequest { name: "FLORIDA".into(), parent_id: None, emoji: None, color: None }).unwrap();
        assert!(svc.delete(&conn, fl).unwrap());
        assert_eq!(svc.list(&conn).unwrap().len(), 0);
    }

    #[test]
    fn rename_syncs_account_proxy_state() {
        let conn = setup_db();
        let svc = RegionService::new();
        let fl = svc.create(&conn, CreateRegionRequest { name: "FLORIDA".into(), parent_id: None, emoji: None, color: None }).unwrap();
        insert_account(&conn, "A", "FLORIDA");

        svc.update(&conn, UpdateRegionRequest {
            id: fl,
            name: Some("FLORIDA (EAST)".into()),
            parent_id: None,
            emoji: None,
            color: None,
            sort_order: None,
            frozen: None,
        }).unwrap();

        let state: String = conn
            .query_row("SELECT proxy_state FROM accounts WHERE name = 'A'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(state, "FLORIDA (EAST)");
    }

    #[test]
    fn sub_region_names_falls_back_to_legacy_when_empty() {
        let conn = setup_db();
        let svc = RegionService::new();
        let names = svc.sub_region_names(&conn).unwrap();
        assert_eq!(
            names,
            vec!["FLORIDA", "CALIFORNIA", "TEXAS", "New York"]
        );
    }

    #[test]
    fn update_with_multiple_fields_binds_params_positionally() {
        let conn = setup_db();
        let svc = RegionService::new();
        let fl = svc.create(&conn, CreateRegionRequest { name: "FLORIDA".into(), parent_id: None, emoji: None, color: None }).unwrap();

        svc.update(&conn, UpdateRegionRequest {
            id: fl,
            name: Some("FLORIDA EAST".into()),
            parent_id: None,
            emoji: Some("🌴".into()),
            color: Some("blue".into()),
            sort_order: None,
            frozen: None,
        }).unwrap();

        let (name, emoji, color): (String, Option<String>, Option<String>) = conn
            .query_row("SELECT name, emoji, color FROM regions WHERE id = ?1", params![fl], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .unwrap();
        assert_eq!(name, "FLORIDA EAST");
        assert_eq!(emoji.as_deref(), Some("🌴"));
        assert_eq!(color.as_deref(), Some("blue"));
    }

    #[test]
    fn create_primary_ignores_color() {
        let conn = setup_db();
        let svc = RegionService::new();
        let id = svc.create(&conn, CreateRegionRequest {
            name: "UNITED STATES (US)".into(),
            parent_id: None,
            emoji: None,
            color: Some("orange".into()),
        }).unwrap();

        let color: Option<String> = conn
            .query_row("SELECT color FROM regions WHERE id = ?1", params![id], |r| r.get(0))
            .unwrap();
        assert_eq!(color, None, "primary regions must not carry a color");
    }

    #[test]
    fn create_rejects_color_used_by_another_region() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = svc.create(&conn, CreateRegionRequest {
            name: "UNITED STATES (US)".into(),
            parent_id: None,
            emoji: None,
            color: None,
        }).unwrap();
        svc.create(&conn, CreateRegionRequest {
            name: "A".into(),
            parent_id: Some(us),
            emoji: None,
            color: Some("orange".into()),
        }).unwrap();

        let err = svc.create(&conn, CreateRegionRequest {
            name: "B".into(),
            parent_id: Some(us),
            emoji: None,
            color: Some("orange".into()),
        }).unwrap_err();
        assert!(err.contains("already used"), "unexpected error: {}", err);
    }

    #[test]
    fn update_rejects_color_used_by_another_region() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = svc.create(&conn, CreateRegionRequest {
            name: "UNITED STATES (US)".into(),
            parent_id: None,
            emoji: None,
            color: None,
        }).unwrap();
        let a = svc.create(&conn, CreateRegionRequest {
            name: "A".into(),
            parent_id: Some(us),
            emoji: None,
            color: Some("orange".into()),
        }).unwrap();
        let b = svc.create(&conn, CreateRegionRequest {
            name: "B".into(),
            parent_id: Some(us),
            emoji: None,
            color: Some("blue".into()),
        }).unwrap();

        // Recolor B to A's color "orange": it is reserved for A, so rejected.
        let err = svc.update(&conn, UpdateRegionRequest {
            id: b,
            name: None,
            parent_id: None,
            emoji: None,
            color: Some("orange".into()),
            sort_order: None,
            frozen: None,
        }).unwrap_err();
        assert!(err.contains("already used"), "unexpected error: {}", err);

        // Colors are unchanged.
        let a_color: String = conn
            .query_row("SELECT color FROM regions WHERE id = ?1", params![a], |r| r.get(0))
            .unwrap();
        let b_color: String = conn
            .query_row("SELECT color FROM regions WHERE id = ?1", params![b], |r| r.get(0))
            .unwrap();
        assert_eq!(a_color, "orange");
        assert_eq!(b_color, "blue");
    }

    #[test]
    fn update_keeps_own_color_and_assigns_free_slot() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = svc.create(&conn, CreateRegionRequest {
            name: "US".into(),
            parent_id: None,
            emoji: None,
            color: None,
        }).unwrap();
        let a = svc.create(&conn, CreateRegionRequest {
            name: "A".into(),
            parent_id: Some(us),
            emoji: None,
            color: None,
        }).unwrap();

        // Recoloring A with nothing selected clears the color, then another
        // region may reuse the freed slot.
        svc.update(&conn, UpdateRegionRequest {
            id: a,
            color: Some("orange".into()),
            ..Default::default()
        }).unwrap();

        let b = svc.create(&conn, CreateRegionRequest {
            name: "B".into(),
            parent_id: Some(us),
            emoji: None,
            color: None,
        }).unwrap();
        let b_color: String = conn
            .query_row("SELECT color FROM regions WHERE id = ?1", params![b], |r| r.get(0))
            .unwrap();
        assert_eq!(b_color, "blue", "first free palette color assigned");
    }

#[test]
    fn create_leaves_extra_regions_colorless_when_palette_exhausted() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = svc.create(&conn, CreateRegionRequest {
            name: "UNITED STATES (US)".into(),
            parent_id: None,
            emoji: None,
            color: None,
        }).unwrap();
        let free = REGION_PALETTE.len();
        for i in 0..free + 3 {
            svc.create(&conn, CreateRegionRequest {
                name: format!("REGION_{}", i).into(),
                parent_id: Some(us),
                emoji: None,
                color: None,
            }).unwrap();
        }

        let regions = svc.list(&conn).unwrap();
        let sub_colors: Vec<Option<String>> = regions
            .iter()
            .filter(|r| r.parent_id.is_some())
            .map(|r| r.color.clone())
            .collect();
        assert_eq!(sub_colors.len(), free + 3);
        // Every palette color is used exactly once.
        let assigned: Vec<&String> = sub_colors.iter().flatten().collect();
        assert_eq!(assigned.len(), free);
        let unique: std::collections::HashSet<&String> = assigned.iter().copied().collect();
        assert_eq!(unique.len(), free, "colors must stay unique, got {:?}", assigned);
        // Regions beyond the palette carry no color (gray).
        assert_eq!(sub_colors.iter().filter(|c| c.is_none()).count(), 3);
    }

    #[test]
    fn redistribute_single_moves_all_accounts_to_target() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = make_primary(&conn, &svc, "UNITED STATES (US)");
        let fl = make_sub(&conn, &svc, us, "FLORIDA");
        let ca = make_sub(&conn, &svc, us, "CALIFORNIA");
        insert_account(&conn, "A", "FLORIDA");
        insert_account(&conn, "B", "FLORIDA");
        insert_account(&conn, "C", "FLORIDA");

        assert!(svc
            .delete_with_redistribution(
                &conn,
                DeleteRegionRequest {
                    id: fl,
                    mode: "single".into(),
                    target_id: Some(ca),
                }
            )
            .unwrap());

        let regions = svc.list(&conn).unwrap();
        assert!(!regions.iter().any(|r| r.id == fl), "FLORIDA deleted");
        let state = |name: &str| {
            conn.query_row(
                "SELECT proxy_state FROM accounts WHERE name = ?1",
                params![name],
                |r| r.get::<_, String>(0),
            )
            .unwrap()
        };
        assert_eq!(state("A"), "CALIFORNIA");
        assert_eq!(state("B"), "CALIFORNIA");
        assert_eq!(state("C"), "CALIFORNIA");
    }

    #[test]
    fn redistribute_single_rejects_frozen_target() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = make_primary(&conn, &svc, "UNITED STATES (US)");
        let fl = make_sub(&conn, &svc, us, "FLORIDA");
        let ca = make_sub(&conn, &svc, us, "CALIFORNIA");
        svc.update(
            &conn,
            UpdateRegionRequest {
                id: ca,
                frozen: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        insert_account(&conn, "A", "FLORIDA");

        let err = svc
            .delete_with_redistribution(
                &conn,
                DeleteRegionRequest {
                    id: fl,
                    mode: "single".into(),
                    target_id: Some(ca),
                },
            )
            .unwrap_err();
        assert!(err.contains("frozen"), "got: {}", err);
    }

    #[test]
    fn redistribute_single_rejects_self_target() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = make_primary(&conn, &svc, "UNITED STATES (US)");
        let fl = make_sub(&conn, &svc, us, "FLORIDA");
        insert_account(&conn, "A", "FLORIDA");

        let err = svc
            .delete_with_redistribution(
                &conn,
                DeleteRegionRequest {
                    id: fl,
                    mode: "single".into(),
                    target_id: Some(fl),
                },
            )
            .unwrap_err();
        assert!(err.contains("different"), "got: {}", err);
    }

    #[test]
    fn redistribute_rotate_spreads_accounts_by_batch() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = make_primary(&conn, &svc, "UNITED STATES (US)");
        let fl = make_sub(&conn, &svc, us, "FLORIDA");
        let ca = make_sub(&conn, &svc, us, "CALIFORNIA");
        let tx = make_sub(&conn, &svc, us, "TEXAS");
        insert_account_with_package(&conn, "A", "FLORIDA", 1);
        insert_account_with_package(&conn, "B", "FLORIDA", 2);
        insert_account_with_package(&conn, "C", "FLORIDA", 3);
        insert_account_with_package(&conn, "D", "FLORIDA", 4);

        assert!(svc
            .delete_with_redistribution(
                &conn,
                DeleteRegionRequest {
                    id: fl,
                    mode: "rotate".into(),
                    target_id: None,
                }
            )
            .unwrap());

        let state = |name: &str| {
            conn.query_row(
                "SELECT proxy_state FROM accounts WHERE name = ?1",
                params![name],
                |r| r.get::<_, String>(0),
            )
            .unwrap()
        };
        assert_eq!(state("A"), "CALIFORNIA");
        assert_eq!(state("B"), "TEXAS");
        assert_eq!(state("C"), "CALIFORNIA");
        assert_eq!(state("D"), "TEXAS");
        assert!(svc.list(&conn).unwrap().iter().all(|r| r.id != fl));
        assert!(svc.list(&conn).unwrap().iter().any(|r| r.id == ca));
        assert!(svc.list(&conn).unwrap().iter().any(|r| r.id == tx));
    }

    #[test]
    fn redistribute_rotate_rejects_when_no_targets_left() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = make_primary(&conn, &svc, "UNITED STATES (US)");
        let fl = make_sub(&conn, &svc, us, "FLORIDA");
        insert_account(&conn, "A", "FLORIDA");

        let err = svc
            .delete_with_redistribution(
                &conn,
                DeleteRegionRequest {
                    id: fl,
                    mode: "rotate".into(),
                    target_id: None,
                },
            )
            .unwrap_err();
        assert!(err.contains("No eligible"), "got: {}", err);
    }

    #[test]
    fn redistribute_unknown_mode_rejected() {
        let conn = setup_db();
        let svc = RegionService::new();
        let us = make_primary(&conn, &svc, "UNITED STATES (US)");
        let fl = make_sub(&conn, &svc, us, "FLORIDA");
        insert_account(&conn, "A", "FLORIDA");

        let err = svc
            .delete_with_redistribution(
                &conn,
                DeleteRegionRequest {
                    id: fl,
                    mode: "bogus".into(),
                    target_id: None,
                },
            )
            .unwrap_err();
        assert!(err.contains("Unknown redistribution mode"), "got: {}", err);
    }
}
