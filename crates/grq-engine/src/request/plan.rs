//! The request planner — the single source of truth for which requests an
//! account gets on a given day, and their FINAL types.
//!
//! Structural rules enforced here:
//! - A day with a real Level Event always carries BOTH a "Level Session" and a
//!   "Level Event" (a virtual session is synthesized when no '-' row exists),
//!   exactly like a Purchase Event carries "Purchase Session" + "Purchase
//!   Event". A standalone "Session Only" therefore never coexists with a Level
//!   Event for the same (base token, day).
//! - A missing level day (no real level) becomes a standalone "Session Only"
//!   via an interpolated synthetic '-' row. A "Session Only" request ALWAYS
//!   carries the BASE token (never a `_day*` suffix), so the filled request and
//!   the frontend card show the clean event token.
//! - A purchase day with a real Level Event never carries a standalone "Session
//!   Only"; a purchase-only day (no real level) keeps its Session Only, ordered
//!   before the purchase.
//! - Every (token, day) group shares ONE `time_spent` value between its Session
//!   and its Event.
//! - Legacy ordering guard: a standalone "Session Only" card never trails a
//!   purchase card on the same day's timeline.

use std::collections::{HashMap, HashSet};

use crate::models::account::Account;
use crate::models::level::Level;
use crate::models::progress::{AccountLevelProgress, AccountPurchaseEventProgress};
use crate::models::purchase_event::PurchaseEvent;

use super::synthetic::{purchase_base_time, synthetic_session_for_day};
use super::time::{group_anchor_time, request_time_spent};
use super::types::{base_token_of, DailyRequest, RequestType};

/// Everything `plan_daily_requests` needs. The caller pre-fetches all rows and
/// hands them in so the planner stays a pure, testable function.
pub struct PlanInput<'a> {
    pub account: &'a Account,
    pub levels: &'a [Level],
    pub level_progress: &'a HashMap<i64, &'a AccountLevelProgress>,
    pub purchase_events: &'a [PurchaseEvent],
    pub purchase_progress: &'a HashMap<i64, &'a AccountPurchaseEventProgress>,
    pub days_passed: i64,
    pub target_date: &'a str,
}

/// A generated card: one (token, day) group or purchase pair, carrying the
/// unified pacing time shared by its requests.
struct Card {
    time_spent: i64,
    has_event: bool,
    has_purchase: bool,
    /// Whether the whole card is already completed (skipped from the returned
    /// list, but still counted when numbering the account's full day plan).
    completed: bool,
    /// The level ids of every level row in this group (event + persisted '-'
    /// session rows). Empty for purchase cards.
    level_ids: Vec<i64>,
    /// The purchase event id when this is a purchase card, else None.
    purchase_event_id: Option<i64>,
    requests: Vec<DailyRequest>,
}

/// The full plan for one account on one day: the pending requests to show plus
/// the total number of tasks (cards) the account has for the day (including
/// completed ones) — the "N" of the Daily Tasks "TASK n/N" counter.
pub struct DayPlan {
    pub requests: Vec<DailyRequest>,
    pub total_cards: i64,
    /// Cards fully completed as of today, using a lenient completion check
    /// (is_completed, dated by `completed_at`) so manually-completed cards
    /// without a `target_date` stamp are still counted. The returned
    /// `requests` keep the strict target-date rule, so the pending list on the
    /// Daily Tasks page is unchanged.
    pub completed_cards: i64,
}

/// Plan the full request list for one account on one target date, including the
/// numbering metadata over the account's whole day plan.
pub fn plan_day(input: &PlanInput) -> DayPlan {
    let mut rng = rand::thread_rng();
    let day = input.days_passed as i32;

    let purchase_days = purchase_days(input);

    let mut cards = plan_level_groups(input, day, &purchase_days, &mut rng);
    cards.extend(plan_purchase_groups(input, day, &mut rng));

    // The full-day plan is ordered and filtered by the same legacy ordering
    // guard the frontend displays. Completed cards stay in this ordering so
    // their requests occupy their natural position in the day, then they are
    // dropped from the returned (pending) list.
    let ordered = legacy_ordering_filter(cards);

    // "N" is the number of tasks (cards) in the full-day plan. Every request of
    // a card (e.g. the Session + Event pair) shares the card's "n" (day_index).
    let total_cards = ordered.len() as i64;
    let completed_cards = ordered
        .iter()
        .filter(|c| card_completed_lenient(input, c))
        .count() as i64;

    let mut day_index = 1i64;
    let mut requests = Vec::new();
    for card in ordered {
        for mut request in card.requests {
            request.day_index = day_index;
            if !card.completed {
                requests.push(request);
            }
        }
        day_index += 1;
    }

    DayPlan {
        requests,
        total_cards,
        completed_cards,
    }
}

/// Lenient card completion used only for counting completed cards: the card is
/// done when every one of its rows is completed, dated by `completed_at` (the
/// actual completion moment) instead of the strict `target_date == today` rule.
/// A missing `completed_at` is treated as completed to avoid undercounting
/// imported/manual progress that predates the timestamp column.
fn card_completed_lenient(input: &PlanInput, card: &Card) -> bool {
    if let Some(purchase_event_id) = card.purchase_event_id {
        return input
            .purchase_progress
            .get(&purchase_event_id)
            .is_some_and(|p| {
                p.is_completed && completed_on_date(&p.completed_at, input.target_date)
            });
    }

    if card.level_ids.is_empty() {
        return false;
    }

    card.level_ids.iter().all(|level_id| {
        input
            .level_progress
            .get(level_id)
            .is_some_and(|p| p.is_completed && completed_on_date(&p.completed_at, input.target_date))
    })
}

/// Whether a `completed_at` timestamp falls on the target date (YYYY-MM-DD,
/// UTC, matching how the app resolves "today"). A None timestamp (legacy rows
/// without the column populated) counts as completed.
fn completed_on_date(completed_at: &Option<String>, target_date: &str) -> bool {
    match completed_at {
        Some(stamp) => chrono::DateTime::parse_from_rfc3339(stamp)
            .map(|dt| dt.date_naive().to_string() == target_date)
            .unwrap_or(false),
        None => true,
    }
}

/// Plan the pending (non-completed) requests for one account on one target
/// date. Thin wrapper over [`plan_day`] kept for backwards compatibility.
pub fn plan_daily_requests(input: &PlanInput) -> Vec<DailyRequest> {
    plan_day(input).requests
}

/// The days on which a purchase event fires, using the same effective offset
/// resolution as `plan_purchase_groups` (progress overrides the event default).
fn purchase_days(input: &PlanInput) -> HashSet<i32> {
    input
        .purchase_events
        .iter()
        .filter_map(|e| {
            input
                .purchase_progress
                .get(&e.id)
                .map(|p| p.days_offset)
                .or(e.days_offset)
        })
        .collect()
}

/// Legacy ordering guard: a standalone "Session Only" card never trails a
/// purchase card on the same day's timeline.
fn legacy_ordering_filter(cards: Vec<Card>) -> Vec<Card> {
    let mut cards = cards;
    cards.sort_by(|a, b| {
        (a.time_spent, &a.requests[0].event_token)
            .cmp(&(b.time_spent, &b.requests[0].event_token))
    });

    let mut seen_purchase = false;
    let mut kept = Vec::new();
    for card in cards {
        if card.has_purchase {
            seen_purchase = true;
        }
        if !card.has_event && !card.has_purchase && seen_purchase {
            continue;
        }
        kept.push(card);
    }
    kept
}

fn plan_level_groups(
    input: &PlanInput,
    day: i32,
    purchase_days: &HashSet<i32>,
    rng: &mut rand::rngs::ThreadRng,
) -> Vec<Card> {
    let mut groups: HashMap<(String, i32), Vec<Level>> = HashMap::new();
    for l in input.levels {
        if l.days_offset != day {
            continue;
        }
        let base = base_token_of(&l.event_token).to_string();
        groups.entry((base, l.days_offset)).or_default().push(l.clone());
    }

    // Synthetic fill only fires when the day has NO level rows at all (neither
    // a real event nor a persisted '-' session), matching the legacy fill.
    let has_any_level_today = input.levels.iter().any(|l| l.days_offset == day);

    if !has_any_level_today {
        if let Some(synth) = synthetic_session_for_day(
            day,
            input.account.game_id,
            input.account.branch_id,
            input.levels,
        ) {
            let base = base_token_of(&synth.event_token).to_string();
            groups.entry((base, day)).or_default().push(synth);
        }
    }

    let mut cards = Vec::new();

    for (_key, group_levels) in groups {
        let has_real_event = group_levels.iter().any(|l| l.level_name != "-");

        // A standalone "Session Only" group (no real event in it) must NEVER
        // coexist with a purchase event on a day that also carries a real Level
        // Event. A purchase-only day (no real level) keeps its Session Only,
        // which the legacy ordering filter then places before the purchase.
        let day_has_purchase = purchase_days.contains(&day);
        let day_has_real_level = input
            .levels
            .iter()
            .any(|l| l.days_offset == day && l.level_name != "-");
        if !has_real_event && day_has_purchase && day_has_real_level {
            continue;
        }

        // A standalone "Session Only" group (no real event in it) is skipped as
        // soon as EVERY session row is completed — REGARDLESS of target_date.
        // This is the hard guarantee that a completed Session Only request never
        // reappears in Daily Tasks after import, even when its `target_date` is
        // stale or absent.
        let session_only_all_completed = !has_real_event
            && group_levels.iter().all(|l| {
                input.level_progress.get(&l.id).is_some_and(|p| p.is_completed)
            });

        // A group is completed when EVERY level of the group was completed on
        // the target date (matches the legacy "group fully completed" skip).
        let group_fully_completed = group_levels.iter().all(|l| {
            input.level_progress.get(&l.id).is_some_and(|p| {
                p.is_completed && p.target_date.as_deref() == Some(input.target_date)
            })
        });
        let completed = session_only_all_completed || group_fully_completed;

        // Sort: '-' session rows first, then real events.
        let mut sorted = group_levels;
        sorted.sort_by(|a, b| {
            let a_is_session = a.level_name == "-";
            let b_is_session = b.level_name == "-";
            b_is_session.cmp(&a_is_session)
        });

        let has_real = sorted.iter().any(|l| l.level_name != "-");
        let has_session_row = sorted.iter().any(|l| l.level_name == "-");

        // The event row's exact token: a virtual session (and any '-' row in an
        // event group) must share it so the frontend groups the pair into one
        // card and can resolve the row by token.
        let real_event_token = sorted
            .iter()
            .find(|l| l.level_name != "-")
            .map(|l| l.event_token.clone());

        // ONE fresh jitter per (token, day) group, anchored on the first real
        // (event) level so the Session and its Event never differ.
        let group_time_spent = request_time_spent(group_anchor_time(&sorted), rng);

        let base_token = base_token_of(&sorted[0].event_token).to_string();

        let mut requests = Vec::new();

        for l in &sorted {
            if l.level_name == "-" {
                requests.push(DailyRequest {
                    request_type: if has_real {
                        RequestType::LevelSession.as_str()
                    } else {
                        RequestType::SessionOnly.as_str()
                    }
                    .to_string(),
                    content: render_content(input, &base_token, &l.level_name, group_time_spent, day, false),
                    // A standalone "Session Only" always emits the BASE token
                    // (no `_day*` suffix), regardless of whether the '-' row is
                    // persisted (`abc_day2`) or synthesized in memory (`abc`).
                    // Level Session pairs keep the real event's full token.
                    event_token: real_event_token
                        .clone()
                        .unwrap_or_else(|| base_token.clone()),
                    level_id: Some(l.id),
                    time_spent: group_time_spent,
                    timestamp: input.target_date.to_string(),
                    day_index: 0,
                });
            } else {
                requests.push(DailyRequest {
                    request_type: RequestType::LevelEvent.as_str().to_string(),
                    content: render_content(input, &base_token, &l.level_name, group_time_spent, day, true),
                    event_token: l.event_token.clone(),
                    level_id: Some(l.id),
                    time_spent: group_time_spent,
                    timestamp: input.target_date.to_string(),
                    day_index: 0,
                });
            }
        }

        // Compound pair: a real event with no '-' session row gets a virtual
        // Level Session sharing the group's unified pacing time AND the event's
        // own token, so the day always emits "Level Session + Level Event"
        // (never a bare Event) in ONE card.
        if has_real && !has_session_row {
            requests.push(DailyRequest {
                request_type: RequestType::LevelSession.as_str().to_string(),
                content: render_content(input, &base_token, "-", group_time_spent, day, false),
                event_token: real_event_token.unwrap(),
                level_id: None,
                time_spent: group_time_spent,
                timestamp: input.target_date.to_string(),
                day_index: 0,
            });
        }

        cards.push(Card {
            time_spent: group_time_spent,
            has_event: has_real,
            has_purchase: false,
            completed,
            level_ids: sorted.iter().map(|l| l.id).collect(),
            purchase_event_id: None,
            requests,
        });
    }

    cards
}

fn plan_purchase_groups(input: &PlanInput, day: i32, rng: &mut rand::rngs::ThreadRng) -> Vec<Card> {
    let mut cards = Vec::new();

    for event in input.purchase_events {
        let prog = input.purchase_progress.get(&event.id);
        let effective_offset = prog.map(|p| p.days_offset).or(event.days_offset);

        let Some(event_day_offset) = effective_offset else { continue; };
        let is_completed = prog.map(|p| p.is_completed).unwrap_or(false);
        if event_day_offset != day {
            continue;
        }
        let completed = is_completed;

        let time_spent = if let Some(p) = prog.filter(|p| {
            p.is_completed && p.target_date.as_deref() == Some(input.target_date)
        }) {
            p.time_spent as i64
        } else {
            let base = purchase_base_time(event_day_offset, input.levels);
            request_time_spent(base, rng)
        };

        let clean_event_token = &event.event_token;

        let base_content = input
            .account
            .request_template
            .replace("{event_token}", clean_event_token)
            .replace("{time_spent}", &time_spent.to_string())
            .replace("{account_name}", &input.account.name)
            .replace("{game_id}", &input.account.game_id.to_string())
            .replace("{level_name}", clean_event_token)
            .replace("{days_offset}", &event_day_offset.to_string());

        let session_content = ensure_content_length(base_content.clone());
        let event_content = ensure_content_length(base_content.replace("POST /session", "POST /event"));

        let requests = vec![
            DailyRequest {
                request_type: RequestType::PurchaseSession.as_str().to_string(),
                content: session_content,
                event_token: clean_event_token.clone(),
                level_id: None,
                time_spent,
                timestamp: input.target_date.to_string(),
                day_index: 0,
            },
            DailyRequest {
                request_type: RequestType::PurchaseEvent.as_str().to_string(),
                content: event_content,
                event_token: clean_event_token.clone(),
                level_id: None,
                time_spent,
                timestamp: input.target_date.to_string(),
                day_index: 0,
            },
        ];

        cards.push(Card {
            time_spent,
            has_event: true,
            has_purchase: true,
            completed,
            level_ids: Vec::new(),
            purchase_event_id: Some(event.id),
            requests,
        });
    }

    cards
}

/// Render the account's request template for one request, filling the known
/// placeholders and (for events) switching `POST /session` to `POST /event`.
fn render_content(
    input: &PlanInput,
    base_token: &str,
    level_name: &str,
    time_spent: i64,
    day: i32,
    is_event: bool,
) -> String {
    let mut content = input
        .account
        .request_template
        .replace("{event_token}", base_token)
        .replace("{time_spent}", &time_spent.to_string())
        .replace("{account_name}", &input.account.name)
        .replace("{game_id}", &input.account.game_id.to_string())
        .replace("{level_name}", level_name)
        .replace("{days_offset}", &day.to_string());

    if is_event {
        content = content.replace("POST /session", "POST /event");
    }

    ensure_content_length(content)
}

/// Adds a `Content-Length` header when the rendered template did not already
/// include one.
fn ensure_content_length(content: String) -> String {
    if !content.contains("Content-Length:") && content.contains("\n\n") {
        if let Some((headers, body)) = content.split_once("\n\n") {
            return format!("{}\nContent-Length: {}\n\n{}", headers, body.len(), body);
        }
    }
    content
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account() -> Account {
        Account {
            id: 1,
            game_id: 1,
            branch_id: Some(1),
            branch_name: None,
            name: "acc".to_string(),
            start_date: "2024-01-01".to_string(),
            start_time: "00:00:00".to_string(),
            request_template: "POST /session\r\n\r\n{{time_spent}}".to_string(),
            created_at: None,
            package_id: None,
            proxy_state: None,
        }
    }

    fn level(id: i64, day: i32, name: &str, base: i32, token: &str) -> Level {
        Level {
            id,
            game_id: 1,
            branch_id: Some(1),
            level_name: name.to_string(),
            event_token: token.to_string(),
            days_offset: day,
            time_spent: base,
            is_bonus: false,
        }
    }

    fn purchase_event(id: i64, token: &str, day: i32) -> PurchaseEvent {
        PurchaseEvent {
            id,
            game_id: 1,
            branch_id: Some(1),
            event_token: token.to_string(),
            level_name: "$$$".to_string(),
            is_restricted: false,
            max_days_offset: None,
            days_offset: Some(day),
            created_at: None,
        }
    }

    fn plan_levels(levels: Vec<Level>, days_passed: i64) -> Vec<DailyRequest> {
        plan_daily_requests(&PlanInput {
            account: &account(),
            levels: &levels,
            level_progress: &HashMap::new(),
            purchase_events: &[],
            purchase_progress: &HashMap::new(),
            days_passed,
            target_date: "2024-01-05",
        })
    }

    fn plan_with_purchases(
        levels: Vec<Level>,
        purchases: Vec<PurchaseEvent>,
        days_passed: i64,
    ) -> Vec<DailyRequest> {
        plan_daily_requests(&PlanInput {
            account: &account(),
            levels: &levels,
            level_progress: &HashMap::new(),
            purchase_events: &purchases,
            purchase_progress: &HashMap::new(),
            days_passed,
            target_date: "2024-01-05",
        })
    }

    #[test]
    fn real_level_day_emits_session_plus_event_pair() {
        let lv = level(1, 4, "Level 1", 1000, "tok_day4");
        let reqs = plan_levels(vec![lv], 4);
        assert_eq!(reqs.len(), 2);

        let session = reqs.iter().find(|r| r.request_type == "Level Session").unwrap();
        let event = reqs.iter().find(|r| r.request_type == "Level Event").unwrap();

        // No '-' row exists -> the session is virtual (no level_id).
        assert_eq!(session.level_id, None);
        assert_eq!(event.level_id, Some(1));
        assert_eq!(session.event_token, event.event_token);
    }

    #[test]
    fn pair_shares_one_time_spent_value() {
        let lv = level(1, 4, "Level 1", 1000, "tok_day4");
        let reqs = plan_levels(vec![lv], 4);
        assert_eq!(reqs[0].time_spent, reqs[1].time_spent);
    }

    #[test]
    fn missing_day_emits_session_only() {
        let lv = level(1, 7, "Level 1", 1000, "tok_day7");
        let reqs = plan_levels(vec![lv], 4);
        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].request_type, "Session Only");
        assert_eq!(reqs[0].event_token, "tok");
        assert_eq!(reqs[0].level_id, Some(-4));
    }

    #[test]
    fn persisted_session_row_emits_session_only_with_base_token() {
        // A persisted '-' row carries a full `_day*` token, but the emitted
        // "Session Only" request must ALWAYS use the BASE token so the filled
        // request and the card show a clean event token (never `_day*`).
        let session = level(1, 4, "-", 18, "b_day4");
        let reqs = plan_levels(vec![session], 4);

        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].request_type, "Session Only");
        assert_eq!(reqs[0].event_token, "b");
        assert_eq!(reqs[0].level_id, Some(1));
    }

    #[test]
    fn session_only_never_coexists_with_level_event_same_base_day() {
        // Legacy invalid DB state: a '-' row and a real event share (base, day).
        let session = level(1, 4, "-", 18, "tok_day4");
        let ev = level(2, 4, "Level 1", 1000, "tok_day4");
        let reqs = plan_levels(vec![session, ev], 4);

        assert_eq!(reqs.len(), 2);
        assert!(
            reqs.iter().all(|r| r.request_type != "Session Only"),
            "a real event on (base, day) must upgrade the session to Level Session"
        );
        let session_req = reqs.iter().find(|r| r.request_type == "Level Session").unwrap();
        assert_eq!(session_req.level_id, Some(1));
    }

    #[test]
    fn session_only_and_event_on_other_token_can_coexist() {
        // Different base token on the same day: allowed.
        let ev = level(1, 5, "Level A", 1000, "a_day5");
        let session = level(2, 5, "-", 18, "b_day5");
        let reqs = plan_levels(vec![ev, session], 5);

        assert!(reqs.iter().any(|r| r.request_type == "Level Event"));
        assert!(reqs.iter().any(|r| r.request_type == "Session Only"));
    }

    #[test]
    fn purchase_emits_session_plus_event_pair() {
        let pe = purchase_event(1, "pev1_day4", 4);
        let reqs = plan_with_purchases(vec![], vec![pe], 4);

        assert_eq!(reqs.len(), 2);
        assert!(reqs.iter().any(|r| r.request_type == "Purchase Session"));
        assert!(reqs.iter().any(|r| r.request_type == "Purchase Event"));
        assert_eq!(reqs[0].time_spent, reqs[1].time_spent);
    }

    #[test]
    fn purchase_and_level_event_same_day_never_emits_session_only() {
        // A real Level Event + purchase on the same day -> Level pair + purchase
        // pair, and NO standalone "Session Only".
        let lv = level(1, 4, "Level 1", 1000, "tok_day4");
        let pe = purchase_event(1, "pev1_day4", 4);
        let reqs = plan_with_purchases(vec![lv], vec![pe], 4);

        assert_eq!(reqs.len(), 4);
        assert!(
            reqs.iter().all(|r| r.request_type != "Session Only"),
            "a purchase day with a real Level Event must never emit Session Only"
        );
        assert!(reqs.iter().any(|r| r.request_type == "Level Session"));
        assert!(reqs.iter().any(|r| r.request_type == "Level Event"));
        assert!(reqs.iter().any(|r| r.request_type == "Purchase Session"));
        assert!(reqs.iter().any(|r| r.request_type == "Purchase Event"));
    }

    #[test]
    fn purchase_day_with_real_level_drops_persisted_session_only() {
        // Legacy DB state: a persisted '-' row (different base token) on a day
        // that also has a real Level Event AND a purchase event. The Session
        // Only must be suppressed; the level pair and purchase pair survive.
        let session = level(1, 4, "-", 18, "b_day4");
        let ev = level(2, 4, "Level 1", 1000, "tok_day4");
        let pe = purchase_event(1, "pev1_day4", 4);
        let reqs = plan_with_purchases(vec![session, ev], vec![pe], 4);

        assert!(
            reqs.iter().all(|r| r.request_type != "Session Only"),
            "persisted Session Only must be suppressed on a purchase day with a real Level Event"
        );
        assert!(reqs.iter().any(|r| r.request_type == "Level Event"));
        assert!(reqs.iter().any(|r| r.request_type == "Purchase Event"));
    }

    #[test]
    fn purchase_only_day_emits_session_only_before_purchase() {
        // No real level on the purchase day (a real level exists later) ->
        // "Session Only" appears and is ordered BEFORE the purchase requests.
        let lv = level(1, 7, "Level 1", 1000, "tok_day7");
        let pe = purchase_event(1, "pev1_day4", 4);
        let reqs = plan_with_purchases(vec![lv], vec![pe], 4);

        let session_idx = reqs
            .iter()
            .position(|r| r.request_type == "Session Only")
            .expect("purchase-only day must keep its Session Only");
        let purchase_idx = reqs
            .iter()
            .position(|r| r.request_type.starts_with("Purchase"))
            .expect("purchase pair must be emitted");
        assert!(
            session_idx < purchase_idx,
            "Session Only must appear before the purchase on a purchase-only day"
        );
    }

    #[test]
    fn fully_completed_group_is_skipped() {
        let lv = level(1, 4, "Level 1", 1000, "tok_day4");
        let mut progress: HashMap<i64, &AccountLevelProgress> = HashMap::new();
        let completed = AccountLevelProgress {
            account_id: 1,
            level_id: 1,
            is_completed: true,
            time_spent: 1000000,
            target_date: Some("2024-01-05".to_string()),
            completed_at: None,
        };
        progress.insert(1, &completed);

        let reqs = plan_daily_requests(&PlanInput {
            account: &account(),
            levels: &[lv],
            level_progress: &progress,
            purchase_events: &[],
            purchase_progress: &HashMap::new(),
            days_passed: 4,
            target_date: "2024-01-05",
        });
        assert_eq!(reqs.len(), 0);
    }

    #[test]
    fn completed_session_only_group_is_skipped_without_target_date() {
        // A standalone "Session Only" group (persisted '-' row) is skipped as
        // soon as its row is completed — even WITHOUT `target_date == today`.
        // This is the hard guarantee that a completed Session Only request never
        // reappears in Daily Tasks after import, regardless of target_date.
        let lv = level(1, 4, "-", 18, "b_day4");
        let plan_with = |target_date: Option<String>, is_completed: bool| {
            let mut progress: HashMap<i64, &AccountLevelProgress> = HashMap::new();
            let completed = AccountLevelProgress {
                account_id: 1,
                level_id: 1,
                is_completed,
                time_spent: 18000,
                target_date,
                completed_at: None,
            };
            progress.insert(1, &completed);
            plan_daily_requests(&PlanInput {
                account: &account(),
                levels: &[lv.clone()],
                level_progress: &progress,
                purchase_events: &[],
                purchase_progress: &HashMap::new(),
                days_passed: 4,
                target_date: "2024-01-05",
            })
        };

        // Completed without target_date -> never emitted.
        assert_eq!(
            plan_with(None, true).len(),
            0,
            "completed Session Only without target_date is skipped"
        );
        // Completed with a stale target_date -> never emitted.
        assert_eq!(
            plan_with(Some("2024-01-04".to_string()), true).len(),
            0,
            "completed Session Only with a stale target_date is skipped"
        );
        // Completed with today's target_date -> skipped (unchanged).
        assert_eq!(
            plan_with(Some("2024-01-05".to_string()), true).len(),
            0,
            "completed Session Only with target_date == today is skipped"
        );
        // Not completed -> still emitted.
        assert_eq!(
            plan_with(None, false).len(),
            1,
            "incomplete Session Only is still emitted"
        );
    }

    #[test]
    fn compound_group_with_completed_session_still_emits_pending_event() {
        // A compound group (real Level Event + '-' session on the same day):
        // when only the SESSION row is completed, the pending Event is still
        // emitted (the frontend hides the completed session via (base, day)
        // progress). Locks behavior so the Session Only skip does not regress
        // event/session pairs.
        let ev = level(1, 4, "Level A", 1000, "a_day4");
        let session = level(2, 4, "-", 18, "a_day4");
        let mut progress: HashMap<i64, &AccountLevelProgress> = HashMap::new();
        let completed_session = AccountLevelProgress {
            account_id: 1,
            level_id: 2,
            is_completed: true,
            time_spent: 18000,
            target_date: None,
            completed_at: None,
        };
        progress.insert(2, &completed_session);

        let reqs = plan_daily_requests(&PlanInput {
            account: &account(),
            levels: &[ev, session],
            level_progress: &progress,
            purchase_events: &[],
            purchase_progress: &HashMap::new(),
            days_passed: 4,
            target_date: "2024-01-05",
        });

        assert!(
            reqs.iter().any(|r| r.request_type == "Level Event"),
            "pending Level Event is still emitted alongside a completed session row"
        );
    }

    #[test]
    fn time_spent_is_in_seconds() {
        let lv = level(1, 4, "Level 1", 3, "tok_day4");
        let reqs = plan_levels(vec![lv], 4);
        let t = reqs[0].time_spent;
        // base 3 -> 3*1000 + jitter(-100..=500) seconds
        assert!(t >= 2900, "below min: {}", t);
        assert!(t <= 3500, "above max: {}", t);
    }

    #[test]
    fn legacy_filter_drops_session_only_after_purchase() {
        let mk = |t: i64, ty: &str, has_event: bool, has_purchase: bool| Card {
            time_spent: t,
            has_event,
            has_purchase,
            completed: false,
            level_ids: Vec::new(),
            purchase_event_id: None,
            requests: vec![DailyRequest {
                request_type: ty.to_string(),
                content: String::new(),
                event_token: "x".to_string(),
                level_id: None,
                time_spent: t,
                timestamp: "".to_string(),
                day_index: 0,
            }],
        };

        let cards = vec![
            mk(100, "Purchase Event", true, true),
            mk(200, "Session Only", false, false),
        ];
        let filtered = legacy_ordering_filter(cards);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].requests[0].request_type, "Purchase Event");

        let cards = vec![
            mk(100, "Session Only", false, false),
            mk(200, "Purchase Event", true, true),
        ];
        let filtered = legacy_ordering_filter(cards);
        assert_eq!(filtered.len(), 2, "session before purchase is kept");
    }

    #[test]
    fn plan_day_numbers_all_day_tasks_per_card() {
        // Two real Level Event pairs on the same day = 2 tasks (cards).
        let a = level(1, 4, "Level 1", 1000, "a_day4");
        let b = level(2, 4, "Level B", 2000, "b_day4");
        let plan = plan_day(&PlanInput {
            account: &account(),
            levels: &[a, b],
            level_progress: &HashMap::new(),
            purchase_events: &[],
            purchase_progress: &HashMap::new(),
            days_passed: 4,
            target_date: "2024-01-05",
        });

        assert_eq!(plan.total_cards, 2);
        // Both rows of a card share the card's "n" (1 then 2).
        let indices: Vec<i64> = plan.requests.iter().map(|r| r.day_index).collect();
        assert_eq!(indices, vec![1, 1, 2, 2]);
        // Every returned request is pending (none completed here).
        assert_eq!(plan_daily_requests(&PlanInput {
            account: &account(),
            levels: &[level(1, 4, "Level 1", 1000, "a_day4"), level(2, 4, "Level B", 2000, "b_day4")],
            level_progress: &HashMap::new(),
            purchase_events: &[],
            purchase_progress: &HashMap::new(),
            days_passed: 4,
            target_date: "2024-01-05",
        }).len(), 4);
    }

    #[test]
    fn plan_day_total_includes_completed_tasks() {
        // Group A (day 4) is fully completed today -> only group B is returned,
        // but the full-day task count stays 2 and B keeps its position (2/2).
        let a = level(1, 4, "Level 1", 1000, "a_day4");
        let b = level(2, 4, "Level B", 2000, "b_day4");
        let mut progress: HashMap<i64, &AccountLevelProgress> = HashMap::new();
        let completed_a = AccountLevelProgress {
            account_id: 1,
            level_id: 1,
            is_completed: true,
            time_spent: 1000000,
            target_date: Some("2024-01-05".to_string()),
            completed_at: None,
        };
        progress.insert(1, &completed_a);

        let plan = plan_day(&PlanInput {
            account: &account(),
            levels: &[a, b],
            level_progress: &progress,
            purchase_events: &[],
            purchase_progress: &HashMap::new(),
            days_passed: 4,
            target_date: "2024-01-05",
        });

        assert_eq!(plan.total_cards, 2, "total includes the completed pair");
        assert_eq!(plan.requests.len(), 2, "only the pending pair is returned");
        let indices: Vec<i64> = plan.requests.iter().map(|r| r.day_index).collect();
        assert_eq!(indices, vec![2, 2], "pending requests keep the card's absolute position");
    }

    #[test]
    fn plan_day_completed_cards_counts_manual_completion_without_target_date() {
        // A card completed manually (is_completed, completed_at today, but NO
        // target_date) is NOT dropped from the pending requests (strict rule),
        // yet `completed_cards` still counts it so the dashboard is accurate.
        let a = level(1, 4, "Level 1", 1000, "a_day4");
        let b = level(2, 4, "Level B", 2000, "b_day4");
        let mut progress: HashMap<i64, &AccountLevelProgress> = HashMap::new();
        let completed_a = AccountLevelProgress {
            account_id: 1,
            level_id: 1,
            is_completed: true,
            time_spent: 1000000,
            target_date: None, // manual completion leaves target_date NULL
            completed_at: Some("2026-08-05T10:00:00.000Z".to_string()),
        };
        progress.insert(1, &completed_a);

        let plan = plan_day(&PlanInput {
            account: &account(),
            levels: &[a, b],
            level_progress: &progress,
            purchase_events: &[],
            purchase_progress: &HashMap::new(),
            days_passed: 4,
            target_date: "2026-08-05",
        });

        // Manually-completed card still appears as pending (strict target_date rule).
        assert_eq!(plan.requests.len(), 2, "manual card stays in pending list");
        assert_eq!(plan.total_cards, 2);
        assert_eq!(plan.completed_cards, 1, "manual card counted as completed today");
    }

    #[test]
    fn plan_day_completed_cards_ignores_stale_completed_at() {
        // A card completed on a previous day must not count as completed today.
        let a = level(1, 4, "Level 1", 1000, "a_day4");
        let b = level(2, 4, "Level B", 2000, "b_day4");
        let mut progress: HashMap<i64, &AccountLevelProgress> = HashMap::new();
        let completed_a = AccountLevelProgress {
            account_id: 1,
            level_id: 1,
            is_completed: true,
            time_spent: 1000000,
            target_date: None,
            completed_at: Some("2026-08-04T10:00:00.000Z".to_string()),
        };
        progress.insert(1, &completed_a);

        let plan = plan_day(&PlanInput {
            account: &account(),
            levels: &[a, b],
            level_progress: &progress,
            purchase_events: &[],
            purchase_progress: &HashMap::new(),
            days_passed: 4,
            target_date: "2026-08-05",
        });

        assert_eq!(plan.completed_cards, 0, "yesterday's completion is not 'today'");
    }

    #[test]
    fn plan_day_completed_cards_counts_purchase_and_null_stamp() {
        // Purchase card completed today counts; a level with NULL completed_at
        // also counts (legacy rows without a timestamp).
        let lv = level(1, 4, "Level 1", 1000, "tok_day4");
        let pe = purchase_event(1, "pev1_day4", 4);
        let mut purchase_progress: HashMap<i64, &AccountPurchaseEventProgress> = HashMap::new();
        let completed_pe = AccountPurchaseEventProgress {
            account_id: 1,
            purchase_event_id: 1,
            is_completed: true,
            days_offset: 4,
            time_spent: 5000,
            target_date: None,
            completed_at: Some("2026-08-05T11:00:00.000Z".to_string()),
        };
        purchase_progress.insert(1, &completed_pe);

        let mut progress: HashMap<i64, &AccountLevelProgress> = HashMap::new();
        let null_stamped = AccountLevelProgress {
            account_id: 1,
            level_id: 1,
            is_completed: true,
            time_spent: 1000,
            target_date: None,
            completed_at: None,
        };
        progress.insert(1, &null_stamped);

        let plan = plan_day(&PlanInput {
            account: &account(),
            levels: &[lv],
            level_progress: &progress,
            purchase_events: &[pe],
            purchase_progress: &purchase_progress,
            days_passed: 4,
            target_date: "2026-08-05",
        });

        assert_eq!(plan.total_cards, 2);
        assert_eq!(plan.completed_cards, 2, "purchase (today) + level (null stamp) count");
    }

    #[test]
    fn plan_day_single_request_is_one_of_one() {
        let lv = level(1, 7, "Level 1", 1000, "tok_day7");
        let plan = plan_day(&PlanInput {
            account: &account(),
            levels: &[lv],
            level_progress: &HashMap::new(),
            purchase_events: &[],
            purchase_progress: &HashMap::new(),
            days_passed: 4,
            target_date: "2024-01-05",
        });

        assert_eq!(plan.total_cards, 1);
        assert_eq!(plan.requests[0].day_index, 1);
        assert_eq!(plan.requests[0].request_type, "Session Only");
    }

    #[test]
    fn plan_day_total_counts_purchase_pairs() {
        // A purchase event = 1 task (card) of 2 rows; with one pending level
        // pair that is 2 tasks total.
        let lv = level(1, 4, "Level 1", 1000, "tok_day4");
        let pe = purchase_event(1, "pev1_day4", 4);
        let plan = plan_day(&PlanInput {
            account: &account(),
            levels: &[lv],
            level_progress: &HashMap::new(),
            purchase_events: &[pe],
            purchase_progress: &HashMap::new(),
            days_passed: 4,
            target_date: "2024-01-05",
        });

        assert_eq!(plan.total_cards, 2);
        let indices: Vec<i64> = plan.requests.iter().map(|r| r.day_index).collect();
        assert_eq!(indices, vec![1, 1, 2, 2]);
    }
}
