import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TauriService } from './tauri.service.ts';
import { ImportPersistenceService } from './import-persistence.service.ts';
import type { ImportData } from './excel/excel-parser.ts';

interface FakeLevel {
  id: number;
  game_id: number;
  branch_id: number;
  level_name: string;
  event_token: string;
  days_offset: number | null;
  time_spent: number;
  is_bonus: boolean;
}

class FakeDb {
  games: any[] = [];
  branches: any[] = [];
  accounts: any[] = [];
  levels: FakeLevel[] = [];
  purchaseEvents: any[] = [];
  levelProgress: any[] = [];
  purchaseProgress: any[] = [];
  logs: any[] = [];
  nextId = 1000;

  seed() {
    this.games.push({ id: 1, name: 'TestGame' });
    this.branches.push({ id: 10, game_id: 1, name: 'TestBranch', is_default: true });
    this.levels.push({
      id: 100, game_id: 1, branch_id: 10, level_name: '-', event_token: 'lvl_day10', days_offset: 10, time_spent: 500, is_bonus: false,
    });
    this.levels.push({
      id: 101, game_id: 1, branch_id: 10, level_name: '-', event_token: 'lvl_day30', days_offset: 30, time_spent: 500, is_bonus: false,
    });
    this.nextId = 200;
  }

  private newId(): number {
    return this.nextId++;
  }

  addGame(req: any): number {
    const id = this.newId();
    this.games.push({ id, name: req.name });
    return id;
  }

  addBranch(req: any): number {
    const id = this.newId();
    this.branches.push({ id, game_id: req.game_id, name: req.name, is_default: false });
    return id;
  }

  addAccount(req: any): number {
    const id = this.newId();
    this.accounts.push({
      id,
      game_id: req.game_id,
      branch_id: req.branch_id,
      name: req.name,
      start_date: req.start_date,
      start_time: req.start_time,
    });
    return id;
  }

  addLevel(req: any): number {
    const id = this.newId();
    this.levels.push({
      id,
      game_id: req.game_id,
      branch_id: req.branch_id,
      level_name: req.level_name,
      event_token: req.event_token,
      days_offset: req.days_offset ?? null,
      time_spent: req.time_spent || 0,
      is_bonus: req.is_bonus || false,
    });
    return id;
  }

  addPurchaseEvent(req: any): number {
    const id = this.newId();
    this.purchaseEvents.push({
      id,
      game_id: req.game_id,
      branch_id: req.branch_id,
      event_token: req.event_token,
      is_restricted: req.is_restricted || false,
      max_days_offset: req.max_days_offset ?? null,
    });
    return id;
  }

  createLevelProgress(req: any): void {
    if (!this.levelProgress.some(p => p.account_id === req.account_id && p.level_id === req.level_id)) {
      this.levelProgress.push({ account_id: req.account_id, level_id: req.level_id, is_completed: false });
    }
  }

  updateLevelProgress(req: any): void {
    let rec = this.levelProgress.find(p => p.account_id === req.account_id && p.level_id === req.level_id);
    if (!rec) {
      rec = { account_id: req.account_id, level_id: req.level_id, is_completed: false };
      this.levelProgress.push(rec);
    }
    rec.is_completed = req.is_completed;
    if (req.target_date != null) rec.target_date = req.target_date;
  }

  createPurchaseEventProgress(req: any): void {
    if (!this.purchaseProgress.some(p => p.account_id === req.account_id && p.purchase_event_id === req.purchase_event_id)) {
      this.purchaseProgress.push({ account_id: req.account_id, purchase_event_id: req.purchase_event_id, is_completed: false });
    }
  }

  updatePurchaseEventProgress(req: any): void {
    let rec = this.purchaseProgress.find(p => p.account_id === req.account_id && p.purchase_event_id === req.purchase_event_id);
    if (!rec) {
      rec = { account_id: req.account_id, purchase_event_id: req.purchase_event_id, is_completed: false };
      this.purchaseProgress.push(rec);
    }
    rec.is_completed = req.is_completed;
  }
}

let db: FakeDb;

function installE2EMocks(): void {
  db = new FakeDb();
  db.seed();

  (TauriService as any).getGames = async () => [...db.games];
  (TauriService as any).getGameById = async (id: number) => db.games.find(g => g.id === id) || null;
  (TauriService as any).addGame = async (req: any) => db.addGame(req);
  (TauriService as any).getGameBranches = async (gameId: number) => db.branches.filter(b => b.game_id === gameId);
  (TauriService as any).addBranch = async (req: any) => db.addBranch(req);
  (TauriService as any).getAccounts = async (gameId: number) => db.accounts.filter(a => a.game_id === gameId);
  (TauriService as any).getAccountById = async (id: number) => db.accounts.find(a => a.id === id) || null;
  (TauriService as any).addAccount = async (req: any) => db.addAccount(req);
  (TauriService as any).getGameLevels = async (branchId: number) => db.levels.filter(l => l.branch_id === branchId);
  (TauriService as any).addLevel = async (req: any) => db.addLevel(req);
  (TauriService as any).getGamePurchaseEvents = async (gameId: number) => db.purchaseEvents.filter(p => p.game_id === gameId);
  (TauriService as any).addPurchaseEvent = async (req: any) => db.addPurchaseEvent(req);
  (TauriService as any).createLevelProgress = async (req: any) => { db.createLevelProgress(req); };
  (TauriService as any).updateLevelProgress = async (req: any) => { db.updateLevelProgress(req); };
  (TauriService as any).getAccountLevelProgress = async (accountId: number) => db.levelProgress.filter(p => p.account_id === accountId);
  (TauriService as any).createPurchaseEventProgress = async (req: any) => { db.createPurchaseEventProgress(req); };
  (TauriService as any).updatePurchaseEventProgress = async (req: any) => { db.updatePurchaseEventProgress(req); };
  (TauriService as any).logMaintenanceEvent = async (req: any) => { db.logs.push(req); };
}

function startDateStr(): string {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  return `${start.getFullYear()}-${m}-${d}`;
}

function buildImportData(): ImportData {
  const startDate = startDateStr();
  return {
    levels: [
      { gameName: 'TestGame', branchName: 'TestBranch', event_token: 'lvl_day0', level_name: 'Level 0', days_offset: 0, time_spent: 1, is_bonus: false } as any,
      { gameName: 'TestGame', branchName: 'TestBranch', event_token: 'lvl_day5', level_name: 'Level 5', days_offset: 5, time_spent: 1, is_bonus: false } as any,
      { gameName: 'TestGame', branchName: 'TestBranch', event_token: 'lvl_day15', level_name: 'Level 15', days_offset: 15, time_spent: 1, is_bonus: false } as any,
    ],
    purchaseEvents: [
      { gameName: 'TestGame', branchName: 'TestBranch', event_token: 'shop_day3', is_restricted: false, max_days_offset: 3 } as any,
    ],
    accounts: [
      { name: 'Acc1', gameName: 'TestGame', branchName: 'TestBranch', start_date: startDate, start_time: '00:00:00' } as any,
      { name: 'Acc2', gameName: 'TestGame', branchName: 'TestBranch', start_date: startDate, start_time: '00:00:00' } as any,
    ],
    progress: [
      { gameName: 'TestGame', accountName: 'Acc1', levelName: 'Level 5', token: 'lvl_day5', isCompleted: true },
      { gameName: 'TestGame', accountName: 'Acc1', levelName: 'Level 15', token: 'lvl_day15', isCompleted: true },
      { gameName: 'TestGame', accountName: 'Acc2', levelName: 'Level 5', token: 'lvl_day5', isCompleted: true },
      { gameName: 'TestGame', accountName: 'Acc1', purchaseToken: 'shop_day3', token: 'shop_day3', isCompleted: true },
    ],
    accountSessionDates: new Map<string, string>(),
  };
}

beforeEach(() => {
  installE2EMocks();
});

describe('ImportPersistenceService.persistAll — end-to-end import of Level Events, Purchase Events and Session Only classification', () => {
  it('imports Level Events + Purchase Events, creates accounts, completes Session Only BEFORE the last completed Level Event, with zero errors', async () => {
    const data = buildImportData();

    const result = await ImportPersistenceService.persistAll(data, 1, 10);

    assert.deepStrictEqual(result.errors, [], 'no import errors');

    const levelId = (token: string) => db.levels.find(l => l.event_token === token)!.id;
    const acc1 = db.accounts.find(a => a.name === 'Acc1')!;
    const acc2 = db.accounts.find(a => a.name === 'Acc2')!;
    const shopId = db.purchaseEvents.find(p => p.event_token === 'shop_day3')!.id;
    const lp = (aid: number, lid: number) => db.levelProgress.find(p => p.account_id === aid && p.level_id === lid);

    assert.ok(levelId('lvl_day0'), 'lvl_day0 created');
    assert.ok(levelId('lvl_day5'), 'lvl_day5 created');
    assert.ok(levelId('lvl_day15'), 'lvl_day15 created');
    assert.ok(acc1 && acc2, 'both accounts created');
    assert.strictEqual(acc1.start_time, '00:00:00', 'start_time preserved');

    assert.strictEqual(lp(acc1.id, levelId('lvl_day5'))?.is_completed, true, 'Level Event day5 completed (C)');
    assert.strictEqual(lp(acc1.id, levelId('lvl_day15'))?.is_completed, true, 'Level Event day15 completed (C)');
    assert.strictEqual(lp(acc2.id, levelId('lvl_day5'))?.is_completed, true, 'Level Event day5 completed for Acc2 (C)');

    const shopProgress = db.purchaseProgress.find(p => p.account_id === acc1.id && p.purchase_event_id === shopId);
    assert.strictEqual(shopProgress?.is_completed, true, 'Purchase Event shop_day3 completed (C)');

    assert.strictEqual(lp(acc1.id, levelId('lvl_day10'))?.is_completed, true, 'Session Only day10 completed for Acc1 (before last completed event day15)');
    assert.strictEqual(
      lp(acc1.id, levelId('lvl_day10'))?.target_date,
      new Date().toISOString().split('T')[0],
      'Session Only day10 stamped with target_date = today so the planner skips it',
    );
    assert.strictEqual(lp(acc2.id, levelId('lvl_day10'))?.is_completed, undefined, 'Acc2 Session Only day10 NOT completed (day10 is after last completed event day5)');
    assert.strictEqual(lp(acc1.id, levelId('lvl_day30'))?.is_completed, undefined, 'Session Only day30 NOT completed (after last completed event day15)');
    assert.strictEqual(lp(acc2.id, levelId('lvl_day30'))?.is_completed, undefined, 'Acc2 Session Only day30 NOT completed (after day5)');

    const completionLog = db.logs.find(l => l.action === 'session_only_completed' && l.levelId === levelId('lvl_day10'));
    assert.ok(completionLog, 'session_only_completed trace log written for day10');
    assert.strictEqual(JSON.parse(completionLog.detail).lastCompletedOffset, 15, 'detail records the last completed event offset');

    assert.strictEqual(result.importedCount, 6, '3 levels + 1 purchase + 2 accounts imported');
  });

  it('does not import a standalone Session row whose base token belongs to a Level Event (event + session folds)', async () => {
    const startDate = startDateStr();
    const data: ImportData = {
      levels: [
        { gameName: 'TestGame', branchName: 'TestBranch', event_token: 'lvl_day0', level_name: 'Level 0', days_offset: 0, time_spent: 1, is_bonus: false } as any,
        { gameName: 'TestGame', branchName: 'TestBranch', event_token: 'lvl_day5', level_name: 'Level 5', days_offset: 5, time_spent: 1, is_bonus: false } as any,
        { gameName: 'TestGame', branchName: 'TestBranch', event_token: 'lvl_day6', level_name: '-', days_offset: 6, time_spent: 500, is_bonus: false } as any,
      ],
      purchaseEvents: [],
      accounts: [
        { name: 'Acc1', gameName: 'TestGame', branchName: 'TestBranch', start_date: startDate, start_time: '00:00:00' } as any,
      ],
      progress: [
        { gameName: 'TestGame', accountName: 'Acc1', levelName: 'Level 5', token: 'lvl_day5', isCompleted: true },
      ],
      accountSessionDates: new Map<string, string>(),
    };

    const result = await ImportPersistenceService.persistAll(data, 1, 10);

    const lvlDay6 = db.levels.find(l => l.event_token === 'lvl_day6');
    assert.strictEqual(lvlDay6, undefined, 'standalone Session lvl_day6 NOT imported (folds into the Level Event)');

    const infoErrors = result.errors.filter(e => e.type === 'info');
    assert.ok(infoErrors.some(e => e.message.includes('folds into the event')), 'info error explains the fold');

    const skipLog = db.logs.find(l => l.action === 'session_skipped');
    assert.ok(skipLog, 'session_skipped maintenance log written');

    assert.strictEqual(result.errors.filter(e => e.type === 'level' || e.type === 'unexpected').length, 0, 'no level/unexpected errors');

    const lvl0 = db.levels.find(l => l.event_token === 'lvl_day0');
    const lvl5 = db.levels.find(l => l.event_token === 'lvl_day5');
    assert.ok(lvl0 && lvl0.level_name !== '-', 'Level Event lvl_day0 still imported');
    assert.ok(lvl5 && lvl5.level_name !== '-', 'Level Event lvl_day5 still imported');

    assert.strictEqual(result.importedCount, 3, '2 levels + 1 account imported (session-only skipped)');
  });

  it('creates missing Session Only rows across the range (fresh branch, no pre-seeded \'-\' rows) and completes them', async () => {
    const startDate = startDateStr();
    const data: ImportData = {
      levels: [
        { gameName: 'GapGame', branchName: 'GapBranch', event_token: 'lvl_day5', level_name: 'Level 5', days_offset: 5, time_spent: 1, is_bonus: false } as any,
        { gameName: 'GapGame', branchName: 'GapBranch', event_token: 'lvl_day15', level_name: 'Level 15', days_offset: 15, time_spent: 1, is_bonus: false } as any,
      ],
      purchaseEvents: [],
      accounts: [
        { name: 'AccGap', gameName: 'GapGame', branchName: 'GapBranch', start_date: startDate, start_time: '00:00:00' } as any,
      ],
      progress: [
        { gameName: 'GapGame', accountName: 'AccGap', levelName: 'Level 5', token: 'lvl_day5', isCompleted: true },
        { gameName: 'GapGame', accountName: 'AccGap', levelName: 'Level 15', token: 'lvl_day15', isCompleted: true },
      ],
      accountSessionDates: new Map<string, string>(),
    };

    const result = await ImportPersistenceService.persistAll(data, 1, 10);

    assert.deepStrictEqual(result.errors, [], 'no import errors');

    const gapBranch = db.branches.find(b => b.name === 'GapBranch')!;
    assert.ok(gapBranch, 'GapBranch created for the new game');

    const gapLevels = db.levels.filter(l => l.branch_id === gapBranch.id);
    const day6 = gapLevels.find(l => l.event_token === 'lvl_day6');
    assert.ok(day6, 'sandwiched session row lvl_day6 created by the importer');
    assert.strictEqual(day6.level_name, '-', 'created row is a Session Only row');
    assert.strictEqual(day6.days_offset, 6, 'created row sits strictly between day5 and day15');
    assert.ok(day6.time_spent > 0, 'created row carries an interpolated time_spent');

    const createdRange = gapLevels
      .filter(l => l.level_name === '-')
      .every(l => l.days_offset != null && l.days_offset >= 0 && l.days_offset <= 15 && l.days_offset !== 5 && l.days_offset !== 15);
    assert.ok(createdRange, 'only days in [0,15] without a level row are created');

    const day0 = gapLevels.find(l => l.event_token === 'lvl_day0');
    assert.ok(day0, 'session row before the first completed event (day0) created');

    const accGap = db.accounts.find(a => a.name === 'AccGap')!;
    const lp = db.levelProgress.find(p => p.account_id === accGap.id && p.level_id === day6.id);
    assert.strictEqual(lp?.is_completed, true, 'created sandwiched session completed');

    const lp0 = db.levelProgress.find(p => p.account_id === accGap.id && p.level_id === day0!.id);
    assert.strictEqual(lp0?.is_completed, true, 'day0 session completed (blanket rule)');

    const completionLog = db.logs.find(l => l.action === 'session_only_completed' && l.levelId === day6.id);
    assert.ok(completionLog, 'session_only_completed trace log written for the created row');
  });
});
