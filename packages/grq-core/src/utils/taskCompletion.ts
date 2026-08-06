import { ApiService } from "@grq/core/services/api.service";
import { TauriService } from "@grq/core/services/tauri.service";
import { todayLocalIso } from "@grq/core/utils/date.utils";
import type { ApiResponse } from "@grq/core/services/api.service";
import type {
  DailyTask,
  GameBatch,
  AccountCompletionRecord,
  CompletedDailyTask,
} from "@grq/api-bindings";

export interface TaskCompletionOptions {
  batches: GameBatch[];
  setBatches: React.Dispatch<React.SetStateAction<GameBatch[]>>;
  deferredTasks: DailyTask[];
  setDeferredTasks: React.Dispatch<React.SetStateAction<DailyTask[]>>;
  games: any[];
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  setAccountCompletionRecords: React.Dispatch<
    React.SetStateAction<{ [accountId: number]: AccountCompletionRecord }>
  >;
  setAccountTaskAssignments: React.Dispatch<
    React.SetStateAction<{ [accountId: number]: any[] }>
  >;
}

/**
 * Compute a random time_spent (in SECONDS) from a level's base time_spent
 * column (base unit where one unit == 1000 seconds) plus a fresh jitter,
 * matching the Rust planner's `request_time_spent`. Used by manual completion
 * flows (detail pages) that write progress/history records outside the
 * daily-request pipeline; the daily pipeline gets its single value from Rust.
 */
export function computeTaskDuration(baseSeconds?: number): number {
  const base = baseSeconds && baseSeconds > 0 ? baseSeconds : 1000;
  const jitter =
    base < 25
      ? Math.floor(Math.random() * 601) - 100
      : Math.floor(Math.random() * 2251) - 750;
  return Math.max(1, base * 1000 + jitter);
}

/** Format level name consistently for the History Report Task Detail column */
export function formatTaskLevelName(
  levelName: string | undefined | null,
  isPurchase: boolean,
): string {
  if (levelName && levelName.trim()) return levelName.trim();
  if (isPurchase) return '$$$';
  if (!levelName) return '-';
  const trimmed = levelName.trim();
  return trimmed || '-';
}

/**
 * Unified execution layer — called by ALL completion entry points
 * (Daily Tasks, Account Detail, Accounts Detail).
 * Saves one row per account via `last_${accountId}` UPSERT.
 */
export async function recordTaskCompletion(params: {
  accountId: number;
  accountName: string;
  gameId: number;
  gameName: string;
  eventToken: string;
  durationMs: number;
  levelId?: number;
  levelName?: string;
  requestType: string;
  isPurchase: boolean;
}): Promise<void> {
  const cleanEventToken = (params.eventToken || '').replace(/_day\d+$/g, '');
  const completedTask: CompletedDailyTask = {
    id: `last_${params.accountId}`,
    accountId: params.accountId,
    accountName: params.accountName,
    gameId: params.gameId,
    gameName: params.gameName || 'Unknown',
    eventToken: cleanEventToken,
    timeSpent: Math.max(1, params.durationMs),
    completionTime: Date.now(),
    completionDate: todayLocalIso(),
    levelId: params.isPurchase ? undefined : params.levelId,
    levelName: formatTaskLevelName(params.levelName, params.isPurchase),
    requestType: params.requestType,
    isPurchase: params.isPurchase,
  };
  try {
    await TauriService.addCompletedTask(completedTask);
    window.dispatchEvent(new CustomEvent("daily-task-completed"));
  } catch (err) {
    console.error("[recordTaskCompletion] Tauri error:", err, completedTask);
    throw err;
  }
}

/**
 * @deprecated Use recordTaskCompletion instead.
 *   Wrapper kept for backward compatibility during migration.
 */
export async function saveCompletionToHistory(params: {
  id?: string;
  accountId: number;
  accountName: string;
  gameId: number;
  gameName: string;
  eventToken: string;
  timeSpent?: number;
  levelId?: number;
  levelName?: string;
  requestType: string;
  isPurchase: boolean;
}): Promise<void> {
  const durationMs = params.timeSpent || 0;
  await recordTaskCompletion({
    accountId: params.accountId,
    accountName: params.accountName,
    gameId: params.gameId,
    gameName: params.gameName,
    eventToken: params.eventToken,
    durationMs,
    levelId: params.levelId,
    levelName: params.levelName,
    requestType: params.requestType,
    isPurchase: params.isPurchase,
  });
}

export class TaskCompletionHandler {
  private options: TaskCompletionOptions;

  constructor(options: TaskCompletionOptions) {
    this.options = options;
  }

  async completeTask(
    accountId: number,
    requestIndex: number,
    batchIndex: number,
    taskRef: DailyTask,
  ): Promise<ApiResponse> {
    try {
      const deriveFinalType = (req: any): any => {
        const currentType = req.request_type as string;

        if (
          currentType === "Session Only" ||
          currentType === "Level Session" ||
          currentType === "Level Event" ||
          currentType === "Purchase Session" ||
          currentType === "Purchase Event"
        ) {
          return currentType;
        }

        if (currentType.includes("Purchase")) {
          return currentType.includes("Session")
            ? "Purchase Session"
            : "Purchase Event";
        }

        if (currentType.includes("Event")) {
          return "Level Event";
        }

        return "Session Only";
      };

      const matchesTask = (task: DailyTask): boolean => {
        const currentGroup = task.requestGroups?.[0];
        const targetGroup = taskRef.requestGroups?.[0];
        return (
          task.account.id === accountId &&
          task.targetDate === taskRef.targetDate &&
          currentGroup?.event_token === targetGroup?.event_token &&
          currentGroup?.time_spent === targetGroup?.time_spent &&
          task.requests.length === taskRef.requests.length
        );
      };

      const updateTaskCollection = (tasks: DailyTask[]): DailyTask[] =>
        tasks.map((task) => {
          if (!matchesTask(task)) return task;

          const newCompletedTasks = new Set(task.completedTasks);
          newCompletedTasks.add(requestIndex.toString());

          // If the completed request is an Event, mark all other requests in its group as completed too
          const completedRequest = task.requests[requestIndex];
          if (
            completedRequest &&
            (deriveFinalType(completedRequest) as string).includes("Event")
          ) {
            // Find the group this event belongs to
            const group = task.requestGroups?.find((g) =>
              g.requests.some((r) => task.requests.indexOf(r) === requestIndex),
            );

            if (group) {
              group.requests.forEach((r) => {
                const idx = task.requests.indexOf(r);
                if (idx !== -1) newCompletedTasks.add(idx.toString());
              });
            }
          }

          return {
            ...task,
            completedTasks: newCompletedTasks,
          };
        });

      // Find the matching task in batches or deferred tasks
      let foundTask: DailyTask | null = null;
      let foundBatch: GameBatch | null = null;
      let foundInDeferred = false;

      if (batchIndex >= 0) {
        const batch =
          this.options.batches.find((b) => b.batchIndex === batchIndex) || null;
        foundTask = batch?.tasks.find(matchesTask) || null;
        if (foundTask && batch) {
          foundBatch = batch;
        }
      }

      if (!foundTask) {
        for (const batch of this.options.batches) {
          foundTask = batch.tasks.find(matchesTask) || null;
          if (foundTask) {
            foundBatch = batch;
            break;
          }
        }
      }

      if (!foundTask) {
        foundTask = this.options.deferredTasks.find(matchesTask) || null;
        foundInDeferred = !!foundTask;
      }

      if (!foundTask) return { success: false, error: "Task not found" };

      const request = foundTask.requests[requestIndex];
      const finalRequestType = deriveFinalType(request);
      const isPurchaseEvent = finalRequestType === "Purchase Event";
      const isPurchaseSession = finalRequestType === "Purchase Session";
      const isLevelSession = finalRequestType === "Level Session";
      const isSessionOnly = finalRequestType === "Session Only";
      const usesSyntheticSessionLevel =
        isPurchaseSession || isLevelSession || isSessionOnly;

      const toMidnightUTC = (dateStr: string) => {
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return null;
        return new Date(
          Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
        ).getTime();
      };

      const resolveSessionLevelId = async (): Promise<number> => {
        const account = await TauriService.getAccountById(accountId);
        if (!account) throw new Error("Account not found");
        if (!account.branch_id)
          throw new Error("Account has no branch associated with it");

        const gameLevels = await TauriService.getGameLevels(account.branch_id);
        let baseToken = (request.event_token || "").split("_day")[0];
        let daysOffset = 0;
        let timeSpent = Math.round((request.time_spent || 0) / 1000);

        if (request.level_id) {
          const sourceLevel = gameLevels.find(
            (level) => level.id === request.level_id,
          );
          if (sourceLevel) {
            baseToken = (sourceLevel.event_token || baseToken).split("_day")[0];
            // Initialize daysOffset from level as fallback, but we will likely override it for Session Only
            daysOffset =
              typeof sourceLevel.days_offset === "number"
                ? sourceLevel.days_offset
                : 0;
            timeSpent = sourceLevel.time_spent || timeSpent;
          }
        } else if (isPurchaseSession && request.event_token) {
          const purchaseEvents = await TauriService.getGamePurchaseEvents(
            account.branch_id,
          );
          const purchaseEvent = purchaseEvents.find(
            (event) => event.event_token === request.event_token,
          );
          if (purchaseEvent) {
            daysOffset =
              typeof purchaseEvent.days_offset === "number"
                ? purchaseEvent.days_offset
                : 0;
          }
        }

        // For Session Only or any gap-filler, ALWAYS verify day offset against the target date
        if (isSessionOnly || !request.level_id) {
          const eventTokenMatch = (request.event_token || "").match(
            /_day(-?\d+)$/,
          );
          if (eventTokenMatch) {
            daysOffset = parseInt(eventTokenMatch[1], 10);
          } else {
            const startUTC = toMidnightUTC(account.start_date);
            const targetUTC = toMidnightUTC(foundTask.targetDate);
            if (startUTC !== null && targetUTC !== null) {
              const msPerDay = 24 * 60 * 60 * 1000;
              daysOffset = Math.round((targetUTC - startUTC) / msPerDay);
            }
          }
        }

        if (isSessionOnly) {
          // Calculate timeSpent using sophisticated logic matching AccountDetailPage
          const relatedRealLevels = gameLevels
            .filter(
              (level) =>
                level.level_name !== "-" &&
                (level.event_token || "").split("_day")[0] === baseToken,
            )
            .sort((a, b) => a.days_offset - b.days_offset);

          const searchLevels =
            relatedRealLevels.length > 0
              ? relatedRealLevels
              : gameLevels.filter((l) => l.level_name !== "-");
          const nextMatch = searchLevels.find(
            (l) => l.days_offset > daysOffset,
          );
          const firstRealDay = Number(searchLevels[0]?.days_offset ?? 0);

          if (nextMatch && daysOffset < firstRealDay) {
            timeSpent = Math.round(
              (daysOffset + 1) *
                ((nextMatch.time_spent || 0) / (firstRealDay + 1)),
            );
          } else if (nextMatch) {
            const prevLevels = searchLevels.filter(
              (l) => l.days_offset < daysOffset,
            );
            const prevReal = prevLevels[prevLevels.length - 1];
            timeSpent = prevReal?.time_spent || timeSpent;
          } else {
            const prevReal = searchLevels
              .filter((l) => l.days_offset <= daysOffset)
              .slice(-1)[0];
            timeSpent = prevReal?.time_spent || timeSpent;
          }
        }

        if (!baseToken) {
          throw new Error("Session token could not be resolved");
        }

        const sessionEventToken = `${baseToken}_day${daysOffset}`;
        const existingSessionLevel = gameLevels.find(
          (level) =>
            level.level_name === "-" &&
            level.event_token === sessionEventToken &&
            level.days_offset === daysOffset,
        );

        if (existingSessionLevel) {
          return existingSessionLevel.id;
        }

        // Per-token rule: never create a standalone Session when a real Level
        // Event with the SAME base token already exists on the same day — reuse
        // the real event instead (matches LevelService::create_level guard).
        const sameTokenEvent = gameLevels.find(
          (level) =>
            level.level_name !== "-" &&
            level.days_offset === daysOffset &&
            (level.event_token || "").split("_day")[0] === baseToken,
        );

        if (sameTokenEvent) {
          console.log(
            `[taskCompletion] Reusing real level ${sameTokenEvent.id} (${sameTokenEvent.event_token}) instead of creating standalone Session on day ${daysOffset}`,
          );
          TauriService.logMaintenanceEvent({
            action: "session_reused",
            branchId: account.branch_id,
            levelId: sameTokenEvent.id,
            eventToken: sessionEventToken,
            daysOffset,
            reason: "real Level Event with same Event Token exists on same day",
            detail: "standalone Session completion reused the real event",
          }).catch(() => {});
          return sameTokenEvent.id;
        }

        return TauriService.addLevel({
          game_id: account.game_id,
          branch_id: account.branch_id,
          level_name: "-",
          event_token: sessionEventToken,
          days_offset: daysOffset,
          time_spent: timeSpent,
          is_bonus: false,
        });
      };

      if (!request.level_id && !isPurchaseEvent && !usesSyntheticSessionLevel) {
        console.error(
          "Task completion error: request missing level_id and not identified as supported request type",
          {
            requestType: request.request_type,
            eventToken: request.event_token,
            levelId: request.level_id,
            finalRequestType,
          },
        );
        throw new Error("Task completion error");
      }

      let result: any;
      let resolvedLevelId = request.level_id ?? undefined;

      if (isPurchaseEvent) {
        // Handle purchase event completion
        if (!request.event_token) {
          throw new Error("Purchase event token is missing");
        }

        // Get account details to find the branch ID
        const account = await TauriService.getAccountById(accountId);
        if (!account) {
          throw new Error("Account not found");
        }

        if (!account.branch_id) {
          throw new Error("Account has no branch associated with it");
        }

        // Get purchase events for this branch to find the one with matching event_token
        const gamePurchaseEvents = await TauriService.getGamePurchaseEvents(
          account.branch_id,
        );
        const purchaseEventDetails = gamePurchaseEvents.find(
          (pe) => pe.event_token === request.event_token,
        );

        if (!purchaseEventDetails) {
          throw new Error("Purchase event not found in game configuration");
        }

        // Ensure purchase event progress exists, create if necessary
        let purchaseEventProgress =
          await TauriService.getAccountPurchaseEventProgress(accountId);
        let purchaseEvent = purchaseEventProgress.find(
          (pe) => pe.purchase_event_id === purchaseEventDetails.id,
        );

        if (!purchaseEvent) {
          // Try to create the purchase event progress first
          try {
            const createRequest = {
              account_id: accountId,
              purchase_event_id: purchaseEventDetails.id,
              days_offset: purchaseEventDetails.days_offset || 0,
              time_spent: 0, // Will be updated when the task is completed
            };
            await TauriService.createPurchaseEventProgress(createRequest);

            // Refresh the progress list
            purchaseEventProgress =
              await TauriService.getAccountPurchaseEventProgress(accountId);
            purchaseEvent = purchaseEventProgress.find(
              (pe) => pe.purchase_event_id === purchaseEventDetails.id,
            );
          } catch (createError) {
            console.warn(
              "Failed to create purchase event progress, it may already exist:",
              createError,
            );
            // Try one more time to get the progress
            purchaseEventProgress =
              await TauriService.getAccountPurchaseEventProgress(accountId);
            purchaseEvent = purchaseEventProgress.find(
              (pe) => pe.purchase_event_id === purchaseEventDetails.id,
            );
          }
        }

        if (!purchaseEvent) {
          throw new Error(
            "Purchase event progress not found and could not be created",
          );
        }

        // Update purchase event progress
        const updateRequest = {
          account_id: accountId,
          purchase_event_id: purchaseEvent.purchase_event_id,
          is_completed: true,
          time_spent: request.time_spent,
          target_date: foundTask.targetDate,
          bypass_cooldown: true,
        };

        result = await TauriService.updatePurchaseEventProgress(updateRequest);

        // Record completed purchase event
        await recordTaskCompletion({
          accountId,
          accountName: account.name,
          gameId: account.game_id,
          gameName:
            this.options.games.find((g) => g.id === account.game_id)?.name ||
            "Unknown",
          eventToken: request.event_token!,
            durationMs: request.time_spent || 0,
          levelName: request.level_name,
          requestType: finalRequestType,
          isPurchase: true,
        });
      } else {
        let targetLevelId = request.level_id;

        if (usesSyntheticSessionLevel) {
          targetLevelId = await resolveSessionLevelId();
        }

        if (!targetLevelId) {
          throw new Error("Level ID is required for level event completion");
        }

        resolvedLevelId = targetLevelId;

        // Ensure level progress record exists before updating
        // This is critical for the "first-time" completion of session-only tasks
        const existingProgress =
          await TauriService.getAccountLevelProgress(accountId);
        const hasProgress = existingProgress.some(
          (p) => p.level_id === targetLevelId,
        );

        if (!hasProgress) {
          try {
            await TauriService.createLevelProgress({
              account_id: accountId,
              level_id: targetLevelId,
            });
          } catch (error) {
            console.warn(
              "Level progress creation failed, it might have been created by another process:",
              error,
            );
          }
        }

        // Now update the progress to completed status.
        // time_spent is in SECONDS and stored as-is in the progress record.
        // target_date stamps today so the planner's group-skip rule
        // (is_completed && target_date == today) drops the task immediately on
        // the next regeneration.
        const updateTimeSpentMs = request.time_spent || 0;
        const updateRequest = {
          account_id: accountId,
          level_id: targetLevelId,
          time_spent: updateTimeSpentMs,
          is_completed: true,
          target_date: todayLocalIso(),
          bypass_cooldown: true,
        };

        result = await ApiService.updateLevelProgress(updateRequest);
      }

      const success =
        result === true ||
        (result && typeof result === "object" && result.success);

      if (success) {
        const now = Date.now();

        // Create individual completion records for all level events
        if (!isPurchaseEvent) {
          await recordTaskCompletion({
            accountId,
            accountName: foundTask!.account.name,
            gameId: foundTask!.account.game_id,
            gameName:
              this.options.games.find(
                (g) => g.id === foundTask!.account.game_id,
              )?.name || "Unknown",
            eventToken: request.event_token || "",
          durationMs: request.time_spent || 0,
            levelId: resolvedLevelId,
            levelName: isSessionOnly ? '-' : request.level_name,
            requestType: finalRequestType,
            isPurchase: false,
          });
        }

        // Update task completion status
        const updatedBatches = this.options.batches.map((batch) => ({
          ...batch,
          tasks: updateTaskCollection(batch.tasks),
        }));
        const updatedDeferredTasks = updateTaskCollection(
          this.options.deferredTasks,
        );

        // Check if this completes a Session+Event pair (both requests in the group)
        if (foundTask && foundTask.requestGroups) {
          const updatedTask = foundInDeferred
            ? updatedDeferredTasks.find(matchesTask) || null
            : foundBatch
              ? updatedBatches
                  .find((b) => b.batchIndex === foundBatch!.batchIndex)
                  ?.tasks.find(matchesTask) || null
              : updatedBatches
                  .flatMap((batch) => batch.tasks)
                  .find(matchesTask) || null;

          // Find which group this request belongs to
          for (const group of foundTask.requestGroups) {
            const groupIndices = group.requests.map((_, idx) =>
              foundTask!.requests.indexOf(group.requests[idx]),
            );

            // Check if all requests in this group are now completed
            const allGroupCompleted = groupIndices.every((idx) =>
              updatedTask?.completedTasks.has(idx.toString()),
            );

            if (allGroupCompleted && groupIndices.includes(requestIndex)) {
              const completionRecord: AccountCompletionRecord = {
                accountId,
                // time_spent is already in seconds; store as-is. The timer diffs
                // it against the next task's seconds-based time_spent, and the UI
                // renders this value directly as "{{timeSpent}}s".
                timeSpent: Math.round(group.time_spent),
                completionTime: now,
                levelId: resolvedLevelId ?? 0,
                eventToken: group.event_token,
              };

              this.options.setAccountCompletionRecords((prev) => ({
                ...prev,
                [accountId]: completionRecord,
              }));

              // Clear task assignments for this account since the pair is completed
              this.options.setAccountTaskAssignments((prev) => ({
                ...prev,
                [accountId]: [],
              }));

              this.options.setBatches(updatedBatches);
              this.options.setDeferredTasks(updatedDeferredTasks);

              // Dispatch progress-updated event
              window.dispatchEvent(
                new CustomEvent("progress-updated", { detail: { accountId } }),
              );

              return; // Exit early since we've handled everything
            }
          }
        }

        // If we get here, the task was partially completed (only one request in a pair)
        // We still update the completion record for timing purposes
        this.options.setAccountCompletionRecords((prev) => ({
          ...prev,
          [accountId]: {
            accountId,
            timeSpent: Math.round(request.time_spent || 0),
            completionTime: now,
            levelId: resolvedLevelId ?? 0,
            eventToken: request.event_token || "",
          },
        }));

        this.options.setBatches(updatedBatches);
        this.options.setDeferredTasks(updatedDeferredTasks);

        // Dispatch progress-updated event to refresh other components
        window.dispatchEvent(
          new CustomEvent("progress-updated", { detail: { accountId } }),
        );

        return result; // Return the successful result
      } else {
        const errorMessage =
          typeof result === "object" && result.error
            ? result.error
            : "Failed to update progress";
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
