// ===== Import Persistence Service =====

import { TauriService } from './tauri.service';
import { asyncStorageService } from './storage.service';
import type { ImportData } from './excel/excel-parser';

export interface PersistenceResult {
  importedCount: number;
  errors: ImportError[];
}

export interface ImportError {
  type: string;
  message: string;
  item?: any;
}

/** Resolves game/branch IDs with in-memory caching across import phases */
class ImportCache {
  gameCache: Record<string, number> = {};
  branchCache: Record<string, number> = {};
  levelCache: Record<string, number> = {};
  purchaseCache: Record<string, number> = {};
  accountCache: Record<string, number> = {};

  constructor(
    private contextGameId?: number,
    private contextBranchId?: number,
  ) {}

  async init(): Promise<void> {
    const gamesList = await TauriService.getGames();
    gamesList.forEach(g => { this.gameCache[g.name.toLowerCase()] = g.id; });
  }

  async getOrCreateGameAndBranch(
    gameName?: string,
    branchName?: string,
  ): Promise<{ targetGameId: number; targetBranchId: number } | null> {
    let targetGame = this.contextGameId;

    if (gameName) {
      const lowerName = gameName.toLowerCase();
      if (this.gameCache[lowerName]) {
        targetGame = this.gameCache[lowerName];
      } else {
        targetGame = await TauriService.addGame({ name: gameName });
        this.gameCache[lowerName] = targetGame;
      }
    }

    if (!targetGame) return null;

    const branchKey = `${targetGame}_${branchName || ''}`;

    if (this.contextBranchId && targetGame === this.contextGameId) {
      this.branchCache[branchKey] = this.contextBranchId;
      return { targetGameId: targetGame, targetBranchId: this.contextBranchId };
    }

    if (this.branchCache[branchKey]) {
      return { targetGameId: targetGame, targetBranchId: this.branchCache[branchKey] };
    }

    const branches = await TauriService.getGameBranches(targetGame);

    if (branchName) {
      const match = branches.find(b => b.name === branchName);
      if (match) {
        this.branchCache[branchKey] = match.id;
        return { targetGameId: targetGame, targetBranchId: match.id };
      }
      const newBranchId = await TauriService.addBranch({ game_id: targetGame, name: branchName });
      this.branchCache[branchKey] = newBranchId;
      return { targetGameId: targetGame, targetBranchId: newBranchId };
    }

    const defaultBranch = branches.find(b => b.is_default) || branches[0];
    if (defaultBranch) {
      this.branchCache[branchKey] = defaultBranch.id;
      return { targetGameId: targetGame, targetBranchId: defaultBranch.id };
    }

    return null;
  }
}

export class ImportPersistenceService {
  static async persistAll(
    data: ImportData,
    contextGameId?: number,
    contextBranchId?: number,
  ): Promise<PersistenceResult> {
    const cache = new ImportCache(contextGameId, contextBranchId);
    await cache.init();

    const result: PersistenceResult = { importedCount: 0, errors: [] };

    try {
      await importLevels(data.levels, cache, result);
      await importPurchaseEvents(data.purchaseEvents, cache, result);
      await importAccounts(data.accounts, data, cache, result);
      await importProgressMatrix(data, cache, result);
      await restoreCompletedToday(data.completedToday, cache);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({ type: 'unexpected', message });
    }

    return result;
  }
}

async function importLevels(
  levels: ImportData['levels'],
  cache: ImportCache,
  result: PersistenceResult,
): Promise<void> {
  const createdKeys = new Set<string>();
  for (const level of levels) {
    try {
      const ids = await cache.getOrCreateGameAndBranch(
        (level as any).gameName,
        (level as any).branchName,
      );
      if (!ids) continue;

      const { targetGameId, targetBranchId } = ids;
      const levelKey = `${targetGameId}_${targetBranchId}_${(level.event_token || '').toLowerCase()}`;
      if (createdKeys.has(levelKey)) continue;
      createdKeys.add(levelKey);

      const levelId = await TauriService.addLevel({
        ...level,
        game_id: targetGameId,
        branch_id: targetBranchId,
        is_bonus: level.is_bonus || false,
      } as any);

      if (level.event_token) {
        const lowerToken = level.event_token.toLowerCase();
        cache.levelCache[`${targetGameId}_${lowerToken}_Session Only`] = levelId;
        if (level.level_name !== '-') {
          cache.levelCache[`${targetGameId}_${lowerToken}_Level Session`] = levelId;
          cache.levelCache[`${targetGameId}_${lowerToken}_Level Event`] = levelId;
        }
      }
      result.importedCount++;
    } catch (error) {
      result.errors.push({
        type: 'level',
        message: error instanceof Error ? error.message : 'Failed to import level',
        item: level,
      });
    }
  }
}

async function importPurchaseEvents(
  events: ImportData['purchaseEvents'],
  cache: ImportCache,
  result: PersistenceResult,
): Promise<void> {
  const createdKeys = new Set<string>();
  for (const event of events) {
    try {
      const ids = await cache.getOrCreateGameAndBranch(
        (event as any).gameName,
        (event as any).branchName,
      );
      if (!ids) continue;

      const { targetGameId, targetBranchId } = ids;
      const purchaseKey = `${targetGameId}_${targetBranchId}_${(event.event_token || '').toLowerCase()}`;
      if (createdKeys.has(purchaseKey)) continue;
      createdKeys.add(purchaseKey);

      const peId = await TauriService.addPurchaseEvent({
        ...event,
        game_id: targetGameId,
        branch_id: targetBranchId,
        is_restricted: event.is_restricted || false,
      } as any);

      if (event.event_token) {
        const lowerToken = event.event_token.toLowerCase();
        cache.purchaseCache[`${targetGameId}_${lowerToken}_Purchase Session`] = peId;
        cache.purchaseCache[`${targetGameId}_${lowerToken}_Purchase Event`] = peId;
      }
      result.importedCount++;
    } catch (error) {
      result.errors.push({
        type: 'purchaseEvent',
        message: error instanceof Error ? error.message : 'Failed to import purchase event',
        item: event,
      });
    }
  }
}

async function importAccounts(
  accounts: ImportData['accounts'],
  data: ImportData,
  cache: ImportCache,
  result: PersistenceResult,
): Promise<void> {
  const gameEventSequenceCache: Record<number, any[]> = {};

  for (const account of accounts) {
    try {
      const ids = await cache.getOrCreateGameAndBranch(
        (account as any).gameName,
        (account as any).branchName,
      );
      if (!ids) continue;

      const { targetGameId, targetBranchId } = ids;
      const lowerAccName = account.name?.toLowerCase() || '';
      const cacheKey = `${targetGameId}_${lowerAccName}`;

      if (cache.accountCache[cacheKey]) {
        continue;
      }

      const accId = await TauriService.addAccount({
        ...account,
        game_id: targetGameId,
        branch_id: targetBranchId,
        request_template: account.request_template || 'Needs to be filled in - imported from Excel export',
        country: (account as any).country || 'UNITED STATES (US)',
      } as any);

      cache.accountCache[cacheKey] = accId;
      result.importedCount++;

      // Progress restoration (milestone + global backfill)
      const lastCompletedToken = (account as any).lastCompletedToken;
      const globalBackfillDate = data.fullCompletionUpToDate;

      if ((lastCompletedToken || globalBackfillDate) && accId) {
        const backfillDeadline = globalBackfillDate ? new Date(globalBackfillDate).getTime() : 0;
        const startDateStr = account.start_date
          ? (account.start_date.includes('T') ? account.start_date.split('T')[0] : account.start_date)
          : '';
        const startDateTime = startDateStr ? new Date(startDateStr).getTime() : 0;

        if (!gameEventSequenceCache[targetGameId]) {
          const [lvls, evts] = await Promise.all([
            TauriService.getGameLevels(targetGameId),
            TauriService.getGamePurchaseEvents(targetGameId),
          ]);
          const sequence = [
            ...lvls.map(l => ({ ...l, kind: 'level' })),
            ...evts.map(e => ({ ...e, kind: 'purchase', days_offset: e.max_days_offset })),
          ].sort((a, b) => (a.days_offset || 0) - (b.days_offset || 0));
          gameEventSequenceCache[targetGameId] = sequence;
        }

        const sequence = gameEventSequenceCache[targetGameId];
        let foundMilestone = false;

        for (const item of sequence) {
          const offsetMs = (item.days_offset || 0) * 24 * 60 * 60 * 1000;
          const eventDate = startDateTime + offsetMs;

          let mToken = lastCompletedToken;
          let mType = '';
          if (lastCompletedToken && lastCompletedToken.includes(':')) {
            const parts = lastCompletedToken.split(':');
            mToken = parts[0];
            mType = parts[1];
          }

          const isMatch = item.event_token === mToken && (
            !mType ||
            (mType === 'Session Only' && item.kind === 'level' && item.level_name === '-') ||
            (mType === 'Level Event' && item.kind === 'level' && item.level_name !== '-') ||
            (mType === 'Purchase Event' && item.kind === 'purchase')
          );

          const isUnderMilestone = !foundMilestone && isMatch;

          if (isUnderMilestone || (!foundMilestone && globalBackfillDate && eventDate <= backfillDeadline)) {
            if (item.kind === 'level') {
              try { await TauriService.createLevelProgress({ account_id: accId, level_id: item.id }); } catch (e) { /* ignore */ }
              await TauriService.updateLevelProgress({ account_id: accId, level_id: item.id, is_completed: true });
            } else {
              try { await TauriService.createPurchaseEventProgress({ account_id: accId, purchase_event_id: item.id, days_offset: 0, time_spent: 0 }); } catch (e) { /* ignore */ }
              await TauriService.updatePurchaseEventProgress({ account_id: accId, purchase_event_id: item.id, is_completed: true });
            }
          }

          if (isUnderMilestone) {
            foundMilestone = true;
            if (!globalBackfillDate) break;
          }
        }
      }
    } catch (error) {
      result.errors.push({
        type: 'account',
        message: error instanceof Error ? error.message : 'Failed to import account',
        item: account,
      });
    }
  }
}

async function importProgressMatrix(
  data: ImportData,
  cache: ImportCache,
  result: PersistenceResult,
): Promise<void> {
  for (const p of data.progress) {
    try {
      const ids = await cache.getOrCreateGameAndBranch(p.gameName, (p as any).branchName);
      if (!ids) continue;
      const { targetGameId: gid, targetBranchId: bid } = ids;

      let aid = cache.accountCache[`${gid}_${p.accountName.toLowerCase()}`];
      if (!aid) {
        // Fallback: create account on the fly if found in imported data
        const matchedAcc = data.accounts.find(
          (a: any) => (a as any).gameName === p.gameName && a.name?.toLowerCase() === p.accountName.toLowerCase(),
        );
        if (matchedAcc) {
          const lowerAccName = matchedAcc.name?.toLowerCase() || '';
          aid = cache.accountCache[`${gid}_${lowerAccName}`];
          if (!aid) {
            aid = await TauriService.addAccount({
              ...matchedAcc,
              game_id: gid,
              branch_id: bid,
              request_template: matchedAcc.request_template || 'Needs to be filled in - imported from Excel export',
              country: (matchedAcc as any).country || 'UNITED STATES (US)',
            } as any);
            cache.accountCache[`${gid}_${lowerAccName}`] = aid;
            result.importedCount++;
          }
        } else {
          continue;
        }
      }

      const lowerToken = p.token.toLowerCase();
      const accountInfo = data.accounts.find(
        (a: any) => a.name?.toLowerCase() === p.accountName.toLowerCase() && a.gameName === p.gameName,
      );

      if (p.levelName !== undefined) {
        let lid = cache.levelCache[`${gid}_${lowerToken}_Session Only`];
        if (!lid && p.levelName === '-') {
          const gameLevels = await TauriService.getGameLevels(bid);
          const existing = gameLevels.find(l => l.event_token?.toLowerCase() === lowerToken);
          if (existing) {
            lid = existing.id;
          } else {
            const dayMatch = p.token.match(/_day(-?\d+)$/);
            lid = await TauriService.addLevel({
              game_id: gid,
              branch_id: bid,
              level_name: '-',
              event_token: p.token,
              days_offset: dayMatch ? parseInt(dayMatch[1]) : 0,
              time_spent: 0,
              is_bonus: false,
            } as any);
          }
          cache.levelCache[`${gid}_${lowerToken}_Session Only`] = lid;
        }
        if (lid) {
          try { await TauriService.createLevelProgress({ account_id: aid, level_id: lid }); } catch (e) { /* ignore */ }
          await TauriService.updateLevelProgress({ account_id: aid, level_id: lid, is_completed: p.isCompleted });
        }
      } else if (p.purchaseToken !== undefined) {
        const peid = cache.purchaseCache[`${gid}_${lowerToken}_Purchase Event`];
        if (peid) {
          let calculatedDaysOffset = 0;

          if (!p.completionDate) {
            const importedPe = data.purchaseEvents.find(
              (pe: any) => pe.event_token?.toLowerCase() === lowerToken,
            );
            if (importedPe && importedPe.days_offset != null) {
              calculatedDaysOffset = importedPe.days_offset;
            }
          }

          if (p.completionDate && accountInfo?.start_date) {
            const m = p.completionDate.match(/^(\d{1,2})-([A-Za-z]{3})$/);
            if (m) {
              const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
              const monthIndex = months.indexOf(m[2].toLowerCase());
              if (monthIndex >= 0) {
                const startDate = new Date(accountInfo.start_date);
                const compDate = new Date(new Date().getFullYear(), monthIndex, parseInt(m[1]));
                const diffTime = compDate.getTime() - startDate.getTime();
                calculatedDaysOffset = Math.round(diffTime / (1000 * 60 * 60 * 24));
              }
            }
          }

          try { await TauriService.createPurchaseEventProgress({ account_id: aid, purchase_event_id: peid, days_offset: calculatedDaysOffset, time_spent: 0 }); } catch (e) { /* ignore */ }
          await TauriService.updatePurchaseEventProgress({ account_id: aid, purchase_event_id: peid, is_completed: p.isCompleted, days_offset: calculatedDaysOffset });
        }
      }
    } catch (error) {
      result.errors.push({
        type: 'progress',
        message: error instanceof Error ? error.message : 'Failed to import progress',
        item: p,
      });
    }
  }
}

async function restoreCompletedToday(
  todayRecords: any[] | undefined,
  cache: ImportCache,
): Promise<void> {
  if (!Array.isArray(todayRecords) || todayRecords.length === 0) return;

  const today = new Date().toISOString().split('T')[0];
  const completedKey = `dailyTasks_completed_${today}`;
  const existingCompleted = await asyncStorageService.get<any[]>(completedKey);
  let completedList: any[] = existingCompleted || [];

  for (const newRecord of todayRecords) {
    if (!completedList.find(r => r.id === newRecord.id)) {
      completedList.push(newRecord);
    }

    try {
      const ids = await cache.getOrCreateGameAndBranch(newRecord.gameName);
      if (!ids) continue;
      const { targetGameId: gid, targetBranchId } = ids;

      const aid = cache.accountCache[`${gid}_${newRecord.accountName.toLowerCase()}`];
      if (!aid) continue;

      const lowerToken = (newRecord.eventToken || '').toLowerCase();
      const type = newRecord.requestType;

      if (type && type.includes('Purchase')) {
        const peid = cache.purchaseCache[`${gid}_${lowerToken}_${type}`];
        if (peid) {
          try { await TauriService.createPurchaseEventProgress({ account_id: aid, purchase_event_id: peid, days_offset: 0, time_spent: 0 }); } catch (e) { /* ignore */ }
          await TauriService.updatePurchaseEventProgress({ account_id: aid, purchase_event_id: peid, is_completed: true });
        }
      } else if (type) {
        let targetLevelId = null;
        const gameLevels = await TauriService.getGameLevels(targetBranchId);
        const completionTimeMs = newRecord.timeSpent || 0;
        const expectedBaseThousandSeconds = Math.round(completionTimeMs / 1000);

        let bestMatch = null;
        let bestDiff = Infinity;

        for (const level of gameLevels) {
          if (level.event_token.toLowerCase().startsWith(lowerToken)) {
            const diff = Math.abs(level.time_spent - expectedBaseThousandSeconds);
            if (diff < bestDiff && diff < 3) {
              bestMatch = level;
              bestDiff = diff;
            }
          }
        }

        if (bestMatch) {
          targetLevelId = bestMatch.id;
        } else {
          const matchingLevel = gameLevels.find(
            l => l.event_token.toLowerCase() === lowerToken && l.level_name === newRecord.levelName,
          );
          if (matchingLevel) {
            targetLevelId = matchingLevel.id;
          } else {
            targetLevelId = cache.levelCache[`${gid}_${lowerToken}_${type}`];
          }
        }

        if (targetLevelId) {
          try { await TauriService.createLevelProgress({ account_id: aid, level_id: targetLevelId }); } catch (e) { /* ignore */ }
          await TauriService.updateLevelProgress({ account_id: aid, level_id: targetLevelId, is_completed: true });
        }
      }
    } catch (error) {
      console.error('Failed to sync today record to DB:', newRecord, error);
    }
  }

  await asyncStorageService.set(completedKey, completedList);
  window.dispatchEvent(new CustomEvent('daily-task-completed'));
}
