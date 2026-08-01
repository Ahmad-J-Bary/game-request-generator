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
      time_spent: 243, // seconds (as returned by the Rust backend)
    },
  ],
  requestGroups: [
    {
      event_token: 'evt-1',
      time_spent: 243,
      requests: [],
    },
  ],
  targetDate: '2026-01-02',
  completedTasks: new Set<string>(),
  ...overrides,
});

const makeStartState = (overrides: any = {}) => ({
  accountId: 1,
  startTime: new Date(1000000).toISOString(), // consistent with the fake epochs used below
  firstRequestAllowedAt: 0,
  isInitialized: true,
  ...overrides,
});

const makeCompletionRecord = (overrides: any = {}) => ({
  accountId: 1,
  timeSpent: 243, // seconds (as stored in the completion record)
  completionTime: 1000000,
  levelId: 10,
  eventToken: 'evt-1',
  ...overrides,
});

// ===== First task readiness =====

describe('calculateTimerState — first task', () => {
  it('is ready immediately when the target time is in the past', () => {
    const now = 300000000; // startTime + timeSpent * 1000 long passed
    const startState = makeStartState();
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

  it('shows an initializing countdown until startTime + timeSpent * 1000', () => {
    const now = 1000000; // before startTime + timeSpent * 1000
    const startState = makeStartState();
    const expectedTarget = 1000000 + 243 * 1000;
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
    assert.strictEqual(state.remainingTime, 243);
    assert.strictEqual(state.comeBackTime!.getTime(), expectedTarget);
    // total wait (in seconds) = timeSpent (seconds)
    assert.strictEqual(state.totalWaitSec, 243);
  });

  it('targets startTime + timeSpent * 1000 regardless of firstRequestAllowedAt', () => {
    // Legacy v1.4.9 behavior: the timer never consults firstRequestAllowedAt,
    // so a stale or missing persisted value must not shift the countdown.
    const stale = makeStartState({ firstRequestAllowedAt: 1000000 + 243 * 1000 });
    const expectedTarget = 1000000 + 243 * 1000;
    const state = calculateTimerState(
      makeTask(),
      0,
      [],
      expectedTarget - 5000,
      {},
      { 1: stale },
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
      { 1: stale },
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

// ===== Session Only first task =====

describe('calculateTimerState — Session Only first task', () => {
  const makeSessionOnlyTask = (overrides: any = {}) =>
    makeTask({
      requests: [
        {
          event_token: 'evt-session',
          level_id: null,
          request_type: 'Session Only',
          time_spent: 243,
        },
      ],
      requestGroups: [
        {
          event_token: 'evt-session',
          time_spent: 243,
          requests: [],
        },
      ],
      ...overrides,
    });

  it('is not ready until startTime + timeSpent * 1000 (subject to the wait system)', () => {
    const startState = makeStartState();
    const now = 1000000; // before the target
    const state = calculateTimerState(
      makeSessionOnlyTask(),
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
    assert.strictEqual(state.isBlocked, false);
    assert.strictEqual(state.reason, 'initializing');
    assert.strictEqual(state.comeBackTime!.getTime(), 1000000 + 243 * 1000);

    const readyState = calculateTimerState(
      makeSessionOnlyTask(),
      0,
      [],
      1000000 + 243 * 1000 + 1000,
      {},
      { 1: startState },
      [],
      [],
      null,
    );
    assert.strictEqual(readyState.isReady, true);
  });

  it('respects the next-task countdown driven by a seconds-unit completion record', () => {
    const completionRecord = makeCompletionRecord({
      completionTime: 1000000,
      timeSpent: 243, // seconds
    });
    const task = makeSessionOnlyTask({
      requestGroups: [{ event_token: 'evt-session-2', time_spent: 300, requests: [] }],
    });
    const target = 1000000 + (300 - 243) * 1000;
    const notReady = calculateTimerState(
      task,
      0,
      [],
      1000000 + 10000,
      { 1: completionRecord },
      {},
      [],
      [],
      null,
    );
    assert.strictEqual(notReady.isReady, false);
    assert.strictEqual(notReady.comeBackTime!.getTime(), target);
    assert.strictEqual(notReady.totalWaitSec, 57);
  });
});

// ===== Subsequent task =====

describe('calculateTimerState — subsequent task', () => {
  it('waits for the diff between current and previous timeSpent after completion', () => {
    const completionTime = 1000000;
    const completionRecord = makeCompletionRecord({
      completionTime,
      timeSpent: 243, // seconds
    });
    const task = makeTask({ requestGroups: [{ event_token: 'evt-2', time_spent: 300, requests: [] }] });

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
    // total wait (in seconds) = 300 - 243 = 57
    assert.strictEqual(notReady.totalWaitSec, 57);

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
      timeSpent: 300, // seconds
    });
    const task = makeTask({ requestGroups: [{ event_token: 'evt-2', time_spent: 243, requests: [] }] });
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
    assert.strictEqual(state.totalWaitSec, 0);
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
    assert.strictEqual(state.totalWaitSec, 3600);
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
