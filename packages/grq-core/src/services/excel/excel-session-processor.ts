import { TauriService } from '../tauri.service';
import { asyncStorageService } from '../storage.service';
import { formatDateShort, parseDate, addDays } from './excel-date-utils';
import { parseDMMMDate } from './excel-parse-utils';

export interface SessionProcessorResult {
  totalAccountsScanned: number;
  totalSessionLevelsFound: number;
  completedByCutoff: number;
  alreadyCompleted: number;
  errors: string[];
  details: SessionCompletionDetail[];
}

interface SessionCompletionDetail {
  gameName: string;
  accountId: number;
  accountName: string;
  levelId: number;
  levelToken: string;
  computedDate: string;
  wasAlreadyCompleted: boolean;
  markedAsCompleted: boolean;
}

function processAccount(
  account: any,
  sessionOnlyLevels: any[],
  gameName: string,
  overrideDateStr?: string,
): Promise<SessionCompletionDetail[]> {
  return (async () => {
    const results: SessionCompletionDetail[] = [];
    const startDate = parseDate(account.start_date);
    if (!startDate) return results;

    let levelProgress: any[];
    try {
      levelProgress = await TauriService.getAccountLevelProgress(account.id);
    } catch {
      return results;
    }

    const progressMap = new Map<number, boolean>();
    levelProgress.forEach((p: any) => {
      if (p.is_completed) progressMap.set(p.level_id, true);
    });

    for (const level of sessionOnlyLevels) {
      if (progressMap.has(level.id)) continue;
      if (level.days_offset == null) continue;

      const eventDate = addDays(startDate, level.days_offset);
      const eventDateDMMM = formatDateShort(eventDate);

      let cutoffDate: Date;
      if (overrideDateStr) {
        const parsed = parseDMMMDate(overrideDateStr, startDate.getFullYear());
        cutoffDate = parsed || new Date();
      } else {
        cutoffDate = new Date();
      }

      if (eventDate.getTime() <= cutoffDate.getTime()) {
        try {
          await TauriService.createLevelProgress({ account_id: account.id, level_id: level.id });
        } catch { /* ignore duplicate */ }
        await TauriService.updateLevelProgress({
          account_id: account.id,
          level_id: level.id,
          is_completed: true,
        });
        results.push({
          gameName,
          accountId: account.id,
          accountName: account.name,
          levelId: level.id,
          levelToken: level.event_token || '',
          computedDate: eventDateDMMM,
          wasAlreadyCompleted: false,
          markedAsCompleted: true,
        });
      }
    }
    return results;
  })();
}

/**
 * Apply Session completion for a specific game's accounts.
 * Uses per-account session date overrides (from import) when available.
 */
export async function applySessionCompletionForGame(
  gameId: number,
  sessionDateOverrides?: Map<number, string>,
): Promise<SessionProcessorResult> {
  const result: SessionProcessorResult = {
    totalAccountsScanned: 0,
    totalSessionLevelsFound: 0,
    completedByCutoff: 0,
    alreadyCompleted: 0,
    errors: [],
    details: [],
  };

  try {
    const game = await TauriService.getGameById(gameId);
    if (!game) {
      result.errors.push(`Game with ID ${gameId} not found`);
      return result;
    }

    const branches = await TauriService.getGameBranches(gameId);
    const allAccounts = await TauriService.getAccounts(gameId);

    const branchPromises = branches.map(async (branch) => {
      const branchAccounts = allAccounts.filter((a: any) => a.branch_id === branch.id);
      if (branchAccounts.length === 0) return;

      const levels = await TauriService.getGameLevels(branch.id);
      const sessionOnlyLevels = levels.filter((l: any) => l.level_name === '-');
      if (sessionOnlyLevels.length === 0) return;

      result.totalSessionLevelsFound += sessionOnlyLevels.length * branchAccounts.length;

      const accountPromises = branchAccounts.map(async (account: any) => {
        result.totalAccountsScanned++;
        const overrideDateStr = sessionDateOverrides?.get(account.id);
        const details = await processAccount(account, sessionOnlyLevels, game.name, overrideDateStr);
        if (details.length > 0) {
          result.completedByCutoff += details.length;
          result.details.push(...details);
        }
      });

      await Promise.all(accountPromises);
    });

    await Promise.all(branchPromises);

    result.alreadyCompleted = result.totalSessionLevelsFound - result.completedByCutoff;
    if (result.alreadyCompleted < 0) result.alreadyCompleted = 0;

    console.log(`[SessionProcessor] Game ${game.name}: scanned=${result.totalAccountsScanned} sessionLevels=${result.totalSessionLevelsFound} completed=${result.completedByCutoff} alreadyDone=${result.alreadyCompleted}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error in session processor';
    result.errors.push(message);
    console.error(`[SessionProcessor] Error for game ${gameId}:`, error);
  }

  return result;
}

/**
 * Apply Session completion logic to all accounts across all games.
 * Uses current date as fallback cutoff (for accounts without import overrides).
 * Processes games in parallel batches.
 */
export async function applySessionCompletionForAllAccounts(
  concurrency?: number,
): Promise<SessionProcessorResult> {
  const result: SessionProcessorResult = {
    totalAccountsScanned: 0,
    totalSessionLevelsFound: 0,
    completedByCutoff: 0,
    alreadyCompleted: 0,
    errors: [],
    details: [],
  };

  try {
    const games = await TauriService.getGames();

    const gamePromises = games.map(async (game) => {
      const gameResult = await applySessionCompletionForGame(game.id);
      result.totalAccountsScanned += gameResult.totalAccountsScanned;
      result.totalSessionLevelsFound += gameResult.totalSessionLevelsFound;
      result.completedByCutoff += gameResult.completedByCutoff;
      result.alreadyCompleted += gameResult.alreadyCompleted;
      result.errors.push(...gameResult.errors);
      result.details.push(...gameResult.details);
    });

    if (concurrency && concurrency > 0) {
      for (let i = 0; i < gamePromises.length; i += concurrency) {
        await Promise.all(gamePromises.slice(i, i + concurrency));
      }
    } else {
      await Promise.all(gamePromises);
    }

    await saveSessionProcessorResult(result);

    console.log(`[SessionProcessor] System scan complete: games=${games.length} scanned=${result.totalAccountsScanned} completed=${result.completedByCutoff}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error in session processor';
    result.errors.push(message);
    console.error('[SessionProcessor] Error scanning all accounts:', error);
  }

  return result;
}

const STORAGE_KEY = 'session_processor_log';

export async function saveSessionProcessorResult(result: SessionProcessorResult): Promise<void> {
  try {
    const existing = await asyncStorageService.get<any[]>(STORAGE_KEY);
    const log = Array.isArray(existing) ? existing : [];
    log.push({
      timestamp: new Date().toISOString(),
      totalAccountsScanned: result.totalAccountsScanned,
      totalSessionLevelsFound: result.totalSessionLevelsFound,
      completedByCutoff: result.completedByCutoff,
      alreadyCompleted: result.alreadyCompleted,
      errors: result.errors,
      details: result.details.slice(0, 500),
    });
    if (log.length > 100) log.splice(0, log.length - 100);
    await asyncStorageService.set(STORAGE_KEY, log);
  } catch {
    /* storage failure is non-critical */
  }
}
