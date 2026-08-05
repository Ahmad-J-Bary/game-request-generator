import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildModeColumns } from './excel-column-builder.ts';
import { generateGameMatrixData } from './excel-export-sheet-builder.ts';
import { getCellStyle } from './excel-styling.ts';
import type { ExcelColorSettings } from '../../types/excel';

const colors: ExcelColorSettings = {
  levelBonus: 'rgb(120, 120, 120)',
  levelNormal: 'rgb(100, 100, 100)',
  purchaseRestricted: 'rgb(200, 60, 60)',
  purchaseUnrestricted: 'rgb(60, 200, 60)',
  headerColor: 'rgb(50, 50, 50)',
  dataRowColor: 'rgb(240, 240, 240)',
  incompleteScheduledStyle: 'rgb(255, 255, 255)',
  completeScheduledStyle: 'rgb(0, 255, 0)',
};

const level = (overrides: any = {}) => ({
  id: 1,
  game_id: 1,
  branch_id: 1,
  event_token: 'abc_day0',
  level_name: 'Level 1',
  days_offset: 0,
  time_spent: 100,
  is_bonus: false,
  ...overrides,
});

describe('generateGameMatrixData — ALL mode renders (C) on completed Session Only rows', () => {
  it('marks a completed persisted "-" gap-day session with (C), and leaves incomplete/unpersisted days unmarked', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0, time_spent: 100 }),
      level({ id: 2, event_token: 'abc_day5', level_name: 'Level 5', days_offset: 5, time_spent: 200 }),
      level({ id: 3, event_token: 'abc_day2', level_name: '-', days_offset: 2, time_spent: 90 }),
      level({ id: 4, event_token: 'abc_day4', level_name: '-', days_offset: 4, time_spent: 110 }),
    ];

    const columns = buildModeColumns(levels, [], 'all');

    const accounts = [
      { id: 10, name: 'Acc1', start_date: '2024-01-01', start_time: '00:00:00', game_id: 1, branch_id: 1 },
    ] as any[];

    // Only the persisted '-' level id 3 (day 2) is completed for account 10.
    const levelsProgress: Record<string, any> = {
      '10_3': { account_id: 10, level_id: 3, is_completed: true },
    };

    const { wsData } = generateGameMatrixData(
      levels as any,
      [] as any,
      accounts,
      columns,
      'vertical',
      colors,
      'light',
      getCellStyle as any,
      levelsProgress,
      {},
    );

    // Vertical layout: 5 header rows, then one account row.
    const accountRow = wsData[5];
    const cellValue = (colIdx: number): string => {
      const cell = accountRow[3 + colIdx];
      return typeof cell === 'object' && cell !== null && 'v' in cell ? String(cell.v) : String(cell);
    };
    const cellStyle = (colIdx: number): any => {
      const cell = accountRow[3 + colIdx];
      return typeof cell === 'object' && cell !== null && 's' in cell ? (cell as any).s : undefined;
    };

    // Column order: day0 event, synth day1, day2 persisted "-", synth day3, day4 persisted "-", day5 event.
    assert.deepEqual(
      columns.map((c) => c.id),
      [1, 'synth-abc-1', 3, 'synth-abc-3', 4, 2],
    );

    assert.strictEqual(columns[2].id, 3, 'completed gap-day session keeps its real level id');
    assert.ok(cellValue(2).includes('(C)'), `completed persisted Session Only day2 exports with (C): got "${cellValue(2)}"`);

    assert.ok(!cellValue(0).includes('(C)'), 'incomplete Level Event day0 has no (C)');
    assert.ok(!cellValue(1).includes('(C)'), 'unpersisted synthesized day1 has no (C)');
    assert.ok(!cellValue(3).includes('(C)'), 'unpersisted synthesized day3 has no (C)');
    assert.ok(!cellValue(4).includes('(C)'), 'persisted but NOT completed day4 has no (C)');
    assert.ok(!cellValue(5).includes('(C)'), 'incomplete Level Event day5 has no (C)');

    // Visual distinction: Session Only columns are styled with the synthetic
    // treatment (italic font), real Level Events are not.
    assert.ok(!cellStyle(0)?.font?.italic, 'Level Event day0 is not italic');
    assert.strictEqual(cellStyle(2)?.font?.italic, true, 'completed persisted Session Only day2 is italic');
    assert.strictEqual(cellStyle(4)?.font?.italic, true, 'incomplete persisted Session Only day4 is italic');
  });

  it('event-only mode exports no Session Only columns at all', () => {
    const levels = [
      level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0, time_spent: 100 }),
      level({ id: 2, event_token: 'abc_day5', level_name: 'Level 5', days_offset: 5, time_spent: 200 }),
      level({ id: 3, event_token: 'abc_day2', level_name: '-', days_offset: 2, time_spent: 90 }),
    ];

    const columns = buildModeColumns(levels, [], 'event-only');

    assert.deepEqual(
      columns.map((c) => ({ id: c.id, name: c.name })),
      [
        { id: 1, name: 'Level 1' },
        { id: 2, name: 'Level 5' },
      ],
    );
  });
});

describe('generateGameMatrixData — Time column mirrors History Report Dur. (ms)', () => {
  const levels = [
    level({ id: 1, event_token: 'abc_day0', level_name: 'Level 1', days_offset: 0, time_spent: 100 }),
    level({ id: 2, event_token: 'abc_day5', level_name: 'Level 5', days_offset: 5, time_spent: 200 }),
  ];

  const accounts = [
    { id: 10, name: 'Acc1', start_date: '2024-01-01', start_time: '00:00:00', game_id: 1, branch_id: 1 },
  ] as any[];

  const timeCellValue = (wsData: any[][]): any => {
    const accountRow = wsData[5];
    const cell = accountRow[accountRow.length - 1];
    return typeof cell === 'object' && cell !== null && 'v' in cell ? cell.v : cell;
  };

  it('exports the account last used time_spent from history as the Time column', () => {
    const columns = buildModeColumns(levels as any, [], 'all');
    const levelsProgress: Record<string, any> = {
      '10_1': { account_id: 10, level_id: 1, is_completed: true },
    };
    const taskHistory = [
      { id: 'last_10', accountId: 10, gameId: 1, eventToken: 'abc_day5', timeSpent: 123456, levelId: 2, isPurchase: false },
    ] as any;

    const { wsData } = generateGameMatrixData(
      levels as any,
      [] as any,
      accounts,
      columns,
      'vertical',
      colors,
      'light',
      getCellStyle as any,
      levelsProgress,
      {},
      undefined,
      taskHistory,
    );

    assert.strictEqual(timeCellValue(wsData), 123456, 'Time must mirror the history Dur. (ms) value');
  });

  it('uses history timeSpent even when it references a level other than the last completed event', () => {
    const columns = buildModeColumns(levels as any, [], 'all');
    // Last completed event by days_offset is level 2 (day5, time_spent 200),
    // but the account last used level 1's duration -> Time must be 777.
    const levelsProgress: Record<string, any> = {
      '10_1': { account_id: 10, level_id: 1, is_completed: true },
      '10_2': { account_id: 10, level_id: 2, is_completed: true },
    };
    const taskHistory = [
      { id: 'last_10', accountId: 10, gameId: 1, eventToken: 'abc_day0', timeSpent: 777, levelId: 1, isPurchase: false },
    ] as any;

    const { wsData } = generateGameMatrixData(
      levels as any,
      [] as any,
      accounts,
      columns,
      'vertical',
      colors,
      'light',
      getCellStyle as any,
      levelsProgress,
      {},
      undefined,
      taskHistory,
    );

    assert.strictEqual(timeCellValue(wsData), 777, 'Time must be the account last used time_spent, not the event static value');
  });

  it('falls back to the level time_spent when no history exists', () => {
    const columns = buildModeColumns(levels as any, [], 'all');
    const levelsProgress: Record<string, any> = {
      '10_1': { account_id: 10, level_id: 1, is_completed: true },
    };

    const { wsData } = generateGameMatrixData(
      levels as any,
      [] as any,
      accounts,
      columns,
      'vertical',
      colors,
      'light',
      getCellStyle as any,
      levelsProgress,
      {},
    );

    assert.strictEqual(timeCellValue(wsData), 100, 'without history, Time falls back to the last completed event time_spent');
  });
});
