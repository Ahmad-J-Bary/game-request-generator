// ===== Accounts Detail Vertical Layout Parser =====

import type { Level, PurchaseEvent, Account } from '@grq/api-bindings';
import {
  detectStartCol,
  detectSpecialColumns,
  isPurchaseEvent,
  parseAccountDateStr,
  parseTimeStr,
  parsePurchaseDaysOffset,
} from './excel-parse-utils';

export function isAccountsDetailFormat(rows: any[][]): boolean {
  if (rows.length < 6) return false;

  let dataStart = 0;
  while (dataStart < rows.length && String(rows[dataStart]?.[0] ?? '').toLowerCase().startsWith('branch:')) {
    dataStart++;
  }

  if (dataStart + 6 > rows.length) return false;

  for (let i = dataStart + 4; i < Math.min(dataStart + 8, rows.length); i++) {
    if (rows[i] && rows[i][0] && rows[i][0].toString().toLowerCase().includes('account')) {
      return true;
    }
  }
  return false;
}

export function parseAccountsDetailVerticalLayout(rows: any[][]): { levels: Partial<Level>[], purchaseEvents: Partial<PurchaseEvent>[], accounts: Partial<Account>[] } {
  const levels: Partial<Level>[] = [];
  const purchaseEvents: Partial<PurchaseEvent>[] = [];
  const accounts: Partial<Account>[] = [];

  if (rows.length < 6) {
    return { levels, purchaseEvents, accounts };
  }

  const parseAccountRow = (row: any[], sessionCol = -1): Partial<Account> | null => {
    if (!row || row.length < 3) return null;
    const accountName = row[0] ? String(row[0]).trim() : '';
    if (!accountName) return null;

    const rawDate = row[1];
    // Pass rawDate directly so parseAccountDateStr handles Date objects,
    // D-MMM strings ("1-Jul"), and all other formats for every row.
    const parsedDateFromRaw = parseAccountDateStr(rawDate);

    const rawTime = row[2];
    const startTimeStr = rawTime instanceof Date
      ? `${String(rawTime.getHours()).padStart(2, '0')}:${String(rawTime.getMinutes()).padStart(2, '0')}:${String(rawTime.getSeconds()).padStart(2, '0')}`
      : rawTime ? String(rawTime).trim() : '';

    const account: Partial<Account> = {
      name: accountName,
      request_template: 'Needs to be filled in - imported from Excel export',
    };

    if (parsedDateFromRaw) account.start_date = parsedDateFromRaw;

    const parsedTime = parseTimeStr(startTimeStr || rawTime);
    if (parsedTime) account.start_time = parsedTime;

    if (sessionCol >= 0 && row.length > sessionCol && row[sessionCol] !== undefined && row[sessionCol] !== null) {
      const cell = String(row[sessionCol]).trim();
      if (cell !== '-' && cell !== '') {
        (account as any).sessionDate = cell;
      }
    }

    return account;
  };

  const parseLevelsAndEvents = (headerRows: any[][], branchName?: string): { groupLevels: Partial<Level>[], groupEvents: Partial<PurchaseEvent>[] } => {
    const groupLevels: Partial<Level>[] = [];
    const groupEvents: Partial<PurchaseEvent>[] = [];

    if (headerRows.length < 4) return { groupLevels, groupEvents };

    const maxCols = Math.max(...headerRows.map(r => r.length));
    let startCol = detectStartCol(headerRows, maxCols);

    for (let col = startCol; col < maxCols; col++) {
      const eventToken = String(headerRows[0]?.[col] ?? '').trim();
      const levelName = String(headerRows[1]?.[col] ?? '').trim();
      const daysOffsetStr = String(headerRows[2]?.[col] ?? '').trim();
      const timeSpentStr = String(headerRows[3]?.[col] ?? '').trim();

      if (!eventToken || eventToken.toLowerCase() === 'event token') continue;

      if (isPurchaseEvent(levelName, timeSpentStr)) {
        const pe: Partial<PurchaseEvent> = { event_token: eventToken, level_name: levelName !== '$$$' ? levelName : '', is_restricted: false };
        const parsed = parsePurchaseDaysOffset(daysOffsetStr);
        if (parsed.days_offset !== undefined) pe.days_offset = parsed.days_offset;
        if (parsed.max_days_offset !== undefined) pe.max_days_offset = parsed.max_days_offset;
        pe.is_restricted = parsed.is_restricted;
        (pe as any).branchName = branchName;
        groupEvents.push(pe);
      } else {
        const lvl: Partial<Level> = { event_token: eventToken, level_name: levelName };
        if (daysOffsetStr !== '-' && daysOffsetStr !== '') {
          const d = parseInt(daysOffsetStr, 10);
          if (!isNaN(d)) lvl.days_offset = d;
          else { const n = Number(daysOffsetStr); if (!isNaN(n) && isFinite(n)) lvl.days_offset = Math.floor(n); }
        }
        if (timeSpentStr !== '-' && timeSpentStr !== '') {
          const t = parseInt(timeSpentStr);
          if (!isNaN(t)) lvl.time_spent = t;
        } else {
          lvl.time_spent = lvl.time_spent || 0;
        }
        lvl.is_bonus = false;
        if (lvl.event_token && lvl.level_name && lvl.days_offset != null && lvl.time_spent != null) {
          (lvl as any).branchName = branchName;
          groupLevels.push(lvl);
        }
      }
    }

    return { groupLevels, groupEvents };
  };

  let i = 0;
  let currentBranchName: string | undefined;

  while (i < rows.length) {
    while (i < rows.length && (!rows[i] || rows[i].length === 0 || !rows[i][0])) {
      i++;
    }
    if (i >= rows.length) break;

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

    if (i + 5 > rows.length) break;

    const groupHeaders = rows.slice(i, i + 5);
    const hasToken = groupHeaders[0]?.some((v: any) => v && String(v).trim() && !String(v).toLowerCase().includes('event token'));
    if (!hasToken) { i++; continue; }

    const { groupLevels, groupEvents } = parseLevelsAndEvents(rows.slice(i, i + 4), currentBranchName);
    levels.push(...groupLevels);
    purchaseEvents.push(...groupEvents);

    let accountRowIdx = -1;
    for (let j = i + 4; j < Math.min(i + 10, rows.length); j++) {
      if (rows[j] && rows[j][0] && String(rows[j][0]).toLowerCase().includes('account')) {
        accountRowIdx = j;
        break;
      }
    }
    if (accountRowIdx === -1) { i += 5; continue; }

    const specialCols = detectSpecialColumns(rows[accountRowIdx]);
    const sessionCol = specialCols.sessionCol;

    let groupEnd = rows.length;
    for (let j = accountRowIdx + 1; j < rows.length; j++) {
      const r = rows[j];
      if (!r || r.length === 0) continue;
      if (String(r[0] ?? '').toLowerCase().startsWith('branch:')) {
        groupEnd = j;
        break;
      }
    }

    for (let j = accountRowIdx + 1; j < groupEnd; j++) {
      const account = parseAccountRow(rows[j], sessionCol);
      if (account) {
        (account as any).branchName = currentBranchName;
        accounts.push(account);
      }
    }

    i = groupEnd;
  }

  return { levels, purchaseEvents, accounts };
}
