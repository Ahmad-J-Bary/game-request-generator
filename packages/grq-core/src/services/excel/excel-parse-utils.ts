// ===== Excel Parse Utilities (shared across parser modules) =====

const MONTHS_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTHS_CAP = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Parse "Less Than" restricted offset pattern from days offset string.
 * Handles formats like "3 (Less Than 5)" in any locale.
 */
export function parsePurchaseDaysOffset(daysOffsetStr: string): {
  days_offset?: number;
  max_days_offset?: number;
  is_restricted: boolean;
} {
  const result: { days_offset?: number; max_days_offset?: number; is_restricted: boolean } = {
    is_restricted: false,
  };

  const parenMatch = daysOffsetStr.match(/\((.+?)\s+(\d+)\)\s*$/);
  if (parenMatch) {
    const baseVal = parseInt(daysOffsetStr, 10);
    if (!isNaN(baseVal)) result.days_offset = baseVal;
    result.max_days_offset = parseInt(parenMatch[2], 10);
    result.is_restricted = true;
  } else {
    const val = parseInt(daysOffsetStr, 10);
    if (!isNaN(val)) {
      result.days_offset = val;
      result.max_days_offset = val;
    } else {
      const n = Number(daysOffsetStr);
      if (!isNaN(n) && isFinite(n)) {
        result.days_offset = Math.floor(n);
      }
    }
  }

  return result;
}

/**
 * Detect the first data column in a 4-row header block.
 * Scans columns 0-4 looking for a column where row 2 has a numeric (or "less") value
 * and row 0 has a non-label token.
 */
export function detectStartCol(rows: any[][], maxCols: number): number {
  for (let col = 0; col < Math.min(5, maxCols); col++) {
    const valDayRaw = rows[2]?.[col] !== undefined && rows[2]?.[col] !== null ? rows[2][col] : '';
    const valDay = String(valDayRaw).trim();
    const isDayNumeric = valDay !== '' && !isNaN(Number(valDay));
    const isLess = valDay.toLowerCase().includes('less');

    const valTokenRaw = rows[0]?.[col] !== undefined && rows[0]?.[col] !== null ? rows[0][col] : '';
    const valToken = String(valTokenRaw).trim().toLowerCase();
    const isLabelColumn = valToken === 'event token' || valToken === 'levels' || valToken === '' || valToken.includes(' ');

    if ((isDayNumeric || isLess) && !isLabelColumn) {
      return col;
    }
  }
  return 0;
}

/**
 * Detect the Session and Time column indices from an Account header row.
 */
export function detectSpecialColumns(headerRow: any[]): { sessionCol: number; timeCol: number } {
  let sessionCol = -1;
  let timeCol = -1;
  for (let c = 0; c < headerRow.length; c++) {
    const cellStr = headerRow[c]?.toString().trim().toLowerCase();
    if (cellStr === 'session') sessionCol = c;
    if (cellStr === 'time') timeCol = c;
  }
  return { sessionCol, timeCol };
}

/**
 * Check if a column represents a Purchase Event (rather than a Level).
 * A column whose Level Name is "-" is always a session-only level and is
 * never treated as a purchase event, even when its Time Spent cell is empty
 * or "-" (which would otherwise look like a purchase marker).
 */
export function isPurchaseEvent(name: string, timeSpentStr: string): boolean {
  if (name === '-') return false;
  return name === '$$$' || timeSpentStr === '' || timeSpentStr === '-';
}

/**
 * Parse a date value in various formats (Date object, MM/DD/YYYY, YYYY-MM-DD, DD-Mon-YYYY, DD-Mon)
 * and return ISO date string YYYY-MM-DD.
 */
export function parseAccountDateStr(rawDate: any): string | undefined {
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

  // MM/DD/YYYY or M/D/YYYY or DD/MM/YYYY
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);

    let month = p1 - 1;
    let day = p2;
    if (p1 > 12) {
      day = p1;
      month = p2 - 1;
    }
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // DD-Mon-YYYY (e.g. "15-Jan-2025" or "1-Jul-2025")
  const dashMatch = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (dashMatch) {
    const day = parseInt(dashMatch[1], 10);
    const monthStr = dashMatch[2].toLowerCase();
    const year = parseInt(dashMatch[3], 10);
    const monthIndex = MONTHS_SHORT.indexOf(monthStr);
    if (monthIndex >= 0) {
      const d = new Date(year, monthIndex, day);
      if (!isNaN(d.getTime())) {
        return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  // DD-Mon (e.g. "1-Jul" or "15-Jan")
  const shortDashMatch = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (shortDashMatch) {
    const day = parseInt(shortDashMatch[1], 10);
    const monthStr = shortDashMatch[2].toLowerCase();
    const year = new Date().getFullYear();
    const monthIndex = MONTHS_SHORT.indexOf(monthStr);
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

/**
 * Parse a D-MMM date string into a Date object.
 * Falls back to current year if referenceYear not provided.
 */
export function parseDMMMDate(dateStr: string, referenceYear?: number): Date | null {
  const m = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (!m) return null;
  const monthIndex = MONTHS_SHORT.indexOf(m[2].toLowerCase());
  if (monthIndex < 0) return null;
  const year = referenceYear ?? new Date().getFullYear();
  const d = new Date(year, monthIndex, parseInt(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Compare two D-MMM date strings: returns true if a <= b.
 */
export function dateStrLte(a: string, b: string, referenceYear?: number): boolean {
  const da = parseDMMMDate(a, referenceYear);
  const db = parseDMMMDate(b, referenceYear);
  if (!da || !db) return false;
  return da.getTime() <= db.getTime();
}

/**
 * Compute a D-MMM date string from a start date + days offset.
 */
export function computeEventDateStr(accountStartDate: Date, daysOffset: number): string {
  const eventDate = new Date(accountStartDate.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  return `${eventDate.getDate()}-${MONTHS_CAP[eventDate.getMonth()]}`;
}

/**
 * Format a time value from various sources (Date object or string) into HH:MM:SS format.
 */
export function parseTimeStr(raw: any): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    const d = raw as Date;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }
  const str = String(raw).trim();

  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const seconds = ampmMatch[3] || '00';
    if (ampmMatch[4]?.toUpperCase() === 'PM' && hours !== 12) hours += 12;
    else if (ampmMatch[4]?.toUpperCase() === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
  }

  if (/^\d{1,2}:\d{2}$/.test(str)) return `${str}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(str)) return str;
  return '';
}

/**
 * Parse a cell value to extract completion status and date string.
 * Cells can be: "26-Jul (C)", "26-Jul", "-", or empty.
 */
export function parseCellCompletion(cellVal: string): { isCompleted: boolean; dateStr: string; hasDateCell: boolean } {
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
}
