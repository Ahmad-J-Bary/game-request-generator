import { TauriService } from "@grq/core/services/tauri.service";
import { calculateFirstRequestAllowedTime } from "./daily-tasks.utils";
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

interface RequestGroup {
  event_token: string;
  time_spent: number;
  requests: DailyRequestsResponse["requests"];
}

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
    const today = new Date().toISOString().split("T")[0];
    const statesOrder = ["FLORIDA", "CALIFORNIA", "TEXAS", "New York", "UK"];

    // 1. Get all accounts and group them by state
    const allAccounts: Account[] = await TauriService.getAllAccounts();
    const stateGroups: { [state: string]: Account[] } = {};

    for (const acc of allAccounts) {
      const state = acc.proxy_state || "Unknown";
      if (!stateGroups[state]) {
        stateGroups[state] = [];
      }
      stateGroups[state].push(acc);
    }

    const allStateKeys = Object.keys(stateGroups);
    const processingOrder = [
      ...statesOrder.filter((s) => allStateKeys.includes(s)),
      ...allStateKeys.filter((s) => !statesOrder.includes(s)),
    ];

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
          const toMidnightUTC = (dateStr: string) => {
            const date = new Date(dateStr);
            if (Number.isNaN(date.getTime())) return null;
            return new Date(
              Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
            ).getTime();
          };

          const sessionLevelIdByKey = new Map(
            gameLevels
              .filter((level) => level.level_name === "-")
              .map((level) => [
                `${(level.event_token || "").split("_day")[0]}::${level.days_offset}`,
                level.id,
              ]),
          );

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
              let daysOffset = 0;
              const eventTokenMatch = (request.event_token || "").match(
                /_day(-?\d+)$/,
              );
              if (eventTokenMatch) {
                daysOffset = parseInt(eventTokenMatch[1], 10);
              } else {
                const startUTC = toMidnightUTC(account.start_date);
                const targetUTC = toMidnightUTC(response.target_date);

                if (startUTC !== null && targetUTC !== null) {
                  const msPerDay = 24 * 60 * 60 * 1000;
                  daysOffset = Math.round((targetUTC - startUTC) / msPerDay);
                }
              }
              const baseToken = (request.event_token || "").split("_day")[0];
              const sessionKey = `${baseToken}::${daysOffset}`;
              const sessionLevelId = sessionLevelIdByKey.get(sessionKey);
              return sessionLevelId ? completedLevelIds.has(sessionLevelId) : false;
            }

            return false;
          };

          const validRequests: any[] = [];
          const tempRequests: any[] = [];

          for (const req of response.requests) {
            const eventToken = (req.event_token || "").trim();
            if (!eventToken) continue;

            const matchingLevel = gameLevelByToken.get(eventToken);
            const matchingPurchase = purchaseByToken.get(eventToken);

            // Keep only requests that map to real rows in current branch tables.
            if (matchingLevel || matchingPurchase) {
              // Normalize token before downstream grouping/classification.
              req.event_token = eventToken;
              tempRequests.push(req);
            }
          }

          for (const req of tempRequests) {
            const matchingLevel = gameLevelByToken.get(req.event_token);
            const matchingPurchase = purchaseByToken.get(req.event_token);

            if (matchingLevel) {
              const rawType = (req.request_type as string).toLowerCase();
              // For compound level events, skip the session request entirely
              if (rawType === "session" || rawType === "session only") {
                const hasCorrespondingEvent = tempRequests.some(
                  (r) =>
                    r.event_token === req.event_token &&
                    (r.request_type as string).toLowerCase() === "event" &&
                    r.level_id === req.level_id,
                );
                if (hasCorrespondingEvent) continue;
              }

              req.level_name = matchingLevel.level_name;
              req.level_id = matchingLevel.id;
              req.days_offset = matchingLevel.days_offset;

              if (rawType === "session" || rawType === "session only") {
                req.request_type = "Session Only";
                // Re-resolve the correct session level ID (if one exists)
                // to avoid using a real level's ID from the map collision.
                const sessionDaysOffset = req.days_offset ?? 0;
                const sessionBaseToken = (req.event_token || "").split("_day")[0];
                const sessionKey = `${sessionBaseToken}::${sessionDaysOffset}`;
                const sessionLvlId = sessionLevelIdByKey.get(sessionKey);
                if (sessionLvlId) {
                  req.level_id = sessionLvlId;
                }
              } else if (rawType === "event") {
                req.request_type = "Level Event";
              }
              validRequests.push(req);
            } else if (matchingPurchase) {
              const rawType = req.request_type as string;

              req.level_name = (matchingPurchase as any).level_name || "$$$";
              req.level_id = matchingPurchase.id;
              req.days_offset = matchingPurchase.days_offset;
              req.request_type =
                rawType === "session" ? "Purchase Session" : "Purchase Event";
              validRequests.push(req);
            }
          }

          if (validRequests.length > 0) {
            const requestGroups: RequestGroup[] = [];
            for (const request of validRequests) {
              const eventToken = request.event_token || "";
              const existingGroup = requestGroups.find(
                (g) =>
                  g.event_token === eventToken &&
                  g.time_spent === request.time_spent,
              );
              if (existingGroup) {
                existingGroup.requests.push(request);
                // Sort requests within the group: Session first, then Event
                existingGroup.requests.sort((a, b) => {
                  const typeA = (a.request_type || "").toString().toLowerCase();
                  const typeB = (b.request_type || "").toString().toLowerCase();
                  const isSessionA = typeA.includes("session");
                  const isSessionB = typeB.includes("session");
                  if (isSessionA && !isSessionB) return -1;
                  if (!isSessionA && isSessionB) return 1;
                  return 0;
                });
              } else {
                requestGroups.push({
                  event_token: eventToken,
                  time_spent: request.time_spent,
                  requests: [request],
                });
              }
            }
            requestGroups.sort((a, b) => a.time_spent - b.time_spent);

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
              pendingStartStates[account.id] = {
                accountId: account.id,
                startTime: `${account.start_date} ${account.start_time}`,
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

            // Prevent placing standalone "Session Only" groups after any purchase group
            // for the same account/day timeline. This preserves legacy flow where purchase
            // behaves like level (session+event pair) and no trailing session-only is emitted.
            const normalizedPendingGroups = pendingGroups.filter(
              (group, idx, arr) => {
                const hasEvent = group.requests.some((r) =>
                  (r.request_type as string).includes("Event"),
                );
                if (hasEvent) return true;

                const hasPurchaseInGroup = group.requests.some((r) =>
                  (r.request_type as string).includes("Purchase"),
                );
                if (hasPurchaseInGroup) return true;

                const hasAnyPurchaseBefore = arr
                  .slice(0, idx)
                  .some((prev) =>
                    prev.requests.some((r) =>
                      (r.request_type as string).includes("Purchase"),
                    ),
                  );

                // Drop session-only groups that come after purchase groups.
                if (hasAnyPurchaseBefore) return false;

                return true;
              },
            );

            normalizedPendingGroups.forEach((group, index) => {
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
              };

              // Only the first pending group is shown in the ready section;
              // the UI timer (calculateTimerState in TaskItem) handles when it becomes ready.
              // Subsequent pending groups always go to deferred and are blocked until the
              // first group completes (via the sequential dependency check).
              if (index === 0) {
                readyTasksInState.push(task);
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
                  group.time_spent - prevGroup.time_spent;
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
