// ===== Import Persistence Service =====

import { TauriService } from './tauri.service.ts';
import { asyncStorageService } from './storage.service.ts';
import type { ImportData } from './excel/excel-parser.ts';
import { applySessionCompletionForGame } from './excel/excel-session-processor.ts';
import { parseDMMMDate } from './excel/excel-parse-utils.ts';

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
  /** branchId -> (day -> Set of base tokens) that already have a real Level Event */
  branchEventDayCache: Map<number, Map<number, Set<string>>> = new Map();
  /** branchId -> Set of base tokens that have a real Level Event anywhere */
  branchEventBaseCache: Map<number, Set<string>> = new Map();

  private contextGameId?: number;
  private contextBranchId?: number;

  constructor(contextGameId?: number, contextBranchId?: number) {
    this.contextGameId = contextGameId;
    this.contextBranchId = contextBranchId;
  }

  /** Per-token rule helper: does the branch have a real Level Event with the same
   *  base token on the given day? A standalone Session sharing that (base, day)
   *  must not be imported. */
  async hasRealLevelForDayWithBase(
    branchId: number,
    day: number,
    base: string,
  ): Promise<boolean> {
    let dayBases = this.branchEventDayCache.get(branchId);
    if (!dayBases) {
      dayBases = new Map<number, Set<string>>();
      try {
        const gameLevels = await TauriService.getGameLevels(branchId);
        gameLevels
          .filter((l: any) => l.level_name !== '-' && l.days_offset != null)
          .forEach((l: any) => {
            const d = l.days_offset as number;
            const b = String(l.event_token || '').split('_day')[0];
            if (!dayBases!.has(d)) dayBases!.set(d, new Set<string>());
            dayBases!.get(d)!.add(b);
          });
      } catch (_) { /* ignore db error */ }
      this.branchEventDayCache.set(branchId, dayBases);
    }
    const bases = dayBases.get(day);
    return bases ? bases.has(base) : false;
  }

  /** Per-token rule helper: does the branch have a real Level Event whose base
   *  token equals `base` anywhere? A standalone Session ('-') whose base token
   *  has a Level Event must never be imported/created — the session belongs to
   *  the event column. */
  async hasLevelEventForBase(branchId: number, base: string): Promise<boolean> {
    let bases = this.branchEventBaseCache.get(branchId);
    if (!bases) {
      bases = new Set<string>();
      try {
        const gameLevels = await TauriService.getGameLevels(branchId);
        gameLevels
          .filter((l: any) => l.level_name !== '-' && l.event_token)
          .forEach((l: any) => {
            bases!.add(String(l.event_token).split('_day')[0]);
          });
      } catch (_) { /* ignore db error */ }
      this.branchEventBaseCache.set(branchId, bases);
    }
    return bases.has(base);
  }

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
      const lowerName = gameName.trim().toLowerCase();
      if (this.gameCache[lowerName]) {
        targetGame = this.gameCache[lowerName];
      } else {
        targetGame = await TauriService.addGame({ name: gameName.trim() });
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

      // Build per-account session date overrides.
      // Priority: data.accountSessionDates (populated directly from every Excel row)
      // Fallback: data.progress entries that carry sessionDate.
      // This ensures ALL imported accounts get their session-only requests completed,
      // not just the accounts that happened to produce progress entries.
      const sessionDateOverrides = new Map<number, string>();

      // 1. Populate from the authoritative accountSessionDates map (all rows)
      if (data.accountSessionDates && data.accountSessionDates.size > 0) {
        const step1GameCache = {};
        for (const [mapKey, sessionDateStr] of data.accountSessionDates.entries()) {
          const pipeIdx = mapKey.indexOf('|');
          if (pipeIdx < 0) continue;
          const lowerGameName = mapKey.substring(0, pipeIdx);
          const lowerAccName = mapKey.substring(pipeIdx + 1);
          let gid = cache.gameCache[lowerGameName];
          if (!gid && contextGameId) gid = contextGameId;
          if (!gid) {
            for (const [ckey, caid] of Object.entries(cache.accountCache)) {
              if (ckey.endsWith(`_${lowerAccName}`)) {
                sessionDateOverrides.set(caid, sessionDateStr);
                break;
              }
            }
            continue;
          }
          let aid = cache.accountCache[`${gid}_${lowerAccName}`];
          if (!aid) {
            for (const [ckey, caid] of Object.entries(cache.accountCache)) {
              if (ckey.endsWith(`_${lowerAccName}`)) {
                aid = caid;
                break;
              }
            }
          }
          if (!aid) {
            if (!step1GameCache[gid]) {
              try { step1GameCache[gid] = await TauriService.getAccounts(gid); } catch (_) { step1GameCache[gid] = []; }
            }
            const match = step1GameCache[gid].find((a) => a.name?.toLowerCase() === lowerAccName);
            if (match) {
              aid = match.id;
              cache.accountCache[`${gid}_${lowerAccName}`] = aid;
            }
          }
          if (aid && !sessionDateOverrides.has(aid)) {
            sessionDateOverrides.set(aid, sessionDateStr);
          }
        }
      }

      // 2. Populate directly from imported accounts (if sessionDate was attached to account)
      for (const a of data.accounts) {
        const sessionDateStr = (a as any).sessionDate;
        if (!sessionDateStr) continue;
        const lowerGameName = ((a as any).gameName || '').trim().toLowerCase();
        const lowerAccName = (a.name || '').trim().toLowerCase();
        let gid = cache.gameCache[lowerGameName];
        if (!gid && contextGameId) gid = contextGameId;
        if (gid) {
          const aid = cache.accountCache[`${gid}_${lowerAccName}`];
          if (aid && !sessionDateOverrides.has(aid)) {
            sessionDateOverrides.set(aid, sessionDateStr);
          }
        } else {
          for (const [ckey, caid] of Object.entries(cache.accountCache)) {
            if (ckey.endsWith(`_${lowerAccName}`) && !sessionDateOverrides.has(caid)) {
              sessionDateOverrides.set(caid, sessionDateStr);
              break;
            }
          }
        }
      }

      // 3. Fallback: supplement from progress entries for any account still missing
      for (const p of data.progress) {
        if (!p.sessionDate) continue;
        const lowerGameName = p.gameName?.trim().toLowerCase();
        const lowerAccName = p.accountName.toLowerCase();
        let gid = lowerGameName ? cache.gameCache[lowerGameName] : contextGameId;
        if (!gid) continue;
        let aid = cache.accountCache[`${gid}_${lowerAccName}`];
        if (!aid) {
          for (const [ckey, caid] of Object.entries(cache.accountCache)) {
            if (ckey.endsWith(`_${lowerAccName}`)) {
              aid = caid;
              break;
            }
          }
        }
        if (!aid) {
          try {
            const allAccs = await TauriService.getAccounts(gid);
            const match = allAccs.find((a) => a.name?.toLowerCase() === lowerAccName);
            if (match) { aid = match.id; cache.accountCache[`${gid}_${lowerAccName}`] = aid; }
          } catch (_) {}
        }
        if (aid && !sessionDateOverrides.has(aid)) {
          sessionDateOverrides.set(aid, p.sessionDate);
        }
      }

      // Log override summary per step for debugging
      console.log(`[ImportPersistence] sessionDateOverrides total=${sessionDateOverrides.size} (step1=${data.accountSessionDates?.size || 0} mapEntries, step2=${data.accounts.filter((a: any) => (a as any).sessionDate).length} accountDates, step3 supplements)`);
      if (sessionDateOverrides.size > 0) {
        const overrideEntries = [...sessionDateOverrides.entries()].map(([aid, dt]) => `${aid}=${dt}`).join(', ');
        console.log(`[ImportPersistence] Override map: ${overrideEntries}`);
      }

      // Collect all affected game IDs (levels, accounts, and context).
      const affectedGameIds = new Set<number>();
      data.levels.forEach(l => {
        const id = cache.gameCache[((l as any).gameName || '').trim().toLowerCase()];
        if (id) affectedGameIds.add(id);
      });
      data.accounts.forEach(a => {
        const id = cache.gameCache[((a as any).gameName || '').trim().toLowerCase()];
        if (id) affectedGameIds.add(id);
      });
      if (contextGameId) affectedGameIds.add(contextGameId);

      // Apply per-account session-only completion AFTER all data has been imported.
      // Using per-account overrides ensures every row is handled independently.
      console.log(`[ImportPersistence] Running session processor for ${affectedGameIds.size} games with ${sessionDateOverrides.size} account overrides`);
      for (const gid of affectedGameIds) {
        try {
          await applySessionCompletionForGame(gid, sessionDateOverrides);
        } catch (err) {
          console.error(`[ImportPersistence] Session processor error for game ${gid}:`, err);
        }
      }

      // Per-account pass: completes session-only levels for every imported
      // account. A session-only level is completed when its date is <= the
      // Session date (cutoff) OR it lies temporally BEFORE the LAST completed
      // "(C)" Level Event of that account. Runs regardless of whether a Session
      // date exists.
      await applySessionCompletionPerAccount(cache, sessionDateOverrides, data, result);
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
  // Pre-scan: collect the base tokens of real Level Events in THIS file, grouped
  // by (game|branch). Order-independent: works even if a Session row precedes
  // its Event row in the file.
  const fileEventBaseByBranch = new Map<string, Set<string>>();
  for (const lvl of levels as any[]) {
    if (lvl.level_name !== '-' && lvl.event_token) {
      const fileKey = `${String(lvl.gameName || '').toLowerCase()}|${String(lvl.branchName || '').toLowerCase()}`;
      if (!fileEventBaseByBranch.has(fileKey)) {
        fileEventBaseByBranch.set(fileKey, new Set<string>());
      }
      fileEventBaseByBranch.get(fileKey)!.add(String(lvl.event_token).split('_day')[0]);
    }
  }

  const createdKeys = new Set<string>();
  for (const level of levels) {
    try {
      const ids = await cache.getOrCreateGameAndBranch(
        (level as any).gameName,
        (level as any).branchName,
      );
      if (!ids) continue;

      const { targetGameId, targetBranchId } = ids;

      // Rule: a standalone Session ('-') whose base token belongs to a real
      // Level Event is never imported — the session folds into the event
      // ("Level Event (event + session)"); only true standalone tokens (no
      // event anywhere) are imported as "Session Only".
      if ((level as any).level_name === '-') {
        const base = String((level as any).event_token || '').split('_day')[0];
        if (base) {
          const fileKey = `${String((level as any).gameName || '').toLowerCase()}|${String((level as any).branchName || '').toLowerCase()}`;
          const fileBlocked = fileEventBaseByBranch.get(fileKey)?.has(base) ?? false;
          const dbBlocked = await cache.hasLevelEventForBase(targetBranchId, base);
          if (fileBlocked || dbBlocked) {
            result.errors.push({
              type: 'info',
              message: `Skipped standalone Session ${(level as any).event_token}: its base token belongs to a Level Event, the session folds into the event column.`,
              item: level,
            });
            TauriService.logMaintenanceEvent({
              action: 'session_skipped',
              branchId: targetBranchId,
              eventToken: (level as any).event_token,
              reason: 'base token belongs to a Level Event (event + session rule)',
              detail: 'import skipped the standalone Session level',
            }).catch(() => {});
            continue;
          }
        }
      }

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
  const fetchedGameAccounts = new Set<number>();

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

      // Pre-fetch existing DB accounts for this game once to ensure cache has their IDs
      if (!fetchedGameAccounts.has(targetGameId)) {
        fetchedGameAccounts.add(targetGameId);
        try {
          const dbAccs = await TauriService.getAccounts(targetGameId);
          dbAccs.forEach((da: any) => {
            if (da.name) {
              cache.accountCache[`${targetGameId}_${da.name.toLowerCase()}`] = da.id;
            }
          });
        } catch (_) {}
      }

      let accId = cache.accountCache[cacheKey];

      if (!accId) {
        try {
          accId = await TauriService.addAccount({
            ...account,
            game_id: targetGameId,
            branch_id: targetBranchId,
            request_template: account.request_template || 'Needs to be filled in - imported from Excel export',
            country: (account as any).country || 'UNITED STATES (US)',
          } as any);

          cache.accountCache[cacheKey] = accId;
          result.importedCount++;
        } catch (addErr) {
          // If adding failed, try fetching existing accounts again
          try {
            const dbAccs = await TauriService.getAccounts(targetGameId);
            const existing = dbAccs.find((da: any) => da.name?.toLowerCase() === lowerAccName);
            if (existing) {
              accId = existing.id;
              cache.accountCache[cacheKey] = accId;
            }
          } catch (_) {}
        }
      }

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
            // Session-only levels are handled exclusively by the session-specific
            // completion pass which uses the per-row Session column date as cutoff.
            if (item.kind === 'level' && item.level_name === '-') {
              if (isUnderMilestone) {
                foundMilestone = true;
                if (!globalBackfillDate) break;
              }
              continue;
            }
            if (item.kind === 'level') {
              try { await TauriService.createLevelProgress({ account_id: accId, level_id: item.id }); } catch (e) { /* ignore */ }
              await TauriService.updateLevelProgress({ account_id: accId, level_id: item.id, is_completed: true, bypass_cooldown: true });
            } else {
              try { await TauriService.createPurchaseEventProgress({ account_id: accId, purchase_event_id: item.id, days_offset: 0, time_spent: 0 }); } catch (e) { /* ignore */ }
              await TauriService.updatePurchaseEventProgress({ account_id: accId, purchase_event_id: item.id, is_completed: true, bypass_cooldown: true });
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
  let processedCount = 0;
  let skippedNoIds = 0;
  let skippedNoAccount = 0;
  let cacheWarmedAccount = 0;

  // Warm up account cache: ensure every account in data.accounts is cached
  // before we iterate progress entries, preventing silent skips for accounts 2+.
  for (const acc of data.accounts) {
    const lowerGameName = ((acc as any).gameName || '').trim().toLowerCase();
    const lowerAccName = (acc.name || '').trim().toLowerCase();
    if (!lowerGameName || !lowerAccName) continue;
    const gid = cache.gameCache[lowerGameName];
    if (!gid) continue;
    const cacheKey = `${gid}_${lowerAccName}`;
    if (cache.accountCache[cacheKey]) continue;
    try {
      const accounts = await TauriService.getAccounts(gid);
      const existing = accounts.find((a: any) => a.name?.toLowerCase() === lowerAccName);
      if (existing) {
        cache.accountCache[cacheKey] = existing.id;
        cacheWarmedAccount++;
      }
    } catch (_) {}
  }
  if (cacheWarmedAccount > 0) {
    console.log(`[ImportProgressMatrix] Cache warm-up: added ${cacheWarmedAccount} account(s) from DB`);
  }

  for (const p of data.progress) {
    try {
      const ids = await cache.getOrCreateGameAndBranch(p.gameName, (p as any).branchName);
      if (!ids) {
        skippedNoIds++;
        continue;
      }
      const { targetGameId: gid, targetBranchId: bid } = ids;

      let aid = cache.accountCache[`${gid}_${p.accountName.toLowerCase()}`];
      if (!aid) {
        // Fallback: search imported data by name only (ignore gameName mismatch)
        const matchedAcc = data.accounts.find(
          (a: any) => a.name?.toLowerCase() === p.accountName.toLowerCase(),
        );
        if (matchedAcc) {
          const lowerAccName = matchedAcc.name?.toLowerCase() || '';
          aid = cache.accountCache[`${gid}_${lowerAccName}`];
          if (!aid) {
            // Try any cached key that ends with this account name
            for (const [ckey, cid] of Object.entries(cache.accountCache)) {
              if (ckey.endsWith(`_${lowerAccName}`)) {
                aid = cid as number;
                break;
              }
            }
          }
        }
        if (!aid) {
          // DB fallback: check if account already exists for this game
          try {
            const accounts = await TauriService.getAccounts(gid);
            const existing = accounts.find(
              (a: any) => a.name?.toLowerCase() === p.accountName.toLowerCase(),
            );
            if (existing) {
              aid = existing.id;
              cache.accountCache[`${gid}_${p.accountName.toLowerCase()}`] = aid;
            }
          } catch (_) {}
        }
        if (!aid) {
          skippedNoAccount++;
          console.warn(`[ImportProgressMatrix] Skipping progress entry for ${p.accountName}/${p.token}: no account found in cache or DB`);
          continue;
        }
      }

      const lowerToken = p.token.toLowerCase();
      const accountInfo = data.accounts.find(
        (a: any) => a.name?.toLowerCase() === p.accountName.toLowerCase(),
      );

      if (p.levelName !== undefined) {
        // Determine cache key based on level type
        const isSessionOnly = p.levelName === '-';
        const cacheTypeSuffix = isSessionOnly ? 'Session Only' : 'Level Event';
        let lid = cache.levelCache[`${gid}_${lowerToken}_${cacheTypeSuffix}`]
               || cache.levelCache[`${gid}_${lowerToken}_Session Only`]
               || cache.levelCache[`${gid}_${lowerToken}_Level Event`]
               || cache.levelCache[`${gid}_${lowerToken}_Level Session`];
        if (!lid) {
          // Search in the database for this level
          try {
            const gameLevels = await TauriService.getGameLevels(bid);
            const existing = gameLevels.find((l: any) =>
              l.event_token?.toLowerCase() === lowerToken &&
              (isSessionOnly ? l.level_name === '-' : l.level_name !== '-')
            );
            if (existing) {
              lid = existing.id;
              cache.levelCache[`${gid}_${lowerToken}_${cacheTypeSuffix}`] = lid;
            }
          } catch (_) { /* ignore db error */ }
        }
        if (!lid) {
          // Create the level on the fly if not found anywhere
          const dayMatch = p.token.match(/_day(-?\d+)$/);
          if (isSessionOnly) {
            // Rule: no standalone Session progress whose base token belongs to
            // a real Level Event — the session folds into the event.
            const base = p.token.split('_day')[0];
            const blocked = await cache.hasLevelEventForBase(bid, base);
            if (blocked) {
              result.errors.push({
                type: 'info',
                message: `Skipped standalone Session progress ${p.token}: its base token belongs to a Level Event, the session folds into the event column.`,
                item: p,
              });
              TauriService.logMaintenanceEvent({
                action: 'session_skipped',
                branchId: bid,
                eventToken: p.token,
                daysOffset: dayMatch ? parseInt(dayMatch[1], 10) : null,
                reason: 'base token belongs to a Level Event (event + session rule)',
                detail: 'import skipped the standalone Session progress',
              }).catch(() => {});
              continue;
            }
          }
          const newLevelName = p.levelName === '-' ? '-' : (p.levelName || '-');
          try {
            lid = await TauriService.addLevel({
              game_id: gid,
              branch_id: bid,
              level_name: newLevelName,
              event_token: p.token,
              days_offset: dayMatch ? parseInt(dayMatch[1]) : 0,
              time_spent: 0,
              is_bonus: false,
            } as any);
            cache.levelCache[`${gid}_${lowerToken}_${cacheTypeSuffix}`] = lid;
          } catch (_) { /* ignore creation failure */ }
        }
        if (lid) {
          try { await TauriService.createLevelProgress({ account_id: aid, level_id: lid }); } catch (e) { /* ignore */ }
          await TauriService.updateLevelProgress({ account_id: aid, level_id: lid, is_completed: p.isCompleted, bypass_cooldown: true });
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
          await TauriService.updatePurchaseEventProgress({ account_id: aid, purchase_event_id: peid, is_completed: p.isCompleted, days_offset: calculatedDaysOffset, bypass_cooldown: true });
        }
      }
      processedCount++;
    } catch (error) {
      result.errors.push({
        type: 'progress',
        message: error instanceof Error ? error.message : 'Failed to import progress',
        item: p,
      });
    }
  }

  if (skippedNoIds > 0 || skippedNoAccount > 0) {
    console.warn(`[ImportProgressMatrix] progressEntries=${data.progress.length} processed=${processedCount} skippedNoIds=${skippedNoIds} skippedNoAccount=${skippedNoAccount}`);
  }
  const accountNames = [...new Set(data.progress.map(p => p.accountName))];
  console.log(`[ImportProgressMatrix] Done: ${processedCount}/${data.progress.length} entries across ${accountNames.length} account(s): [${accountNames.join(', ')}]`);

}

/**
 * Per-account session-only completion pass.
 * Called AFTER all levels, accounts, and progress have been imported.
 * For every imported account, iterates over ALL session-only ('-') levels in
 * its branch and marks them as completed when EITHER:
 *  - their computed datetime is <= the Session date (cutoff), OR
 *  - they lie TEMPORALLY BEFORE the LAST completed "(C)" Level Event of that
 *    account: `X < start(E_last)` where E_last is the completed Level Event
 *    with the greatest start datetime. A completed Level Event therefore
 *    completes the Session Only requests that precede it, never the ones that
 *    follow it.
 *
 * The Session date is optional: the last-completed-event rule applies
 * regardless.
 *
 * When the account has a completed Level Event, missing '-' rows for every day
 * in [0, maxRealOffset] (days with no level row) are persisted first so the
 * planner emits a real (positive-id) Session Only request that the frontend can
 * resolve and mark completed — synthetic in-memory days carry negative ids and
 * can never be completed.
 *
 * Every evaluated session-only level is traced via logMaintenanceEvent so the
 * classification (completed/skipped + reason) can be audited.
 *
 * Additionally scans data.accounts for any account not in sessionDateOverrides
 * (catch-all for edge cases where cache lookups failed), ensuring every
 * imported account is processed.
 *
 * This correctly handles:
 * - Accounts in rows 2..N (not just the first row)
 * - Session-only levels that were created during this import run
 * - Accounts from multi-group sheets across all groups
 */
export async function applySessionCompletionPerAccount(
  cache: ImportCache,
  sessionDateOverrides: Map<number, string>,
  data: ImportData,
  result: PersistenceResult,
): Promise<void> {
  const branchLevelsCache = new Map<number, any[]>();

  const DAY_MS = 24 * 60 * 60 * 1000;
  // time_spent is stored in base units where 1 unit == 1000 seconds.
  const UNIT_SECONDS_MS = 1000 * 1000;

  /** Account base-of-day in ms: start_date + start_time (defaults to midnight). */
  const accountBaseMs = (startDate: Date, startTime?: string): number => {
    let hours = 0, minutes = 0, seconds = 0;
    if (startTime) {
      const parts = startTime.split(':').map(p => parseInt(p, 10));
      if (!isNaN(parts[0])) hours = parts[0];
      if (!isNaN(parts[1])) minutes = parts[1];
      if (!isNaN(parts[2])) seconds = parts[2];
    }
    return new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), hours, minutes, seconds).getTime();
  };

  // Helper: complete session-only levels for one account
  const completeForAccount = async (aid: number, sessionDateStr?: string): Promise<number> => {
    let completedCount = 0;
    try {
      const dbAccount = await TauriService.getAccountById(aid).catch(() => null);

      let accountStartDate: Date;
      let accountStartTime: string | undefined;
      let branchId: number | undefined;
      let gameId: number | undefined;

      if (dbAccount) {
        gameId = dbAccount.game_id;
        branchId = dbAccount.branch_id;
        const rawStartDate = dbAccount.start_date
          ? (dbAccount.start_date.includes('T') ? dbAccount.start_date.split('T')[0] : dbAccount.start_date)
          : '';
        accountStartDate = new Date(rawStartDate);
        accountStartTime = dbAccount.start_time;
      } else {
        let startDate = '';
        for (const [cacheKey, caid] of Object.entries(cache.accountCache)) {
          if ((caid as number) !== aid) continue;
          const underscoreIdx = cacheKey.indexOf('_');
          if (underscoreIdx < 0) continue;
          const lowerAccName = cacheKey.substring(underscoreIdx + 1);
          const accData = data.accounts.find((a: any) => a.name?.toLowerCase() === lowerAccName);
          if (accData?.start_date) { startDate = accData.start_date; accountStartTime = (accData as any).start_time; break; }
        }
        if (!startDate) return 0;
        accountStartDate = new Date(startDate.includes('T') ? startDate.split('T')[0] : startDate);
      }

      if (!branchId || isNaN(accountStartDate.getTime())) return 0;

      const baseOfDay = accountBaseMs(accountStartDate, accountStartTime);
      const cutoffDate = sessionDateStr ? parseDMMMDate(sessionDateStr, accountStartDate.getFullYear()) : null;

      // Cache ALL branch levels (real events + '-' sessions) so both the
      // session-only rows and the completed Level Event windows can be derived.
      if (!branchLevelsCache.has(branchId)) {
        try {
          branchLevelsCache.set(branchId, await TauriService.getGameLevels(branchId));
        } catch (_) {
          branchLevelsCache.set(branchId, []);
        }
      }
      const branchLevels = branchLevelsCache.get(branchId) || [];
      let sessionLevels = branchLevels.filter((l: any) => l.level_name === '-');

      let existingProgress: any[];
      try {
        existingProgress = await TauriService.getAccountLevelProgress(aid);
      } catch (_) { return 0; }
      const completedSet = new Set<number>();
      existingProgress.forEach((ep: any) => { if (ep.is_completed) completedSet.add(ep.level_id); });

      // Completed real Level Event windows. Purchases and other sessions are
      // never bounds; their count drives the blanket rule below.
      const completedWindows: { startMs: number; endMs: number; levelId: number; token: string; offset: number; timeSpent: number }[] = [];
      branchLevels.forEach((l: any) => {
        if (l.level_name === '-' || l.days_offset == null) return;
        if (!completedSet.has(l.id)) return;
        const startMs = baseOfDay + l.days_offset * DAY_MS;
        const endMs = startMs + (l.time_spent || 0) * UNIT_SECONDS_MS;
        completedWindows.push({ startMs, endMs, levelId: l.id, token: l.event_token || '', offset: l.days_offset, timeSpent: l.time_spent || 0 });
      });

      // Per-account rule: a Session Only request is completed when it lies
      // temporally BEFORE the LAST completed Level Event of this account.
      // Real levels (excluding '-') are the anchors.
      const hasAnyCompletedEvent = completedWindows.length > 0;
      const lastCompletedEvent = completedWindows.reduce<typeof completedWindows[number] | undefined>(
        (max, w) => (max === undefined || w.startMs > max.startMs ? w : max),
        undefined,
      );
      const lastCompletedStartMs = lastCompletedEvent ? lastCompletedEvent.startMs : null;
      const lastCompletedOffset = lastCompletedEvent ? lastCompletedEvent.offset : null;
      const realLevels = branchLevels
        .filter((l: any) => l.level_name !== '-' && l.days_offset != null)
        .sort((a: any, b: any) => a.days_offset - b.days_offset);
      const maxRealOffset = realLevels.length > 0 ? realLevels[realLevels.length - 1].days_offset : -1;

      const interpolateTime = (d: number): number => {
        if (realLevels.length === 0) return 1;
        const next = realLevels.find((l: any) => l.days_offset > d);
        const prev = realLevels.filter((l: any) => l.days_offset < d).pop();
        if (prev && next) {
          const span = next.days_offset - prev.days_offset;
          const ratio = span > 0 ? (d - prev.days_offset) / span : 0;
          return Math.max(1, Math.round(prev.time_spent + ratio * (next.time_spent - prev.time_spent)));
        }
        if (next && !prev) {
          const firstRealDay = next.days_offset;
          const increment = next.time_spent / (Math.max(firstRealDay, 0) + 1);
          return Math.max(1, Math.round((d + 1) * increment));
        }
        const last = prev || next;
        return Math.max(1, last.time_spent);
      };

      const baseForDay = (d: number): string => {
        const next = realLevels.find((l: any) => l.days_offset > d);
        const source = next || realLevels[realLevels.length - 1];
        return (source?.event_token || '').split('_day')[0] || 'lvl';
      };

      // The planner only synthesizes session-only days in memory (negative ids),
      // so without a persisted row the frontend can never resolve/mark them
      // completed. Persist a '-' row for every day in [0, maxRealOffset] that has
      // no level row so every Session Only request exists and can be completed.
      // Idempotent: addLevel dedupes, and branchLevels is cached.
      if (gameId && hasAnyCompletedEvent) {
        for (let d = 0; d <= maxRealOffset; d++) {
          if (branchLevels.some((l: any) => l.days_offset === d)) continue;
          const base = baseForDay(d);
          const timeSpent = interpolateTime(d);
          let newId: number;
          try {
            newId = await TauriService.addLevel({
              game_id: gameId,
              branch_id: branchId,
              level_name: '-',
              event_token: `${base}_day${d}`,
              days_offset: d,
              time_spent: timeSpent,
              is_bonus: false,
            } as any);
          } catch (_) { continue; }
          branchLevels.push({
            id: newId,
            game_id: gameId,
            branch_id: branchId,
            level_name: '-',
            event_token: `${base}_day${d}`,
            days_offset: d,
            time_spent: timeSpent,
            is_bonus: false,
          });
        }
        sessionLevels = branchLevels.filter((l: any) => l.level_name === '-');
      }
      if (sessionLevels.length === 0) return 0;

      for (const level of sessionLevels) {
        if (level.days_offset == null) continue;
        const sessionX = baseOfDay + level.days_offset * DAY_MS;
        const alreadyCompleted = completedSet.has(level.id);
        const beforeCutoff = !!cutoffDate && sessionX <= cutoffDate.getTime();
        const beforeLastCompletedEvent = lastCompletedStartMs != null && sessionX < lastCompletedStartMs;

        const shouldComplete = !alreadyCompleted && (beforeCutoff || beforeLastCompletedEvent);

        const reason = alreadyCompleted
          ? 'already completed'
          : !beforeCutoff && !beforeLastCompletedEvent
            ? lastCompletedStartMs != null
              ? 'after the last completed (C) Level Event'
              : 'no completed Level Event and after the Session cutoff'
            : beforeCutoff && beforeLastCompletedEvent
              ? 'session cutoff AND before the last completed (C) Level Event'
              : beforeCutoff
                ? 'session cutoff'
                : 'before the last completed (C) Level Event';

        // Trace every evaluated session-only level (completion + classification).
        TauriService.logMaintenanceEvent({
          action: shouldComplete ? 'session_only_completed' : 'session_only_skipped',
          branchId,
          levelId: level.id,
          eventToken: level.event_token,
          daysOffset: level.days_offset,
          reason,
          detail: JSON.stringify({
            sessionX,
            beforeCutoff,
            beforeLastCompletedEvent,
            lastCompletedStartMs,
            lastCompletedOffset,
            completedEventCount: completedWindows.length,
          }),
        }).catch(() => {});

        if (shouldComplete) {
          try { await TauriService.createLevelProgress({ account_id: aid, level_id: level.id }); } catch (_) { /* ignore duplicate */ }
          await TauriService.updateLevelProgress({ account_id: aid, level_id: level.id, is_completed: true, bypass_cooldown: true });
          completedCount++;
        }
      }
    } catch (error) {
      result.errors.push({
        type: 'per-account-session-completion',
        message: error instanceof Error ? error.message : 'Failed per-account session completion',
        item: { aid, sessionDateStr },
      });
    }
    return completedCount;
  };

  // --- Pass 1: Process all accounts from sessionDateOverrides ---
  for (const [aid, sessionDateStr] of sessionDateOverrides.entries()) {
    const completedCount = await completeForAccount(aid, sessionDateStr);
    if (completedCount > 0) {
      console.log(`[ImportPersistence] Per-account session completion: account=${aid} sessionDate=${sessionDateStr} completed=${completedCount} session-only levels`);
    }
  }

  // --- Pass 2: Catch-all for accounts that were not in sessionDateOverrides
  //     (e.g., cache lookup edge cases). Session date is optional: the sandwich
  //     rule applies to every imported account even without one. ---
  const processedAids = new Set(sessionDateOverrides.keys());
  for (const acc of data.accounts) {
    const sessionDateStr = (acc as any).sessionDate || undefined;
    const lowerGameName = ((acc as any).gameName || '').trim().toLowerCase();
    const lowerAccName = (acc.name || '').trim().toLowerCase();
    const gid = cache.gameCache[lowerGameName];
    if (!gid) continue;
    const aid = cache.accountCache[`${gid}_${lowerAccName}`];
    if (!aid || processedAids.has(aid)) continue;
    processedAids.add(aid);
    const completedCount = await completeForAccount(aid, sessionDateStr);
    if (completedCount > 0) {
      console.log(`[ImportPersistence] Catch-all per-account session completion: account=${aid} sessionDate=${sessionDateStr} completed=${completedCount} session-only levels`);
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
          await TauriService.updatePurchaseEventProgress({ account_id: aid, purchase_event_id: peid, is_completed: true, bypass_cooldown: true });
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
          await TauriService.updateLevelProgress({ account_id: aid, level_id: targetLevelId, is_completed: true, bypass_cooldown: true });
        }
      }
    } catch (error) {
      console.error('Failed to sync today record to DB:', newRecord, error);
    }
  }

  await asyncStorageService.set(completedKey, completedList);
  window.dispatchEvent(new CustomEvent('daily-task-completed'));
}





