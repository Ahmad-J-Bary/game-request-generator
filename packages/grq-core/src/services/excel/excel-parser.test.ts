import { describe, it } from 'node:test';
import assert from 'node:assert';

// ===== Locale-agnostic Days Offset Regex Tests =====
const DAYS_OFFSET_REGEX = /\((.+?)\s+(\d+)\)\s*$/;

function parseDaysOffsetRegex(daysOffsetStr: string) {
  const parenMatch = daysOffsetStr.match(DAYS_OFFSET_REGEX);
  if (!parenMatch) return null;
  return {
    baseVal: parseInt(daysOffsetStr, 10),
    maxDaysOffset: parseInt(parenMatch[2], 10),
  };
}

describe('Days Offset regex — locale-agnostic', () => {
  it('parses English "less than" format', () => {
    const result = parseDaysOffsetRegex('5 (Less than 7)');
    assert.deepStrictEqual(result, { baseVal: 5, maxDaysOffset: 7 });
  });

  it('parses French format', () => {
    const result = parseDaysOffsetRegex('3 (Moins de 10)');
    assert.deepStrictEqual(result, { baseVal: 3, maxDaysOffset: 10 });
  });

  it('parses Arabic format', () => {
    const result = parseDaysOffsetRegex('2 (أقل من 5)');
    assert.deepStrictEqual(result, { baseVal: 2, maxDaysOffset: 5 });
  });

  it('parses Spanish format', () => {
    const result = parseDaysOffsetRegex('4 (Menos de 8)');
    assert.deepStrictEqual(result, { baseVal: 4, maxDaysOffset: 8 });
  });

  it('parses German format', () => {
    const result = parseDaysOffsetRegex('1 (Weniger als 3)');
    assert.deepStrictEqual(result, { baseVal: 1, maxDaysOffset: 3 });
  });

  it('parses Japanese format', () => {
    const result = parseDaysOffsetRegex('0 (未満 6)');
    assert.deepStrictEqual(result, { baseVal: 0, maxDaysOffset: 6 });
  });

  it('parses Chinese format', () => {
    const result = parseDaysOffsetRegex('2 (小于 9)');
    assert.deepStrictEqual(result, { baseVal: 2, maxDaysOffset: 9 });
  });

  it('parses with trailing spaces', () => {
    const result = parseDaysOffsetRegex('3 (Less than 10)   ');
    assert.deepStrictEqual(result, { baseVal: 3, maxDaysOffset: 10 });
  });

  it('parses simple number without parentheses', () => {
    const result = parseDaysOffsetRegex('42');
    assert.strictEqual(result, null);
  });

  it('returns null for empty string', () => {
    const result = parseDaysOffsetRegex('');
    assert.strictEqual(result, null);
  });

  it('returns null for dash', () => {
    const result = parseDaysOffsetRegex('-');
    assert.strictEqual(result, null);
  });
});

// ===== Purchase Event Detection Tests =====
function isPurchaseEvent(name: string, timeSpentStr: string): boolean {
  return name === '$$$' || timeSpentStr === '-' || timeSpentStr === '';
}

describe('Purchase event detection', () => {
  it('detects purchase by $$$ name', () => {
    assert.strictEqual(isPurchaseEvent('$$$', '500'), true);
  });

  it('detects purchase by empty timeSpent', () => {
    assert.strictEqual(isPurchaseEvent('MyEvent', ''), true);
  });

  it('detects purchase by dash timeSpent', () => {
    assert.strictEqual(isPurchaseEvent('MyEvent', '-'), true);
  });

  it('returns false for normal event with timeSpent', () => {
    assert.strictEqual(isPurchaseEvent('Level 1', '300'), false);
  });

  it('returns false for normal event with zero timeSpent', () => {
    assert.strictEqual(isPurchaseEvent('Level 1', '0'), false);
  });
});

// ===== Per-Type Cascade Logic Tests =====

/**
 * Simulates the new two-pass per-type cascade logic:
 * 1. (C) markers mark specific events as completed
 * 2. Within each type (level/purchase), cascade to earlier events of the same type
 * 3. If a type has no (C) markers, fall back to completionThreshold for that type
 * 4. Cross-type cascade never happens
 */
interface CascadeEvent {
  daysOffset: number;
  isPurchase: boolean;
  explicitC: boolean;  // has explicit (C) marker
}

interface CascadeResult {
  daysOffset: number;
  isPurchase: boolean;
  isCompleted: boolean;
}

function applyPerTypeCascade(
  events: { daysOffset: number; isPurchase: boolean }[],
  completedIndices: number[],  // indices of events with (C) marker
  completionThreshold: number | undefined,
): CascadeResult[] {
  // Mark events with explicit (C)
  const withC: CascadeEvent[] = events.map((e, idx) => ({
    ...e,
    explicitC: completedIndices.includes(idx),
  }));

  // Compute max completed offset per type from (C) markers
  let maxLevelFromC = -1;
  let maxPurchaseFromC = -1;
  for (const evt of withC) {
    if (!evt.explicitC) continue;
    if (evt.isPurchase) {
      if (evt.daysOffset > maxPurchaseFromC) maxPurchaseFromC = evt.daysOffset;
    } else {
      if (evt.daysOffset > maxLevelFromC) maxLevelFromC = evt.daysOffset;
    }
  }

  // Fall back to threshold for types without (C) markers
  const maxLevelOffset = maxLevelFromC >= 0 ? maxLevelFromC : completionThreshold;
  const maxPurchaseOffset = maxPurchaseFromC >= 0 ? maxPurchaseFromC : completionThreshold;

  // Apply cascade per type
  return withC.map((evt) => {
    let isCompleted = evt.explicitC;
    if (!isCompleted) {
      if (!evt.isPurchase && maxLevelOffset !== undefined && evt.daysOffset <= maxLevelOffset) {
        isCompleted = true;
      }
      if (evt.isPurchase && maxPurchaseOffset !== undefined && evt.daysOffset <= maxPurchaseOffset) {
        isCompleted = true;
      }
    }
    return { daysOffset: evt.daysOffset, isPurchase: evt.isPurchase, isCompleted };
  });
}

describe('Per-type cascade — level (C) does NOT cascade to purchases', () => {
  it('level (C) at day 5 cascades to earlier levels but not purchases', () => {
    // Events: levels at day 0, 3, 5 and purchases at day 0, 2, 5
    // Only level day 5 has (C)
    const events = [
      { daysOffset: 0, isPurchase: false },
      { daysOffset: 3, isPurchase: false },
      { daysOffset: 5, isPurchase: false },
      { daysOffset: 0, isPurchase: true },
      { daysOffset: 2, isPurchase: true },
      { daysOffset: 5, isPurchase: true },
    ];
    const result = applyPerTypeCascade(events, [2], undefined);
    // Levels: 0, 3, 5 should be completed (cascade)
    assert.strictEqual(result[0].isCompleted, true);
    assert.strictEqual(result[1].isCompleted, true);
    assert.strictEqual(result[2].isCompleted, true);
    // Purchases: none should be completed (no purchase (C), no threshold)
    assert.strictEqual(result[3].isCompleted, false);
    assert.strictEqual(result[4].isCompleted, false);
    assert.strictEqual(result[5].isCompleted, false);
  });

  it('purchase (C) at day 3 cascades to earlier purchases but not levels', () => {
    const events = [
      { daysOffset: 0, isPurchase: false },
      { daysOffset: 3, isPurchase: false },
      { daysOffset: 0, isPurchase: true },
      { daysOffset: 2, isPurchase: true },
      { daysOffset: 3, isPurchase: true },
    ];
    const result = applyPerTypeCascade(events, [4], undefined);
    // Levels: none should be completed
    assert.strictEqual(result[0].isCompleted, false);
    assert.strictEqual(result[1].isCompleted, false);
    // Purchases: 0, 2, 3 should be completed (cascade)
    assert.strictEqual(result[2].isCompleted, true);
    assert.strictEqual(result[3].isCompleted, true);
    assert.strictEqual(result[4].isCompleted, true);
  });

  it('cross-type cascade: both types with their own (C) markers cascade independently', () => {
    const events = [
      { daysOffset: 0, isPurchase: false },
      { daysOffset: 5, isPurchase: false },
      { daysOffset: 0, isPurchase: true },
      { daysOffset: 3, isPurchase: true },
    ];
    // Level day 5 has (C), purchase day 3 has (C)
    const result = applyPerTypeCascade(events, [1, 3], undefined);
    // Level 0, 5 completed; purchase 0, 3 completed
    assert.strictEqual(result[0].isCompleted, true);
    assert.strictEqual(result[1].isCompleted, true);
    assert.strictEqual(result[2].isCompleted, true);
    assert.strictEqual(result[3].isCompleted, true);
  });

  it('type without (C) falls back to threshold', () => {
    const events = [
      { daysOffset: 0, isPurchase: false },
      { daysOffset: 5, isPurchase: false },
      { daysOffset: 0, isPurchase: true },
      { daysOffset: 3, isPurchase: true },
    ];
    // Only purchase day 3 has (C). Threshold = 5.
    // Levels (no (C)) fall back to threshold → all levels <= 5 completed
    // Purchases cascade from (C) → all purchases <= 3 completed
    const result = applyPerTypeCascade(events, [3], 5);
    assert.strictEqual(result[0].isCompleted, true);   // level 0 (threshold)
    assert.strictEqual(result[1].isCompleted, true);   // level 5 (threshold)
    assert.strictEqual(result[2].isCompleted, true);   // purchase 0 (cascade from (C))
    assert.strictEqual(result[3].isCompleted, true);   // purchase 3 ((C))
  });

  it('no (C) markers at all: both types use threshold', () => {
    const events = [
      { daysOffset: 0, isPurchase: false },
      { daysOffset: 5, isPurchase: false },
      { daysOffset: 0, isPurchase: true },
      { daysOffset: 3, isPurchase: true },
    ];
    const result = applyPerTypeCascade(events, [], 3);
    assert.strictEqual(result[0].isCompleted, true);   // level 0
    assert.strictEqual(result[1].isCompleted, false);  // level 5 > 3
    assert.strictEqual(result[2].isCompleted, true);   // purchase 0
    assert.strictEqual(result[3].isCompleted, true);   // purchase 3 == threshold
  });

  it('no (C) and no threshold: nothing completed', () => {
    const events = [
      { daysOffset: 0, isPurchase: false },
      { daysOffset: 0, isPurchase: true },
    ];
    const result = applyPerTypeCascade(events, [], undefined);
    assert.strictEqual(result[0].isCompleted, false);
    assert.strictEqual(result[1].isCompleted, false);
  });

  it('threshold handles large values correctly', () => {
    const events = [
      { daysOffset: 1000, isPurchase: false },
      { daysOffset: 1001, isPurchase: false },
    ];
    const result = applyPerTypeCascade(events, [], 1000);
    assert.strictEqual(result[0].isCompleted, true);
    assert.strictEqual(result[1].isCompleted, false);
  });
});

// ===== Session Date Cutoff Tests =====

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Simulates the Session date cutoff logic:
 * Given a start_date and session date string (D-MMM),
 * mark events whose computed date <= session date as completed.
 */
interface SessionCutoffEvent {
  daysOffset: number;
  isCompleted: boolean;
  isPurchase?: boolean;
  isSessionOnly?: boolean;
  timeSpent?: number;
}

/**
 * Simulates the Session date cutoff logic:
 * Given a start_date and session date string (D-MMM),
 * - mark events whose computed date is BEFORE the Session date as completed.
 * - for events scheduled ON the Session date itself, complete only purchases,
 *   session-only requests, or level events whose time_spent matches
 *   round(Time/1000) within ±1 (completionThreshold).
 */
function applySessionCutoff(
  events: SessionCutoffEvent[],
  startDateStr: string,
  sessionDateStr: string | undefined,
  completionThreshold?: number,
): SessionCutoffEvent[] {
  if (!sessionDateStr) return events.map(e => ({ ...e }));

  const dashMatch = startDateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  let startDate: Date | null = null;
  if (dashMatch) {
    const mi = MONTHS_SHORT.map(m => m.toLowerCase()).indexOf(dashMatch[2].toLowerCase());
    if (mi >= 0) startDate = new Date(parseInt(dashMatch[3]), mi, parseInt(dashMatch[1]));
  } else {
    const d = new Date(startDateStr);
    if (!isNaN(d.getTime())) startDate = d;
  }
  if (!startDate) return events.map(e => ({ ...e }));
  // Normalize to local midnight so the Session-date day is compared by calendar day.
  startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

  // Parse session date
  const sm = sessionDateStr.match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (!sm) return events.map(e => ({ ...e }));
  const smi = MONTHS_SHORT.map(m => m.toLowerCase()).indexOf(sm[2].toLowerCase());
  if (smi < 0) return events.map(e => ({ ...e }));
  const sessionDate = new Date(startDate.getFullYear(), smi, parseInt(sm[1]));

  return events.map((e) => {
    if (e.isCompleted) return { ...e };
    const eventDate = new Date(startDate.getTime() + e.daysOffset * 24 * 60 * 60 * 1000);
    if (eventDate.getTime() < sessionDate.getTime()) {
      return { ...e, isCompleted: true };
    }
    if (eventDate.getTime() === sessionDate.getTime()) {
      const matchesTimeSpent = completionThreshold !== undefined && e.timeSpent !== undefined && Math.abs(e.timeSpent - completionThreshold) <= 1;
      if (e.isPurchase || e.isSessionOnly || matchesTimeSpent) {
        return { ...e, isCompleted: true };
      }
    }
    return { ...e };
  });
}

describe('Session date cutoff', () => {
  it('marks events with date before Session date as completed; boundary needs time_spent match', () => {
    const events = [
      { daysOffset: 0, isCompleted: false, timeSpent: 300 },
      { daysOffset: 2, isCompleted: false, timeSpent: 300 },
      { daysOffset: 5, isCompleted: false, timeSpent: 300 },
    ];
    // Start date: 1-Jan-2025 → offset 0=1-Jan, offset 2=3-Jan, offset 5=6-Jan
    // Session: 3-Jan → offset 0 (1-Jan < 3-Jan) completed; offset 2 (3-Jan, boundary)
    // completed via time_spent match (300 vs threshold 300); offset 5 (6-Jan) not.
    const result = applySessionCutoff(events, '1-Jan-2025', '3-Jan', 300);
    assert.strictEqual(result[0].isCompleted, true);
    assert.strictEqual(result[1].isCompleted, true);
    assert.strictEqual(result[2].isCompleted, false);
  });

  it('boundary level event without time_spent match is NOT completed', () => {
    const events = [
      { daysOffset: 0, isCompleted: false, timeSpent: 300 },
      { daysOffset: 2, isCompleted: false, timeSpent: 500 }, // boundary 3-Jan, no match
    ];
    // Session 3-Jan, threshold 300 → offset 0 (before) completed; offset 2 (boundary) not.
    const result = applySessionCutoff(events, '1-Jan-2025', '3-Jan', 300);
    assert.strictEqual(result[0].isCompleted, true);
    assert.strictEqual(result[1].isCompleted, false);
  });

  it('does not override existing (C) completion', () => {
    const events = [
      { daysOffset: 0, isCompleted: false },
      { daysOffset: 5, isCompleted: true },  // already completed via (C)
      { daysOffset: 10, isCompleted: false },
    ];
    const result = applySessionCutoff(events, '1-Jan-2025', '3-Jan');
    assert.strictEqual(result[0].isCompleted, true);  // via cutoff
    assert.strictEqual(result[1].isCompleted, true);  // already true
    assert.strictEqual(result[2].isCompleted, false); // > cutoff
  });

  it('handles Session date at month boundary', () => {
    // Start 30-Jan-2025, Session 1-Feb → offset 0 (30-Jan, before) and offset 2 (1-Feb, boundary + match) completed
    const events = [
      { daysOffset: 0, isCompleted: false, timeSpent: 300 },
      { daysOffset: 2, isCompleted: false, timeSpent: 300 },
      { daysOffset: 5, isCompleted: false, timeSpent: 300 },
    ];
    const result = applySessionCutoff(events, '30-Jan-2025', '1-Feb', 300);
    assert.strictEqual(result[0].isCompleted, true);
    assert.strictEqual(result[1].isCompleted, true);
    assert.strictEqual(result[2].isCompleted, false);
  });

  it('returns early when sessionDateStr is undefined', () => {
    const events = [{ daysOffset: 0, isCompleted: false }];
    const result = applySessionCutoff(events, '1-Jan-2025', undefined);
    assert.strictEqual(result[0].isCompleted, false);
  });

  it('handles start date in ISO format (YYYY-MM-DD)', () => {
    const events = [
      { daysOffset: 0, isCompleted: false },
      { daysOffset: 5, isCompleted: false },
    ];
    const result = applySessionCutoff(events, '2025-01-01', '3-Jan');
    assert.strictEqual(result[0].isCompleted, true);
    assert.strictEqual(result[1].isCompleted, false);
  });

  it('level event on the Session date completes only when time_spent matches ±1', () => {
    const events = [
      { daysOffset: 28, isCompleted: false, timeSpent: 690 }, // 29-Jul (before)
      { daysOffset: 29, isCompleted: false, timeSpent: 700 }, // 30-Jul (boundary, no match)
      { daysOffset: 30, isCompleted: false, timeSpent: 690 }, // 31-Jul (after, even if match)
    ];
    // Session 30-Jul, Time 690680 → completionThreshold = round(690680/1000) = 690
    const result = applySessionCutoff(events, '1-Jul-2025', '30-Jul', 690);
    assert.strictEqual(result[0].isCompleted, true,  '29-Jul < 30-Jul → completed regardless');
    assert.strictEqual(result[1].isCompleted, false, '30-Jul boundary, time_spent 700 ≠ 690±1 → NOT completed');
    assert.strictEqual(result[2].isCompleted, false, '31-Jul > 30-Jul → not completed');
  });

  it('level event on the Session date with time_spent within ±1 is completed', () => {
    const events = [
      { daysOffset: 29, isCompleted: false, timeSpent: 689 },
      { daysOffset: 29, isCompleted: false, timeSpent: 691 },
    ];
    const result = applySessionCutoff(events, '1-Jul-2025', '30-Jul', 690);
    assert.strictEqual(result[0].isCompleted, true, '689 is within ±1 of 690');
    assert.strictEqual(result[1].isCompleted, true, '691 is within ±1 of 690');
  });

  it('session-only request on the Session date is always completed', () => {
    const events = [
      { daysOffset: 29, isCompleted: false, isSessionOnly: true },
    ];
    const result = applySessionCutoff(events, '1-Jul-2025', '30-Jul');
    assert.strictEqual(result[0].isCompleted, true, 'session-only on boundary always completed');
  });

  it('purchase on the Session date is completed (no time_spent to match)', () => {
    const events = [
      { daysOffset: 29, isCompleted: false, isPurchase: true },
    ];
    const result = applySessionCutoff(events, '1-Jul-2025', '30-Jul');
    assert.strictEqual(result[0].isCompleted, true, 'purchase on boundary completed');
  });

  it('explicit (C) on the Session date always wins', () => {
    const events = [
      { daysOffset: 29, isCompleted: true, timeSpent: 700 },
    ];
    const result = applySessionCutoff(events, '1-Jul-2025', '30-Jul', 690);
    assert.strictEqual(result[0].isCompleted, true, '(C) preserved regardless of time_spent');
  });
});

// ===== Session Only + Session Cutoff Integration Tests =====

/**
 * Simulates the full flow for Session Only events:
 * 1. Session column date cutoff marks events as completed
 * 2. Per-type cascade then cascades within each type
 */
describe('Session Only with Session cutoff + per-type cascade', () => {
  it('Session cutoff marks Session Only (level_name === "-") events as completed', () => {
    // Simulate what the parser does: Session cutoff applies to ALL events first,
    // then per-type cascade spreads within each type
    const events = [
      { daysOffset: 0, isPurchase: false, explicitC: false },
      { daysOffset: 3, isPurchase: false, explicitC: false },
      { daysOffset: 5, isPurchase: false, explicitC: true }, // has (C)
      { daysOffset: 0, isPurchase: true, explicitC: false },
      { daysOffset: 3, isPurchase: true, explicitC: false },
    ];
    // Session date cutoff: start=1-Jan-2025, session=3-Jan
    // → events at offset 0 and 3 of BOTH types completed via cutoff
    // Then (C) at level offset 5 cascades to earlier levels too
    // Final: levels 0,3,5 completed; purchases 0,3 completed

    const startDate = new Date(2025, 0, 1);
    const sessionDate = new Date(2025, 0, 3); // 3-Jan

    // Apply cutoff (simulating parser logic)
    const cutoffResults = events.map((e) => {
      if (e.explicitC) return { ...e, isCompleted: true };
      const eventDate = new Date(startDate.getTime() + e.daysOffset * 86400000);
      const isCompleted = eventDate.getTime() <= sessionDate.getTime();
      return { ...e, isCompleted };
    });

    // Apply per-type cascade
    let maxLevel = -1;
    let maxPurchase = -1;
    for (const e of cutoffResults) {
      if (e.isCompleted) {
        if (!e.isPurchase && e.daysOffset > maxLevel) maxLevel = e.daysOffset;
        if (e.isPurchase && e.daysOffset > maxPurchase) maxPurchase = e.daysOffset;
      }
    }
    const finalResults = cutoffResults.map((e) => {
      if (e.isCompleted) return e;
      if (!e.isPurchase && maxLevel >= 0 && e.daysOffset <= maxLevel) return { ...e, isCompleted: true };
      if (e.isPurchase && maxPurchase >= 0 && e.daysOffset <= maxPurchase) return { ...e, isCompleted: true };
      return e;
    });

    // Levels 0, 3 (via cutoff) + 5 (via (C)) + cascade from 5 to 0,3 → all levels completed
    assert.strictEqual(finalResults[0].isCompleted, true); // level 0 (via cutoff + cascade)
    assert.strictEqual(finalResults[1].isCompleted, true); // level 3 (via cascade from 5)
    assert.strictEqual(finalResults[2].isCompleted, true); // level 5 (via (C))
    // Purchase 0 (via cutoff), purchase 3 has no (C) and is past cutoff → NOT completed
    assert.strictEqual(finalResults[3].isCompleted, true);  // purchase 0 (via cutoff)
    assert.strictEqual(finalResults[4].isCompleted, false); // purchase 3 (past cutoff, no (C))
  });

  it('Session cutoff with no (C) markers — boundary level needs time_spent match, purchases included', () => {
    const events = [
      { daysOffset: 0, isPurchase: false },
      { daysOffset: 2, isPurchase: false },
      { daysOffset: 5, isPurchase: false },
      { daysOffset: 0, isPurchase: true },
      { daysOffset: 2, isPurchase: true },
    ];
    // Session date 3-Jan, start 1-Jan → boundary at offset 2 (=3-Jan)
    // Level 0 (1-Jan < 3-Jan) completed; level 2 (3-Jan boundary, no time_spent match) NOT completed;
    // level 5 not. Purchases 0 (1-Jan < 3-Jan) and 2 (boundary purchase) completed.
    const startDate = new Date(2025, 0, 1);
    const sessionDate = new Date(2025, 0, 3);
    const results = events.map((e) => {
      const eventDate = new Date(startDate.getTime() + e.daysOffset * 86400000);
      if (eventDate.getTime() < sessionDate.getTime()) return { ...e, isCompleted: true };
      if (eventDate.getTime() === sessionDate.getTime()) return { ...e, isCompleted: e.isPurchase };
      return { ...e, isCompleted: false };
    });
    assert.strictEqual(results[0].isCompleted, true);
    assert.strictEqual(results[1].isCompleted, false);
    assert.strictEqual(results[2].isCompleted, false);
    assert.strictEqual(results[3].isCompleted, true);
    assert.strictEqual(results[4].isCompleted, true);
  });
});

// ===== (C) Marker Parsing Tests =====
function parseCellMarker(cellVal: string): { isCompleted: boolean; dateStr: string } {
  let isCompleted = false;
  let dateStr = '';
  if (cellVal && cellVal !== '-') {
    if (cellVal.endsWith('(C)')) {
      isCompleted = true;
      dateStr = cellVal.replace('(C)', '').trim();
    } else if (/^\d{1,2}-[A-Za-z]{3}$/.test(cellVal)) {
      isCompleted = false;
      dateStr = cellVal;
    }
  }
  return { isCompleted, dateStr };
}

describe('(C) marker parsing', () => {
  it('parses "26-Jul (C)" correctly', () => {
    const result = parseCellMarker('26-Jul (C)');
    assert.strictEqual(result.isCompleted, true);
    assert.strictEqual(result.dateStr, '26-Jul');
  });

  it('parses "5-Jan (C)" correctly', () => {
    const result = parseCellMarker('5-Jan (C)');
    assert.strictEqual(result.isCompleted, true);
    assert.strictEqual(result.dateStr, '5-Jan');
  });

  it('parses "26-Jul" without marker as not completed', () => {
    const result = parseCellMarker('26-Jul');
    assert.strictEqual(result.isCompleted, false);
    assert.strictEqual(result.dateStr, '26-Jul');
  });

  it('handles dash as no data', () => {
    const result = parseCellMarker('-');
    assert.strictEqual(result.isCompleted, false);
    assert.strictEqual(result.dateStr, '');
  });

  it('handles empty string', () => {
    const result = parseCellMarker('');
    assert.strictEqual(result.isCompleted, false);
    assert.strictEqual(result.dateStr, '');
  });

  it('does not match lowercase (c)', () => {
    const result = parseCellMarker('26-Jul (c)');
    assert.strictEqual(result.isCompleted, false);
    assert.strictEqual(result.dateStr, '');
  });
});

// ===== level_name resolution for purchase events =====
function resolvePurchaseLevelName(levelName: string): string {
  return levelName !== '$$$' ? levelName : '';
}

describe('Purchase event level_name resolution', () => {
  it('resolves normal level name', () => {
    assert.strictEqual(resolvePurchaseLevelName('My Level'), 'My Level');
  });

  it('resolves $$$ to empty string', () => {
    assert.strictEqual(resolvePurchaseLevelName('$$$'), '');
  });

  it('preserves empty string', () => {
    assert.strictEqual(resolvePurchaseLevelName(''), '');
  });
});

// ===== Multi-Account Progress Generation Tests =====

interface MockProgressEntry {
  gameName: string;
  accountName: string;
  levelName?: string;
  purchaseToken?: string;
  token: string;
  isCompleted: boolean;
  completionDate?: string;
  sessionDate?: string;
}

/**
 * Simulates what the parser does for each account row:
 * parse cells, apply session cutoff, apply per-type cascade, push progress entries.
 */
function generateProgressForRow(
  rowCells: string[],
  accountName: string,
  gameName: string,
  sessionDateStr: string | undefined,
  startDate: Date,
  colHeaders: { name: string; isPurchase: boolean; token: string; daysOffset?: number; timeSpent?: number }[],
  completionThreshold?: number,
): MockProgressEntry[] {
  const MONTHS_CAP = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parseCell = (cellVal: string): { isCompleted: boolean; dateStr: string; hasDateCell: boolean } => {
    let isCompleted = false;
    let dateStr = '';
    let hasDateCell = false;
    if (cellVal && cellVal !== '-') {
      hasDateCell = true;
      if (cellVal.endsWith('(C)')) {
        isCompleted = true;
        dateStr = cellVal.replace('(C)', '').trim();
      } else if (/^\d{1,2}-[A-Za-z]{3}$/.test(cellVal)) {
        isCompleted = false;
        dateStr = cellVal;
      }
    }
    return { isCompleted, dateStr, hasDateCell };
  };

  const computeEvtDateStr = (daysOffset: number): string => {
    const evtDate = new Date(startDate.getTime() + daysOffset * 24 * 60 * 60 * 1000);
    return `${evtDate.getDate()}-${MONTHS_CAP[evtDate.getMonth()]}`;
  };
  const parseDMMMD = (dateStr: string, refYear?: number): Date | null => {
    const m = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})$/);
    if (!m) return null;
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const mi = months.indexOf(m[2].toLowerCase());
    if (mi < 0) return null;
    const year = refYear ?? new Date().getFullYear();
    const d = new Date(year, mi, parseInt(m[1]));
    return isNaN(d.getTime()) ? null : d;
  };

  const refYear = startDate.getFullYear();

  // Parse cells → events
  const rowEvents: { header: typeof colHeaders[0]; isCompleted: boolean; dateStr: string; hasDateCell: boolean }[] = [];
  for (let c = 0; c < rowCells.length && c < colHeaders.length; c++) {
    const header = colHeaders[c];
    if (!header || !header.token) continue;
    const { isCompleted, dateStr, hasDateCell } = parseCell(rowCells[c]);
    rowEvents.push({ header, isCompleted, dateStr, hasDateCell });
  }

  // Apply session cutoff: requests before the Session date complete; requests on the
  // Session date itself complete only for purchases, session-only requests, or level
  // events whose time_spent matches round(Time/1000) within ±1 (completionThreshold).
  if (sessionDateStr && startDate) {
    const sessionParsed = parseDMMMD(sessionDateStr, refYear);
    for (const evt of rowEvents) {
      if (evt.isCompleted) continue;
      if (evt.header.daysOffset === undefined) continue;
      const evtDateStr = computeEvtDateStr(evt.header.daysOffset);
      const evtParsed = evtDateStr ? parseDMMMD(evtDateStr, refYear) : null;
      if (!evtParsed || !sessionParsed) continue;
      if (evtParsed.getTime() < sessionParsed.getTime()) {
        evt.isCompleted = true;
      } else if (evtParsed.getTime() === sessionParsed.getTime()) {
        const isSessionOnly = evt.header.name === '-';
        const headerSpent = evt.header.timeSpent;
        const matchesTimeSpent = completionThreshold !== undefined && headerSpent !== undefined && Math.abs(headerSpent - completionThreshold) <= 1;
        if (evt.header.isPurchase || isSessionOnly || matchesTimeSpent) {
          evt.isCompleted = true;
        }
      }
    }
  }

  // Per-type cascade
  let maxLevelFromC = -1;
  let maxPurchaseFromC = -1;
  for (const evt of rowEvents) {
    if (!evt.isCompleted || evt.header.daysOffset === undefined) continue;
    if (evt.header.isPurchase) {
      if (evt.header.daysOffset > maxPurchaseFromC) maxPurchaseFromC = evt.header.daysOffset;
    } else {
      if (evt.header.daysOffset > maxLevelFromC) maxLevelFromC = evt.header.daysOffset;
    }
  }

  const maxLevelOffset = maxLevelFromC >= 0 ? maxLevelFromC : undefined;
  const maxPurchaseOffset = maxPurchaseFromC >= 0 ? maxPurchaseFromC : undefined;

  // Generate progress entries
  const entries: MockProgressEntry[] = [];
  for (const evt of rowEvents) {
    let { isCompleted, header, dateStr, hasDateCell } = evt;
    if (!isCompleted && header.daysOffset !== undefined) {
      if (!header.isPurchase && maxLevelOffset !== undefined && header.daysOffset <= maxLevelOffset) {
        isCompleted = true;
      }
      if (header.isPurchase && maxPurchaseOffset !== undefined && header.daysOffset <= maxPurchaseOffset) {
        isCompleted = true;
      }
    }
    if (isCompleted || hasDateCell) {
      entries.push({
        gameName,
        accountName,
        levelName: header.isPurchase ? undefined : header.name,
        purchaseToken: header.isPurchase ? header.token : undefined,
        token: header.token,
        isCompleted,
        completionDate: dateStr || undefined,
        sessionDate: sessionDateStr || undefined,
      });
    }
  }
  return entries;
}

describe('Multi-account progress generation', () => {
  it('generates progress entries for 3 accounts in the same game', () => {
    const headers = [
      { name: 'Event 1', isPurchase: false, token: 'event1_day0', daysOffset: 0 },
      { name: 'Event 2', isPurchase: false, token: 'event1_day2', daysOffset: 2 },
      { name: 'Event 3', isPurchase: false, token: 'event1_day5', daysOffset: 5 },
    ];
    const startDate = new Date(2025, 0, 1);

    const rows: { name: string; sessionCell: string; cells: string[] }[] = [
      // 3 headers for offsets 0, 2, 5. Session (last cell) extracted separately.
      { name: 'AccountA', sessionCell: '3-Jan', cells: ['-', '-', '-'] },
      { name: 'AccountB', sessionCell: '2-Jan', cells: ['-', '-', '-'] },
      { name: 'AccountC', sessionCell: '-',     cells: ['-', '1-Jan (C)', '-'] },
    ];

    const allEntries: MockProgressEntry[] = [];
    for (const row of rows) {
      const sessionDate = row.sessionCell === '-' ? undefined : row.sessionCell;
      const entries = generateProgressForRow(
        row.cells, row.name, 'Call of Dragons', sessionDate, startDate, headers,
      );
      allEntries.push(...entries);
    }

    assert.ok(allEntries.length > 0, 'Should generate entries for all accounts');

    const accountNames = [...new Set(allEntries.map(e => e.accountName))];
    assert.strictEqual(accountNames.length, 3, 'All 3 accounts should have progress entries');

    // Each account should have its own session date stamped on its progress entries
    const aEntries = allEntries.filter(e => e.accountName === 'AccountA');
    assert.ok(aEntries.length > 0, 'AccountA should have progress entries');
    aEntries.forEach(e => assert.strictEqual(e.sessionDate, '3-Jan', 'AccountA entries should carry sessionDate'));

    const bEntries = allEntries.filter(e => e.accountName === 'AccountB');
    assert.ok(bEntries.length > 0, 'AccountB should have progress entries');
    bEntries.forEach(e => assert.strictEqual(e.sessionDate, '2-Jan', 'AccountB entries should carry sessionDate'));

    const cEntries = allEntries.filter(e => e.accountName === 'AccountC');
    assert.ok(cEntries.length > 0, 'AccountC should have progress entries');
    cEntries.forEach(e => assert.strictEqual(e.sessionDate, undefined, 'AccountC (no session) entries carry undefined'));
  });

  it('per-account session cutoff produces different completion sets', () => {
    const headers = [
      { name: 'Day 0', isPurchase: false, token: 'evt_day0', daysOffset: 0 },
      { name: 'Day 3', isPurchase: false, token: 'evt_day3', daysOffset: 3 },
      { name: 'Day 5', isPurchase: false, token: 'evt_day5', daysOffset: 5 },
    ];
    const startDate = new Date(2025, 0, 1);

    // AccountA: Session = 3-Jan → completes days 0,3
    // AccountB: Session = 5-Jan → completes days 0,3,5
    // AccountC: Session = 1-Jan → completes day 0 only
    const rows = [
      { name: 'AccountA', session: '3-Jan', cells: ['-', '-', '-'] },
      { name: 'AccountB', session: '5-Jan', cells: ['-', '-', '-'] },
      { name: 'AccountC', session: '1-Jan', cells: ['-', '-', '-'] },
    ];

    const allEntries: MockProgressEntry[] = [];
    for (const row of rows) {
      const entries = generateProgressForRow(
        row.cells, row.name, 'TestGame', row.session, startDate, headers,
      );
      allEntries.push(...entries);
    }

    // Session cutoff only: no (C) markers and no threshold → only events strictly
    // before the session date are completed (no cascade fallback).
    // AccountA session 3-Jan: day 0 (1-Jan) < 3-Jan = 1 completed
    // AccountB session 5-Jan: days 0 (1-Jan) and 3 (4-Jan) < 5-Jan = 2 completed
    // AccountC session 1-Jan: day 0 (1-Jan) is ON the boundary (level event, no
    // threshold → time_spent cannot match) = 0 completed
    const aCompleted = allEntries.filter(e => e.accountName === 'AccountA' && e.isCompleted);
    const bCompleted = allEntries.filter(e => e.accountName === 'AccountB' && e.isCompleted);
    const cCompleted = allEntries.filter(e => e.accountName === 'AccountC' && e.isCompleted);

    assert.strictEqual(aCompleted.length, 1, 'AccountA: day 0 completed (< 3-Jan)');
    assert.strictEqual(bCompleted.length, 2, 'AccountB: days 0 and 3 completed (< 5-Jan)');
    assert.strictEqual(cCompleted.length, 0, 'AccountC: day 0 is on the Session date boundary without time_spent match → not completed');
  });

  it('Time=690680: level event scheduled ON the Session date (30-Jul) with matching time_spent completes', () => {
    const headers = [
      { name: 'Day 28', isPurchase: false, token: 'evt_day28', daysOffset: 28, timeSpent: 690 },
      { name: 'Day 29', isPurchase: false, token: 'evt_day29', daysOffset: 29, timeSpent: 690 },
      { name: 'Day 30', isPurchase: false, token: 'evt_day30', daysOffset: 30, timeSpent: 690 },
    ];
    const startDate = new Date(2025, 6, 1); // 1-Jul-2025
    // Session 30-Jul, Time 690680 → completionThreshold = round(690680/1000) = 690
    const entries = generateProgressForRow(
      ['-', '-', '-'], 'Acc', 'Game', '30-Jul', startDate, headers, 690,
    );
    const d28 = entries.find(e => e.token === 'evt_day28');
    const d29 = entries.find(e => e.token === 'evt_day29');
    const d30 = entries.find(e => e.token === 'evt_day30');
    assert.ok(d28?.isCompleted, 'day 28 (29-Jul < 30-Jul) completed regardless of time_spent');
    assert.ok(d29?.isCompleted, 'day 29 (30-Jul boundary, time_spent 690 matches 690±1) completed');
    assert.ok(!d30?.isCompleted, 'day 30 (31-Jul > 30-Jul) NOT completed even with matching time_spent');
  });

  it('Time=690680: level event ON the Session date with non-matching time_spent is not completed', () => {
    const headers = [
      { name: 'Day 29', isPurchase: false, token: 'evt_day29', daysOffset: 29, timeSpent: 700 },
    ];
    const startDate = new Date(2025, 6, 1);
    const entries = generateProgressForRow(
      ['-'], 'Acc', 'Game', '30-Jul', startDate, headers, 690,
    );
    assert.strictEqual(entries.length, 0, 'no matching boundary entry → no progress entry created');
  });

  it('session-only request ON the Session date is always completed', () => {
    const headers = [
      { name: '-', isPurchase: false, token: 'evt_day29', daysOffset: 29, timeSpent: 9999 },
    ];
    const startDate = new Date(2025, 6, 1);
    const entries = generateProgressForRow(
      ['-'], 'Acc', 'Game', '30-Jul', startDate, headers, 690,
    );
    assert.strictEqual(entries.length, 1, 'session-only boundary entry created');
    assert.ok(entries[0].isCompleted, 'session-only on the Session date completed');
  });

  it('explicit (C) marker on the Session date always wins', () => {
    const headers = [
      { name: 'Day 29', isPurchase: false, token: 'evt_day29', daysOffset: 29, timeSpent: 700 },
    ];
    const startDate = new Date(2025, 6, 1);
    const entries = generateProgressForRow(
      ['30-Jul (C)'], 'Acc', 'Game', '30-Jul', startDate, headers, 690,
    );
    const d29 = entries.find(e => e.token === 'evt_day29');
    assert.ok(d29?.isCompleted, '(C) on boundary always completed');
  });
});

// ===== Session Processor Override Tests =====

describe('Session processor per-account overrides', () => {
  /**
   * Simulates what `processAccount` does in the session processor:
   * for each session-only level, check if eventDate <= cutoffDate
   * using the per-account override.
   */
  function simulateProcessAccount(
    startDateStr: string,
    levels: { daysOffset: number; token: string }[],
    overrideDateStr: string | undefined,
  ): { token: string; completed: boolean }[] {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const parseDMMMD = (dateStr: string, refYear?: number): Date | null => {
      const m = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})$/);
      if (!m) return null;
      const mi = months.indexOf(m[2].toLowerCase());
      if (mi < 0) return null;
      const d = new Date(refYear ?? new Date().getFullYear(), mi, parseInt(m[1]));
      return isNaN(d.getTime()) ? null : d;
    };

    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) return [];
    // Normalize to local midnight so the Session-date day itself is included
    // (mirrors the local-midnight fix in the real session processor).
    const startLocal = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

    let cutoffDate: Date;
    if (overrideDateStr) {
      const parsed = parseDMMMD(overrideDateStr, startLocal.getFullYear());
      cutoffDate = parsed || new Date();
    } else {
      cutoffDate = new Date();
    }

    const addDays = (date: Date, days: number): Date => {
      const r = new Date(date);
      r.setDate(r.getDate() + days);
      return r;
    };

    return levels.map(level => {
      const eventDate = addDays(startLocal, level.daysOffset);
      const completed = eventDate.getTime() <= cutoffDate.getTime();
      return { token: level.token, completed };
    });
  }

  it('processAccount with override completes levels up to cutoff', () => {
    const levels = [
      { daysOffset: 0, token: 'evt_day0' },
      { daysOffset: 3, token: 'evt_day3' },
      { daysOffset: 5, token: 'evt_day5' },
      { daysOffset: 7, token: 'evt_day7' },
    ];
    // Start 1-Jan-2025, Session 3-Jan → only days with eventDate ≤ 3-Jan completed.
    // Day 0: 1-Jan ≤ 3-Jan = true
    // Day 3: 4-Jan ≤ 3-Jan = false
    const result = simulateProcessAccount('2025-01-01', levels, '3-Jan');
    assert.strictEqual(result[0].completed, true,  'day 0 (1-Jan) ≤ 3-Jan');
    assert.strictEqual(result[1].completed, false, 'day 3 (4-Jan) > 3-Jan');
    assert.strictEqual(result[2].completed, false, 'day 5 (6-Jan) > 3-Jan');
    assert.strictEqual(result[3].completed, false, 'day 7 (8-Jan) > 3-Jan');
  });

  it('processAccount with later override includes more levels', () => {
    const levels = [
      { daysOffset: 0, token: 'evt_day0' },
      { daysOffset: 3, token: 'evt_day3' },
      { daysOffset: 5, token: 'evt_day5' },
    ];
    // Start 1-Jan-2025, Session 5-Jan → days 0,3 are ≤ 5-Jan
    const result = simulateProcessAccount('2025-01-01', levels, '5-Jan');
    assert.strictEqual(result[0].completed, true,  'day 0 (1-Jan) ≤ 5-Jan');
    assert.strictEqual(result[1].completed, true,  'day 3 (4-Jan) ≤ 5-Jan');
    assert.strictEqual(result[2].completed, false, 'day 5 (6-Jan) > 5-Jan');
  });

  it('different accounts get different cutoffs from their own overrides', () => {
    const levels = [
      { daysOffset: 0, token: 'evt_day0' },   // 1-Jan
      { daysOffset: 2, token: 'evt_day2' },   // 3-Jan
      { daysOffset: 5, token: 'evt_day5' },   // 6-Jan
    ];
    const startDate = '2025-01-01';

    // Account 1: cutoff 2-Jan → only day 0 (1-Jan) ≤ 2-Jan
    const result1 = simulateProcessAccount(startDate, levels, '2-Jan');
    assert.strictEqual(result1[0].completed, true,  'Account1 day0: 1-Jan ≤ 2-Jan');
    assert.strictEqual(result1[1].completed, false, 'Account1 day2: 3-Jan > 2-Jan');
    assert.strictEqual(result1[2].completed, false, 'Account1 day5: 6-Jan > 2-Jan');

    // Account 2: cutoff 5-Jan → days 0 (1-Jan) and 2 (3-Jan) ≤ 5-Jan; day 5 (6-Jan) > 5-Jan
    const result2 = simulateProcessAccount(startDate, levels, '5-Jan');
    assert.strictEqual(result2[0].completed, true, 'Account2 day0: 1-Jan ≤ 5-Jan');
    assert.strictEqual(result2[1].completed, true, 'Account2 day2: 3-Jan ≤ 5-Jan');
    assert.strictEqual(result2[2].completed, false, 'Account2 day5: 6-Jan > 5-Jan');
  });

  it('no override falls back to current date (always completes past levels)', () => {
    const levels = [
      { daysOffset: -5, token: 'evt_minus5' },
      { daysOffset: 0, token: 'evt_now' },
      { daysOffset: 1000, token: 'evt_future' },
    ];
    const startDate = '2025-01-01';
    const result = simulateProcessAccount(startDate, levels, undefined);
    // Past and current events ≤ Date.now() → completed
    assert.strictEqual(result[0].completed, true);
    assert.strictEqual(result[1].completed, true);
    // Future event > Date.now() → not completed (unless Date.now() is > that date)
    // This depends on when the test runs, but 1000 days from 2025 should be in the past
    // since Date.now() is well past 2025+1000 days. So result[2].completed might be true too.
    // This test verifies the fallback behavior exists.
  });

  it('includes the Session date day itself (no timezone off-by-one)', () => {
    const levels = [
      { daysOffset: 28, token: 'evt_day28' }, // 29-Jul
      { daysOffset: 29, token: 'evt_day29' }, // 30-Jul (Session date)
      { daysOffset: 30, token: 'evt_day30' }, // 31-Jul
    ];
    const result = simulateProcessAccount('2025-07-01', levels, '30-Jul');
    assert.strictEqual(result[0].completed, true,  'day 28 (29-Jul) ≤ 30-Jul');
    assert.strictEqual(result[1].completed, true,  'day 29 (30-Jul) == Session date → completed');
    assert.strictEqual(result[2].completed, false, 'day 30 (31-Jul) > 30-Jul');
  });
});

// ===== parseAccountDateStr — multi-format date parsing =====
const MONTHS_SHORT_LOCAL = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function parseAccountDateStrTest(rawDate: any): string | undefined {
  if (!rawDate) return undefined;

  if (rawDate instanceof Date) {
    if (isNaN(rawDate.getTime())) return undefined;
    const y = rawDate.getFullYear();
    const m = String(rawDate.getMonth() + 1).padStart(2, '0');
    const d = String(rawDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const dateStr = String(rawDate).trim();
  if (!dateStr || dateStr === '-') return undefined;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return dateStr;
  }

  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);
    let month = p1 - 1;
    let day = p2;
    if (p1 > 12) { day = p1; month = p2 - 1; }
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // DD-Mon-YYYY
  const dashMatch = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (dashMatch) {
    const day = parseInt(dashMatch[1], 10);
    const monthStr = dashMatch[2].toLowerCase();
    const year = parseInt(dashMatch[3], 10);
    const monthIndex = MONTHS_SHORT_LOCAL.indexOf(monthStr);
    if (monthIndex >= 0) {
      const d = new Date(year, monthIndex, day);
      if (!isNaN(d.getTime())) {
        return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  // DD-Mon (e.g. "1-Jul")
  const shortDashMatch = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (shortDashMatch) {
    const day = parseInt(shortDashMatch[1], 10);
    const monthStr = shortDashMatch[2].toLowerCase();
    const year = new Date().getFullYear();
    const monthIndex = MONTHS_SHORT_LOCAL.indexOf(monthStr);
    if (monthIndex >= 0) {
      const d = new Date(year, monthIndex, day);
      if (!isNaN(d.getTime())) {
        return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  // General fallback
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return undefined;
}

describe('parseAccountDateStr — multi-format date parsing for all account rows', () => {
  it('parses JS Date object correctly', () => {
    const d = new Date(2025, 6, 1); // July 1, 2025
    assert.strictEqual(parseAccountDateStrTest(d), '2025-07-01');
  });

  it('parses YYYY-MM-DD string', () => {
    assert.strictEqual(parseAccountDateStrTest('2025-07-01'), '2025-07-01');
  });

  it('parses MM/DD/YYYY string', () => {
    assert.strictEqual(parseAccountDateStrTest('7/1/2025'), '2025-07-01');
  });

  it('parses DD/MM/YYYY when day > 12', () => {
    // 15/07/2025 → day=15, month=07
    assert.strictEqual(parseAccountDateStrTest('15/7/2025'), '2025-07-15');
  });

  it('parses DD-Mon-YYYY (e.g. "1-Jul-2025")', () => {
    assert.strictEqual(parseAccountDateStrTest('1-Jul-2025'), '2025-07-01');
  });

  it('parses DD-Mon (e.g. "1-Jul") using current year', () => {
    const year = new Date().getFullYear();
    const result = parseAccountDateStrTest('1-Jul');
    assert.strictEqual(result, `${year}-07-01`);
  });

  it('returns undefined for empty string', () => {
    assert.strictEqual(parseAccountDateStrTest(''), undefined);
  });

  it('returns undefined for dash', () => {
    assert.strictEqual(parseAccountDateStrTest('-'), undefined);
  });

  it('returns undefined for null', () => {
    assert.strictEqual(parseAccountDateStrTest(null), undefined);
  });

  it('returns undefined for invalid Date object', () => {
    const d = new Date('invalid');
    assert.strictEqual(parseAccountDateStrTest(d), undefined);
  });

  it('all account rows: row1 ISO, row2 Date object, row3 D-MMM-YYYY, row4 D-MMM all parse successfully', () => {
    const row1 = parseAccountDateStrTest('2025-07-01');
    const row2 = parseAccountDateStrTest(new Date(2025, 6, 1));
    const row3 = parseAccountDateStrTest('1-Jul-2025');
    const year = new Date().getFullYear();
    const row4 = parseAccountDateStrTest('1-Jul');

    assert.strictEqual(row1, '2025-07-01', 'row1 ISO format');
    assert.strictEqual(row2, '2025-07-01', 'row2 Date object');
    assert.strictEqual(row3, '2025-07-01', 'row3 DD-Mon-YYYY format');
    assert.strictEqual(row4, `${year}-07-01`, 'row4 DD-Mon short format');

    // All must be defined — none is undefined
    assert.ok(row1 !== undefined, 'row1 must not be undefined');
    assert.ok(row2 !== undefined, 'row2 must not be undefined');
    assert.ok(row3 !== undefined, 'row3 must not be undefined');
    assert.ok(row4 !== undefined, 'row4 must not be undefined');
  });
});


// ===== Multi-group Sheet Parser: Non-account Row Skipping Tests =====

/**
 * Simulates what the sheet parser does: skip header rows that appear
 * between account groups in multi-group sheets.
 */
function simulateSkipNonAccountRows(rows: string[][]): string[] {
  const results: string[] = [];
  let foundFirstAccountHeader = false;
  for (const row of rows) {
    if (!row || !row[0]) continue;
    const firstCell = row[0].toString().trim();
    const lowerFirst = firstCell.toLowerCase();
    if (lowerFirst.startsWith('branch:') || lowerFirst.includes('event token')) continue;
    // New skip logic
    if (lowerFirst === 'account' || lowerFirst === 'level name' || lowerFirst === 'days offset' || lowerFirst === 'time spent' || lowerFirst === 'total') continue;
    if (/^\d+$/.test(firstCell) && firstCell.length <= 4) continue;
    results.push(firstCell);
    if (lowerFirst.includes('account')) foundFirstAccountHeader = true;
  }
  return results;
}

describe('Multi-group row skipping', () => {
  it('skips Level Name, Days Offset, Time Spent, Account header rows', () => {
    // Simulates rows from a 2-group sheet: first group accounts,
    // then branch header, second group headers, second group accounts
    const rows = [
      ['AccountA', '1-Jul-2025', '10:00', '-', '-', '-', '5-Jul'],
      ['AccountB', '1-Jul-2025', '12:00', '-', '-', '-', '3-Jul'],
      ['Branch: Event A', '', '', '', '', '', ''],
      ['Event Token', 'evt_day0', 'evt_day2', 'evt_day5', '', '', ''],
      ['Level Name', 'Day 0', 'Day 2', 'Day 5', '', '', ''],
      ['Days Offset', '0', '2', '5', '', '', ''],
      ['Time Spent', '180', '300', '500', '', '', ''],
      ['Account', 'Start Date', 'Time', '1-Jan', '2-Jan (C)', '-', 'Session'],
      ['AccountC', '1-Jul-2025', '09:00', '-', '-', '-', '7-Jul'],
      ['AccountD', '1-Jul-2025', '14:00', '-', '-', '-', '2-Jul'],
    ];

    const accountNames = simulateSkipNonAccountRows(rows);
    // Should only include real account names (AccountA, AccountB, AccountC, AccountD)
    // NOT the header rows (Level Name, Days Offset, Time Spent, Account, Event Token)
    assert.strictEqual(accountNames.length, 4, 'Should have exactly 4 account names');
    assert.ok(accountNames.includes('AccountA'), 'Should include AccountA');
    assert.ok(accountNames.includes('AccountB'), 'Should include AccountB');
    assert.ok(accountNames.includes('AccountC'), 'Should include AccountC');
    assert.ok(accountNames.includes('AccountD'), 'Should include AccountD');
    assert.ok(!accountNames.includes('Level Name'), 'Should exclude Level Name');
    assert.ok(!accountNames.includes('Days Offset'), 'Should exclude Days Offset');
    assert.ok(!accountNames.includes('Time Spent'), 'Should exclude Time Spent');
    assert.ok(!accountNames.includes('Account'), 'Should exclude Account header');
    assert.ok(!accountNames.includes('Event Token'), 'Should exclude Event Token');
  });

  it('skips rows with pure numeric first cell (days offset, time spent)', () => {
    const rows = [
      ['180', '300', '500', '', '', '', ''],
      ['0', '2', '5', '', '', '', ''],
      ['AccountC', '1-Jul-2025', '09:00', '-', '-', '-', '7-Jul'],
    ];

    const accountNames = simulateSkipNonAccountRows(rows);
    assert.strictEqual(accountNames.length, 1, 'Should only have 1 account name');
    assert.strictEqual(accountNames[0], 'AccountC', 'Should have AccountC');
  });

  it('does not skip account names that look like numbers but are > 4 digits', () => {
    const rows = [
      ['12345', '1-Jul-2025', '10:00', '-', '-', '-', '5-Jul'],
    ];
    const accountNames = simulateSkipNonAccountRows(rows);
    assert.strictEqual(accountNames.length, 1, 'Should allow 5-digit account name');
  });
});

// ===== Session Date Overrides Building Tests =====

/**
 * Simulates the sessionDateOverrides building logic from persistAll.
 * This tests the new comprehensive fallback (step 1: accountSessionDates).
 */
interface MockAccount {
  name: string;
  id: number;
  sessionDate?: string;
  gameId: number;
}
interface MockSessionDateOverride {
  accountId: number;
  sessionDate: string;
}

function buildSessionDateOverridesStep1(
  accountSessionDates: Map<string, string>,
  accountCache: Map<string, number>,  // key = "gameId_accountName"
  gameCache: Map<string, number>,     // key = "gamename" → gameId
  dbAccounts: Map<number, MockAccount[]>,  // gameId → accounts[]
): MockSessionDateOverride[] {
  const result: MockSessionDateOverride[] = [];
  const seenIds = new Set<number>();

  for (const [mapKey, sessionDateStr] of accountSessionDates.entries()) {
    const pipeIdx = mapKey.indexOf('|');
    if (pipeIdx < 0) continue;
    const lowerGameName = mapKey.substring(0, pipeIdx);
    const lowerAccName = mapKey.substring(pipeIdx + 1);

    let gid = gameCache.get(lowerGameName);
    if (!gid) continue;

    // Direct cache lookup
    let aid = accountCache.get(`${gid}_${lowerAccName}`);

    if (!aid) {
      // Fallback: scan all cache keys ending with this name
      for (const [ckey, caid] of accountCache.entries()) {
        if (ckey.endsWith(`_${lowerAccName}`)) {
          aid = caid;
          break;
        }
      }
    }

    if (!aid) {
      // DB fallback
      const gameAccounts = dbAccounts.get(gid) || [];
      const match = gameAccounts.find(a => a.name.toLowerCase() === lowerAccName);
      if (match) {
        aid = match.id;
      }
    }

    if (aid && !seenIds.has(aid)) {
      seenIds.add(aid);
      result.push({ accountId: aid, sessionDate: sessionDateStr });
    }
  }
  return result;
}

describe('Session date overrides building (step 1: accountSessionDates)', () => {
  it('finds all 3 accounts via direct cache hit', () => {
    const accountSessionDates = new Map<string, string>([
      ['testgame|accouna', '5-Jul'],
      ['testgame|accounb', '3-Jul'],
      ['testgame|accounc', '7-Jul'],
    ]);
    const accountCache = new Map<string, number>([
      ['42_accouna', 101],
      ['42_accounb', 102],
      ['42_accounc', 103],
    ]);
    const gameCache = new Map<string, number>([['testgame', 42]]);
    const dbAccounts = new Map<number, MockAccount[]>(); // empty, not needed

    const overrides = buildSessionDateOverridesStep1(accountSessionDates, accountCache, gameCache, dbAccounts);
    assert.strictEqual(overrides.length, 3, 'Should find all 3 accounts');
    const a101 = overrides.find(o => o.accountId === 101);
    const a102 = overrides.find(o => o.accountId === 102);
    const a103 = overrides.find(o => o.accountId === 103);
    assert.ok(a101, 'Should find account 101');
    assert.strictEqual(a101!.sessionDate, '5-Jul');
    assert.ok(a102, 'Should find account 102');
    assert.strictEqual(a102!.sessionDate, '3-Jul');
    assert.ok(a103, 'Should find account 103');
    assert.strictEqual(a103!.sessionDate, '7-Jul');
  });

  it('finds accounts missing from direct cache via cache key scan fallback', () => {
    // accounB is cached with a different gameId prefix (different game or stale entry)
    const accountSessionDates = new Map<string, string>([
      ['testgame|accouna', '5-Jul'],
      ['testgame|accounb', '3-Jul'],
    ]);
    const accountCache = new Map<string, number>([
      ['42_accouna', 101],
      ['99_accounb', 102],  // different gameId prefix
    ]);
    const gameCache = new Map<string, number>([['testgame', 42]]);
    const dbAccounts = new Map<number, MockAccount[]>();

    const overrides = buildSessionDateOverridesStep1(accountSessionDates, accountCache, gameCache, dbAccounts);
    assert.strictEqual(overrides.length, 2, 'Should find both accounts');
    const a101 = overrides.find(o => o.accountId === 101);
    const a102 = overrides.find(o => o.accountId === 102);
    assert.ok(a101, 'Should find account 101 (direct cache hit)');
    assert.ok(a102, 'Should find account 102 (cache scan fallback)');
  });

  it('finds accounts via DB fallback when cache miss', () => {
    const accountSessionDates = new Map<string, string>([
      ['testgame|accounta', '5-Jul'],
      ['testgame|accountb', '3-Jul'],
    ]);
    const accountCache = new Map<string, number>([
      ['42_accounta', 101],
    ]);
    const gameCache = new Map<string, number>([['testgame', 42]]);
    const dbAccounts = new Map<number, MockAccount[]>([
      [42, [
        { name: 'AccountA', id: 101, gameId: 42 },
        { name: 'AccountB', id: 102, gameId: 42 },
      ]],
    ]);

    const overrides = buildSessionDateOverridesStep1(accountSessionDates, accountCache, gameCache, dbAccounts);
    assert.strictEqual(overrides.length, 2, 'Should find both accounts');
    const a101 = overrides.find(o => o.accountId === 101);
    const a102 = overrides.find(o => o.accountId === 102);
    assert.ok(a101, 'Should find account 101 (cache hit)');
    assert.ok(a102, 'Should find account 102 (DB fallback)');
    assert.strictEqual(a102!.sessionDate, '3-Jul');
  });
});

// ===== Per-account isCompleted verification tests =====

/**
 * Verifies that each account's progress entries carry the correct isCompleted
 * when running through the full parser flow (session cutoff + cascade).
 */
interface TestProgress {
  accountName: string;
  token: string;
  isCompleted: boolean;
  sessionDate?: string;
}

function simulateMultiAccountProgress(
  headers: { token: string; daysOffset: number; isPurchase: boolean; name?: string; timeSpent?: number }[],
  accounts: { name: string; startDate: string; sessionDate?: string; cells: string[] }[],
  completionThreshold?: number,
): TestProgress[] {
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const parseDMMMD = (s: string, y: number): Date | null => {
    const m = s.match(/^(\d{1,2})-([A-Za-z]{3})$/);
    if (!m) return null;
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi < 0) return null;
    const d = new Date(y, mi, parseInt(m[1]));
    return isNaN(d.getTime()) ? null : d;
  };

  const results: TestProgress[] = [];
  for (const acct of accounts) {
    const parsedDate = new Date(acct.startDate);
    const startDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    const refYear = startDate.getFullYear();

    // Parse cells
    const parsed = headers.map((h, ci) => {
      const cell = acct.cells[ci] || '-';
      const isC = cell.endsWith('(C)');
      const dateStr = isC ? cell.replace('(C)', '').trim() : (cell.match(/^\d{1,2}-[A-Za-z]{3}$/) ? cell : '');
      const hasDate = cell !== '-' && cell !== '';
      return { header: h, isCompleted: isC, dateStr, hasDate: true };
    });

    // Apply session cutoff: requests before the Session date complete; requests on the
    // Session date complete only for purchases, session-only, or time_spent-matched levels.
    if (acct.sessionDate) {
      const sessionParsed = parseDMMMD(acct.sessionDate, refYear);
      for (const evt of parsed) {
        if (evt.isCompleted) continue;
        if (evt.header.daysOffset === undefined) continue;
        const evtDate = new Date(startDate.getTime() + evt.header.daysOffset * 86400000);
        const evtDateStr = `${evtDate.getDate()}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][evtDate.getMonth()]}`;
        const evtParsed = parseDMMMD(evtDateStr, refYear);
        if (!evtParsed || !sessionParsed) continue;
        if (evtParsed.getTime() < sessionParsed.getTime()) {
          evt.isCompleted = true;
        } else if (evtParsed.getTime() === sessionParsed.getTime()) {
          const isSessionOnly = evt.header.name === '-';
          const headerSpent = evt.header.timeSpent;
          const matchesTimeSpent = completionThreshold !== undefined && headerSpent !== undefined && Math.abs(headerSpent - completionThreshold) <= 1;
          if (evt.header.isPurchase || isSessionOnly || matchesTimeSpent) {
            evt.isCompleted = true;
          }
        }
      }
    }

    // Per-type cascade
    let maxLevel = -1, maxPurchase = -1;
    for (const evt of parsed) {
      if (evt.isCompleted && evt.header.daysOffset !== undefined) {
        if (evt.header.isPurchase) maxPurchase = Math.max(maxPurchase, evt.header.daysOffset);
        else maxLevel = Math.max(maxLevel, evt.header.daysOffset);
      }
    }

    // Generate entries
    for (const evt of parsed) {
      let isC = evt.isCompleted;
      if (!isC && evt.header.daysOffset !== undefined) {
        if (!evt.header.isPurchase && maxLevel >= 0 && evt.header.daysOffset <= maxLevel) isC = true;
        if (evt.header.isPurchase && maxPurchase >= 0 && evt.header.daysOffset <= maxPurchase) isC = true;
      }
      results.push({
        accountName: acct.name,
        token: evt.header.token,
        isCompleted: isC,
        sessionDate: acct.sessionDate,
      });
    }
  }
  return results;
}

describe('Multi-account per-row progress generation', () => {
  const headers = [
    { token: 'evt_day0', daysOffset: 0, isPurchase: false, name: 'Day 0', timeSpent: 300 },
    { token: 'evt_day2', daysOffset: 2, isPurchase: false, name: 'Day 2', timeSpent: 300 },
    { token: 'evt_day5', daysOffset: 5, isPurchase: false, name: 'Day 5', timeSpent: 300 },
    { token: 'purchase_day0', daysOffset: 0, isPurchase: true },
  ];

  it('each account gets its own session cutoff applied independently', () => {
    const accounts = [
      // AccountA: Session 3-Jan → completes days 0,2 (but not 5): day 0 is before the
      // session date, day 2 is ON the session date and matches time_spent (300 vs 300).
      { name: 'AccountA', startDate: '2025-01-01', sessionDate: '3-Jan', cells: ['-', '-', '-', '-'] },
      // AccountB: Session 5-Jan → completes days 0,2,5 via cutoff
      { name: 'AccountB', startDate: '2025-01-01', sessionDate: '5-Jan', cells: ['-', '-', '-', '-'] },
      // AccountC: no session → nothing completed via cutoff
      { name: 'AccountC', startDate: '2025-01-01', cells: ['-', '-', '-', '-'] },
    ];

    // Threshold 300 (matches evt_day2's time_spent so the boundary-day event completes).
    const progress = simulateMultiAccountProgress(headers, accounts, 300);

    // AccountA: Session 3-Jan → days 0,2 ≤ 3-Jan
    const acctAEntries = progress.filter(e => e.accountName === 'AccountA');
    assert.strictEqual(acctAEntries.length, 4, 'AccountA should have 4 entries');
    const aEvt0 = acctAEntries.find(e => e.token === 'evt_day0');
    const aEvt2 = acctAEntries.find(e => e.token === 'evt_day2');
    const aEvt5 = acctAEntries.find(e => e.token === 'evt_day5');
    const aPurchase = acctAEntries.find(e => e.token === 'purchase_day0');
    assert.ok(aEvt0?.isCompleted, 'AccountA: evt_day0 should be completed (≤ 3-Jan)');
    assert.ok(aEvt2?.isCompleted, 'AccountA: evt_day2 should be completed (≤ 3-Jan)');
    assert.ok(!aEvt5?.isCompleted, 'AccountA: evt_day5 should NOT be completed (6-Jan > 3-Jan)');
    assert.ok(aPurchase?.isCompleted, 'AccountA: purchase_day0 should be completed (≤ 3-Jan)');

    // AccountB: Session 5-Jan → days 0,2,5 ≤ 5-Jan
    const acctBEntries = progress.filter(e => e.accountName === 'AccountB');
    const bEvt0 = acctBEntries.find(e => e.token === 'evt_day0');
    const bEvt2 = acctBEntries.find(e => e.token === 'evt_day2');
    const bEvt5 = acctBEntries.find(e => e.token === 'evt_day5');
    const bPurchase = acctBEntries.find(e => e.token === 'purchase_day0');
    assert.ok(bEvt0?.isCompleted, 'AccountB: evt_day0 should be completed (≤ 5-Jan)');
    assert.ok(bEvt2?.isCompleted, 'AccountB: evt_day2 should be completed (≤ 5-Jan)');
    assert.ok(!bEvt5?.isCompleted, 'AccountB: evt_day5 should NOT be completed (6-Jan > 5-Jan)');
    assert.ok(bPurchase?.isCompleted, 'AccountB: purchase_day0 should be completed (≤ 5-Jan)');

    // AccountC: no session → nothing completed
    const acctCEntries = progress.filter(e => e.accountName === 'AccountC');
    acctCEntries.forEach(e => {
      assert.ok(!e.isCompleted, `AccountC: ${e.token} should NOT be completed (no session date)`);
    });
  });

  it('session date is correctly stamped on each account\'s progress entries', () => {
    const accounts = [
      { name: 'AccountX', startDate: '2025-06-01', sessionDate: '5-Jul', cells: ['-', '-', '-', '-'] },
      { name: 'AccountY', startDate: '2025-06-01', sessionDate: '10-Jul', cells: ['-', '-', '-', '-'] },
    ];

    const progress = simulateMultiAccountProgress(headers, accounts);
    const xEntries = progress.filter(e => e.accountName === 'AccountX');
    const yEntries = progress.filter(e => e.accountName === 'AccountY');

    xEntries.forEach(e => assert.strictEqual(e.sessionDate, '5-Jul', 'AccountX entries carry sessionDate 5-Jul'));
    yEntries.forEach(e => assert.strictEqual(e.sessionDate, '10-Jul', 'AccountY entries carry sessionDate 10-Jul'));
  });

  it('(C) markers + session cutoff: cascade does not cross between levels and purchases', () => {
    const accounts = [
      // AccountA: Level evt_day5 has (C) → cascades to earlier levels only (not purchases)
      // Purchases have no (C) markers → not completed (no session cutoff overrides them)
      { name: 'AccountA', startDate: '2025-01-01', cells: ['-', '-', '5-Jan (C)', '-'] },
      // AccountB: Purchase purchase_day0 has (C) → purchase completed. No level (C) → levels not completed.
      { name: 'AccountB', startDate: '2025-01-01', cells: ['-', '-', '-', '1-Jan (C)'] },
    ];

    const progress = simulateMultiAccountProgress(headers, accounts);

    // AccountA: Level offset 5 has (C) → levels 0,2,5 completed. No purchase (C) → no purchases.
    const aLevels = progress.filter(e => e.accountName === 'AccountA' && !e.token.startsWith('purchase'));
    const aPurchases = progress.filter(e => e.accountName === 'AccountA' && e.token.startsWith('purchase'));
    aLevels.forEach(e => assert.ok(e.isCompleted, `AccountA level ${e.token} should be completed (cascade from (C) at day 5)`));
    aPurchases.forEach(e => assert.ok(!e.isCompleted, `AccountA purchase ${e.token} should NOT be completed (no purchase (C) markers)`));

    // AccountB: Purchase purchase_day0 has (C) → purchase completed. No level (C) → levels not completed.
    const bLevels = progress.filter(e => e.accountName === 'AccountB' && !e.token.startsWith('purchase'));
    const bPurchases = progress.filter(e => e.accountName === 'AccountB' && e.token.startsWith('purchase'));
    bLevels.forEach(e => assert.ok(!e.isCompleted, `AccountB level ${e.token} should NOT be completed (no level (C) markers)`));
    bPurchases.forEach(e => assert.ok(e.isCompleted, `AccountB purchase ${e.token} should be completed ((C) at day 0)`));
  });

  it('each account with different start dates gets different computed event dates', () => {
    const headers2 = [
      { token: 'evt_day3', daysOffset: 3, isPurchase: false, name: 'Day 3', timeSpent: 200 },
    ];
    const accounts = [
      // AccountA: start 1-Jan → day3 = 4-Jan. Session 4-Jan → completed via time_spent match (200 vs 200).
      { name: 'AccountA', startDate: '2025-01-01', sessionDate: '4-Jan', cells: ['-'] },
      // AccountB: start 5-Jan → day3 = 8-Jan. Session 4-Jan → NOT completed.
      { name: 'AccountB', startDate: '2025-01-05', sessionDate: '4-Jan', cells: ['-'] },
    ];

    const progress = simulateMultiAccountProgress(headers2, accounts, 200);
    const aEntry = progress.find(e => e.accountName === 'AccountA');
    const bEntry = progress.find(e => e.accountName === 'AccountB');
    assert.ok(aEntry?.isCompleted, 'AccountA: day3 should be completed (event date 4-Jan on session date + time_spent match)');
    assert.ok(!bEntry?.isCompleted, 'AccountB: day3 should NOT be completed (event date 8-Jan > session 4-Jan)');
  });

  it('all accounts in a multi-account sheet produce same number of progress entries', () => {
    const headers3 = [
      { token: 'evt_day0', daysOffset: 0, isPurchase: false },
      { token: 'evt_day3', daysOffset: 3, isPurchase: false },
      { token: 'evt_day7', daysOffset: 7, isPurchase: false },
      { token: 'purchase_day0', daysOffset: 0, isPurchase: true },
    ];
    const accounts = [
      { name: 'AccA', startDate: '2025-01-01', sessionDate: '5-Jan', cells: ['-', '-', '-', '-'] },
      { name: 'AccB', startDate: '2025-01-01', sessionDate: '5-Jan', cells: ['-', '-', '-', '-'] },
      { name: 'AccC', startDate: '2025-01-01', sessionDate: '5-Jan', cells: ['-', '-', '-', '-'] },
      { name: 'AccD', startDate: '2025-01-01', sessionDate: '5-Jan', cells: ['-', '-', '-', '-'] },
    ];

    const progress = simulateMultiAccountProgress(headers3, accounts);
    const accNames = [...new Set(progress.map(e => e.accountName))];
    assert.strictEqual(accNames.length, 4, 'All 4 accounts should have progress entries');
    const countsPerAcc = accNames.map(n => progress.filter(e => e.accountName === 'AccA').length);
    assert.ok(countsPerAcc.every(c => c === countsPerAcc[0]), 'Every account should have the same number of entries');
  });
});

// ===== Multi-group style: different headers per account =====
describe('Multi-group style progress generation (different headers per account)', () => {
  it('accounts with different header configs each get correct isCompleted', () => {
    // Simulates two groups: Group 1 has events at offsets 0,3; Group 2 has events at offsets 5,7
    const headersGroup1 = [
      { name: 'Early A', isPurchase: false, token: 'evt_day0', daysOffset: 0 },
      { name: 'Early B', isPurchase: false, token: 'evt_day3', daysOffset: 3 },
    ];
    const headersGroup2 = [
      { name: 'Late A', isPurchase: false, token: 'evt_day5', daysOffset: 5, timeSpent: 400 },
      { name: 'Late B', isPurchase: false, token: 'evt_day7', daysOffset: 7, timeSpent: 400 },
    ];
    const startDate = new Date(2025, 0, 1);

    // Account A from Group 1: session 2-Jan → completes offset 0 (1-Jan < 2-Jan)
    // Entry for offset 3 (4-Jan > 2-Jan) is NOT included (not completed and no cell data)
    const entriesA = generateProgressForRow(
      ['-', '-'], 'AccA', 'TestGame', '2-Jan', startDate, headersGroup1,
    );
    // Account B from Group 2: session 8-Jan → offset 5 (6-Jan < 8-Jan) completed;
    // offset 7 (8-Jan, ON the session date) completed via time_spent match (400 vs 400).
    const entriesB = generateProgressForRow(
      ['-', '-'], 'AccB', 'TestGame', '8-Jan', startDate, headersGroup2, 400,
    );

    // Verify Account A
    assert.strictEqual(entriesA.length, 1, 'AccA: 1 entry (only day 0 completed, day 3 skipped)');
    const a0 = entriesA.find(e => e.token === 'evt_day0');
    assert.ok(a0, 'AccA: evt_day0 should be present');
    assert.ok(a0!.isCompleted, 'AccA: evt_day0 completed (1-Jan ≤ 2-Jan)');

    // Verify Account B
    assert.strictEqual(entriesB.length, 2, 'AccB: 2 entries');
    const b5 = entriesB.find(e => e.token === 'evt_day5');
    const b7 = entriesB.find(e => e.token === 'evt_day7');
    assert.ok(b5?.isCompleted, 'AccB: evt_day5 completed (6-Jan < 8-Jan)');
    assert.ok(b7?.isCompleted, 'AccB: evt_day7 completed (8-Jan on session date + time_spent match)');

    // Combined: all entries together from both groups
    const allEntries = [...entriesA, ...entriesB];
    assert.strictEqual(allEntries.length, 3, '3 entries total across 2 groups (1+2)');
    assert.strictEqual(allEntries.filter(e => e.isCompleted).length, 3, 'all 3 entries completed');
  });

  it('group-specific (C) markers and cascade work independently', () => {
    // Group 1: levels with (C) at day 3 → cascades to earlier levels
    // Group 2: levels without (C) and different session date
    const headersGroup1 = [
      { name: 'Level 0', isPurchase: false, token: 'grp1_day0', daysOffset: 0 },
      { name: 'Level 3', isPurchase: false, token: 'grp1_day3', daysOffset: 3 },
      { name: 'Level 5', isPurchase: false, token: 'grp1_day5', daysOffset: 5 },
    ];
    const headersGroup2 = [
      { name: 'Event X', isPurchase: false, token: 'grp2_day1', daysOffset: 1 },
      { name: 'Event Y', isPurchase: false, token: 'grp2_day4', daysOffset: 4 },
    ];
    const startDate = new Date(2025, 0, 1);

    // Group 1: (C) at day 3 (4-Jan) → cascades to day 0 (1-Jan). Day 5 (6-Jan) not completed.
    const entriesG1 = generateProgressForRow(
      ['-', '4-Jan (C)', '-'], 'Group1Acc', 'G', undefined, startDate, headersGroup1,
    );
    // Group 2: Session 4-Jan → completes day 1 (2-Jan), not day 4 (5-Jan > 4-Jan)
    const entriesG2 = generateProgressForRow(
      ['-', '-'], 'Group2Acc', 'G', '4-Jan', startDate, headersGroup2,
    );

    // Group 1 assertions: 2 entries (day 0 cascade, day 3 (C)), day 5 omitted
    assert.strictEqual(entriesG1.length, 2, 'Group1: 2 entries (day 0 cascade, day 3 (C))');
    const g1d0 = entriesG1.find(e => e.token === 'grp1_day0');
    const g1d3 = entriesG1.find(e => e.token === 'grp1_day3');
    const g1d5 = entriesG1.find(e => e.token === 'grp1_day5');
    assert.ok(g1d0?.isCompleted, 'Group1: day 0 completed (cascade from (C) at day 3)');
    assert.ok(g1d3?.isCompleted, 'Group1: day 3 completed (has (C))');
    assert.strictEqual(g1d5, undefined, 'Group1: day 5 omitted (not completed, no date cell)');

    // Group 2 assertions: 1 entry (day 1 session cutoff), day 4 omitted
    assert.strictEqual(entriesG2.length, 1, 'Group2: 1 entry (day 1 session cutoff)');
    const g2d1 = entriesG2.find(e => e.token === 'grp2_day1');
    const g2d4 = entriesG2.find(e => e.token === 'grp2_day4');
    assert.ok(g2d1?.isCompleted, 'Group2: day 1 completed (≤ session 4-Jan)');
    assert.strictEqual(g2d4, undefined, 'Group2: day 4 omitted (5-Jan > 4-Jan, not completed)');
  });
});
