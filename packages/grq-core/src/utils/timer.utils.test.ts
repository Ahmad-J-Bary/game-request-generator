import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateTimerState, formatRemainingTime } from './timer.utils.ts';

// ===== Helpers =====

const makeTask = (overrides: any = {}) => ({
  account: {
    id: 1,
    game_id: 100,
    start_date: '2026-01-01',
    start_time: '00:00',
  },
  requests: [
    {
      event_token: 'evt-1',
      level_id: 10,
      request_type: 'Session',
      time_spent: 243000, // ms (as returned by the Rust backend)
    },
  ],
  requestGroups: [
    {
      event_token: 'evt-1',
      time_spent: 243000,
      requests: [],
    },
  ],
  targetDate: '2026-01-02',
  completedTasks: new Set<string>(),
  ...overrides,
});

const makeStartState = (overrides: any = {}) => ({
  accountId: 1,
  startTime: '2026-01-01 00:00',
  firstRequestAllowedAt: 0,
  isInitialized: true,
  ...overrides,
});

const makeCompletionRecord = (overrides: any = {}) => ({
  accountId: 1,
  timeSpent: 243000,
  completionTime: 1000000,
  levelId: 10,
  eventToken: 'evt-1',
  ...overrides,
});

// ===== First task readiness =====

describe('calculateTimerState — first task', () => {
  it('is ready immediately when firstRequestAllowedAt is in the past', () => {
    const now = 2000000; // startTime + firstTaskTimeSpent (243s) long passed
    const startState = makeStartState({ firstRequestAllowedAt: 1000000 + 243000 });
    const state = calculateTimerState(
      makeTask(),
      0,
      [],
      now,
      {},
      { 1: startState },
      [],
      [],
      null,
    );
    assert.strictEqual(state.isReady, true);
    assert.strictEqual(state.isBlocked, false);
    assert.strictEqual(state.reason, 'ready');
  });

  it('shows an initializing countdown when the account has not started yet', () => {
    const now = 1000000; // before startTime + timeSpent
    const startState = makeStartState({ firstRequestAllowedAt: 1000000 + 243000 });
    const state = calculateTimerState(
      makeTask(),
      0,
      [],
      now,
      {},
      { 1: startState },
      [],
      [],
      null,
    );
    assert.strictEqual(state.isReady, false);
    assert.strictEqual(state.reason, 'initializing');
    assert.ok(state.remainingTime > 0);
    assert.strictEqual(state.comeBackTime!.getTime(), 1000000 + 243000);
  });

  it('falls back to startTime + timeSpent when firstRequestAllowedAt is missing', () => {
    const startState = makeStartState({
      firstRequestAllowedAt: 0,
      startTime: '2026-01-01 00:00',
    });
    // parsedStart = Date.parse('2026-01-01 00:00') ms; add task timeSpent (243000 ms)
    const parsedStart = new Date('2026-01-01 00:00').getTime();
    const expectedTarget = parsedStart + 243000;
    const state = calculateTimerState(
      makeTask(),
      0,
      [],
      expectedTarget - 5000,
      {},
      { 1: startState },
      [],
      [],
      null,
    );
    assert.strictEqual(state.isReady, false);
    assert.strictEqual(state.comeBackTime!.getTime(), expectedTarget);

    const readyState = calculateTimerState(
      makeTask(),
      0,
      [],
      expectedTarget + 5000,
      {},
      { 1: startState },
      [],
      [],
      null,
    );
    assert.strictEqual(readyState.isReady, true);
  });

  it('is ready immediately when there is no start state at all', () => {
    const state = calculateTimerState(
      makeTask(),
      0,
      [],
      2000000,
      {},
      {},
      [],
      [],
      null,
    );
    assert.strictEqual(state.isReady, true);
  });
});

// ===== Subsequent task =====

describe('calculateTimerState — subsequent task', () => {
  it('waits for the diff between current and previous timeSpent after completion', () => {
    const completionTime = 1000000;
    const completionRecord = makeCompletionRecord({
      completionTime,
      timeSpent: 243000, // ms
    });
    const task = makeTask({ requestGroups: [{ event_token: 'evt-2', time_spent: 300000, requests: [] }] });

    const target = completionTime + (300 - 243) * 1000; // 57s wait
    const notReady = calculateTimerState(
      task,
      0,
      [],
      completionTime + 10000,
      { 1: completionRecord },
      {},
      [],
      [],
      null,
    );
    assert.strictEqual(notReady.isReady, false);
    assert.strictEqual(notReady.comeBackTime!.getTime(), target);

    const ready = calculateTimerState(
      task,
      0,
      [],
      target + 1000,
      { 1: completionRecord },
      {},
      [],
      [],
      null,
    );
    assert.strictEqual(ready.isReady, true);
  });

  it('is ready immediately when current task timeSpent is not greater than previous', () => {
    const completionRecord = makeCompletionRecord({
      completionTime: 1000000,
      timeSpent: 300000,
    });
    const task = makeTask({ requestGroups: [{ event_token: 'evt-2', time_spent: 243000, requests: [] }] });
    const state = calculateTimerState(
      task,
      0,
      [],
      1005000,
      { 1: completionRecord },
      {},
      [],
      [],
      null,
    );
    assert.strictEqual(state.isReady, true);
  });
});

// ===== Blocked by previous =====

describe('calculateTimerState — sequential dependency', () => {
  it('is blocked while the previous task is incomplete', () => {
    const previousTask = makeTask({ completedTasks: new Set<string>() }); // nothing completed
    const state = calculateTimerState(
      makeTask(),
      0,
      [],
      2000000,
      {},
      {},
      [],
      [],
      previousTask,
    );
    assert.strictEqual(state.isBlocked, true);
    assert.strictEqual(state.isReady, false);
    assert.strictEqual(state.reason, 'blocked');
  });

  it('is not blocked when the previous task is completed', () => {
    const previousTask = makeTask({ completedTasks: new Set<string>(['0']) });
    const state = calculateTimerState(
      makeTask(),
      0,
      [],
      2000000,
      {},
      {},
      [],
      [],
      previousTask,
    );
    assert.strictEqual(state.isBlocked, false);
  });
});

// ===== Global cooldown =====

describe('calculateTimerState — global 1h cooldown', () => {
  it('applies cooldown when another account completed the same level within the last hour', () => {
    const now = 2000000;
    const completedTasks = [
      {
        accountId: 999,
        gameId: 100,
        levelId: 10,
        eventToken: 'evt-other',
        completionTime: now - 60 * 1000, // 59 min ago
      },
    ];
    const state = calculateTimerState(
      makeTask(),
      0,
      [],
      now,
      {},
      {},
      completedTasks,
      [],
      null,
    );
    assert.strictEqual(state.isReady, false);
    assert.strictEqual(state.reason, 'cooldown');
    assert.ok(state.remainingTime >= 3540); // ~59 min remain
  });

  it('is ready when the same-level completion is older than one hour', () => {
    const now = 2000000;
    const completedTasks = [
      {
        accountId: 999,
        gameId: 100,
        levelId: 10,
        eventToken: 'evt-other',
        completionTime: now - 61 * 60 * 1000,
      },
    ];
    const state = calculateTimerState(
      makeTask(),
      0,
      [],
      now,
      {},
      {},
      completedTasks,
      [],
      null,
    );
    assert.strictEqual(state.isReady, true);
  });
});

// ===== Formatting =====

describe('formatRemainingTime', () => {
  it('formats zero as "0s"', () => {
    assert.strictEqual(formatRemainingTime(0), '0s');
    assert.strictEqual(formatRemainingTime(-5), '0s');
  });

  it('formats plain seconds', () => {
    assert.strictEqual(formatRemainingTime(45), '45s');
  });

  it('formats minutes and seconds', () => {
    assert.strictEqual(formatRemainingTime(243), '4m 3s');
  });

  it('formats hours, minutes and seconds', () => {
    assert.strictEqual(formatRemainingTime(3661), '1h 1m 1s');
  });
});
