import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TauriService } from './tauri.service.ts';
import { applySessionCompletionPerAccount } from './import-persistence.service.ts';

// ===== TauriService mocking =====
let createLevelProgressCalls: any[];
let updateLevelProgressCalls: any[];
let logMaintenanceEventCalls: any[];
let addLevelCalls: any[];
let nextLevelId = 1000;

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
  gameId?: number;
}) {
  createLevelProgressCalls = [];
  updateLevelProgressCalls = [];
  logMaintenanceEventCalls = [];
  addLevelCalls = [];
  nextLevelId = 1000;
  (TauriService as any).getAccountById = async () => ({
    id: 100,
    branch_id: 10,
    start_date: '2025-01-01',
    start_time: opts.startTime || '00:00:00',
    ...(opts.gameId != null ? { game_id: opts.gameId } : {}),
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
  (TauriService as any).addLevel = async (req: any) => {
    const id = nextLevelId++;
    addLevelCalls.push({ ...req, id });
    return id;
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

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

beforeEach(() => {
  createLevelProgressCalls = [];
  updateLevelProgressCalls = [];
  logMaintenanceEventCalls = [];
  addLevelCalls = [];
  nextLevelId = 1000;
});

describe('applySessionCompletionPerAccount — completed Level Event completes Session Only rows BEFORE the last completed event', () => {
  it('completes a Session Only level when the account has completed (C) Level Events, no Session date needed', async () => {
    // Events: day 0 [Jan1 00:00, 00:16], day 10 [Jan11 00:00, 00:16]. Session day 5 = Jan6 00:00.
    installMocks({
      levels: [realLevel(1, 0), sessionLevel(2, 5), realLevel(3, 10)],
      progress: [
        { level_id: 1, is_completed: true },
        { level_id: 3, is_completed: true },
      ],
    });
    // No sessionDate on the account → picked up by catch-all (pass 2), completed via the last completed event.
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    assert.ok(updateFor(2), 'Session Only day 5 completed (before the last completed Level Event)');
    assert.ok(!updateFor(1), 'Level Event day 0 not touched by this pass');
    assert.ok(!updateFor(3), 'Level Event day 10 not touched by this pass');
    assert.strictEqual(result.errors.length, 0, 'no errors');
  });

  it('does NOT complete Session Only rows AFTER a single completed Level Event', async () => {
    installMocks({
      levels: [realLevel(1, 0), sessionLevel(2, 5), realLevel(3, 10)],
      progress: [{ level_id: 1, is_completed: true }],
    });
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    assert.ok(!updateFor(2), 'Session Only day 5 NOT completed (it is AFTER the last completed event day 0)');
  });

  it('completes rows before the last completed event, but NOT after it', async () => {
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

    assert.ok(updateFor(1), 'Session Only day -1 completed (before the last completed event day 10)');
    assert.ok(!updateFor(4), 'Session Only day 11 NOT completed (after the last completed event day 10)');
  });

  it('completes a Session Only row on an earlier day than the last completed event', async () => {
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

    assert.ok(updateFor(2), 'Session X === end(E1) still completed (before the last completed event day 10)');
  });

  it('completes a Session Only row before the last completed event even across a spanning window', async () => {
    // start_time 06:00; E1 day 0 time_spent 100 → end Jan2 09:46 (spans into day 1).
    // Session day 1 X = Jan2 06:00 overlaps E1, but is still before day 10.
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

    assert.ok(updateFor(2), 'Session day 1 completed (before the last completed event day 10)');
  });

  it('keeps the Session cutoff working (OR semantics)', async () => {
    installMocks({
      levels: [sessionLevel(1, 2)],
      progress: [],
    });
    const { cache, data, result } = buildContext(true);

    await applySessionCompletionPerAccount(cache, new Map([['100', '3-Jan']]), data, result);

    assert.ok(updateFor(1), 'Session Only day 2 completed by Session cutoff (3-Jan <= 3-Jan)');
    assert.strictEqual(updateFor(1).target_date, todayIso(), 'cutoff-completed session stamped with target_date = today');
  });

  it('completes by the last completed event even when the Session cutoff would NOT', async () => {
    installMocks({
      levels: [realLevel(1, 0), sessionLevel(2, 5), realLevel(3, 10)],
      progress: [
        { level_id: 1, is_completed: true },
        { level_id: 3, is_completed: true },
      ],
    });
    const { cache, data, result } = buildContext(true);

    await applySessionCompletionPerAccount(cache, new Map([['100', '1-Jan']]), data, result);

    assert.ok(updateFor(2), 'Session Only day 5 completed via the last completed event despite being after the Session cutoff');
  });

  it('re-stamps already completed Session Only levels with target_date = today (planner skip invariant)', async () => {
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

    const stamp = updateFor(2);
    assert.ok(stamp, 'already-completed session re-stamped');
    assert.strictEqual(stamp.is_completed, true, 'kept completed');
    assert.strictEqual(stamp.target_date, todayIso(), 'target_date stamped to today so the planner skips the group');
    assert.strictEqual(result.errors.length, 0, 'no errors');
  });

  it('writes trace logs: completed before the last completed event, skipped after it / with no completed event', async () => {
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
    const done = completed.find((l: any) => l.levelId === 2);
    assert.ok(done, 'day 5 logged as completed');
    assert.ok(done.reason && done.reason.includes('before the last completed'), `reason describes frontier: ${done.reason}`);
    assert.ok(done.detail, 'detail JSON present');
    const doneDetail = JSON.parse(done.detail);
    assert.strictEqual(doneDetail.lastCompletedOffset, 10, 'detail records the last completed event offset');
    assert.strictEqual(doneDetail.beforeLastCompletedEvent, true, 'detail marks beforeLastCompletedEvent');

    // A session AFTER the last completed event is skipped with an explanatory reason.
    const skipped = logMaintenanceEventCalls.filter((l: any) => l.action === 'session_only_skipped');
    const afterLast = skipped.find((l: any) => l.levelId === 4);
    assert.ok(afterLast, 'day 11 logged as skipped (after the last completed event)');
    assert.ok(afterLast.reason.includes('after the last completed'), `reason explains skip: ${afterLast.reason}`);

    // No completed event AND no cutoff → the row is skipped with a different reason.
    installMocks({
      levels: [sessionLevel(7, 5)],
      progress: [],
    });
    const { cache: cache2, data: data2, result: result2 } = buildContext(false);
    await applySessionCompletionPerAccount(cache2, new Map(), data2, result2);

    const skipped2 = logMaintenanceEventCalls.filter((l: any) => l.action === 'session_only_skipped');
    assert.ok(skipped2.length >= 1, 'skipped classification logged when no completed event');
    const notDone = skipped2.find((l: any) => l.levelId === 7);
    assert.ok(notDone, 'day 5 logged as skipped');
    assert.ok(notDone.reason.includes('no completed Level Event'), `reason explains skip: ${notDone.reason}`);
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

  it('creates missing Session Only rows across the whole range [0, maxRealOffset] (no \'-\' row pre-existing) and completes them', async () => {
    installMocks({
      gameId: 1,
      levels: [realLevel(1, 0), realLevel(3, 10)],
      progress: [
        { level_id: 1, is_completed: true },
        { level_id: 3, is_completed: true },
      ],
    });
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    const created = addLevelCalls.find((c: any) => c.days_offset === 5);
    assert.ok(created, 'session row for day 5 created');
    assert.strictEqual(created.level_name, '-', 'created row is a Session Only row');
    assert.strictEqual(created.event_token, 'lvl_day5', 'token derived from the next Level Event base');
    assert.strictEqual(created.branch_id, 10, 'created in the account branch');
    assert.ok(created.time_spent > 0, 'created row has an interpolated time_spent');

    const createdDays = addLevelCalls
      .filter((c: any) => c.level_name === '-')
      .map((c: any) => c.days_offset);
    assert.deepStrictEqual(
      createdDays,
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      'every day in [0,10] without a level row is created (event days excluded)',
    );

    assert.ok(updateFor(created.id), 'created row completed (before the last completed event)');
    assert.strictEqual(result.errors.length, 0, 'no errors');
  });

  it('creates + completes Session Only rows up to a single completed Level Event', async () => {
    installMocks({
      gameId: 1,
      levels: [realLevel(1, 5)],
      progress: [{ level_id: 1, is_completed: true }],
    });
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    const createdDays = addLevelCalls
      .filter((c: any) => c.level_name === '-')
      .map((c: any) => c.days_offset)
      .sort((a: number, b: number) => a - b);
    assert.deepStrictEqual(createdDays, [0, 1, 2, 3, 4], 'days before the single completed event created');

    for (const c of addLevelCalls.filter((c: any) => c.level_name === '-')) {
      assert.ok(updateFor(c.id), `created day ${c.days_offset} completed`);
    }
    assert.strictEqual(result.errors.length, 0, 'no errors');
  });

  it('creates missing Session Only rows even WITHOUT a completed Level Event (so the planner emits real ids)', async () => {
    installMocks({
      gameId: 1,
      levels: [realLevel(1, 0), realLevel(3, 10)],
      progress: [],
    });
    const { cache, data, result } = buildContext(false);

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    const createdDays = addLevelCalls
      .filter((c: any) => c.level_name === '-')
      .map((c: any) => c.days_offset);
    assert.deepStrictEqual(
      createdDays,
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      'gap days persisted as Session Only rows despite no completed Level Event',
    );
    assert.strictEqual(updateLevelProgressCalls.length, 0, 'no completion without cutoff or completed event');
    assert.strictEqual(result.errors.length, 0, 'no errors');
  });

  it('completes created rows by the Session cutoff even with no completed Level Event', async () => {
    installMocks({
      gameId: 1,
      levels: [realLevel(1, 0), realLevel(3, 10)],
      progress: [],
    });
    const { cache, data, result } = buildContext(false);

    // Number key (cache.accountCache['1_acc'] === 100) so the catch-all pass
    // skips this account and only the Session cutoff (2-Jan = day 1) applies.
    await applySessionCompletionPerAccount(cache, new Map([[100, '2-Jan']]), data, result);

    const created = addLevelCalls.filter((c: any) => c.level_name === '-');
    assert.deepStrictEqual(
      created.map((c: any) => c.days_offset),
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      'gap days created without a completed event',
    );
    const completed = created
      .filter((c: any) => updateFor(c.id))
      .map((c: any) => c.days_offset);
    assert.deepStrictEqual(completed, [1], 'only days up to the Session cutoff (2-Jan = day 1) completed');
    assert.strictEqual(result.errors.length, 0, 'no errors');
  });

  it('completes a parser-known-completed (C) Session Only row even AFTER the last completed Level Event', async () => {
    installMocks({
      gameId: 1,
      levels: [realLevel(1, 0), realLevel(3, 5), realLevel(5, 10)],
      progress: [
        { level_id: 1, is_completed: true },
        { level_id: 3, is_completed: true },
      ],
    });
    const { cache, data, result } = buildContext(false);
    // The parser marks the session cell "abc_day6" as (C) in the sheet. Its base
    // token belongs to a Level Event, so importProgressMatrix drops the entry;
    // applySessionCompletionPerAccount must re-apply that knowledge.
    data.progress.push({
      levelName: '-',
      token: 'lvl_day6',
      isCompleted: true,
      accountName: 'Acc',
      gameName: 'TestGame',
    });

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    const created = addLevelCalls.filter((c: any) => c.level_name === '-');
    const day6 = created.find((c: any) => c.days_offset === 6);
    assert.ok(day6, 'gap row for day 6 created');
    assert.ok(updateFor(day6.id), 'day 6 completed via parser (C) knowledge despite being after the last completed event (day 5)');
    assert.strictEqual(updateFor(day6.id).target_date, todayIso(), 'parser-(C)-completed session stamped with target_date = today');
    assert.strictEqual(result.errors.length, 0, 'no errors');
  });

  it('completes a parser-known-completed (C) Session Only row with NO completed Level Event', async () => {
    installMocks({
      gameId: 1,
      levels: [realLevel(1, 0), realLevel(3, 10)],
      progress: [],
    });
    const { cache, data, result } = buildContext(false);
    data.progress.push({
      levelName: '-',
      token: 'lvl_day3',
      isCompleted: true,
      accountName: 'Acc',
      gameName: 'TestGame',
    });

    await applySessionCompletionPerAccount(cache, new Map(), data, result);

    const created = addLevelCalls.filter((c: any) => c.level_name === '-');
    const day3 = created.find((c: any) => c.days_offset === 3);
    assert.ok(day3, 'gap row for day 3 created');
    assert.ok(updateFor(day3.id), 'day 3 completed via parser (C) knowledge with no completed Level Events');
    assert.strictEqual(updateFor(day3.id).target_date, todayIso(), 'parser-(C)-completed session stamped with target_date = today');
    assert.strictEqual(result.errors.length, 0, 'no errors');
  });
});
