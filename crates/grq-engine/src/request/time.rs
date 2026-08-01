//! Unified pacing-time helpers.
//!
//! `time_spent` is expressed in SECONDS. A level's `time_spent` column stores a
//! base value where one unit equals 1000 seconds (the unit shown in tables);
//! the real duration is `base * 1000 + jitter`, also in seconds.

use crate::models::level::Level;
use rand::Rng;

/// Returns the allowed jitter range (in seconds) for a base value taken from
/// the level `time_spent` column (base units where one unit == 1000 seconds).
pub fn jitter_range(base: i32) -> std::ops::RangeInclusive<i64> {
    if base < 25 {
        -100..=500
    } else {
        -750..=1500
    }
}

/// Compute a `time_spent` (in seconds) from a base value in the level
/// `time_spent` column plus a fresh random jitter within the allowed range.
/// Called ONCE per (token, day) group so the Session and its Event share the
/// exact same value.
pub fn request_time_spent(base: i32, rng: &mut rand::rngs::ThreadRng) -> i64 {
    let jitter = rng.gen_range(jitter_range(base));
    (base as i64 * 1000) + jitter
}

/// Anchor base (base units) for a request group: the first real (event) level's
/// time, falling back to the session level when the group has no event.
pub fn group_anchor_time(levels: &[Level]) -> i32 {
    levels
        .iter()
        .find(|l| l.level_name != "-")
        .map(|l| l.time_spent)
        .or_else(|| levels.first().map(|l| l.time_spent))
        .unwrap_or(243)
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

    // ===== jitter_range =====

    #[test]
    fn jitter_range_small_base_uses_small_bounds() {
        assert_eq!(jitter_range(0), -100..=500);
        assert_eq!(jitter_range(24), -100..=500);
    }

    #[test]
    fn jitter_range_large_base_uses_large_bounds() {
        assert_eq!(jitter_range(25), -750..=1500);
        assert_eq!(jitter_range(1000), -750..=1500);
    }

    // ===== request_time_spent (seconds) =====

    #[test]
    fn request_time_stays_within_allowed_bounds() {
        let mut rng = rand::thread_rng();
        for _ in 0..200 {
            let t = request_time_spent(1000, &mut rng);
            assert!(t >= 1000 * 1000 - 750, "below min: {}", t);
            assert!(t <= 1000 * 1000 + 1500, "above max: {}", t);
        }
    }

    #[test]
    fn request_time_small_base_uses_small_bounds() {
        let mut rng = rand::thread_rng();
        for _ in 0..200 {
            let t = request_time_spent(10, &mut rng);
            assert!(t >= 10 * 1000 - 100, "below min: {}", t);
            assert!(t <= 10 * 1000 + 500, "above max: {}", t);
        }
    }

    #[test]
    fn request_times_are_independent_across_calls() {
        let mut rng = rand::thread_rng();
        let mut distinct = std::collections::HashSet::new();
        for _ in 0..50 {
            distinct.insert(request_time_spent(1000, &mut rng));
        }
        assert!(distinct.len() > 1, "all per-request times were identical");
    }

    // ===== group_anchor_time =====

    #[test]
    fn group_anchor_prefers_event_level() {
        let levels = vec![level(0, 22, "-"), level(0, 25, "lv60")];
        assert_eq!(group_anchor_time(&levels), 25);
    }

    #[test]
    fn group_anchor_uses_first_event_level() {
        let levels = vec![level(0, 25, "lv60"), level(0, 40, "lv70")];
        assert_eq!(group_anchor_time(&levels), 25);
    }

    #[test]
    fn group_anchor_falls_back_to_session_level() {
        let levels = vec![level(0, 18, "-")];
        assert_eq!(group_anchor_time(&levels), 18);
    }

    #[test]
    fn group_anchor_empty_returns_243() {
        assert_eq!(group_anchor_time(&[]), 243);
    }
}
