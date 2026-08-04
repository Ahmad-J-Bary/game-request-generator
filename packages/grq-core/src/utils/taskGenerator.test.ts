import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TauriService } from '../services/tauri.service.ts';
import { TaskGenerator } from './taskGenerator.ts';

interface MockLevel {
  id: number;
  game_id: number;
  branch_id: number;
  level_name: string;
  event_token: string;
  days_offset: number;
  time_spent: number;
  is_bonus: boolean;
}

const level = (overrides: Partial<MockLevel>): MockLevel => ({
  id: 1,
  game_id: 1,
  branch_id: 1,
  level_name: 'Level 1',
  event_token: 'abc_day0',
  days_offset: 0,
  time_spent: 100,
  is_bonus: false,
  ...overrides,
});

function installMocks(opts: {
  levels: MockLevel[];
  requests: any[];
  progress?: { level_id: number; is_completed: boolean }[];
  total_tasks?: number;
}) {
  (TauriService as any).getAllAccounts = async () => [
    {
      id: 10,
      game_id: 1,
      branch_id: 1,
      name: 'Acc1',
      proxy_state: 'FLORIDA',
      start_date: '2024-01-01',
      start_time: '00:00:00',
      request_template: 'POST /session\r\n\r\n{time_spent}',
    },
  ];
  (TauriService as any).getGameLevels = async () => opts.levels;
  (TauriService as any).getGamePurchaseEvents = async () => [];
  (TauriService as any).getDailyRequests = async () => ({
    account_id: 10,
    account_name: 'Acc1',
    target_date: '2024-01-03',
    days_passed: 2,
    total_tasks: opts.total_tasks ?? opts.requests.length,
    requests: opts.requests,
  });
  (TauriService as any).getAccountLevelProgress = async () => opts.progress || [];
  (TauriService as any).getAccountPurchaseEventProgress = async () => [];
}

async function runGenerator() {
  const generator = new TaskGenerator({
    games: [],
    accountCompletionRecords: {},
    accountStartStates: {},
    setAccountStartStates: () => {},
    setAccountTaskAssignments: () => {},
    currentTime: Date.now(),
    completedTasks: [],
  });
  const { batches, deferredTasks } = await generator.generateTodaysTasks();
  return [...batches.flatMap((b) => b.tasks), ...deferredTasks];
}

function accountTask(tasks: any[]): any {
  const task = tasks.find((t: any) => t.account?.id === 10);
  assert.ok(task, 'expected a daily task to be generated for the account');
  return task;
}

describe('TaskGenerator — Session Only requests in Daily Tasks', () => {
  beforeEach(() => {
    (TauriService as any).getAllAccounts = undefined;
    (TauriService as any).getGameLevels = undefined;
    (TauriService as any).getGamePurchaseEvents = undefined;
    (TauriService as any).getDailyRequests = undefined;
    (TauriService as any).getAccountLevelProgress = undefined;
    (TauriService as any).getAccountPurchaseEventProgress = undefined;
  });

  it('keeps a persisted Session Only request that carries the BASE token (no _day* suffix)', async () => {
    const levels = [
      level({ id: 1, level_name: 'Level 1', event_token: 'abc_day0', days_offset: 0, time_spent: 100 }),
      level({ id: 3, level_name: '-', event_token: 'abc_day2', days_offset: 2, time_spent: 90 }),
    ];
    // The Rust planner emits "Session Only" with event_token = base token "abc",
    // never "abc_day2" — this is exactly what must survive the frontend filter.
    installMocks({
      levels,
      requests: [
        { request_type: 'Session Only', content: 'POST /session\r\n\r\n90', event_token: 'abc', level_id: 3, time_spent: 90, timestamp: '2024-01-03' },
      ],
    });

    const tasks = await runGenerator();
    const req = accountTask(tasks).requests[0];

    assert.strictEqual(req.request_type, 'Session Only');
    assert.strictEqual(req.event_token, 'abc', 'base token is preserved (no _day* suffix)');
    assert.strictEqual(req.level_name, '-', 'Session Only shows the session placeholder');
    assert.strictEqual(req.days_offset, 2, 'real day offset resolved from the persisted row');
  });

  it('keeps a synthetic Session Only request (negative level id, base token)', async () => {
    const levels = [
      level({ id: 1, level_name: 'Level 1', event_token: 'abc_day0', days_offset: 0, time_spent: 100 }),
      level({ id: 2, level_name: 'Level 5', event_token: 'abc_day5', days_offset: 5, time_spent: 200 }),
    ];
    installMocks({
      levels,
      requests: [
        { request_type: 'Session Only', content: 'POST /session\r\n\r\n90', event_token: 'abc', level_id: -2, time_spent: 90, timestamp: '2024-01-03' },
      ],
    });

    const tasks = await runGenerator();
    const req = accountTask(tasks).requests[0];

    assert.strictEqual(req.request_type, 'Session Only');
    assert.strictEqual(req.event_token, 'abc');
    assert.strictEqual(req.level_name, '-');
    assert.strictEqual(req.days_offset, 2, 'synthetic day derived from the negative level id');
  });

  it('still resolves Level Event requests by their full token (no regression)', async () => {
    const levels = [level({ id: 1, level_name: 'Level 1', event_token: 'abc_day0', days_offset: 0, time_spent: 100 })];
    installMocks({
      levels,
      requests: [
        { request_type: 'Level Event', content: 'POST /event\r\n\r\n100', event_token: 'abc_day0', level_id: 1, time_spent: 100, timestamp: '2024-01-03' },
      ],
    });

    const tasks = await runGenerator();
    const req = accountTask(tasks).requests[0];

    assert.strictEqual(req.request_type, 'Level Event');
    assert.strictEqual(req.event_token, 'abc_day0', 'Level Event keeps its full token');
    assert.strictEqual(req.level_name, 'Level 1');
    assert.strictEqual(req.days_offset, 0);
  });

  it('excludes a completed Session Only request (persisted row + progress) from Daily Tasks', async () => {
    const levels = [
      level({ id: 1, level_name: 'Level 1', event_token: 'abc_day0', days_offset: 0, time_spent: 100 }),
      level({ id: 3, level_name: '-', event_token: 'abc_day2', days_offset: 2, time_spent: 90 }),
    ];
    installMocks({
      levels,
      requests: [
        { request_type: 'Session Only', content: 'POST /session\r\n\r\n90', event_token: 'abc', level_id: 3, time_spent: 90, timestamp: '2024-01-03' },
      ],
      progress: [{ level_id: 3, is_completed: true }],
    });

    const tasks = await runGenerator();

    assert.strictEqual(tasks.length, 0, 'a completed Session Only request must not reappear in Daily Tasks');
  });

  it('excludes a synthetic Session Only request whose persisted (base token, day) row is completed', async () => {
    const levels = [
      level({ id: 1, level_name: 'Level 1', event_token: 'abc_day0', days_offset: 0, time_spent: 100 }),
      level({ id: 3, level_name: '-', event_token: 'abc_day2', days_offset: 2, time_spent: 90 }),
    ];
    installMocks({
      levels,
      requests: [
        // The Rust planner emits a synthetic negative id for the same day 2 session.
        { request_type: 'Session Only', content: 'POST /session\r\n\r\n90', event_token: 'abc', level_id: -2, time_spent: 90, timestamp: '2024-01-03' },
      ],
      progress: [{ level_id: 3, is_completed: true }],
    });

    const tasks = await runGenerator();

    assert.strictEqual(tasks.length, 0, 'a completed session must not reappear even when the emitted level id is synthetic');
  });

  it('keeps a Session Only request that lies after the last completed Level Event', async () => {
    const levels = [
      level({ id: 1, level_name: 'Level 1', event_token: 'abc_day0', days_offset: 0, time_spent: 100 }),
      level({ id: 2, level_name: 'Level 5', event_token: 'abc_day5', days_offset: 5, time_spent: 200 }),
      level({ id: 3, level_name: '-', event_token: 'abc_day3', days_offset: 3, time_spent: 90 }),
    ];
    installMocks({
      levels,
      requests: [
        { request_type: 'Session Only', content: 'POST /session\r\n\r\n90', event_token: 'abc', level_id: -3, time_spent: 90, timestamp: '2024-01-03' },
      ],
      // Day 0 Level Event completed → completion frontier is day 0; the day 3
      // session lies after it and must stay pending.
      progress: [{ level_id: 1, is_completed: true }],
    });

    const tasks = await runGenerator();
    const req = accountTask(tasks).requests[0];

    assert.strictEqual(req.request_type, 'Session Only');
    assert.strictEqual(req.days_offset, 3);
  });

  it('propagates day_index and total_tasks to the generated DailyTask', async () => {
    installMocks({
      levels: [
        level({ id: 1, level_name: 'Level 1', event_token: 'abc_day0', days_offset: 0, time_spent: 100 }),
      ],
      requests: [
        { request_type: 'Level Session', content: 'POST /session\r\n\r\n100', event_token: 'abc_day0', level_id: 1, time_spent: 100, timestamp: '2024-01-03', day_index: 2 },
        { request_type: 'Level Event', content: 'POST /event\r\n\r\n100', event_token: 'abc_day0', level_id: 1, time_spent: 100, timestamp: '2024-01-03', day_index: 2 },
      ],
      total_tasks: 2,
    });

    const tasks = await runGenerator();
    const task = accountTask(tasks);

    assert.strictEqual(task.dayTotalTasks, 2, 'full-day task count is frozen on the task');
    assert.strictEqual(task.requests[0].day_index, 2, 'Session row keeps the card position');
    assert.strictEqual(task.requests[1].day_index, 2, 'Event row shares the same n as its Session');
  });
});
