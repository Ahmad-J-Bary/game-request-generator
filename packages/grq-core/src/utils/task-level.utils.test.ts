import { describe, it } from 'node:test';
import assert from 'node:assert';
import { taskLevelOf, buildLevelBatches } from './task-level.utils.ts';
import type { DailyTask } from '@grq/api-bindings';

const makeTask = (accountId: number, gameId: number, dayIndex: number, total: number, state?: string): DailyTask => ({
  account: { id: accountId, game_id: gameId, name: `Acc${accountId}`, proxy_state: state } as any,
  requests: [{ day_index: dayIndex }] as any,
  targetDate: '2024-01-03',
  completedTasks: new Set<string>(),
  dayTotalTasks: total,
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
