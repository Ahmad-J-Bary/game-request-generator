// src/utils/timeline-time.utils.ts
// Shared progressive timeline helpers for AccountDetail / AccountsDetail / DailyTasks

export interface TimelineLevelPoint {
  daysOffset: number;
  timeSpent: number; // base unit used in tables ("1000 seconds")
  levelName?: string;
  token?: string;
  synthetic?: boolean;
}

export interface TimelinePurchasePoint {
  daysOffset: number | null | undefined;
  token?: string;
}

/**
 * Keep only real timeline anchors:
 * - numeric day
 * - non-synthetic
 * - not session-only ("-")
 */
export function getRealTimelineLevels(
  levels: TimelineLevelPoint[],
): TimelineLevelPoint[] {
  return levels
    .filter(
      (l) =>
        typeof l.daysOffset === "number" &&
        Number.isFinite(l.daysOffset) &&
        !l.synthetic &&
        l.levelName !== "-",
    )
    .sort((a, b) => a.daysOffset - b.daysOffset);
}

/**
 * Expand timeline with session-only days so calculations can "see" days
 * that don't have an event anchor in DB but still exist in request flow.
 *
 * Rule:
 * - Keep all real levels.
 * - For missing days between min/max real day, synthesize session points
 *   using progressive interpolation.
 */
export function expandTimelineWithSessionDays(
  realLevels: TimelineLevelPoint[],
  minDay?: number,
  maxDay?: number,
  fallback = 243,
): TimelineLevelPoint[] {
  if (realLevels.length === 0) return [];

  const sorted = [...realLevels].sort((a, b) => a.daysOffset - b.daysOffset);
  const existingDays = new Set(sorted.map((l) => l.daysOffset));

  const fromDay =
    typeof minDay === "number" && Number.isFinite(minDay)
      ? minDay
      : Math.min(0, sorted[0].daysOffset);
  const toDay =
    typeof maxDay === "number" && Number.isFinite(maxDay)
      ? maxDay
      : sorted[sorted.length - 1].daysOffset;

  const expanded: TimelineLevelPoint[] = [...sorted];

  for (let day = fromDay; day <= toDay; day++) {
    if (existingDays.has(day)) continue;

    const interpolated = getProgressiveTimeSpentForDay(day, sorted, fallback);
    expanded.push({
      daysOffset: day,
      timeSpent: interpolated,
      levelName: "-",
      token: "",
      synthetic: true,
    });
  }

  return expanded.sort((a, b) => a.daysOffset - b.daysOffset);
}

/**
 * Progressive interpolation used by legacy behavior:
 * 1) If same-day real levels exist -> average them (their event anchor).
 * 2) Else interpolate progressively between previous and next real anchor.
 * 3) Before first real day -> proportional ramp from day 0 to first anchor.
 * 4) After last real day -> carry last anchor value.
 * 5) Fallback -> provided fallback (default 243).
 */
export function getProgressiveTimeSpentForDay(
  day: number,
  realLevels: TimelineLevelPoint[],
  fallback = 243,
): number {
  if (!Number.isFinite(day)) return fallback;
  if (realLevels.length === 0) return fallback;

  const sameDay = realLevels.filter((l) => l.daysOffset === day);
  if (sameDay.length > 0) {
    const total = sameDay.reduce((sum, l) => sum + (l.timeSpent || 0), 0);
    return Math.round(total / sameDay.length);
  }

  const prev = [...realLevels].reverse().find((l) => l.daysOffset < day);
  const next = realLevels.find((l) => l.daysOffset > day);

  // Before first anchor: progressive ramp
  if (!prev && next) {
    const firstRealDay = next.daysOffset;
    if (firstRealDay <= 0) return next.timeSpent || fallback;
    const ratio = Math.max(0, (day + 1) / (firstRealDay + 1));
    return Math.round((next.timeSpent || fallback) * ratio);
  }

  // Between two anchors: linear interpolation
  if (prev && next) {
    const span = next.daysOffset - prev.daysOffset;
    if (span <= 0) return prev.timeSpent || fallback;
    const t = (day - prev.daysOffset) / span;
    return Math.round(
      (prev.timeSpent || 0) +
        t * ((next.timeSpent || 0) - (prev.timeSpent || 0)),
    );
  }

  // After last anchor
  if (prev) return prev.timeSpent || fallback;

  return fallback;
}

/**
 * Bridged purchase behavior (matches desired progressive between-neighbor requests):
 * - find the nearest previous and next real anchors around purchase day
 * - generate evenly spaced bridge values for all purchase days in that segment
 * - each purchase takes the bridge step corresponding to its order in that segment
 *
 * If either side is missing, fallback to progressive interpolation.
 */
export function getBridgedPurchaseTimeSpent(
  day: number,
  realLevels: TimelineLevelPoint[],
  allPurchaseDays: number[],
  fallback = 243,
): number {
  if (!Number.isFinite(day)) return fallback;
  if (realLevels.length === 0) return fallback;

  const sortedLevels = [...realLevels].sort(
    (a, b) => a.daysOffset - b.daysOffset,
  );
  const prev = [...sortedLevels].reverse().find((l) => l.daysOffset <= day);
  const next = sortedLevels.find((l) => l.daysOffset > day);

  if (!prev || !next) {
    return getProgressiveTimeSpentForDay(day, sortedLevels, fallback);
  }

  const purchaseDaysInSegment = Array.from(
    new Set(
      allPurchaseDays.filter((d) => d > prev.daysOffset && d < next.daysOffset),
    ),
  ).sort((a, b) => a - b);

  if (purchaseDaysInSegment.length === 0) {
    return getProgressiveTimeSpentForDay(day, sortedLevels, fallback);
  }

  const idx = purchaseDaysInSegment.indexOf(day);
  if (idx === -1) {
    return getProgressiveTimeSpentForDay(day, sortedLevels, fallback);
  }

  const totalBridgeSteps = purchaseDaysInSegment.length + 1;
  const delta = (next.timeSpent - prev.timeSpent) / totalBridgeSteps;
  const bridged = prev.timeSpent + delta * (idx + 1);

  return Math.round(bridged);
}

/**
 * Backward-compatible wrapper:
 * - if purchase-day list is provided, uses bridged behavior
 * - otherwise falls back to previous midpoint/progressive behavior
 */
export function getLegacyPurchaseTimeSpent(
  day: number,
  realLevels: TimelineLevelPoint[],
  fallback = 243,
  allPurchaseDays: number[] = [],
): number {
  if (allPurchaseDays.length > 0) {
    return getBridgedPurchaseTimeSpent(
      day,
      realLevels,
      allPurchaseDays,
      fallback,
    );
  }

  if (!Number.isFinite(day)) return fallback;
  if (realLevels.length === 0) return fallback;

  const sameDay = realLevels.filter((l) => l.daysOffset === day);
  const next = realLevels.find((l) => l.daysOffset > day);

  const levelsToAverage = [...sameDay];
  if (next) levelsToAverage.push(next);

  if (levelsToAverage.length > 0) {
    const total = levelsToAverage.reduce(
      (sum, l) => sum + (l.timeSpent || 0),
      0,
    );
    return Math.round(total / levelsToAverage.length);
  }

  return getProgressiveTimeSpentForDay(day, realLevels, fallback);
}

/**
 * Build synthetic session value for a token/day with same progressive behavior.
 * If token has dedicated anchors, use them; otherwise fallback to global anchors.
 */
export function getSyntheticSessionTimeSpent(
  token: string,
  day: number,
  allRealLevels: TimelineLevelPoint[],
  fallback = 243,
): number {
  const tokenLevels = allRealLevels
    .filter((l) => (l.token || "") === token)
    .sort((a, b) => a.daysOffset - b.daysOffset);

  const source = tokenLevels.length > 0 ? tokenLevels : allRealLevels;
  return getProgressiveTimeSpentForDay(day, source, fallback);
}

/**
 * Convenience for purchase object with optional day.
 */
export function getPurchaseTimeSpentFromPurchase(
  purchase: TimelinePurchasePoint,
  realLevels: TimelineLevelPoint[],
  fallback = 243,
): number | null {
  if (purchase.daysOffset == null) return null;
  return getLegacyPurchaseTimeSpent(purchase.daysOffset, realLevels, fallback);
}
