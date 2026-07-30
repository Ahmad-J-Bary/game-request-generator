// ===== Simple Excel Parsers (standalone sheets: Levels, Purchase Events, Accounts) =====

import type { Level, PurchaseEvent, Account } from '@grq/api-bindings';

export function parseLevelsData(rows: any[][]): Partial<Level>[] {
  if (rows.length < 2) return [];

  const levels: Partial<Level>[] = [];
  const headers = rows[0];

  const eventTokenIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('event token'));
  const levelNameIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('level name'));
  const daysOffsetIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('days offset'));
  const timeSpentIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('time spent'));
  const isBonusIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('bonus'));

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const level: Partial<Level> = {};

    if (eventTokenIndex >= 0 && row[eventTokenIndex]) {
      level.event_token = row[eventTokenIndex].toString();
    }

    if (levelNameIndex >= 0 && row[levelNameIndex]) {
      level.level_name = row[levelNameIndex].toString();
    }

    if (daysOffsetIndex >= 0 && row[daysOffsetIndex] !== undefined) {
      const daysOffset = parseInt(row[daysOffsetIndex].toString());
      if (!isNaN(daysOffset)) {
        level.days_offset = daysOffset;
      }
    }

    if (timeSpentIndex >= 0 && row[timeSpentIndex] !== undefined) {
      const timeSpent = parseInt(row[timeSpentIndex].toString());
      if (!isNaN(timeSpent)) {
        level.time_spent = timeSpent;
      }
    }

    if (isBonusIndex >= 0 && row[isBonusIndex] !== undefined) {
      level.is_bonus = row[isBonusIndex]?.toString().toLowerCase() === 'yes' ||
        row[isBonusIndex]?.toString().toLowerCase() === 'true' ||
        row[isBonusIndex] === 1;
    }

    if (level.event_token) {
      levels.push(level);
    }
  }

  return levels;
}

export function parsePurchaseEventsData(rows: any[][]): Partial<PurchaseEvent>[] {
  if (rows.length < 2) return [];

  const events: Partial<PurchaseEvent>[] = [];
  const headers = rows[0];

  const eventTokenIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('event token'));
  const isRestrictedIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('restricted'));
  const maxDaysOffsetIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('max days'));

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const event: Partial<PurchaseEvent> = {};

    if (eventTokenIndex >= 0 && row[eventTokenIndex]) {
      event.event_token = row[eventTokenIndex].toString();
    }

    if (isRestrictedIndex >= 0 && row[isRestrictedIndex] !== undefined) {
      event.is_restricted = row[isRestrictedIndex]?.toString().toLowerCase() === 'yes' ||
        row[isRestrictedIndex]?.toString().toLowerCase() === 'true' ||
        row[isRestrictedIndex] === 1;
    }

    if (maxDaysOffsetIndex >= 0 && row[maxDaysOffsetIndex] !== undefined) {
      const maxDays = parseInt(row[maxDaysOffsetIndex].toString());
      if (!isNaN(maxDays)) {
        event.max_days_offset = maxDays;
      }
    }

    if (event.event_token) {
      events.push(event);
    }
  }

  return events;
}

export function parseAccountsData(rows: any[][]): Partial<Account>[] {
  if (rows.length < 2) return [];

  const accounts: Partial<Account>[] = [];
  const headers = rows[0];

  const nameIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('account'));
  const startDateIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('start date'));
  const startTimeIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('start time'));
  const gameIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('game'));

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const account: Partial<Account> = {};

    if (nameIndex >= 0 && row[nameIndex]) {
      account.name = row[nameIndex].toString();
    }

    if (startDateIndex >= 0 && row[startDateIndex]) {
      account.start_date = row[startDateIndex].toString();
    }

    if (startTimeIndex >= 0 && row[startTimeIndex]) {
      account.start_time = row[startTimeIndex].toString();
    }

    if (gameIndex >= 0 && row[gameIndex]) {
      (account as any)._gameName = row[gameIndex].toString();
    }

    if (account.name) {
      accounts.push(account);
    }
  }

  return accounts;
}
