import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TauriService } from '../tauri.service.ts';
import { applySessionCompletionForGame } from './excel-session-processor.ts';

// ===== TauriService mocking =====
let addLevelCalls: any[];
let addLevelId = 100;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function installMocks(branchLevels: any[]) {
  addLevelCalls = [];
  (TauriService as any).getGameById = async () => ({ id: 1, name: 'Test Game' });
  (TauriService as any).getGameBranches = async () => [{ id: 10, name: 'Main' }];
  (TauriService as any).getAccounts = async () => [
    { id: 100, branch_id: 10, name: 'acc1', start_date: isoDaysAgo(4) },
  ];
  (TauriService as any).getGameLevels = async () => branchLevels;
  (TauriService as any).getAccountLevelProgress = async () => [];
  (TauriService as any).addLevel = async (req: any) => {
    addLevelCalls.push(req);
    return addLevelId++;
  };
  (TauriService as any).createLevelProgress = async () => 1;
  (TauriService as any).updateLevelProgress = async () => true;
}

beforeEach(() => {
  addLevelId = 100;
});

describe('applySessionCompletionForGame — session row creation rule', () => {
  it('never CREATES a standalone Session row for a base token that has a Level Event', async () => {
    installMocks([
      {
        id: 1,
        game_id: 1,
        branch_id: 10,
        event_token: 'ett5wk',
        level_name: 'lv60',
        days_offset: 1,
        time_spent: 25,
        is_bonus: false,
      },
    ]);

    const result = await applySessionCompletionForGame(1);

    assert.equal(addLevelCalls.length, 0, 'gap-day sessions of an event token are synthetic — no rows created');
    assert.equal(result.completedByCutoff, 0, 'nothing to complete without an existing row');
  });

  it('still completes an existing legacy Session row of an event token', async () => {
    let updates: any[] = [];
    installMocks([
      {
        id: 1,
        game_id: 1,
        branch_id: 10,
        event_token: 'ett5wk',
        level_name: 'lv60',
        days_offset: 1,
        time_spent: 25,
        is_bonus: false,
      },
      {
        id: 2,
        game_id: 1,
        branch_id: 10,
        event_token: 'ett5wk_day0',
        level_name: '-',
        days_offset: 0,
        time_spent: 13,
        is_bonus: false,
      },
    ]);
    (TauriService as any).updateLevelProgress = async (req: any) => {
      updates.push(req);
      return true;
    };

    await applySessionCompletionForGame(1);

    assert.equal(addLevelCalls.length, 0, 'existing row means no creation');
    const completed = updates.filter((u) => u.is_completed && u.level_id === 2);
    assert.equal(completed.length, 1, 'legacy event-token session row is completed, not recreated');
  });

  it('creates standalone Session rows for tokens with NO Level Event', async () => {
    installMocks([]);

    const result = await applySessionCompletionForGame(1);

    assert.ok(addLevelCalls.length >= 1, 'standalone branch creates Session rows');
    addLevelCalls.forEach((c) => {
      assert.match(c.event_token, /^lvl_day-?\d+$/, 'fallback token for branches without real events');
      assert.equal(c.level_name, '-');
    });
    assert.ok(result.completedByCutoff >= 1, 'created standalone rows are completed');
  });
});
