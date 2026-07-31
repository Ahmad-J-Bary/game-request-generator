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
    // before first real day (day 1): day 0 -> (0+1) * 1000 / (1+1) = 500
    assert_eq!(session_interpolated_time(0, &levels), 500);
}

#[test]
fn clamps_after_last_real_level() {
    let levels = vec![level(0, 1000, "Level 1"), level(1, 2500, "Level 2")];
    assert_eq!(session_interpolated_time(5, &levels), 2500);
}

#[test]
fn ignores_the_day_itself_as_anchor() {
    // day 1 is a real event (3000) but must NOT be used as the session anchor
    let levels = vec![level(0, 1000, "Level 1"), level(1, 3000, "Level 2")];
    assert_eq!(session_interpolated_time(1, &levels), 1000);
}

#[test]
fn exact_match_on_anchor_day_uses_own_value() {
    let levels = vec![level(0, 1000, "Level 1"), level(2, 2000, "Level 3")];
    // day 0 -> no prev, next day 2 -> before-first scaling: (0+1)*2000/(2+1) ~= 667
    assert_eq!(session_interpolated_time(0, &levels), 667);
}

#[test]
fn empty_levels_returns_zero() {
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
    // anchors: only day 3 (5000). day 2 -> before-first scaling: (2+1)*5000/(3+1) = 3750
    assert_eq!(session_interpolated_time(2, &levels), 3750);
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

// ===== per-request time (own base + jitter) =====

#[test]
fn per_request_time_uses_own_base_time() {
    let base = 1000;
    let jitter = jitter_range(base);
    let ms = (base as i64 * 1000) + jitter.start();
    assert_eq!(ms, 1000 * 1000 - 750);
}

#[test]
fn per_request_time_stays_within_allowed_bounds() {
    let mut rng = rand::thread_rng();
    for _ in 0..200 {
        let ms = request_time_spent_ms(1000, &mut rng);
        assert!(ms >= 1000 * 1000 - 750, "below min: {}", ms);
        assert!(ms <= 1000 * 1000 + 1500, "above max: {}", ms);
    }
}

#[test]
fn per_request_time_small_base_uses_small_bounds() {
    let mut rng = rand::thread_rng();
    for _ in 0..200 {
        let ms = request_time_spent_ms(10, &mut rng);
        assert!(ms >= 10 * 1000 - 100, "below min: {}", ms);
        assert!(ms <= 10 * 1000 + 500, "above max: {}", ms);
    }
}

#[test]
fn per_request_times_are_independent_across_calls() {
    // Each call must draw a fresh jitter; over many samples the values are not
    // all identical (i.e. requests never share a single cloned value).
    let mut rng = rand::thread_rng();
    let mut distinct = std::collections::HashSet::new();
    for _ in 0..50 {
        distinct.insert(request_time_spent_ms(1000, &mut rng));
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

