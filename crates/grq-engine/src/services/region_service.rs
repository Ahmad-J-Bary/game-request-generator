// src-tauri/src/services/region_service.rs

use crate::models::account::PROXY_STATES;
use crate::models::region::{
    CreateRegionRequest, Region, UpdateRegionRequest, REGION_PALETTE,
};
use rusqlite::{params, Connection, OptionalExtension};

pub struct RegionService;

impl RegionService {
    pub fn new() -> Self {
        RegionService
    }

    // Colors currently assigned to regions, optionally excluding one region.
    fn used_colors(&self, conn: &Connection, exclude_id: Option<i64>) -> Result<Vec<String>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, color FROM regions
                 WHERE color IS NOT NULL AND TRIM(color) != ''",
            )
            .map_err(|e| format!("Failed to prepare colors query: {}", e))?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| format!("Failed to query colors: {}", e))?;
        let mut used = Vec::new();
        for row in rows {
            let (id, color) = row.map_err(|e| format!("Failed to map colors: {}", e))?;
            if exclude_id == Some(id) {
                continue;
            }
            used.push(color);
        }
        Ok(used)
    }

    pub fn list(&self, conn: &Connection) -> Result<Vec<Region>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, parent_id, is_primary, sort_order, emoji, color, created_at
                 FROM regions ORDER BY sort_order, id",
            )
            .map_err(|e| format!("Failed to prepare regions query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Region {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    parent_id: row.get(2).ok().flatten(),
                    is_primary: row.get::<_, i32>(3)? != 0,
                    sort_order: row.get(4)?,
                    emoji: row.get(5).ok().flatten(),
                    color: row.get(6).ok().flatten(),
                    created_at: row.get(7).ok().flatten(),
                })
            })
            .map_err(|e| format!("Failed to query regions: {}", e))?;

        let mut regions = Vec::new();
        for row in rows {
            regions.push(row.map_err(|e| format!("Failed to map region: {}", e))?);
        }
        Ok(regions)
    }

    pub fn create(
        &self,
        conn: &Connection,
        request: CreateRegionRequest,
    ) -> Result<i64, String> {
        let name = request.name.trim().to_string();
        if name.is_empty() {
            return Err("Region name cannot be empty".to_string());
        }

        // A region with no parent is a primary region; with a parent it is a
        // sub-region. The parent must be a primary region (2-level hierarchy).
        let (parent_id, is_primary) = match request.parent_id {
            Some(pid) => {
                let is_parent_primary: Option<i32> = conn
                    .query_row(
                        "SELECT is_primary FROM regions WHERE id = ?1",
                        params![pid],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|e| format!("Failed to check parent region: {}", e))?;
                match is_parent_primary {
                    Some(1) => (Some(pid), 0),
                    Some(_) => return Err("Sub-regions can only belong to a primary region".to_string()),
                    None => return Err(format!("Parent region {} not found", pid)),
                }
            }
            None => (None, 1),
        };

        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM regions WHERE name = ?1",
                params![name],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check region name: {}", e))?;
        if exists > 0 {
            return Err(format!("Region '{}' already exists", name));
        }

        // Next sort position within the same level scope (primaries vs. the
        // children of this parent).
        let sort_order = if let Some(pid) = parent_id {
            let max: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM regions WHERE parent_id = ?1",
                    params![pid],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Failed to compute sort order: {}", e))?;
            max + 1
        } else {
            let max: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM regions WHERE parent_id IS NULL",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Failed to compute sort order: {}", e))?;
            max + 1
        };

        // Assign a color. Only sub-regions carry a color; a primary region has
        // none. A color may belong to exactly one region: reject an already-used
        // color and auto-pick the first free palette color otherwise.
        let color = if is_primary == 1 {
            None
        } else {
            match request.color {
                Some(c) if !c.trim().is_empty() => {
                    let c = c.trim().to_string();
                    let used = self.used_colors(conn, None)?;
                    if used.contains(&c) {
                        return Err(format!("Color '{}' is already used by another region", c));
                    }
                    Some(c)
                }
                _ => {
                    let used = self.used_colors(conn, None)?;
                    REGION_PALETTE
                        .iter()
                        .find(|p| !used.iter().any(|u| u.as_str() == **p))
                        .copied()
                        .map(|c| c.to_string())
                }
            }
        };

        conn.execute(
            "INSERT INTO regions (name, parent_id, is_primary, sort_order, emoji, color)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![name, parent_id, is_primary, sort_order, request.emoji, color],
        )
        .map_err(|e| format!("Failed to create region: {}", e))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn update(
        &self,
        conn: &Connection,
        request: UpdateRegionRequest,
    ) -> Result<bool, String> {
        let current: Option<(String, Option<i64>, i64)> = conn
            .query_row(
                "SELECT name, parent_id, is_primary FROM regions WHERE id = ?1",
                params![request.id],
                |row| Ok((row.get(0)?, row.get(1).ok().flatten(), row.get(2)?)),
            )
            .optional()
            .map_err(|e| format!("Failed to fetch region: {}", e))?;

        let (old_name, _old_parent, old_is_primary) = match current {
            Some(c) => c,
            None => return Err(format!("Region with ID {} not found", request.id)),
        };

        let mut updates = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(name) = &request.name {
            let name = name.trim().to_string();
            if name.is_empty() {
                return Err("Region name cannot be empty".to_string());
            }
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM regions WHERE name = ?1 AND id != ?2",
                    params![name, request.id],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Failed to check region name: {}", e))?;
            if exists > 0 {
                return Err(format!("Region '{}' already exists", name));
            }
            updates.push("name = ?".to_string());
            values.push(Box::new(name));
        }

        if let Some(emoji) = &request.emoji {
            updates.push("emoji = ?".to_string());
            values.push(Box::new(if emoji.trim().is_empty() {
                None::<String>
            } else {
                Some(emoji.trim().to_string())
            }));
        }

        if let Some(color) = &request.color {
            // Primary regions never carry a color; only sub-regions may be
            // recolored and only with a color not already in use elsewhere.
            let final_color = if old_is_primary != 0 {
                None::<String>
            } else if color.trim().is_empty() {
                None::<String>
            } else {
                let c = color.trim().to_string();
                let used = self.used_colors(conn, Some(request.id))?;
                if used.contains(&c) {
                    return Err(format!("Color '{}' is already used by another region", c));
                }
                Some(c)
            };
            updates.push("color = ?".to_string());
            values.push(Box::new(final_color));
        }

        if let Some(sort_order) = request.sort_order {
            updates.push("sort_order = ?".to_string());
            values.push(Box::new(sort_order));
        }

        if let Some(parent_id) = request.parent_id {
            if parent_id == request.id {
                return Err("A region cannot be its own parent".to_string());
            }
            let is_parent_primary: Option<i32> = conn
                .query_row(
                    "SELECT is_primary FROM regions WHERE id = ?1",
                    params![parent_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| format!("Failed to check parent region: {}", e))?;
            match is_parent_primary {
                Some(1) => {
                    updates.push("parent_id = ?".to_string());
                    updates.push("is_primary = 0".to_string());
                    values.push(Box::new(parent_id));
                    // Re-seat at the end of the new parent's children.
                    let max: i64 = conn
                        .query_row(
                            "SELECT COALESCE(MAX(sort_order), -1) FROM regions WHERE parent_id = ?1",
                            params![parent_id],
                            |row| row.get(0),
                        )
                        .map_err(|e| format!("Failed to compute sort order: {}", e))?;
                    updates.push("sort_order = ?".to_string());
                    values.push(Box::new(max + 1));
                }
                _ => {
                    return Err(
                        "Sub-regions can only belong to a primary region".to_string()
                    )
                }
            }
        }

        if updates.is_empty() {
            return Ok(false);
        }

        let sql = format!("UPDATE regions SET {} WHERE id = ?", updates.join(", "));
        values.push(Box::new(request.id));
        let ref_values: Vec<&dyn rusqlite::ToSql> =
            values.iter().map(|b| b.as_ref()).collect();
        let changed = conn
            .execute(&sql, ref_values.as_slice())
            .map_err(|e| format!("Failed to update region: {}", e))?;

        // Renaming a region must keep existing accounts in sync, since
        // accounts.proxy_state stores the region name directly.
        if let Some(name) = &request.name {
            let name = name.trim().to_string();
            if name != old_name {
                conn.execute(
                    "UPDATE accounts SET proxy_state = ?1 WHERE proxy_state = ?2",
                    params![name, old_name],
                )
                .map_err(|e| format!("Failed to sync account proxy_state: {}", e))?;
            }
        }

        Ok(changed > 0)
    }

    pub fn delete(&self, conn: &Connection, id: i64) -> Result<bool, String> {
        let region: Option<(String, Option<i64>)> = conn
            .query_row(
                "SELECT name, parent_id FROM regions WHERE id = ?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1).ok().flatten())),
            )
            .optional()
            .map_err(|e| format!("Failed to fetch region: {}", e))?;

        let (name, _parent_id) = match region {
            Some(r) => r,
            None => return Ok(false),
        };

        let children: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM regions WHERE parent_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check children: {}", e))?;
        if children > 0 {
            return Err(
                "Cannot delete a primary region that still has sub-regions".to_string()
            );
        }

        let in_use: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM accounts WHERE proxy_state = ?1",
                params![name],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check region usage: {}", e))?;
        if in_use > 0 {
            return Err(format!(
                "Cannot delete '{}': it is assigned to {} account(s)",
                name, in_use
            ));
        }

        conn.execute("DELETE FROM regions WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete region: {}", e))?;

        Ok(conn.changes() > 0)
    }

    /// Reorders a sibling group (primaries when parent_id is None, otherwise
    /// the children of that parent) to match the given ordered id list.
    pub fn reorder(
        &self,
        conn: &Connection,
        parent_id: Option<i64>,
        ordered_ids: Vec<i64>,
    ) -> Result<bool, String> {
        let scope = if let Some(pid) = parent_id {
            format!("parent_id = {}", pid)
        } else {
            "parent_id IS NULL".to_string()
        };

        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("Failed to start transaction: {}", e))?;

        for (index, rid) in ordered_ids.iter().enumerate() {
            let updated = tx
                .execute(
                    &format!(
                        "UPDATE regions SET sort_order = ?1 WHERE id = ?2 AND {}",
                        scope
                    ),
                    params![index as i64, rid],
                )
                .map_err(|e| format!("Failed to reorder region: {}", e))?;
            if updated == 0 {
                return Err(format!("Region {} is not part of the target group", rid));
            }
        }

        tx.commit().map_err(|e| format!("Failed to commit reorder: {}", e))?;
        Ok(true)
    }

    /// Names of all sub-regions in display (sort) order. Used for cycling new
    /// accounts across states. Falls back to the legacy PROXY_STATES list when
    /// no sub-regions are configured yet.
    pub fn sub_region_names(&self, conn: &Connection) -> Result<Vec<String>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT name FROM regions WHERE parent_id IS NOT NULL ORDER BY sort_order, id",
            )
            .map_err(|e| format!("Failed to prepare sub-region query: {}", e))?;

        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| format!("Failed to query sub-regions: {}", e))?;

        let mut names = Vec::new();
        for row in rows {
            names.push(row.map_err(|e| format!("Failed to map sub-region: {}", e))?);
        }

        if names.is_empty() {
            names = PROXY_STATES.iter().map(|s| s.to_string()).collect();
        }
        Ok(names)
    }
}
