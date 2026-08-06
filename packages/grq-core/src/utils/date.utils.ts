/**
 * Current calendar date (local timezone) as YYYY-MM-DD.
 *
 * The whole stack (daily task generation, completion stamps, the engine's
 * `completed_on_date` rule and Excel exports) must agree on ONE calendar day.
 * `toISOString()` returns the UTC date, which drifts off-by-one near midnight
 * on any machine whose timezone is not UTC — so "today" is resolved here using
 * the local timezone and the engine matches it via `Local`.
 */
export function toLocalDateIso(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today's local calendar date as YYYY-MM-DD. */
export function todayLocalIso(): string {
  return toLocalDateIso();
}
