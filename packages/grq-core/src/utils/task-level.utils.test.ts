import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  taskLevelOf,
  buildLevelBatches,
  buildEffectiveTaskLevelMap,
  applyStageReorderingRules,
} from './task-level.utils.ts';
import type { DailyTask } from '@grq/api-bindings';

const makeTask = (accountId: number, gameId: number, dayIndex: number, total: number, state?: string): DailyTask => ({
  account: { id: accountId, game_id: gameId, name: `Acc${accountId}`, proxy_state: state } as any,
  requests: [{ day_index: dayIndex }] as any,
  targetDate: '2024-01-03',
  completedTasks: new Set<string>(),
  dayTotalTasks: total,
});

describe('applyStageReorderingRules', () => {
  it('does NOT reorder a stage when all previous stages in current order are completed (in-order)', () => {
    const items = [
      { id: 1, isCompleted: true },
      { id: 2, isCompleted: true },
      { id: 3, isCompleted: true },
      { id: 4, isCompleted: false },
    ];
    const reordered = applyStageReorderingRules(items, (x) => x.isCompleted);
    assert.deepEqual(
      reordered.map((x) => x.id),
      [1, 2, 3, 4],
    );
  });

  it('moves an out-of-order completed stage to right after the last completed stage in the current order', () => {
    const items = [
      { id: 1, isCompleted: true },
      { id: 2, isCompleted: true },
      { id: 3, isCompleted: false },
      { id: 4, isCompleted: false },
      { id: 5, isCompleted: true }, // completed out-of-order while 3 & 4 are pending
    ];
    const reordered = applyStageReorderingRules(items, (x) => x.isCompleted);
    // 5 should be moved to after 2 (since 1 & 2 are completed, and 3 is pending)
    assert.deepEqual(
      reordered.map((x) => x.id),
      [1, 2, 5, 3, 4],
    );
  });

  it('evaluates using the latest/current order, placing subsequent out-of-order completions sequentially', () => {
    const items = [
      { id: 1, isCompleted: true },
      { id: 2, isCompleted: false },
      { id: 3, isCompleted: true },
      { id: 4, isCompleted: true },
    ];
    const reordered = applyStageReorderingRules(items, (x) => x.isCompleted);
    // 3 and 4 move to after 1 because 2 is pending
    assert.deepEqual(
      reordered.map((x) => x.id),
      [1, 3, 4, 2],
    );
  });
});

describe('taskLevelOf', () => {
  it('classifies n === 1 as first', () => {
    assert.equal(taskLevelOf(1, 5), 'first');
    assert.equal(taskLevelOf(1, 1), 'first');
  });

  it('classifies middle cards as middle', () => {
    assert.equal(taskLevelOf(2, 5), 'middle');
    assert.equal(taskLevelOf(4, 5), 'middle');
    assert.equal(taskLevelOf(3, 5), 'middle');
  });

  it('classifies n === N (N > 1) as last', () => {
    assert.equal(taskLevelOf(5, 5), 'last');
    assert.equal(taskLevelOf(3, 3), 'last');
    assert.equal(taskLevelOf(2, 2), 'last');
  });

  it('handles a single-card day (N === 1) as first', () => {
    assert.equal(taskLevelOf(1, 1), 'first');
  });

  it('falls back to middle for missing values', () => {
    assert.equal(taskLevelOf(undefined, 5), 'middle');
    assert.equal(taskLevelOf(1, undefined), 'middle');
    assert.equal(taskLevelOf(null, null), 'middle');
    assert.equal(taskLevelOf(undefined, undefined), 'middle');
  });
});

describe('buildLevelBatches', () => {
  it('builds one task-per-game diversity batches', () => {
    const batches = buildLevelBatches([
      makeTask(1, 1, 1, 5),
      makeTask(2, 1, 3, 5),
      makeTask(3, 2, 1, 5),
      makeTask(4, 2, 2, 5),
    ]);

    assert.equal(batches.length, 2);
    assert.deepEqual(
      batches[0].tasks.map((t) => t.account.id),
      [1, 3],
    );
    assert.deepEqual(
      batches[1].tasks.map((t) => t.account.id),
      [2, 4],
    );
  });

  it('numbers batches sequentially starting at 0', () => {
    const batches = buildLevelBatches([
      makeTask(1, 1, 1, 5),
      makeTask(2, 2, 2, 5),
    ]);
    assert.deepEqual(batches.map((b) => b.batchIndex), [0]);
  });

  it('continues numbering from the given offset (global sequence)', () => {
    const first = buildLevelBatches(
      [makeTask(1, 1, 1, 5), makeTask(2, 2, 2, 5)],
      0,
    );
    const second = buildLevelBatches(
      [makeTask(3, 1, 3, 5), makeTask(4, 2, 4, 5)],
      first.length,
    );
    assert.deepEqual(first.map((b) => b.batchIndex), [0]);
    assert.deepEqual(second.map((b) => b.batchIndex), [1]);
  });

  it('groups tasks by region before batching (preserves region ordering)', () => {
    const batches = buildLevelBatches([
      makeTask(1, 1, 1, 5, 'FLORIDA'),
      makeTask(2, 2, 1, 5, 'FLORIDA'),
      makeTask(3, 1, 1, 5, 'CALIFORNIA'),
      makeTask(4, 2, 1, 5, 'CALIFORNIA'),
    ]);

    // One batch per region, in first-seen region order.
    assert.deepEqual(
      batches[0].tasks.map((t) => t.account.name),
      ['Acc1', 'Acc2'],
    );
    assert.deepEqual(
      batches[1].tasks.map((t) => t.account.name),
      ['Acc3', 'Acc4'],
    );
  });

  it('returns an empty array for no tasks', () => {
    assert.deepEqual(buildLevelBatches([]), []);
  });
});

describe('buildEffectiveTaskLevelMap', () => {
  it('keeps active task in level "first" when prior tasks are completed', () => {
    const t1 = makeTask(1, 1, 1, 3);
    const t2 = makeTask(1, 1, 2, 3);
    const t3 = makeTask(1, 1, 3, 3);

    // Initially none completed
    let map = buildEffectiveTaskLevelMap([t1, t2, t3]);
    assert.equal(map.get(t1), 'first');
    assert.equal(map.get(t2), 'middle');
    assert.equal(map.get(t3), 'last');

    // Mark t1 completed
    t1.completedTasks.add('0');

    map = buildEffectiveTaskLevelMap([t1, t2, t3]);
    // t2 is now the first active task for account 1, so it gets 'first'
    assert.equal(map.get(t2), 'first');
    assert.equal(map.get(t3), 'last');

    // Mark t2 completed
    t2.completedTasks.add('0');

    map = buildEffectiveTaskLevelMap([t1, t2, t3]);
    // t3 is now the first active task for account 1, so it gets 'first'
    assert.equal(map.get(t3), 'first');
  });
});
