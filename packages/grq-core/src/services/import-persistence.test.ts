import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TauriService } from './tauri.service.ts';
import { applySessionCompletionPerAccount } from './import-persistence.service.ts';

// ===== TauriService mocking =====
let createLevelProgressCalls: any[];
let updateLevelProgressCalls: any[];
let logMaintenanceEventCalls: any[];

interface MockLevel {
  id: number;
  game_id: number;
  branch_id: number;
  level_name: string;
  event_token: string;
  days_offset: number | null;
  time_spent: number;
  is_bonus: boolean;
}

function installMocks(opts: {
  levels: MockLevel[];
  progress?: { level_id: number; is_completed: boolean }[];
  startTime?: string;
}) {
  createLevelProgressCalls = [];
  updateLevelProgressCalls = [];
  logMaintenanceEventCalls = [];
  (TauriService as any).getAccountById = async () => ({
    id: 100,
    branch_id: 10,
    start_date: '2025-01-01',
    start_time: opts.startTime || '00:00:00',
  });
  (TauriService as any).getGameLevels = async () => opts.levels;
  (TauriService as any).getAccountLevelProgress = async () => opts.progress || [];
  (TauriService as any).createLevelProgress = async (req: any) => {
    createLevelProgressCalls.push(req);
    return 1;
  };
  (TauriService as any).updateLevelProgress = async (req: any) => {
    updateLevelProgressCalls.push(req);
    return true;
  };
  (TauriService as any).logMaintenanceEvent = async (req: any) => {
    logMaintenanceEventCalls.push(req);
  };
}

function realLevel(id: number, day: number, timeSpent = 1): MockLevel {
  return {
    id,
    game_id: 1,
    branch_id: 10,
    level_name: `Level ${day}`,
    event_token: `lvl_day${day}`,
    days_offset: day,
    time_spent: timeSpent,
    is_bonus: false,
  };
}

function sessionLevel(id: number, day: number): MockLevel {
  return {
    id,
    game_id: 1,
    branch_id: 10,
    level_name: '-',
    event_token: `lvl_day${day}`,
    days_offset: day,
    time_spent: 500,
    is_bonus: false,
  };
}

// Builds the ImportCache/ImportData/PersistenceResult shape the pass consumes.
// Account 100 resolves via TauriService.getAccountById (branch 10, 2025-01-01).
function buildContext(accountHasSessionDate: boolean, purchaseTokens: string[] = []) {
  const cache: any = {
    gameCache: { testgame: 1 },
    accountCache: { '1_acc': 100 },
  };
  const data: any = {
    levels: [],
    purchaseEvents: purchaseTokens.map(t => ({ event_token: t })),
    accounts: [
      {
        name: 'Acc',
        gameName: 'TestGame',
        start_date: '2025-01-01',
        sessionDate: accountHasSessionDate ? '3-Jan' : undefined,
      },
    ],
    progress: [],
    accountSessionDates: new Map(),
  };
  const result: any = { importedCount: 0, errors: [] };
  return { cache, data, result };
}

// Resolves the update call for a given session level id (if any).
function updateFor(levelId: number): any | undefined {
  return updateLevelProgressCalls.find(
    (u: any) => u.level_id === levelId && u.is_completed === true,
  );
}

beforeEach(() => {
  createLevelProgressCalls = [];
  updateLevelProgressCalls = [];
  logMaintenanceEventCalls = [];
});

describe('applySessionCompletionPerAccount — precise temporal sandwich rule', () => {
  it('completes a Session Only level in the strict gap between two completed (C) Level Events, no Session date needed', async () => {
    // Events: day 0 [Jan1 00:00, 00:16], day 10 [Jan11 00:00, 00:16]. Session day 5 = Jan6 00:00.
    installMocks({
      levels: [realLevel(1, 0), sessionLevel(2, 5), realLevel(3, 10)],
      progress: [
        { level_id: 1, is_completed: true },
        { level_id: 3, is_completed: true },
      ],
    });
    // No sessionDate on the account → picked up by catch-all (pass 2), completed purely via sandwich.
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    assert.ok(updateFor(2), 'Session Only day 5 completed (end(day0) < Jan6 < start(day10))');
    assert.ok(!updateFor(1), 'Level Event day 0 not touched by this pass');
    assert.ok(!updateFor(3), 'Level Event day 10 not touched by this pass');
    assert.strictEqual(result.errors.length, 0, 'no errors');
  });

  it('does NOT complete when only one bounding Level Event is completed', async () => {
    installMocks({
      levels: [realLevel(1, 0), sessionLevel(2, 5), realLevel(3, 10)],
      progress: [{ level_id: 1, is_completed: true }],
    });
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    assert.ok(!updateFor(2), 'Session Only day 5 NOT completed (no completed event after it)');
  });

  it('does NOT complete before the first or after the last completed Level Event', async () => {
    installMocks({
      levels: [
        sessionLevel(1, -1),
        realLevel(2, 0),
        realLevel(3, 10),
        sessionLevel(4, 11),
      ],
      progress: [
        { level_id: 2, is_completed: true },
        { level_id: 3, is_completed: true },
      ],
    });
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    assert.ok(!updateFor(1), 'Session Only day -1 NOT completed (no completed event before it)');
    assert.ok(!updateFor(4), 'Session Only day 11 NOT completed (no completed event after it)');
  });

  it('does NOT complete when the session is exactly AT a completed event end (strict end < X)', async () => {
    // E1 day 0 with time_spent 0 → window [Jan1 00:00, Jan1 00:00]. Session day 0 has X = Jan1 00:00.
    installMocks({
      levels: [realLevel(1, 0, 0), sessionLevel(2, 0), realLevel(3, 10, 0)],
      progress: [
        { level_id: 1, is_completed: true },
        { level_id: 3, is_completed: true },
      ],
    });
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    assert.ok(!updateFor(2), 'Session X === end(E1) is not strictly after E1 end → NOT sandwiched');
  });

  it('does NOT complete a session that overlaps a completed event window, even if day-wise between', async () => {
    // start_time 06:00; E1 day 0 time_spent 100 → end Jan2 09:46 (spans into day 1).
    // Session day 1 X = Jan2 06:00 < end(E1) → overlaps, not in the strict gap.
    installMocks({
      startTime: '06:00:00',
      levels: [realLevel(1, 0, 100), sessionLevel(2, 1), realLevel(3, 10, 1)],
      progress: [
        { level_id: 1, is_completed: true },
        { level_id: 3, is_completed: true },
      ],
    });
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    assert.ok(!updateFor(2), 'Session day 1 overlaps E1 window → NOT sandwiched');
  });

  it('keeps the Session cutoff working (OR semantics)', async () => {
    installMocks({
      levels: [sessionLevel(1, 2)],
      progress: [],
    });
    const { cache, data, result } = buildContext(true);

    await applySessionCompletionPerAccount(cache, new Map([['100', '3-Jan']]), data, result);

    assert.ok(updateFor(1), 'Session Only day 2 completed by Session cutoff (3-Jan <= 3-Jan)');
  });

  it('completes by sandwich even when the Session cutoff would NOT', async () => {
    installMocks({
      levels: [realLevel(1, 0), sessionLevel(2, 5), realLevel(3, 10)],
      progress: [
        { level_id: 1, is_completed: true },
        { level_id: 3, is_completed: true },
      ],
    });
    const { cache, data, result } = buildContext(true);

    await applySessionCompletionPerAccount(cache, new Map([['100', '1-Jan']]), data, result);

    assert.ok(updateFor(2), 'Session Only day 5 completed via sandwich despite being after the Session cutoff');
  });

  it('skips Session Only levels that are already completed', async () => {
    installMocks({
      levels: [realLevel(1, 0), sessionLevel(2, 5), realLevel(3, 10)],
      progress: [
        { level_id: 1, is_completed: true },
        { level_id: 3, is_completed: true },
        { level_id: 2, is_completed: true },
      ],
    });
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    assert.strictEqual(updateLevelProgressCalls.length, 0, 'no updates issued (already completed)');
  });

  it('writes trace logs for completed AND skipped classifications with reasons', async () => {
    installMocks({
      levels: [
        realLevel(1, 0),
        sessionLevel(2, 5),
        realLevel(3, 10),
        sessionLevel(4, 11),
      ],
      progress: [
        { level_id: 1, is_completed: true },
        { level_id: 3, is_completed: true },
      ],
    });
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    const completed = logMaintenanceEventCalls.filter((l: any) => l.action === 'session_only_completed');
    const skipped = logMaintenanceEventCalls.filter((l: any) => l.action === 'session_only_skipped');

    assert.ok(completed.length >= 1, 'completed classification logged');
    const done = completed.find((l: any) => l.levelId === 2);
    assert.ok(done, 'day 5 logged as completed');
    assert.ok(done.reason && done.reason.includes('sandwich'), `reason describes sandwich: ${done.reason}`);
    assert.ok(done.detail, 'detail JSON present');
    const detail = JSON.parse(done.detail);
    assert.strictEqual(detail.sandwiched, true, 'detail marks sandwiched');

    assert.ok(skipped.length >= 1, 'skipped classification logged');
    const notDone = skipped.find((l: any) => l.levelId === 4);
    assert.ok(notDone, 'day 11 logged as skipped');
    assert.ok(notDone.reason.includes('not between'), `reason explains skip: ${notDone.reason}`);
  });

  it('completes session-only rows without errors even when purchase events are present', async () => {
    installMocks({
      levels: [realLevel(1, 0), sessionLevel(2, 5), realLevel(3, 10)],
      progress: [
        { level_id: 1, is_completed: true },
        { level_id: 3, is_completed: true },
      ],
    });
    const { cache, data, result } = buildContext(false, ['pev_day3', 'pev_day7']);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    assert.ok(updateFor(2), 'session-only still completed alongside purchase events');
    assert.strictEqual(result.errors.length, 0, 'no import errors');
  });
});
