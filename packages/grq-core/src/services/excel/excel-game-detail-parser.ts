// ===== Game Detail Layout Parsers (Vertical & Horizontal) =====

import type { Level, PurchaseEvent } from '@grq/api-bindings';
import { detectStartCol, isPurchaseEvent, parsePurchaseDaysOffset } from './excel-parse-utils';

export function isVerticalGameDetailFormat(rows: any[][]): boolean {
  if (rows.length < 4) return false;

  let dataStart = 0;
  while (dataStart < rows.length && String(rows[dataStart]?.[0] ?? '').toLowerCase().startsWith('branch:')) {
    dataStart++;
  }

  if (dataStart + 4 > rows.length) return false;

  let numberCountRow2 = 0;
  for (let i = 0; i < Math.min(10, rows[dataStart + 2].length); i++) {
     const v = rows[dataStart + 2][i];
     if (v !== undefined && v !== null && String(v).trim() !== '' && (!isNaN(Number(v)) || String(v).toLowerCase().includes('less'))) {
         numberCountRow2++;
     }
  }

  return numberCountRow2 >= 2;
}

export function isHorizontalGameDetailFormat(rows: any[][]): boolean {
  if (rows.length < 2) return false;
  const headers = rows[0].map((h: any) => h?.toString().toLowerCase() || '');
  return headers.includes('event token') &&
         headers.includes('level name') &&
         headers.includes('days offset');
}

export function parseHorizontalLayoutData(rows: any[][]): { levels: Partial<Level>[], purchaseEvents: Partial<PurchaseEvent>[] } {
  const levels: Partial<Level>[] = [];
  const purchaseEvents: Partial<PurchaseEvent>[] = [];

  if (rows.length < 2) return { levels, purchaseEvents };

  const headers = rows[0].map((h: any) => h?.toString().toLowerCase() || '');

  const eventTokenIndex = headers.indexOf('event token');
  const levelNameIndex = headers.indexOf('level name');
  const daysOffsetIndex = headers.indexOf('days offset');
  const timeSpentIndex = headers.indexOf('time spent (1000 seconds)');

  if (eventTokenIndex === -1) return { levels, purchaseEvents };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || !row[eventTokenIndex]) continue;

    const token = row[eventTokenIndex].toString().trim();
    const name = row[levelNameIndex]?.toString().trim() || '';
    const daysOffsetStr = row[daysOffsetIndex]?.toString().trim() || '';
    const timeSpentStr = row[timeSpentIndex]?.toString().trim() || '';

    if (isPurchaseEvent(name, timeSpentStr)) {
      const purchaseEvent: Partial<PurchaseEvent> = {
        event_token: token,
        level_name: name !== '$$$' ? name : '',
        is_restricted: false,
      };

      const parsed = parsePurchaseDaysOffset(daysOffsetStr);
      if (parsed.days_offset !== undefined) purchaseEvent.days_offset = parsed.days_offset;
      if (parsed.max_days_offset !== undefined) purchaseEvent.max_days_offset = parsed.max_days_offset;
      purchaseEvent.is_restricted = parsed.is_restricted;
      purchaseEvents.push(purchaseEvent);
    } else {
      const level: Partial<Level> = {
        event_token: token,
        level_name: name,
      };

      const dOffset = parseInt(daysOffsetStr);
      if (!isNaN(dOffset)) level.days_offset = dOffset;

      const tSpent = parseInt(timeSpentStr);
      if (!isNaN(tSpent)) level.time_spent = tSpent;

      level.is_bonus = name.toLowerCase().includes('bonus') ||
                      name.toLowerCase().includes('extra') ||
                      name.match(/\+\d+/) !== null;

      levels.push(level);
    }
  }

  return { levels, purchaseEvents };
}

export function parseVerticalLayoutData(rows: any[][]): { levels: Partial<Level>[], purchaseEvents: Partial<PurchaseEvent>[] } {
  const levels: Partial<Level>[] = [];
  const purchaseEvents: Partial<PurchaseEvent>[] = [];

  if (rows.length < 4) {
    return { levels, purchaseEvents };
  }

  let i = 0;
  let currentBranchName: string | undefined;
  while (i < rows.length) {
    currentBranchName = undefined;
    const branchRowRaw = rows[i]?.[0];
    if (branchRowRaw) {
      const branchStr = String(branchRowRaw).trim();
      if (branchStr.toLowerCase().startsWith('branch:')) {
        const colonIdx = branchStr.indexOf(':');
        if (colonIdx >= 0) {
          currentBranchName = branchStr.substring(colonIdx + 1).trim() || undefined;
        }
      }
    }

    while (i < rows.length && String(rows[i]?.[0] ?? '').toLowerCase().startsWith('branch:')) {
      i++;
    }

    if (i + 4 > rows.length) break;

    const groupRows = rows.slice(i, i + 4);

    const hasToken = groupRows[0]?.some((v: any) => v && String(v).trim() && !String(v).toLowerCase().includes('event token'));
    let hasNumericOffset = false;
    if (groupRows[2]) {
      for (let c = 0; c < Math.min(10, groupRows[2].length); c++) {
        const v = groupRows[2][c];
        if (v !== undefined && v !== null && String(v).trim() !== '' && (!isNaN(Number(v)) || String(v).toLowerCase().includes('less'))) {
          hasNumericOffset = true;
          break;
        }
      }
    }
    if (!hasToken || !hasNumericOffset) {
      i++;
      continue;
    }

    const maxCols = Math.max(...groupRows.map(row => row.length));
    let startCol = detectStartCol(groupRows, maxCols);

    for (let col = startCol; col < maxCols; col++) {
      const eventTokenRaw = groupRows[0] && groupRows[0][col] !== undefined && groupRows[0][col] !== null ? groupRows[0][col] : '';
      const eventToken = eventTokenRaw.toString().trim();
      const levelNameRaw = groupRows[1] && groupRows[1][col] !== undefined && groupRows[1][col] !== null ? groupRows[1][col] : '';
      const levelName = levelNameRaw.toString().trim();
      const daysOffsetRaw = groupRows[2] && groupRows[2][col] !== undefined && groupRows[2][col] !== null ? groupRows[2][col] : '';
      const daysOffsetStr = daysOffsetRaw.toString().trim();
      const timeSpentRaw = groupRows[3] && groupRows[3][col] !== undefined && groupRows[3][col] !== null ? groupRows[3][col] : '';
      const timeSpentStr = timeSpentRaw.toString().trim();

      if (!eventToken || eventToken.toLowerCase() === 'event token' || eventToken.toLowerCase() === 'levels') continue;

      if (isPurchaseEvent(levelName, timeSpentStr)) {
        const purchaseEvent: Partial<PurchaseEvent> = {
          event_token: eventToken,
          level_name: levelName !== '$$$' ? levelName : '',
          is_restricted: false,
        };

        const parsed = parsePurchaseDaysOffset(daysOffsetStr);
        if (parsed.days_offset !== undefined) purchaseEvent.days_offset = parsed.days_offset;
        if (parsed.max_days_offset !== undefined) purchaseEvent.max_days_offset = parsed.max_days_offset;
        purchaseEvent.is_restricted = parsed.is_restricted;

        (purchaseEvent as any).branchName = currentBranchName;
        purchaseEvents.push(purchaseEvent);
      } else {
        const level: Partial<Level> = {
          event_token: eventToken,
          level_name: levelName,
        };

        if (daysOffsetStr !== '-' && daysOffsetStr !== '') {
          const daysOffset = parseInt(daysOffsetStr);
          if (!isNaN(daysOffset)) {
            level.days_offset = daysOffset;
          }
        }

        if (timeSpentStr !== '-' && timeSpentStr !== '') {
          const timeSpent = parseInt(timeSpentStr);
          if (!isNaN(timeSpent)) {
            level.time_spent = timeSpent;
          }
        }

        level.is_bonus = levelName.toLowerCase().includes('bonus') ||
          levelName.toLowerCase().includes('extra') ||
          levelName.match(/\+\d+/) !== null;

        if (level.level_name) {
          (level as any).branchName = currentBranchName;
          levels.push(level);
        }
      }
    }

    i += 4;
  }

  return { levels, purchaseEvents };
}
