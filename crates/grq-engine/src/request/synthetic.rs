//! Synthetic session-day interpolation.
//!
//! Missing level days are filled with a synthetic standalone session ("-")
//! whose base token comes from the NEXT real level (matching the Excel import
//! rule), so tables and the request flow can "see" those days.

use crate::models::level::Level;

use super::types::base_token_of;

/// Interpolates the session-only time (in base units) for a given day using the
/// surrounding REAL levels (`level_name != "-"`) as anchors. The day itself is
/// treated as missing, so the value is independent of any event that shares the
/// day.
pub fn session_interpolated_time(day: i32, levels: &[Level]) -> i32 {
    let mut real_levels: Vec<&Level> = levels.iter().filter(|l| l.level_name != "-").collect();
    real_levels.sort_by_key(|l| l.days_offset);

    if real_levels.is_empty() {
        return 0;
    }

    let next_level = real_levels
        .iter()
        .filter(|l| l.days_offset > day)
        .min_by_key(|l| l.days_offset)
        .copied();
    let prev_level = real_levels
        .iter()
        .filter(|l| l.days_offset < day)
        .max_by_key(|l| l.days_offset)
        .copied();

    match (prev_level, next_level) {
        (Some(prev), Some(next)) => {
            let ratio =
                (day - prev.days_offset) as f64 / (next.days_offset - prev.days_offset) as f64;
            (prev.time_spent as f64 + ratio * (next.time_spent - prev.time_spent) as f64).round()
                as i32
        }
        (None, Some(next)) => {
            let first_real_day = next.days_offset;
            if first_real_day <= 0 {
                next.time_spent
            } else {
                let increment = next.time_spent as f64 / (first_real_day + 1) as f64;
                ((day + 1) as f64 * increment).round() as i32
            }
        }
        (Some(prev), None) => prev.time_spent,
        (None, None) => 0,
    }
}

/// Build a synthetic '-' level for a missing `day` using the NEXT real level's
/// base token. Returns `None` when no real level exists after `day` (no
/// synthetic row is created after the last real day).
pub fn synthetic_session_for_day(
    day: i32,
    game_id: i64,
    branch_id: Option<i64>,
    levels: &[Level],
) -> Option<Level> {
    let mut real_levels: Vec<&Level> = levels.iter().filter(|l| l.level_name != "-").collect();
    real_levels.sort_by_key(|l| l.days_offset);

    if real_levels.is_empty() {
        return None;
    }

    let next_real = real_levels
        .iter()
        .filter(|l| l.days_offset > day)
        .min_by_key(|l| l.days_offset)?;

    let first_real_day = real_levels.iter().map(|l| l.days_offset).min().unwrap();

    let time = if day < first_real_day {
        // Progressive ramp from day 0 to the first real anchor.
        let increment = next_real.time_spent as f64 / (first_real_day + 1) as f64;
        ((day + 1) as f64 * increment).round() as i32
    } else {
        let prev_real = real_levels
            .iter()
            .filter(|l| l.days_offset < day)
            .max_by_key(|l| l.days_offset);
        match prev_real {
            Some(prev) => {
                let span = (next_real.days_offset - prev.days_offset) as f64;
                if span <= 0.0 {
                    prev.time_spent
                } else {
                    let ratio = (day - prev.days_offset) as f64 / span;
                    (prev.time_spent as f64 + ratio * (next_real.time_spent - prev.time_spent)
                        as f64)
                        .round() as i32
                }
            }
            None => next_real.time_spent / 2,
        }
    };

    let token = base_token_of(&next_real.event_token).to_string();

    Some(Level {
        id: -(day as i64),
        game_id,
        branch_id,
        level_name: "-".to_string(),
        event_token: token,
        days_offset: day,
        time_spent: time,
        is_bonus: false,
    })
}

/// Compute the base (base units) pacing for a purchase day, replicating the
/// legacy timeline-aware averaging: real levels plus interpolated session
/// points, then average the same-day entries and the next timeline entry.
pub fn purchase_base_time(day: i32, levels: &[Level]) -> i32 {
    let mut real_sorted_levels: Vec<&Level> =
        levels.iter().filter(|l| l.level_name != "-").collect();
    real_sorted_levels.sort_by_key(|l| l.days_offset);

    if real_sorted_levels.is_empty() {
        return 243;
    }

    let mut timeline_points: Vec<(i32, i32)> = real_sorted_levels
        .iter()
        .map(|l| (l.days_offset, l.time_spent))
        .collect();

    let min_day = std::cmp::min(0, timeline_points.first().map(|(d, _)| *d).unwrap_or(0));
    let max_day = timeline_points.last().map(|(d, _)| *d).unwrap_or(0);

    let existing_days: std::collections::HashSet<i32> =
        timeline_points.iter().map(|(d, _)| *d).collect();

    for missing_day in min_day..=max_day {
        if existing_days.contains(&missing_day) {
            continue;
        }
        timeline_points.push((missing_day, session_interpolated_time(missing_day, levels)));
    }

    timeline_points.sort_by_key(|(d, _)| *d);

    let same_day_levels: Vec<i32> = timeline_points
        .iter()
        .filter(|(d, _)| *d == day)
        .map(|(_, t)| *t)
        .collect();

    let next_level = timeline_points
        .iter()
        .find(|(d, _)| *d > day)
        .map(|(_, t)| *t);

    let mut levels_to_average = same_day_levels;
    if let Some(n) = next_level {
        levels_to_average.push(n);
    }

    if !levels_to_average.is_empty() {
        let total: i32 = levels_to_average.iter().sum();
        (total as f64 / levels_to_average.len() as f64).round() as i32
    } else {
        let prev_level = real_sorted_levels
            .iter()
            .filter(|l| l.days_offset <= day)
            .last();
        prev_level.map(|p| p.time_spent).unwrap_or(243)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn level(day: i32, time: i32, name: &str) -> Level {
        Level {
            id: day as i64,
            game_id: 1,
            branch_id: Some(1),
            level_name: name.to_string(),
            event_token: format!("tok_day{}", day),
            days_offset: day,
            time_spent: time,
            is_bonus: false,
        }
    }

    // ===== session_interpolated_time =====

    #[test]
    fn interpolates_between_two_real_levels() {
        let levels = vec![level(0, 1000, "Level 1"), level(2, 3000, "Level 3")];
        assert_eq!(session_interpolated_time(1, &levels), 2000);
    }

    #[test]
    fn clamps_before_first_real_level() {
        let levels = vec![level(1, 1000, "Level 2")];
        assert_eq!(session_interpolated_time(0, &levels), 500);
    }

    #[test]
    fn clamps_after_last_real_level() {
        let levels = vec![level(0, 1000, "Level 1"), level(1, 2500, "Level 2")];
        assert_eq!(session_interpolated_time(5, &levels), 2500);
    }

    #[test]
    fn ignores_the_day_itself_as_anchor() {
        let levels = vec![level(0, 1000, "Level 1"), level(1, 3000, "Level 2")];
        assert_eq!(session_interpolated_time(1, &levels), 1000);
    }

    #[test]
    fn exact_match_on_anchor_day_uses_own_value() {
        let levels = vec![level(0, 1000, "Level 1"), level(2, 2000, "Level 3")];
        assert_eq!(session_interpolated_time(0, &levels), 667);
    }

    #[test]
    fn empty_levels_return_zero() {
        assert_eq!(session_interpolated_time(3, &[]), 0);
    }

    #[test]
    fn synthetic_only_levels_return_zero() {
        let levels = vec![level(0, 1000, "-"), level(1, 2000, "-")];
        assert_eq!(session_interpolated_time(1, &levels), 0);
    }

    #[test]
    fn synthetic_levels_are_not_used_as_anchors() {
        let levels = vec![
            level(0, 1000, "-"),
            level(1, 2000, "-"),
            level(3, 5000, "Level 4"),
        ];
        assert_eq!(session_interpolated_time(2, &levels), 3750);
    }

    // ===== synthetic_session_for_day =====

    #[test]
    fn synthetic_uses_next_real_token() {
        let levels = vec![level(0, 1000, "Level 1"), level(3, 3000, "Level 4")];
        let s = synthetic_session_for_day(2, 1, Some(1), &levels).unwrap();
        assert_eq!(s.level_name, "-");
        assert_eq!(s.event_token, "tok");
        assert_eq!(s.time_spent, 2000);
        assert_eq!(s.id, -2);
    }

    #[test]
    fn synthetic_before_first_real_ramps_up() {
        let levels = vec![level(2, 1000, "Level 3")];
        let s = synthetic_session_for_day(0, 1, Some(1), &levels).unwrap();
        assert_eq!(s.event_token, "tok");
        assert_eq!(s.time_spent, (1000.0f64 / 3.0f64).round() as i32);
    }

    #[test]
    fn synthetic_none_after_last_real() {
        let levels = vec![level(0, 1000, "Level 1")];
        assert!(synthetic_session_for_day(3, 1, Some(1), &levels).is_none());
    }

    #[test]
    fn synthetic_none_without_real_levels() {
        let levels = vec![level(0, 1000, "-")];
        assert!(synthetic_session_for_day(1, 1, Some(1), &levels).is_none());
    }

    // ===== purchase_base_time =====

    #[test]
    fn purchase_time_empty_levels_returns_243() {
        assert_eq!(purchase_base_time(4, &[]), 243);
    }

    #[test]
    fn purchase_time_averages_same_day_and_next() {
        let levels = vec![level(0, 1000, "Level 1"), level(2, 3000, "Level 3")];
        // same-day at 1 -> none, next -> 3000 => average = 3000
        assert_eq!(purchase_base_time(1, &levels), 3000);
    }
}
