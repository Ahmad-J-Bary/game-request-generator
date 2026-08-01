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
//!   via an interpolated synthetic '-' row.
//! - Every (token, day) group shares ONE `time_spent` value between its Session
//!   and its Event.
//! - Legacy ordering guard: a standalone "Session Only" card never trails a
//!   purchase card on the same day's timeline.

use std::collections::HashMap;

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
    requests: Vec<DailyRequest>,
}

/// Plan the full request list for one account on one target date.
pub fn plan_daily_requests(input: &PlanInput) -> Vec<DailyRequest> {
    let mut rng = rand::thread_rng();
    let day = input.days_passed as i32;

    let mut cards = plan_level_groups(input, day, &mut rng);
    cards.extend(plan_purchase_groups(input, day, &mut rng));

    let mut requests = Vec::new();
    for card in legacy_ordering_filter(cards) {
        requests.extend(card.requests);
    }
    requests
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

fn plan_level_groups(input: &PlanInput, day: i32, rng: &mut rand::rngs::ThreadRng) -> Vec<Card> {
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
        // A group is skipped only when EVERY level of the group was completed
        // on the target date (matches the legacy "group fully completed" skip).
        let group_fully_completed = group_levels.iter().all(|l| {
            input.level_progress.get(&l.id).is_some_and(|p| {
                p.is_completed && p.target_date.as_deref() == Some(input.target_date)
            })
        });
        if group_fully_completed {
            continue;
        }

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
                    event_token: real_event_token
                        .clone()
                        .unwrap_or_else(|| l.event_token.clone()),
                    level_id: Some(l.id),
                    time_spent: group_time_spent,
                    timestamp: input.target_date.to_string(),
                });
            } else {
                requests.push(DailyRequest {
                    request_type: RequestType::LevelEvent.as_str().to_string(),
                    content: render_content(input, &base_token, &l.level_name, group_time_spent, day, true),
                    event_token: l.event_token.clone(),
                    level_id: Some(l.id),
                    time_spent: group_time_spent,
                    timestamp: input.target_date.to_string(),
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
            });
        }

        cards.push(Card {
            time_spent: group_time_spent,
            has_event: has_real,
            has_purchase: false,
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
        if event_day_offset != day || is_completed {
            continue;
        }

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
            },
            DailyRequest {
                request_type: RequestType::PurchaseEvent.as_str().to_string(),
                content: event_content,
                event_token: clean_event_token.clone(),
                level_id: None,
                time_spent,
                timestamp: input.target_date.to_string(),
            },
        ];

        cards.push(Card {
            time_spent,
            has_event: true,
            has_purchase: true,
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
            requests: vec![DailyRequest {
                request_type: ty.to_string(),
                content: String::new(),
                event_token: "x".to_string(),
                level_id: None,
                time_spent: t,
                timestamp: "".to_string(),
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
}
