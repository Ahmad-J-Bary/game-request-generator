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
}

function applySessionCutoff(
  events: { daysOffset: number; isCompleted: boolean }[],
  startDateStr: string,
  sessionDateStr: string | undefined,
): { daysOffset: number; isCompleted: boolean }[] {
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

  // Parse session date
  const sm = sessionDateStr.match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (!sm) return events.map(e => ({ ...e }));
  const smi = MONTHS_SHORT.map(m => m.toLowerCase()).indexOf(sm[2].toLowerCase());
  if (smi < 0) return events.map(e => ({ ...e }));
  const sessionDate = new Date(startDate.getFullYear(), smi, parseInt(sm[1]));

  return events.map((e) => {
    if (e.isCompleted) return { ...e };
    const eventDate = new Date(startDate.getTime() + e.daysOffset * 24 * 60 * 60 * 1000);
    if (eventDate.getTime() <= sessionDate.getTime()) {
      return { ...e, isCompleted: true };
    }
    return { ...e };
  });
}

describe('Session date cutoff', () => {
  it('marks events with date <= Session date as completed', () => {
    const events = [
      { daysOffset: 0, isCompleted: false },
      { daysOffset: 2, isCompleted: false },
      { daysOffset: 5, isCompleted: false },
    ];
    // Start date: 1-Jan-2025 → offset 0=1-Jan, offset 2=3-Jan, offset 5=6-Jan
    // Session: 3-Jan → events at offset 0 (1-Jan) and 2 (3-Jan) completed
    const result = applySessionCutoff(events, '1-Jan-2025', '3-Jan');
    assert.strictEqual(result[0].isCompleted, true);
    assert.strictEqual(result[1].isCompleted, true);
    assert.strictEqual(result[2].isCompleted, false);
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
    // Start 30-Jan-2025, Session 1-Feb → offset 0 (30-Jan) and offset 2 (1-Feb) completed
    const events = [
      { daysOffset: 0, isCompleted: false },
      { daysOffset: 2, isCompleted: false },
      { daysOffset: 5, isCompleted: false },
    ];
    const result = applySessionCutoff(events, '30-Jan-2025', '1-Feb');
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

  it('Session cutoff with no (C) markers — each type cascades independently from cutoff', () => {
    const events = [
      { daysOffset: 0, isPurchase: false },
      { daysOffset: 2, isPurchase: false },
      { daysOffset: 5, isPurchase: false },
      { daysOffset: 0, isPurchase: true },
      { daysOffset: 2, isPurchase: true },
    ];
    // Session date 3-Jan, start 1-Jan → cutoff at offset 2 (=3-Jan)
    // Levels 0,2 completed via cutoff; level 5 not
    // Purchases 0,2 completed via cutoff; no cascade since no (C)
    const startDate = new Date(2025, 0, 1);
    const sessionDate = new Date(2025, 0, 3);
    const results = events.map((e) => {
      const eventDate = new Date(startDate.getTime() + e.daysOffset * 86400000);
      return { ...e, isCompleted: eventDate.getTime() <= sessionDate.getTime() };
    });
    assert.strictEqual(results[0].isCompleted, true);
    assert.strictEqual(results[1].isCompleted, true);
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
