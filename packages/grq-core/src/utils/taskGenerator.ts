import { TauriService } from "../services/tauri.service.ts";
import {
  calculateFirstRequestAllowedTime,
  parseAccountStartDate,
} from "./daily-tasks.utils.ts";
import { calculateTimerState } from "./timer.utils.ts";
import { todayLocalIso } from "./date.utils.ts";
import { buildRequestGroups } from "./request-groups.utils.ts";
import { buildRegionProcessingOrder } from "./region-order.utils.ts";
import { normalizeState } from "./proxy-state.utils.ts";
import type {
  Account,
  DailyRequestsResponse,
  DailyTask,
  GameBatch,
  AccountCompletionRecord,
  AccountStartState,
  AccountTaskAssignment,
  CompletedDailyTask,
} from "@grq/api-bindings";

export interface TaskGenerationOptions {
  games: any[];
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountStartStates: { [accountId: number]: AccountStartState };
  setAccountStartStates: React.Dispatch<
    React.SetStateAction<{ [accountId: number]: AccountStartState }>
  >;
  setAccountTaskAssignments: React.Dispatch<
    React.SetStateAction<{ [accountId: number]: AccountTaskAssignment[] }>
  >;
  currentTime: number;
  completedTasks: CompletedDailyTask[];
}

export class TaskGenerator {
  private options: TaskGenerationOptions;

  constructor(options: TaskGenerationOptions) {
    this.options = options;
  }

  private async getBranchData(branchId: number) {
    const [levels, purchases] = await Promise.all([
      TauriService.getGameLevels(branchId),
      TauriService.getGamePurchaseEvents(branchId),
    ]);

    return { levels, purchases };
  }

  async generateTodaysTasks(): Promise<{
    batches: GameBatch[];
    deferredTasks: DailyTask[];
    accountScheduledTime: { [accountId: number]: number[] };
  }> {
    const today = todayLocalIso();

    // 1. Get all accounts and group them by state
    const [allAccounts, regions] = await Promise.all([
      TauriService.getAllAccounts(),
      TauriService.getRegions(),
    ]);
    const stateGroups: { [state: string]: Account[] } = {};

    for (const acc of allAccounts) {
      const state = normalizeState(acc.proxy_state) || "Unknown";
      if (!stateGroups[state]) {
        stateGroups[state] = [];
      }
      stateGroups[state].push(acc);
    }

    const allStateKeys = Object.keys(stateGroups);
    const processingOrder = buildRegionProcessingOrder(regions, allStateKeys);

    const allBatches: GameBatch[] = [];
    const globalDeferredTasks: DailyTask[] = [];
    const scheduledTimes: { [accountId: number]: number[] } = {};
    const pendingStartStates: { [accountId: number]: AccountStartState } = {};
    const pendingAssignments: { [accountId: number]: AccountTaskAssignment[] } =
      {};

    // 3. Process states in order
    for (const stateName of processingOrder) {
      const stateAccounts = stateGroups[stateName];
      const readyTasksInState: DailyTask[] = [];

      for (const account of stateAccounts) {
        try {
          const branchId = account.branch_id || 0;
          const { levels: gameLevels, purchases: gamePurchaseEvents } =
            await this.getBranchData(branchId);
          const gameLevelByToken = new Map(
            gameLevels.map((level) => [level.event_token, level]),
          );
          const gameLevelById = new Map(
            gameLevels.map((level) => [level.id, level]),
          );
          const realLevelByToken = new Map(
            gameLevels
              .filter((level) => level.level_name !== "-")
              .map((level) => [level.event_token, level]),
          );
          const purchaseByToken = new Map(
            gamePurchaseEvents.map((purchase) => [
              purchase.event_token,
              purchase,
            ]),
          );
          const [response, accountLevelProgress, accountPurchaseProgress] =
            await Promise.all([
              TauriService.getDailyRequests(account.id, today),
              TauriService.getAccountLevelProgress(account.id),
              TauriService.getAccountPurchaseEventProgress(account.id),
            ]);
          const completedLevelIds = new Set(
            accountLevelProgress
              .filter((progress) => progress.is_completed)
              .map((progress) => progress.level_id),
          );
          const completedPurchaseIds = new Set(
            accountPurchaseProgress
              .filter((progress) => progress.is_completed)
              .map((progress) => progress.purchase_event_id),
          );
          const sessionLevelIdByKey = new Map(
            gameLevels
              .filter((level) => level.level_name === "-")
              .map((level) => [
                `${(level.event_token || "").split("_day")[0]}::${level.days_offset}`,
                level.id,
              ]),
          );

          // Per-account rule: the LAST completed Level Event defines the
          // completion frontier — Session Only requests that lie temporally
          // BEFORE it are completed, the ones after it are not. (Negative-id
          // synthetic rows can never match persisted progress, so we fall back
          // to this account-level frontier signal.)
          const lastCompletedEventOffset = [
            ...completedLevelIds,
          ].reduce<number | null>((last, id) => {
            const level = gameLevelById.get(id);
            if (!level || level.level_name === "-") return last;
            const off = level.days_offset;
            if (typeof off !== "number") return last;
            return last == null || off > last ? off : last;
          }, null);

          const isRequestCompleted = (
            request: DailyRequestsResponse["requests"][number],
          ): boolean => {
            const requestType = request.request_type as string;

            if (requestType === "Purchase Event") {
              const purchase = purchaseByToken.get(request.event_token || "");
              return purchase ? completedPurchaseIds.has(purchase.id) : false;
            }

            if (requestType === "Purchase Session") {
              const purchase = purchaseByToken.get(request.event_token || "");
              if (!purchase) return false;
              const sessionKey = `${request.event_token || ""}::${purchase.days_offset ?? 0}`;
              const sessionLevelId = sessionLevelIdByKey.get(sessionKey);
              return sessionLevelId
                ? completedLevelIds.has(sessionLevelId)
                : false;
            }

            if (requestType === "Level Session") {
              const sourceLevel =
                request.level_id != null
                  ? gameLevelById.get(request.level_id)
                  : undefined;
              if (!sourceLevel) return false;
              const sessionKey = `${(sourceLevel.event_token || "").split("_day")[0]}::${sourceLevel.days_offset ?? 0}`;
              const sessionLevelId = sessionLevelIdByKey.get(sessionKey);
              return sessionLevelId
                ? completedLevelIds.has(sessionLevelId)
                : false;
            }

            if (requestType === "Level Event") {
              return request.level_id != null
                ? completedLevelIds.has(request.level_id)
                : false;
            }

            if (requestType === "Session Only") {
              // A standalone session carries a real level_id (a persisted '-'
              // row) or a negative synthetic id. Completion resolves in tiers:
              //   1. the emitted level_id is a completed persisted row;
              //   2. the persisted '-' row for (base token, day offset) is
              //      completed (covers synthetic negative ids whose row exists
              //      and duplicate-row cases where the emitted id differs);
              //   3. fallback: the session lies before the account's LAST
              //      completed Level Event (genuinely missing rows).
              if (request.level_id != null && completedLevelIds.has(request.level_id)) {
                return true;
              }
              const sessionOffset =
                request.level_id != null
                  ? gameLevelById.get(request.level_id)?.days_offset
                    ?? (request.level_id < 0 ? -request.level_id : undefined)
                  : undefined;
              const dayOffset =
                typeof (request as any).days_offset === "number"
                  ? (request as any).days_offset
                  : sessionOffset;
              if (dayOffset != null) {
                const persistedId = sessionLevelIdByKey.get(
                  `${request.event_token || ""}::${dayOffset}`,
                );
                if (persistedId != null && completedLevelIds.has(persistedId)) {
                  return true;
                }
              }
              return lastCompletedEventOffset != null
                && typeof dayOffset === "number"
                && dayOffset < lastCompletedEventOffset;
            }

            return false;
          };

          const validRequests: any[] = [];
          const tempRequests: any[] = [];

          for (const req of response.requests) {
            const eventToken = (req.event_token || "").trim();
            if (!eventToken) continue;

            // Exact-token match first (Level Event / Level Session / purchases
            // carry the full `_day*` token). "Session Only" requests always
            // carry the BASE token (no `_day*` suffix), so they are matched by
            // stripping the suffix from stored level tokens.
            const matchingLevel = gameLevelByToken.get(eventToken)
              ?? gameLevels.find((l) => (l.event_token || "").split("_day")[0] === eventToken);
            const matchingPurchase = purchaseByToken.get(eventToken);

            // Keep only requests that map to real rows in current branch tables.
            if (matchingLevel || matchingPurchase) {
              // Normalize token before downstream grouping/classification.
              req.event_token = eventToken;
              tempRequests.push(req);
            }
          }

          // The Rust planner already emits the FINAL request types. Here we
          // only enrich each request with data-driven fields for display and
          // completion checks — no classification heuristics.
          for (const req of tempRequests) {
            const matchingLevel = gameLevelByToken.get(req.event_token);
            const matchingPurchase = purchaseByToken.get(req.event_token);
            const finalType = (req.request_type as string) || "";

            if (
              finalType === "Purchase Session" ||
              finalType === "Purchase Event"
            ) {
              const purchase = matchingPurchase as any;
              req.level_name = purchase?.level_name || "$$$";
              req.days_offset = purchase?.days_offset;
              validRequests.push(req);
              continue;
            }

            // Level requests (Session Only / Level Session / Level Event).
            // Rust already attaches the correct level_id; we only fill in
            // level_name/days_offset for display and history records.
            const resolved =
              req.level_id != null
                ? gameLevelById.get(req.level_id)
                : undefined;

            if (finalType === "Level Event") {
              const src = resolved ?? matchingLevel;
              req.level_name = src?.level_name;
              req.days_offset = src?.days_offset;
            } else if (finalType === "Level Session") {
              const src = resolved ?? matchingLevel;
              req.level_name =
                src?.level_name ??
                realLevelByToken.get(req.event_token)?.level_name;
              req.days_offset =
                src?.days_offset ?? matchingLevel?.days_offset;
            } else {
              // Session Only — always shows the session placeholder. The real
              // day offset comes from the persisted '-' row, or from the
              // synthetic negative level id (never the base-matched event's day).
              const src = resolved ?? matchingLevel;
              req.level_name = "-";
              req.days_offset =
                resolved?.days_offset
                ?? (req.level_id != null && req.level_id < 0 ? -req.level_id : src?.days_offset);
            }

            validRequests.push(req);
          }

          if (validRequests.length > 0) {
            const requestGroups = buildRequestGroups(validRequests);

            // Calculate allowed start time if not already there
            const firstEvent = validRequests
              .filter(
                (r) =>
                  (r.request_type as string).includes("Session") ||
                  (r.request_type as string).includes("Event"),
              )
              .sort((a, b) => a.time_spent - b.time_spent)[0];

            if (firstEvent) {
              const firstAllowedAt = calculateFirstRequestAllowedTime(
                account,
                firstEvent.time_spent,
              );
              // Build a robust, always-parseable start time so the first-request
              // timer target is set even for AM/PM or otherwise unusual formats.
              const parsedStart = parseAccountStartDate(account);
              pendingStartStates[account.id] = {
                accountId: account.id,
                startTime: parsedStart
                  ? `${parsedStart.getFullYear()}-${String(
                      parsedStart.getMonth() + 1,
                    ).padStart(2, "0")}-${String(
                      parsedStart.getDate(),
                    ).padStart(2, "0")}T${String(
                      parsedStart.getHours(),
                    ).padStart(2, "0")}:${String(
                      parsedStart.getMinutes(),
                    ).padStart(2, "0")}:${String(
                      parsedStart.getSeconds(),
                    ).padStart(2, "0")}`
                  : `${account.start_date} ${account.start_time}`,
                firstRequestAllowedAt: firstAllowedAt,
                isInitialized: true,
              };
            }

            // A task (request group) is considered completed if its Event is completed.
            // If it has no Event (e.g. Session Only), it's completed if all its requests are completed.
            const pendingGroups = requestGroups.filter((group) => {
              const eventReq = group.requests.find((r) =>
                (r.request_type as string).includes("Event"),
              );
              if (eventReq) {
                // If there is an event, only show if that event is NOT completed
                return !isRequestCompleted(eventReq);
              }
              // For session-only groups, show if any request is not completed
              return group.requests.some(
                (request) => !isRequestCompleted(request),
              );
            });

            // The Rust planner already excludes standalone "Session Only"
            // groups that would trail a purchase card on the same timeline, so
            // no legacy post-filter is needed here.
            pendingGroups.forEach((group, index) => {
              const completedTasks = new Set<string>();
              group.requests.forEach((request, requestIndex) => {
                if (isRequestCompleted(request)) {
                  completedTasks.add(requestIndex.toString());
                }
              });

              const task: DailyTask = {
                account,
                requests: group.requests,
                requestGroups: [group],
                targetDate: response.target_date,
                completedTasks,
                dayTotalTasks: response.total_tasks,
              };

              // Only the first pending group is shown in the ready section.
              // Restore v1.4.9 routing: if the first task's timer is not ready yet,
              // route it to deferred so it appears with its countdown. The UI timer
              // (calculateTimerState in TaskItem) also handles readiness live.
              // Subsequent pending groups always go to deferred and are blocked until
              // the first group completes (via the sequential dependency check).
              if (index === 0) {
                const timerState = calculateTimerState(
                  task,
                  0,
                  [],
                  this.options.currentTime,
                  this.options.accountCompletionRecords,
                  this.options.accountStartStates,
                  this.options.completedTasks,
                );
                if (timerState.isReady) {
                  readyTasksInState.push(task);
                } else {
                  globalDeferredTasks.push(task);
                }
              } else {
                globalDeferredTasks.push(task);
              }
            });

            // Calculate scheduled times for logging/internal use
            scheduledTimes[account.id] = [];
            let currentScheduledTime = Date.now();
            for (let i = 0; i < requestGroups.length; i++) {
              const group = requestGroups[i];
              if (i > 0) {
                const prevGroup = requestGroups[i - 1];
                currentScheduledTime +=
                  (group.time_spent - prevGroup.time_spent) * 1000;
              }
              scheduledTimes[account.id].push(currentScheduledTime);
            }
          }
        } catch (accountError) {
          console.error(
            `Error generating tasks for account ${account.name}:`,
            accountError,
          );
        }
      }

      // 4. Create batches for this state using the diversity algorithm
      if (readyTasksInState.length > 0) {
        // Group by game_id
        const tasksByGame: { [gameId: number]: DailyTask[] } = {};
        for (const task of readyTasksInState) {
          const gid = task.account.game_id;
          if (!tasksByGame[gid]) tasksByGame[gid] = [];
          tasksByGame[gid].push(task);
        }

        const gameIds = Object.keys(tasksByGame).map(Number);
        const maxTasksInAnyGame = Math.max(
          ...Object.values(tasksByGame).map((arr) => arr.length),
        );

        // Create batches using diversity algorithm (one task from each game per batch)
        for (let i = 0; i < maxTasksInAnyGame; i++) {
          const currentBatchTasks: DailyTask[] = [];

          for (const gid of gameIds) {
            const gameTasks = tasksByGame[gid];
            if (i < gameTasks.length) {
              currentBatchTasks.push(gameTasks[i]);
            }
          }

          if (currentBatchTasks.length > 0) {
            allBatches.push({
              batchIndex: allBatches.length, // Use simple 0-based index
              tasks: currentBatchTasks,
            });
          }
        }
      }
    }

    if (Object.keys(pendingStartStates).length > 0) {
      this.options.setAccountStartStates((prev) => ({
        ...prev,
        ...pendingStartStates,
      }));
    }

    if (Object.keys(pendingAssignments).length > 0) {
      this.options.setAccountTaskAssignments((prev) => {
        const next = { ...prev };

        Object.entries(pendingAssignments).forEach(
          ([accountId, assignments]) => {
            const parsedAccountId = Number(accountId);
            next[parsedAccountId] = [
              ...(prev[parsedAccountId] || []),
              ...assignments,
            ];
          },
        );

        return next;
      });
    }

    return {
      batches: allBatches,
      deferredTasks: globalDeferredTasks,
      accountScheduledTime: scheduledTimes,
    };
  }
}
