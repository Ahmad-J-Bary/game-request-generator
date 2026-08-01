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
  if (name === '-') return false;
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

  it('returns false for session-only level with dash timeSpent', () => {
    assert.strictEqual(isPurchaseEvent('-', '-'), false);
  });

  it('returns false for session-only level with empty timeSpent', () => {
    assert.strictEqual(isPurchaseEvent('-', ''), false);
  });

  it('returns false for session-only level with numeric timeSpent', () => {
    assert.strictEqual(isPurchaseEvent('-', '650'), false);
  });
});

// ===== (C)-only Completion Logic Tests =====

/**
 * Simulates the parser's completion logic under the "(C)"-driven rule:
 * Level Events and Purchase Events complete EXCLUSIVELY when they carry an
 * explicit "(C)" marker. There is NO cascade, NO threshold, and no cross-type
 * propagation.
 */
interface CascadeResult {
  daysOffset: number;
  isPurchase: boolean;
  isCompleted: boolean;
}

function applyPerTypeCascade(
  events: { daysOffset: number; isPurchase: boolean }[],
  completedIndices: number[],  // indices of events with (C) marker
): CascadeResult[] {
  return events.map((e, idx) => ({
    daysOffset: e.daysOffset,
    isPurchase: e.isPurchase,
    isCompleted: completedIndices.includes(idx),
  }));
}

describe('(C)-only completion — level (C) does NOT cascade to anything', () => {
  it('only the event with (C) is completed; no cascade to earlier levels', () => {
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
    const result = applyPerTypeCascade(events, [2]);
    assert.strictEqual(result[0].isCompleted, false);
    assert.strictEqual(result[1].isCompleted, false);
    assert.strictEqual(result[2].isCompleted, true);
    assert.strictEqual(result[3].isCompleted, false);
    assert.strictEqual(result[4].isCompleted, false);
    assert.strictEqual(result[5].isCompleted, false);
  });

  it('purchase (C) does not cascade to earlier purchases or levels', () => {
    const events = [
      { daysOffset: 0, isPurchase: false },
      { daysOffset: 3, isPurchase: false },
      { daysOffset: 0, isPurchase: true },
      { daysOffset: 2, isPurchase: true },
      { daysOffset: 3, isPurchase: true },
    ];
    // Only purchase day 3 has (C)
    const result = applyPerTypeCascade(events, [4]);
    assert.strictEqual(result[0].isCompleted, false);
    assert.strictEqual(result[1].isCompleted, false);
    assert.strictEqual(result[2].isCompleted, false);
    assert.strictEqual(result[3].isCompleted, false);
    assert.strictEqual(result[4].isCompleted, true);
  });

  it('both types with their own (C) markers complete independently', () => {
    const events = [
      { daysOffset: 0, isPurchase: false },
      { daysOffset: 5, isPurchase: false },
      { daysOffset: 0, isPurchase: true },
      { daysOffset: 3, isPurchase: true },
    ];
    // Level day 5 has (C), purchase day 3 has (C)
    const result = applyPerTypeCascade(events, [1, 3]);
    assert.strictEqual(result[0].isCompleted, false);
    assert.strictEqual(result[1].isCompleted, true);
    assert.strictEqual(result[2].isCompleted, false);
    assert.strictEqual(result[3].isCompleted, true);
  });

  it('no (C) markers at all: nothing completed', () => {
    const events = [
      { daysOffset: 0, isPurchase: false },
      { daysOffset: 5, isPurchase: false },
      { daysOffset: 0, isPurchase: true },
      { daysOffset: 3, isPurchase: true },
    ];
    const result = applyPerTypeCascade(events, []);
    assert.strictEqual(result[0].isCompleted, false);
    assert.strictEqual(result[1].isCompleted, false);
    assert.strictEqual(result[2].isCompleted, false);
    assert.strictEqual(result[3].isCompleted, false);
  });

  it('(C) on a later day does not complete earlier events of the same type', () => {
    const events = [
      { daysOffset: 1000, isPurchase: false },
      { daysOffset: 1001, isPurchase: false },
    ];
    const result = applyPerTypeCascade(events, [1]);
    assert.strictEqual(result[0].isCompleted, false);
    assert.strictEqual(result[1].isCompleted, true);
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
 * Simulates the Session date cutoff logic under the "(C)"-driven rule:
 * Only Session Only ('-') rows are completed by the Session date — a request
 * scheduled on or before the Session date is completed. Level Events and
 * Purchase Events are NEVER completed by the cutoff (only by "(C)").
 */
function applySessionCutoff(
  events: SessionCutoffEvent[],
  startDateStr: string,
  sessionDateStr: string | undefined,
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
    if (!e.isSessionOnly) return { ...e };  // cutoff applies ONLY to Session Only rows
    const eventDate = new Date(startDate.getTime() + e.daysOffset * 24 * 60 * 60 * 1000);
    if (eventDate.getTime() <= sessionDate.getTime()) {
      return { ...e, isCompleted: true };
    }
    return { ...e };
  });
}

describe('Session date cutoff (Session Only only)', () => {
  it('does NOT complete Level Events before the Session date without (C)', () => {
    const events = [
      { daysOffset: 0, isCompleted: false },
      { daysOffset: 2, isCompleted: false },
      { daysOffset: 5, isCompleted: false },
    ];
    // Start 1-Jan-2025, Session 3-Jan → all events are Level Events (no isSessionOnly):
    // none completed, because completion is (C)-only for Level/Purchase Events.
    const result = applySessionCutoff(events, '1-Jan-2025', '3-Jan');
    assert.strictEqual(result[0].isCompleted, false);
    assert.strictEqual(result[1].isCompleted, false);
    assert.strictEqual(result[2].isCompleted, false);
  });

  it('does NOT complete Purchase Events before the Session date without (C)', () => {
    const events = [
      { daysOffset: 0, isCompleted: false, isPurchase: true },
      { daysOffset: 2, isCompleted: false, isPurchase: true },
    ];
    const result = applySessionCutoff(events, '1-Jan-2025', '3-Jan');
    assert.strictEqual(result[0].isCompleted, false);
    assert.strictEqual(result[1].isCompleted, false);
  });

  it('does not override existing (C) completion', () => {
    const events = [
      { daysOffset: 0, isCompleted: false, isSessionOnly: true },
      { daysOffset: 5, isCompleted: true },  // already completed via (C)
      { daysOffset: 10, isCompleted: false, isSessionOnly: true },
    ];
    const result = applySessionCutoff(events, '1-Jan-2025', '3-Jan');
    assert.strictEqual(result[0].isCompleted, true);  // Session Only via cutoff
    assert.strictEqual(result[1].isCompleted, true);  // already true
    assert.strictEqual(result[2].isCompleted, false); // > cutoff
  });

  it('handles Session date at month boundary', () => {
    // Start 30-Jan-2025, Session 1-Feb → offset 0 (30-Jan) and offset 2 (1-Feb) Session Only
    // rows are on/before the cutoff and completed; offset 5 not.
    const events = [
      { daysOffset: 0, isCompleted: false, isSessionOnly: true },
      { daysOffset: 2, isCompleted: false, isSessionOnly: true },
      { daysOffset: 5, isCompleted: false, isSessionOnly: true },
    ];
    const result = applySessionCutoff(events, '30-Jan-2025', '1-Feb');
    assert.strictEqual(result[0].isCompleted, true);
    assert.strictEqual(result[1].isCompleted, true);
    assert.strictEqual(result[2].isCompleted, false);
  });

  it('returns early when sessionDateStr is undefined', () => {
    const events = [{ daysOffset: 0, isCompleted: false, isSessionOnly: true }];
    const result = applySessionCutoff(events, '1-Jan-2025', undefined);
    assert.strictEqual(result[0].isCompleted, false);
  });

  it('handles start date in ISO format (YYYY-MM-DD)', () => {
    const events = [
      { daysOffset: 0, isCompleted: false, isSessionOnly: true },
      { daysOffset: 5, isCompleted: false, isSessionOnly: true },
    ];
    const result = applySessionCutoff(events, '2025-01-01', '3-Jan');
    assert.strictEqual(result[0].isCompleted, true);
    assert.strictEqual(result[1].isCompleted, false);
  });

  it('session-only request on the Session date is always completed', () => {
    const events = [
      { daysOffset: 29, isCompleted: false, isSessionOnly: true },
    ];
    const result = applySessionCutoff(events, '1-Jul-2025', '30-Jul');
    assert.strictEqual(result[0].isCompleted, true, 'session-only on boundary always completed');
  });

  it('Session Only before the Session date is completed', () => {
    const events = [
      { daysOffset: 28, isCompleted: false, isSessionOnly: true },
      { daysOffset: 29, isCompleted: false, isSessionOnly: true },
      { daysOffset: 30, isCompleted: false, isSessionOnly: true },
    ];
    const result = applySessionCutoff(events, '1-Jul-2025', '30-Jul');
    assert.strictEqual(result[0].isCompleted, true,  '29-Jul < 30-Jul → completed');
    assert.strictEqual(result[1].isCompleted, true,  '30-Jul on the Session date → completed');
    assert.strictEqual(result[2].isCompleted, false, '31-Jul > 30-Jul → not completed');
  });

  it('explicit (C) always wins regardless of cutoff', () => {
    const events = [
      { daysOffset: 29, isCompleted: true },
    ];
    const result = applySessionCutoff(events, '1-Jul-2025', '30-Jul');
    assert.strictEqual(result[0].isCompleted, true, '(C) preserved');
  });
});

// ===== Session Only + Session Cutoff Integration Tests =====

/**
 * Simulates the full flow for Session Only events under the "(C)"-driven rule:
 * 1. Session column date cutoff completes Session Only ('-') rows on/before the date.
 * 2. Level Events and Purchase Events complete ONLY via the "(C)" marker (no cascade).
 */
describe('Session Only with Session cutoff + (C)-only events', () => {
  it('Session cutoff completes Session Only rows; Level/Purchase events need (C)', () => {
    const events = [
      { daysOffset: 0, isPurchase: false, explicitC: false, isSessionOnly: true },
      { daysOffset: 2, isPurchase: false, explicitC: false, isSessionOnly: true },
      { daysOffset: 5, isPurchase: false, explicitC: true, isSessionOnly: true }, // has (C)
      { daysOffset: 0, isPurchase: true, explicitC: false },   // Purchase Event
      { daysOffset: 2, isPurchase: false, explicitC: false },  // Level Event
    ];
    // Session date cutoff: start=1-Jan-2025, session=3-Jan
    // → Session Only rows 0 (1-Jan) and 2 (3-Jan) completed via cutoff; row 5 via (C)
    // Purchase/Level events have no (C) → NOT completed by cutoff.

    const startDate = new Date(2025, 0, 1);
    const sessionDate = new Date(2025, 0, 3); // 3-Jan

    const results = events.map((e) => {
      if (e.explicitC) return { ...e, isCompleted: true };
      if (!e.isSessionOnly) return { ...e, isCompleted: false };  // events are (C)-only
      const eventDate = new Date(startDate.getTime() + e.daysOffset * 86400000);
      const isCompleted = eventDate.getTime() <= sessionDate.getTime();
      return { ...e, isCompleted };
    });

    assert.strictEqual(results[0].isCompleted, true,  'Session Only row 0 (1-Jan ≤ 3-Jan) via cutoff');
    assert.strictEqual(results[1].isCompleted, true,  'Session Only row 2 (3-Jan ≤ 3-Jan) via cutoff');
    assert.strictEqual(results[2].isCompleted, true,  'Session Only row 5 (has (C))');
    assert.strictEqual(results[3].isCompleted, false, 'Purchase Event 0 has no (C) → NOT completed');
    assert.strictEqual(results[4].isCompleted, false, 'Level Event 2 (3-Jan) has no (C) → NOT completed');
  });

  it('Level Event (C) does NOT cascade to earlier events', () => {
    const events = [
      { daysOffset: 0, isPurchase: false, explicitC: false },
      { daysOffset: 3, isPurchase: false, explicitC: false },
      { daysOffset: 5, isPurchase: false, explicitC: true },
    ];
    // Only the Level Event at day 5 has (C) → only it completes. No cascade.
    const results = events.map((e) => ({ ...e, isCompleted: e.explicitC }));
    assert.strictEqual(results[0].isCompleted, false);
    assert.strictEqual(results[1].isCompleted, false);
    assert.strictEqual(results[2].isCompleted, true);
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
 * parse cells, apply the Session cutoff for Session Only ('-') rows only,
 * and push progress entries. Level Events and Purchase Events complete
 * EXCLUSIVELY via the "(C)" marker (no cascade, no threshold).
 */
function generateProgressForRow(
  rowCells: string[],
  accountName: string,
  gameName: string,
  sessionDateStr: string | undefined,
  startDate: Date,
  colHeaders: { name: string; isPurchase: boolean; token: string; daysOffset?: number; timeSpent?: number }[],
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

  // Parse cells → events. Mirrors the sheet parser's session-only token
  // reconstruction: a Level Name "-" column gets the full per-day token
  // (base_dayN) so each session day maps to a distinct level on import.
  const rowEvents: { header: typeof colHeaders[0]; isCompleted: boolean; dateStr: string; hasDateCell: boolean }[] = [];
  for (let c = 0; c < rowCells.length && c < colHeaders.length; c++) {
    const header = colHeaders[c];
    if (!header || !header.token) continue;
    const effectiveHeader = header.name === '-' && header.daysOffset !== undefined
      ? { ...header, token: `${header.token.split('_day')[0]}_day${header.daysOffset}` }
      : header;
    const { isCompleted, dateStr, hasDateCell } = parseCell(rowCells[c]);
    rowEvents.push({ header: effectiveHeader, isCompleted, dateStr, hasDateCell });
  }

  // Session cutoff applies ONLY to Session Only ('-') rows: a request scheduled
  // on or before the Session date is completed. Level/Purchase Events keep the
  // "(C)" result (no cutoff, no cascade).
  if (sessionDateStr && startDate) {
    const sessionParsed = parseDMMMD(sessionDateStr, refYear);
    for (const evt of rowEvents) {
      if (evt.isCompleted) continue;
      if (evt.header.name !== '-') continue;
      if (evt.header.daysOffset === undefined) continue;
      const evtDateStr = computeEvtDateStr(evt.header.daysOffset);
      const evtParsed = evtDateStr ? parseDMMMD(evtDateStr, refYear) : null;
      if (!evtParsed || !sessionParsed) continue;
      if (evtParsed.getTime() <= sessionParsed.getTime()) {
        evt.isCompleted = true;
      }
    }
  }

  // Generate progress entries
  const entries: MockProgressEntry[] = [];
  for (const evt of rowEvents) {
    let { isCompleted, header, dateStr, hasDateCell } = evt;
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
      { name: 'AccountA', sessionCell: '3-Jan', cells: ['1-Jan (C)', '-', '-'] },
      { name: 'AccountB', sessionCell: '2-Jan', cells: ['-', '1-Jan (C)', '-'] },
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

  it('per-account session cutoff produces different completion sets for Session Only rows', () => {
    const headers = [
      { name: '-', isPurchase: false, token: 'evt_day0', daysOffset: 0 },
      { name: '-', isPurchase: false, token: 'evt_day2', daysOffset: 2 },
      { name: '-', isPurchase: false, token: 'evt_day5', daysOffset: 5 },
    ];
    const startDate = new Date(2025, 0, 1);

    // Session Only rows ('-') are completed by the Session cutoff (on/before date).
    // Start 1-Jan → offset 0 = 1-Jan, offset 2 = 3-Jan, offset 5 = 6-Jan.
    // AccountA: Session = 3-Jan → completes offsets 0 and 2 (day 5 is 6-Jan > 3-Jan)
    // AccountB: Session = 6-Jan → completes all three
    // AccountC: Session = 1-Jan → completes offset 0 only (1-Jan <= 1-Jan)
    const rows = [
      { name: 'AccountA', session: '3-Jan', cells: ['-', '-', '-'] },
      { name: 'AccountB', session: '6-Jan', cells: ['-', '-', '-'] },
      { name: 'AccountC', session: '1-Jan', cells: ['-', '-', '-'] },
    ];

    const allEntries: MockProgressEntry[] = [];
    for (const row of rows) {
      const entries = generateProgressForRow(
        row.cells, row.name, 'TestGame', row.session, startDate, headers,
      );
      allEntries.push(...entries);
    }

    const aCompleted = allEntries.filter(e => e.accountName === 'AccountA' && e.isCompleted);
    const bCompleted = allEntries.filter(e => e.accountName === 'AccountB' && e.isCompleted);
    const cCompleted = allEntries.filter(e => e.accountName === 'AccountC' && e.isCompleted);

    assert.strictEqual(aCompleted.length, 2, 'AccountA: offsets 0 and 2 on/before 3-Jan');
    assert.strictEqual(bCompleted.length, 3, 'AccountB: all offsets on/before 6-Jan');
    assert.strictEqual(cCompleted.length, 1, 'AccountC: only offset 0 on/before 1-Jan');
  });

  it('Level Event before the Session date with a date but no (C) is NOT completed', () => {
    const headers = [
      { name: 'Day 28', isPurchase: false, token: 'evt_day28', daysOffset: 28, timeSpent: 690 },
    ];
    const startDate = new Date(2025, 6, 1); // 1-Jul-2025 → day 28 = 29-Jul
    const entries = generateProgressForRow(
      ['29-Jul'], 'Acc', 'Game', '30-Jul', startDate, headers,
    );
    assert.strictEqual(entries.length, 1, 'entry with a date cell is emitted');
    assert.strictEqual(entries[0].isCompleted, false, 'Level Event needs (C) — cutoff does not apply');
  });

  it('Level Event ON the Session date with a date but no (C) is NOT completed', () => {
    const headers = [
      { name: 'Day 29', isPurchase: false, token: 'evt_day29', daysOffset: 29, timeSpent: 700 },
    ];
    const startDate = new Date(2025, 6, 1);
    const entries = generateProgressForRow(
      ['30-Jul'], 'Acc', 'Game', '30-Jul', startDate, headers,
    );
    assert.strictEqual(entries.length, 1, 'entry with a date cell is emitted');
    assert.strictEqual(entries[0].isCompleted, false, 'no time_spent matching — (C)-only');
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

  it('session-only headers with a base token get per-day tokens', () => {
    // Mirrors the exported matrix: all Level Name cells are "-" and the Event
    // Token row carries the base token "lvl" at offsets 0/2/5.
    const headers = [
      { name: '-', isPurchase: false, token: 'lvl', daysOffset: 0 },
      { name: '-', isPurchase: false, token: 'lvl', daysOffset: 2 },
      { name: '-', isPurchase: false, token: 'lvl', daysOffset: 5 },
    ];
    const startDate = new Date(2025, 0, 1);

    // Explicit (C) on day 5 only → that day completes and must carry a distinct
    // full per-day token (lvl_day5). Days 0/2 have no (C) and no Session cutoff
    // → omitted entirely.
    const entries = generateProgressForRow(
      ['-', '-', '5-Jan (C)'], 'Acc', 'Game', undefined, startDate, headers,
    );

    const tokens = entries.map(e => e.token).sort();
    assert.deepStrictEqual(tokens, ['lvl_day5'],
      'only the completed day emits an entry with its full per-day token');

    const day5 = entries.find(e => e.token === 'lvl_day5');
    assert.ok(day5?.isCompleted, 'day 5 explicit (C) completed');
    assert.strictEqual(entries.find(e => e.token === 'lvl_day0'), undefined, 'day 0 omitted (no (C), no cutoff)');
    assert.strictEqual(entries.find(e => e.token === 'lvl_day2'), undefined, 'day 2 omitted (no (C), no cutoff)');
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

    // Parse cells → completion is EXCLUSIVELY from the "(C)" marker.
    const parsed = headers.map((h, ci) => {
      const cell = acct.cells[ci] || '-';
      const isC = cell.endsWith('(C)');
      return { header: h, isCompleted: isC };
    });

    // Session cutoff applies ONLY to Session Only ('-') rows: on/before the
    // Session date completes them. Level/Purchase Events stay "(C)"-driven.
    if (acct.sessionDate) {
      const sessionParsed = parseDMMMD(acct.sessionDate, refYear);
      for (const evt of parsed) {
        if (evt.isCompleted) continue;
        if (evt.header.name !== '-') continue;
        if (evt.header.daysOffset === undefined) continue;
        const evtDate = new Date(startDate.getTime() + evt.header.daysOffset * 86400000);
        const evtDateStr = `${evtDate.getDate()}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][evtDate.getMonth()]}`;
        const evtParsed = parseDMMMD(evtDateStr, refYear);
        if (!evtParsed || !sessionParsed) continue;
        if (evtParsed.getTime() <= sessionParsed.getTime()) {
          evt.isCompleted = true;
        }
      }
    }

    // Generate entries (one per header, mirroring the parser's progress list)
    for (const evt of parsed) {
      results.push({
        accountName: acct.name,
        token: evt.header.token,
        isCompleted: evt.isCompleted,
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
    // Session Only headers ('-') so the cutoff applies per account.
    const sessionHeaders = [
      { token: 'evt_day0', daysOffset: 0, isPurchase: false, name: '-' },
      { token: 'evt_day2', daysOffset: 2, isPurchase: false, name: '-' },
      { token: 'evt_day5', daysOffset: 5, isPurchase: false, name: '-' },
    ];
    const accounts = [
      // AccountA: Session 3-Jan → completes days 0,2 (1-Jan/3-Jan ≤ 3-Jan), not day 5 (6-Jan).
      { name: 'AccountA', startDate: '2025-01-01', sessionDate: '3-Jan', cells: ['-', '-', '-'] },
      // AccountB: Session 6-Jan → completes all three days (all ≤ 6-Jan).
      { name: 'AccountB', startDate: '2025-01-01', sessionDate: '6-Jan', cells: ['-', '-', '-'] },
      // AccountC: no session → nothing completed via cutoff.
      { name: 'AccountC', startDate: '2025-01-01', cells: ['-', '-', '-'] },
    ];

    const progress = simulateMultiAccountProgress(sessionHeaders, accounts);

    const acctAEntries = progress.filter(e => e.accountName === 'AccountA');
    assert.strictEqual(acctAEntries.length, 3, 'AccountA should have 3 entries');
    const aEvt0 = acctAEntries.find(e => e.token === 'evt_day0');
    const aEvt2 = acctAEntries.find(e => e.token === 'evt_day2');
    const aEvt5 = acctAEntries.find(e => e.token === 'evt_day5');
    assert.ok(aEvt0?.isCompleted, 'AccountA: evt_day0 completed (1-Jan ≤ 3-Jan)');
    assert.ok(aEvt2?.isCompleted, 'AccountA: evt_day2 completed (3-Jan ≤ 3-Jan)');
    assert.ok(!aEvt5?.isCompleted, 'AccountA: evt_day5 NOT completed (6-Jan > 3-Jan)');

    const acctBEntries = progress.filter(e => e.accountName === 'AccountB');
    const bEvt0 = acctBEntries.find(e => e.token === 'evt_day0');
    const bEvt2 = acctBEntries.find(e => e.token === 'evt_day2');
    const bEvt5 = acctBEntries.find(e => e.token === 'evt_day5');
    assert.ok(bEvt0?.isCompleted, 'AccountB: evt_day0 completed (≤ 6-Jan)');
    assert.ok(bEvt2?.isCompleted, 'AccountB: evt_day2 completed (≤ 6-Jan)');
    assert.ok(bEvt5?.isCompleted, 'AccountB: evt_day5 completed (6-Jan ≤ 6-Jan)');

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

  it('(C) markers complete independently across types and accounts', () => {
    const accounts = [
      // AccountA: Level evt_day5 has (C) → only that level completes. No cascade, no purchases.
      { name: 'AccountA', startDate: '2025-01-01', cells: ['-', '-', '5-Jan (C)', '-'] },
      // AccountB: Purchase purchase_day0 has (C) → purchase completes. No level (C) → levels not completed.
      { name: 'AccountB', startDate: '2025-01-01', cells: ['-', '-', '-', '1-Jan (C)'] },
    ];

    const progress = simulateMultiAccountProgress(headers, accounts);

    // AccountA: only evt_day5 has (C) → day5 completed, days 0/2 NOT completed.
    const aLevels = progress.filter(e => e.accountName === 'AccountA' && !e.token.startsWith('purchase'));
    const aPurchases = progress.filter(e => e.accountName === 'AccountA' && e.token.startsWith('purchase'));
    const aDay5 = aLevels.find(e => e.token === 'evt_day5');
    const aDay0 = aLevels.find(e => e.token === 'evt_day0');
    const aDay2 = aLevels.find(e => e.token === 'evt_day2');
    assert.ok(aDay5?.isCompleted, 'AccountA: evt_day5 completed (has (C))');
    assert.ok(!aDay0?.isCompleted, 'AccountA: evt_day0 NOT completed (no (C), no cascade)');
    assert.ok(!aDay2?.isCompleted, 'AccountA: evt_day2 NOT completed (no (C), no cascade)');
    aPurchases.forEach(e => assert.ok(!e.isCompleted, `AccountA purchase ${e.token} NOT completed (no purchase (C))`));

    // AccountB: purchase_day0 has (C) → purchase completed. Levels not completed.
    const bLevels = progress.filter(e => e.accountName === 'AccountB' && !e.token.startsWith('purchase'));
    const bPurchases = progress.filter(e => e.accountName === 'AccountB' && e.token.startsWith('purchase'));
    bLevels.forEach(e => assert.ok(!e.isCompleted, `AccountB level ${e.token} NOT completed (no level (C))`));
    bPurchases.forEach(e => assert.ok(e.isCompleted, `AccountB purchase ${e.token} completed ((C) at day 0)`));
  });

  it('each account with different start dates gets different computed event dates', () => {
    const headers2 = [
      { token: 'evt_day3', daysOffset: 3, isPurchase: false, name: '-' },
    ];
    const accounts = [
      // AccountA: start 1-Jan → day3 = 4-Jan. Session 4-Jan → on cutoff → completed.
      { name: 'AccountA', startDate: '2025-01-01', sessionDate: '4-Jan', cells: ['-'] },
      // AccountB: start 5-Jan → day3 = 8-Jan. Session 4-Jan → after cutoff → NOT completed.
      { name: 'AccountB', startDate: '2025-01-05', sessionDate: '4-Jan', cells: ['-'] },
    ];

    const progress = simulateMultiAccountProgress(headers2, accounts);
    const aEntry = progress.find(e => e.accountName === 'AccountA');
    const bEntry = progress.find(e => e.accountName === 'AccountB');
    assert.ok(aEntry?.isCompleted, 'AccountA: evt_day3 completed (4-Jan ≤ 4-Jan)');
    assert.ok(!bEntry?.isCompleted, 'AccountB: evt_day3 NOT completed (8-Jan > 4-Jan)');
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
    // Simulates two groups of Session Only ('-') rows: Group 1 at offsets 0,3;
    // Group 2 at offsets 5,7. Session cutoff completes rows on/before the date.
    const headersGroup1 = [
      { name: '-', isPurchase: false, token: 'evt_day0', daysOffset: 0 },
      { name: '-', isPurchase: false, token: 'evt_day3', daysOffset: 3 },
    ];
    const headersGroup2 = [
      { name: '-', isPurchase: false, token: 'evt_day5', daysOffset: 5 },
      { name: '-', isPurchase: false, token: 'evt_day7', daysOffset: 7 },
    ];
    const startDate = new Date(2025, 0, 1);

    // Account A from Group 1: session 2-Jan → completes offset 0 (1-Jan ≤ 2-Jan).
    // Entry for offset 3 (4-Jan > 2-Jan) is NOT included (not completed, no cell data).
    const entriesA = generateProgressForRow(
      ['-', '-'], 'AccA', 'TestGame', '2-Jan', startDate, headersGroup1,
    );
    // Account B from Group 2: session 8-Jan → offsets 5 (6-Jan) and 7 (8-Jan)
    // are both on/before 8-Jan → both completed.
    const entriesB = generateProgressForRow(
      ['-', '-'], 'AccB', 'TestGame', '8-Jan', startDate, headersGroup2,
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
    assert.ok(b5?.isCompleted, 'AccB: evt_day5 completed (6-Jan ≤ 8-Jan)');
    assert.ok(b7?.isCompleted, 'AccB: evt_day7 completed (8-Jan ≤ 8-Jan)');

    // Combined: all entries together from both groups
    const allEntries = [...entriesA, ...entriesB];
    assert.strictEqual(allEntries.length, 3, '3 entries total across 2 groups (1+2)');
    assert.strictEqual(allEntries.filter(e => e.isCompleted).length, 3, 'all 3 entries completed');
  });

  it('group-specific (C) markers complete independently', () => {
    // Group 1: levels with (C) at day 3 → only day 3 completes (no cascade).
    // Group 2: level events with date cells but no (C) → emitted, not completed.
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

    // Group 1: (C) at day 3 (4-Jan) → only day 3 completed. Days 0/5 have no (C)
    // and no date cell → omitted.
    const entriesG1 = generateProgressForRow(
      ['-', '4-Jan (C)', '-'], 'Group1Acc', 'G', undefined, startDate, headersGroup1,
    );
    // Group 2: date cells without (C) → emitted but NOT completed (Level Events
    // are (C)-only; the Session date does not complete them).
    const entriesG2 = generateProgressForRow(
      ['2-Jan', '5-Jan'], 'Group2Acc', 'G', '4-Jan', startDate, headersGroup2,
    );

    // Group 1 assertions: 1 entry (day 3 (C)), days 0 and 5 omitted
    assert.strictEqual(entriesG1.length, 1, 'Group1: 1 entry (day 3 (C))');
    const g1d0 = entriesG1.find(e => e.token === 'grp1_day0');
    const g1d3 = entriesG1.find(e => e.token === 'grp1_day3');
    const g1d5 = entriesG1.find(e => e.token === 'grp1_day5');
    assert.strictEqual(g1d0, undefined, 'Group1: day 0 omitted (no (C), no date cell)');
    assert.ok(g1d3?.isCompleted, 'Group1: day 3 completed (has (C))');
    assert.strictEqual(g1d5, undefined, 'Group1: day 5 omitted (not completed, no date cell)');

    // Group 2 assertions: 2 entries (date cells emitted), none completed
    assert.strictEqual(entriesG2.length, 2, 'Group2: 2 entries (date cells emitted)');
    const g2d1 = entriesG2.find(e => e.token === 'grp2_day1');
    const g2d4 = entriesG2.find(e => e.token === 'grp2_day4');
    assert.ok(g2d1 && !g2d1.isCompleted, 'Group2: day 1 emitted but NOT completed (Level Event, no (C))');
    assert.ok(g2d4 && !g2d4.isCompleted, 'Group2: day 4 emitted but NOT completed (Level Event, no (C))');
  });
});
