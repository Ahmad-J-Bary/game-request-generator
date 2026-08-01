import { TauriService } from '../tauri.service.ts';
import { asyncStorageService } from '../storage.service.ts';
import { formatDateShort, parseDate, addDays, todayIsoDate } from './excel-date-utils.ts';
import { parseDMMMDate } from './excel-parse-utils.ts';

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

/**
 * Rule 1: a standalone Session carries the base token of its NEXT real Level
 * Event (falling back to the previous real level when no event follows). This
 * replaces the old `levels[0]` base that disconnected Session tokens from the
 * event they follow.
 */
function getBaseTokenForOffset(offset: number, gameLevels: any[]): string {
  const realLevels = gameLevels
    .filter((l) => l.level_name !== '-' && typeof l.days_offset === 'number')
    .sort((a, b) => a.days_offset - b.days_offset);

  if (realLevels.length === 0) return 'lvl';

  const nextReal = realLevels.find((l) => l.days_offset > offset);
  const prevReal = [...realLevels].reverse().find((l) => l.days_offset <= offset);
  const chosen = nextReal || prevReal;

  return chosen.event_token ? chosen.event_token.split('_day')[0] : 'lvl';
}

function getInterpolatedTimeSpent(day: number, gameLevels: any[]): number {
  if (gameLevels.length === 0) return 0;

  const numeric = gameLevels
    .filter((l) => typeof l.days_offset === 'number' && l.level_name !== '-')
    .sort((a, b) => a.days_offset - b.days_offset);

  if (numeric.length === 0) return 0;

  const exact = numeric.find((l) => l.days_offset === day);
  if (exact && exact.time_spent) return exact.time_spent;

  const prevReal = [...numeric].reverse().find((l) => l.days_offset < day);
  const nextReal = numeric.find((l) => l.days_offset > day);

  if (nextReal && !prevReal) {
    const firstRealDay = nextReal.days_offset;
    const increment = (nextReal.time_spent || 0) / (firstRealDay + 1);
    return Math.round((day + 1) * increment);
  }

  if (prevReal && nextReal) {
    const ratio = (day - prevReal.days_offset) / (nextReal.days_offset - prevReal.days_offset);
    return Math.round((prevReal.time_spent || 0) + ratio * ((nextReal.time_spent || 0) - (prevReal.time_spent || 0)));
  }

  if (prevReal && !nextReal) {
    return prevReal.time_spent || 0;
  }

  return 0;
}

/**
 * Apply Session completion for a specific game's accounts.
 * Uses per-account session date overrides (from import) when available.
 * Creates session-only levels in `game_levels` if missing, and marks
 * `account_level_progress` and `account_purchase_event_progress` as completed
 * for all accounts up to their Session cutoff date.
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

    for (const branch of branches) {
      const branchAccounts = allAccounts.filter((a: any) => a.branch_id === branch.id);
      if (branchAccounts.length === 0) continue;

      let levels = await TauriService.getGameLevels(branch.id);

      // Rule 2 (per token): a standalone Session must never coexist with a real
      // Level Event on the same day. Offsets that carry a real level are handled
      // exclusively by the parser cascade, so this processor skips them.
      const realLevelOffsets = new Set<number>(
        levels
          .filter((l: any) => l.level_name !== '-' && l.days_offset != null)
          .map((l: any) => l.days_offset as number),
      );

      // Rule 3 (per token): a base token that has a real Level Event anywhere is
      // an "event + session" pair — its standalone Session row must never be
      // CREATED here. Days before/after such an event are generated
      // synthetically by the planner; this processor may only complete an
      // already-existing '-' row for such a token (legacy data).
      const eventBaseTokens = new Set<string>(
        levels
          .filter((l: any) => l.level_name !== '-' && l.event_token)
          .map((l: any) => String(l.event_token).split('_day')[0]),
      );

      for (const account of branchAccounts) {
        result.totalAccountsScanned++;

        const startDate = parseDate(account.start_date);
        if (!startDate) continue;

        // Normalize to local midnight so calendar-day math is exact: the Session
        // date day itself (e.g. offset 29 for a 1-Jul start + 30-Jul Session) is
        // included, avoiding a timezone off-by-one that previously dropped it.
        const startLocal = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

        const overrideDateStr = sessionDateOverrides?.get(account.id);
        let cutoffDate: Date;
        if (overrideDateStr) {
          const parsed = parseDMMMDate(overrideDateStr, startLocal.getFullYear());
          cutoffDate = parsed || new Date();
        } else {
          cutoffDate = new Date();
        }

        const diffMs = cutoffDate.getTime() - startLocal.getTime();
        const maxCutoffOffset = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (maxCutoffOffset < 0) continue;

        const targetOffsets = new Set<number>();
        levels.forEach((l: any) => {
          if (l.days_offset != null && l.days_offset <= maxCutoffOffset) {
            targetOffsets.add(l.days_offset);
          }
        });
        for (let d = 0; d <= maxCutoffOffset; d++) {
          targetOffsets.add(d);
        }

        // Rule 2 (per token): drop offsets that already have a real Level Event —
        // the parser cascade completes those, never a standalone Session here.
        const sessionOnlyOffsets = [...targetOffsets].filter((o) => !realLevelOffsets.has(o));
        result.totalSessionLevelsFound += sessionOnlyOffsets.length;

        let levelProgress: any[] = [];
        try {
          levelProgress = await TauriService.getAccountLevelProgress(account.id);
        } catch (_) {}
        const completedLevelSet = new Set<number>();
        levelProgress.forEach((p: any) => {
          if (p.is_completed) completedLevelSet.add(p.level_id);
        });

        for (const offset of sessionOnlyOffsets) {
          const eventDate = addDays(startLocal, offset);
          if (eventDate.getTime() > cutoffDate.getTime()) continue;

          // Rule 1: token follows the next real level (previous as fallback).
          const baseToken = getBaseTokenForOffset(offset, levels);
          const sessionToken = `${baseToken}_day${offset}`;
          const belongsToEvent = eventBaseTokens.has(baseToken);

          let sessionLevel = levels.find(
            (l: any) => l.level_name === '-' && l.event_token === sessionToken && l.days_offset === offset,
          );

          // Rule 3: never CREATE a standalone Session row for a base token that
          // belongs to a Level Event — the session folds into the event column.
          // If such a row already exists (legacy data) it may still be completed.
          if (!sessionLevel && !belongsToEvent) {
            const interpolatedSpent = getInterpolatedTimeSpent(offset, levels);
            const finalTimeSpent = interpolatedSpent > 0 ? interpolatedSpent : Math.max(1, offset + 1);

            try {
              const newLevelId = await TauriService.addLevel({
                game_id: gameId,
                branch_id: branch.id,
                level_name: '-',
                event_token: sessionToken,
                days_offset: offset,
                time_spent: finalTimeSpent,
                is_bonus: false,
              });
              sessionLevel = {
                id: newLevelId,
                game_id: gameId,
                branch_id: branch.id,
                level_name: '-',
                event_token: sessionToken,
                days_offset: offset,
                time_spent: finalTimeSpent,
                is_bonus: false,
              };
              levels.push(sessionLevel);
            } catch (err) {
              const freshLevels = await TauriService.getGameLevels(branch.id);
              levels = freshLevels;
              sessionLevel = levels.find(
                (l: any) => l.level_name === '-' && l.event_token === sessionToken && l.days_offset === offset,
              );
            }
          }

          if (sessionLevel && !completedLevelSet.has(sessionLevel.id)) {
            try {
              await TauriService.createLevelProgress({ account_id: account.id, level_id: sessionLevel.id });
            } catch (_) {}
            await TauriService.updateLevelProgress({
              account_id: account.id,
              level_id: sessionLevel.id,
              is_completed: true,
              target_date: todayIsoDate(),
            });
            completedLevelSet.add(sessionLevel.id);
            result.completedByCutoff++;
            result.details.push({
              gameName: game.name,
              accountId: account.id,
              accountName: account.name,
              levelId: sessionLevel.id,
              levelToken: sessionToken,
              computedDate: formatDateShort(eventDate),
              wasAlreadyCompleted: false,
              markedAsCompleted: true,
            });
          }
        }

        // Real levels (level_name !== '-') and purchase events are completed
        // exclusively by the parser-level session cutoff + cascade logic during
        // importProgressMatrix. The session processor only handles session-only
        // levels so it does NOT duplicate or override the parser's isCompleted
        // determinations.
      }
    }

    result.alreadyCompleted = result.totalSessionLevelsFound - result.completedByCutoff;
    if (result.alreadyCompleted < 0) result.alreadyCompleted = 0;

    console.log(`[SessionProcessor] Game ${game.name}: scanned=${result.totalAccountsScanned} sessionLevels=${result.totalSessionLevelsFound} completed=${result.completedByCutoff}`);
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
