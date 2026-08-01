// ===== Excel Column Builder Utilities =====

import type { Level, PurchaseEvent } from '@grq/api-bindings';
import {
  getRealTimelineLevels,
  getSyntheticSessionTimeSpent,
} from '../../utils/timeline-time.utils.ts';

export interface ColumnData {
  kind: 'level' | 'purchase';
  id: number | string;
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
 * Three request types model:
 * - "Session Only": a standalone Session ('-') whose base token has NO real
 *   Level Event anywhere in the branch. It is exported/imported as its own row.
 * - "Level Event (event + session)": a real Level Event. Its session is folded
 *   into the event — the event column represents the whole pair, so no separate
 *   Session Only row may exist for that base token.
 * - "Purchase Event (event + session)": handled by the purchase columns.
 *
 * A standalone Session ('-') is therefore only kept when its base token does
 * not belong to any real Level Event. This subsumes the same-(base, day) rule:
 * if a Session shares base + day with an event, its base already has an event.
 */
export function filterStandaloneSessionLevels(levels: Level[]): Level[] {
  return levels.filter((l) => {
    if (l.level_name !== '-') return true;
    const baseToken = l.event_token.split('_day')[0];
    return !levels.some(
      (other) =>
        other.id !== l.id &&
        other.level_name !== '-' &&
        other.event_token.split('_day')[0] === baseToken,
    );
  });
}

/**
 * Build the export columns for a given mode.
 *
 * - "event-only": only real Level Events and Purchase Events (no session rows).
 * - "all": matches the ALL-mode table exactly — real Level Events, EVERY
 *   persisted DB Session ('-') row (regardless of whether its base token also
 *   has a Level Event on some other day), PLUS synthesized "Session Only"
 *   columns for gap days that have NO persisted row, then purchases.
 *
 * Persisted '-' rows are kept with their REAL level id (NOT dropped/replaced by
 * a synthesized fake id) so progress records (`{account}_{level_id}`) resolve
 * and the export renders "(C)" on completed Session Only requests exactly like
 * the ALL-mode table does. Days that carry a real Level Event fold the session
 * into the event column (no separate Session Only column), mirroring the table.
 *
 * The gap-day synthesis replicates the UI timeline (AccountsDetail /
 * AccountDetail / GameDetail): min day is min(0, first real event), max day is
 * the last real event; each missing day gets a Session Only column whose token
 * is the first real event at or after that day and whose time comes from
 * getSyntheticSessionTimeSpent (progressive interpolation over real anchors).
 */
export function buildModeColumns(
  levels: Level[],
  purchaseEvents: PurchaseEvent[],
  mode: 'event-only' | 'all',
): ColumnData[] {
  // Level columns use ALL persisted levels (real events + every '-' session),
  // so completed sessions keep their real ids and their progress can resolve.
  // Only event-only mode narrows them down to real events below.
  const levelCols: ColumnData[] = levels.map((l) => ({
    kind: 'level' as const,
    id: l.id,
    token: l.event_token.split('_day')[0],
    fullToken: l.event_token,
    name: l.level_name,
    daysOffset: l.days_offset,
    timeSpent: l.time_spent,
    isBonus: l.is_bonus,
    uniqueKey: `${l.event_token}:${l.level_name === '-' ? 'Session Only' : 'Level Event'}`,
    // Session Only columns are always flagged synthetic so the export styles
    // them with the distinguishing color (lighter/darker blend) + italic font,
    // exactly like the ALL-mode table does. Real Level Events stay solid.
    synthetic: l.level_name === '-',
  }));

  const purchaseCols: ColumnData[] = purchaseEvents.map((p: PurchaseEvent) => {
    const isRestricted = (p as any).is_restricted ?? false;
    const base = (p as any).days_offset !== null && (p as any).days_offset !== undefined ? String((p as any).days_offset) : '-';
    let daysOffsetValue = base;
    if (isRestricted && p.max_days_offset != null) {
        daysOffsetValue = `${base} (Less Than ${p.max_days_offset})`;
    }

    return {
      kind: 'purchase' as const,
      id: p.id,
      token: p.event_token,
      fullToken: p.event_token,
      name: p.level_name || '$$$',
      uniqueKey: `${p.event_token}:Purchase Event`,
      isRestricted,
      daysOffset: daysOffsetValue,
      maxDaysOffset: String(p.max_days_offset),
      synthetic: false,
    };
  });

  const realEvents = levelCols
    .filter((c) => c.name !== '-')
    .sort((a, b) => Number(a.daysOffset ?? 0) - Number(b.daysOffset ?? 0));

  if (mode === 'event-only') {
    return [...realEvents, ...purchaseCols];
  }

  if (realEvents.length === 0) {
    return [...levelCols, ...purchaseCols];
  }

  const realLevelPoints = getRealTimelineLevels(
    realEvents.map((c) => ({
      daysOffset: Number(c.daysOffset ?? 0),
      timeSpent: Number(c.timeSpent ?? 0),
      levelName: c.name,
      token: c.token,
      synthetic: false,
    })),
  );

  const dbSessionsByDay = new Map<number, ColumnData>();
  levelCols
    .filter((c) => c.name === '-' && typeof c.daysOffset === 'number')
    .forEach((c) => {
      if (!dbSessionsByDay.has(Number(c.daysOffset))) {
        dbSessionsByDay.set(Number(c.daysOffset), c);
      }
    });

  const minDay = Math.min(0, Number(realEvents[0].daysOffset));
  const maxDay = Number(realEvents[realEvents.length - 1].daysOffset);

  const result: ColumnData[] = [];

  for (let day = minDay; day <= maxDay; day++) {
    const dayEvents = realEvents.filter((c) => Number(c.daysOffset) === day);
    if (dayEvents.length > 0) {
      result.push(...dayEvents);
      continue;
    }

    const existing = dbSessionsByDay.get(day);
    if (existing) {
      result.push(existing);
      continue;
    }

    const fallback = realEvents.find((c) => Number(c.daysOffset) >= day);
    if (!fallback) continue;

    const synthesizedTime = getSyntheticSessionTimeSpent(
      fallback.token,
      day,
      realLevelPoints,
      0,
    );

    result.push({
      kind: 'level',
      id: `synth-${fallback.token}-${day}`,
      token: fallback.token,
      fullToken: fallback.token,
      name: '-',
      daysOffset: day,
      timeSpent: synthesizedTime,
      isBonus: false,
      uniqueKey: `${fallback.token}:-`,
      synthetic: true,
    });
  }

  return [...result, ...purchaseCols];
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

