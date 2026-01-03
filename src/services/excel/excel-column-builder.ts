// ===== Excel Column Builder Utilities =====

import type { Level, PurchaseEvent } from '../../types';

export interface ColumnData {
  kind: 'level' | 'purchase';
  id: number;
  token: string;
  fullToken: string; // The complete event token for accurate matching
  name: string;
  daysOffset?: number | string | null;
  timeSpent?: number | string | null;
  isBonus?: boolean;
  isRestricted?: boolean;
  maxDaysOffset?: string;
  uniqueKey: string; // Combination of token and name for unique identification (e.g., "7bqez2:-")
  synthetic?: boolean;
}

/**
 * Build columns array from levels and purchase events
 */
export function buildColumns(levels: Level[], purchaseEvents: PurchaseEvent[]): ColumnData[] {
  const levelCols: ColumnData[] = levels.map((l) => ({
    kind: 'level' as const,
    id: l.id,
    token: l.event_token,
    fullToken: l.event_token,
    name: l.level_name,
    daysOffset: l.days_offset,
    timeSpent: l.time_spent,
    isBonus: l.is_bonus,
    uniqueKey: `${l.event_token}:${l.level_name === '-' ? 'Session Only' : 'Level Event'}`,
    synthetic: false,
  }));

  const peCols: ColumnData[] = purchaseEvents.map((p: PurchaseEvent) => ({
    kind: 'purchase' as const,
    id: p.id,
    token: p.event_token,
    fullToken: p.event_token,
    name: '$$$',
    uniqueKey: `${p.event_token}:Purchase Event`,
    isRestricted: (p as any).is_restricted ?? false,
    maxDaysOffset: p.max_days_offset != null ? `Less Than ${p.max_days_offset}` : '-',
    synthetic: false,
  }));

  return [...levelCols, ...peCols];
}

/**
 * Create date matrix for accounts and columns
 */
export function createDateMatrix(
  accounts: Array<{ start_date?: string }>,
  columns: ColumnData[],
  formatDateShort: (dateStr?: string) => string,
  parseDate: (input?: string) => Date | null,
  addDays: (date: Date, days: number) => Date
): string[][] {
  return accounts.map((acc) => {
    const start = parseDate(acc.start_date);
    return columns.map((c) => {
      if (c.kind === 'level' && start && c.daysOffset != null) {
        const offset = typeof c.daysOffset === 'number' ? c.daysOffset : 0;
        return formatDateShort(addDays(start, offset).toISOString().split('T')[0]);
      }
      return '-';
    });
  });
}

/**
 * Get column style based on column type and properties
 */
export function getColumnStyle(
  kind: 'level' | 'purchase',
  isBonus: boolean | undefined,
  isRestricted: boolean | undefined,
  isSynthetic: boolean | undefined,
  isHeader: boolean,
  getCellStyle: (backgroundColor: string, theme: 'light' | 'dark', isHeader: boolean, isSynthetic: boolean) => any,
  colorSettings: {
    levelBonus: string;
    levelNormal: string;
    purchaseRestricted: string;
    purchaseUnrestricted: string;
  },
  theme: 'light' | 'dark' = 'light'
): any {
  let backgroundColor: string;
  if (kind === 'level') {
    backgroundColor = isBonus ? colorSettings.levelBonus : colorSettings.levelNormal;
  } else {
    backgroundColor = isRestricted ? colorSettings.purchaseRestricted : colorSettings.purchaseUnrestricted;
  }
  return getCellStyle(backgroundColor, theme, isHeader, isSynthetic ?? false);
}

