// src/utils/taskGenerator.ts
import { TauriService } from '../services/tauri.service';
import { calculateFirstRequestAllowedTime } from './daily-tasks.utils';
import type { DailyRequestsResponse } from '../types';
import type { DailyTask, GameBatch, AccountCompletionRecord, AccountStartState, AccountTaskAssignment } from '../types/daily-tasks.types';

interface RequestGroup {
  event_token: string;
  time_spent: number;
  requests: DailyRequestsResponse['requests'];
}

export interface TaskGenerationOptions {
  games: any[];
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  accountStartStates: { [accountId: number]: AccountStartState };
  setAccountStartStates: React.Dispatch<React.SetStateAction<{ [accountId: number]: AccountStartState }>>;
  setAccountTaskAssignments: React.Dispatch<React.SetStateAction<{ [accountId: number]: AccountTaskAssignment[] }>>;
}

export class TaskGenerator {
  private options: TaskGenerationOptions;

  constructor(options: TaskGenerationOptions) {
    this.options = options;
  }

  async generateTodaysTasks(): Promise<{ batches: GameBatch[], accountScheduledTime: { [accountId: number]: number[] } }> {
    const today = new Date().toISOString().split('T')[0];
    const gameTasksMap: { [gameId: number]: DailyTask[] } = {};

    // 1. Collect all tasks grouped by game
    for (const game of this.options.games) {
      try {
        const accounts = await TauriService.getAccounts(game.id);
        const gameLevels = await TauriService.getGameLevels(game.id);
        const gamePurchaseEvents = await TauriService.getGamePurchaseEvents(game.id);
        const gameTasks: DailyTask[] = [];

        for (const account of accounts) {
          try {
            // Purchase events are now handled by the Rust backend
            // No need to generate them in the JavaScript frontend
            const purchaseRequests: any[] = [];

            // Get regular daily requests for level events
            const response = await TauriService.getDailyRequests(account.id, today);

            // Combine level requests with purchase requests
            response.requests = [...response.requests, ...purchaseRequests];

            // Filter out requests for events that don't exist
            const validRequests: any[] = [];
            for (const req of response.requests) {
              const isLevel = gameLevels.some(l => l.event_token === req.event_token);
              const isPurchase = gamePurchaseEvents.some(p => p.event_token === req.event_token);

              // Only include requests for events that actually exist
              if (isLevel || isPurchase) {
                validRequests.push(req);
              }
            }
            response.requests = validRequests;

            if (response.requests.length > 0) {
              // Find the first event (smallest time_spent)
              const firstEvent = response.requests
                .filter(r => r.request_type === 'session' || r.request_type === 'event')
                .sort((a, b) => a.time_spent - b.time_spent)[0];

              if (firstEvent) {
                const firstRequestAllowedAt = calculateFirstRequestAllowedTime(account, firstEvent.time_spent);

                this.options.setAccountStartStates(prev => ({
                  ...prev,
                  [account.id]: {
                    accountId: account.id,
                    startTime: `${account.start_date} ${account.start_time}`,
                    firstRequestAllowedAt,
                    isInitialized: true,
                  }
                }));
              }
            }

            // Use the response from the first call to avoid redeclaration
            if (response.requests.length > 0) {
              // Group related requests (Session + Event pairs) by event_token and time_spent
              const requestGroups: RequestGroup[] = [];

              for (const request of response.requests) {
                const eventToken = request.event_token || '';
                const existingGroup = requestGroups.find(g =>
                  g.event_token === eventToken && g.time_spent === request.time_spent
                );

                if (existingGroup) {
                  existingGroup.requests.push(request);
                } else {
                  requestGroups.push({
                    event_token: eventToken,
                    time_spent: request.time_spent,
                    requests: [request]
                  });
                }
              }

              // Sort groups by time_spent for proper sequencing
              requestGroups.sort((a, b) => a.time_spent - b.time_spent);

              gameTasks.push({
                account,
                requests: requestGroups.flatMap(g => g.requests), // Flatten back for compatibility
                requestGroups, // Keep grouped structure for timing logic
                targetDate: response.target_date,
                completedTasks: new Set(),
              });
            }
          } catch (accountError) {
            console.error(`Error generating tasks for account ${account.name}:`, accountError);
          }
        }

        if (gameTasks.length > 0) {
          gameTasksMap[game.id] = gameTasks;
        }
      } catch (error) {
        console.error(`Error getting accounts for game ${game.name}:`, error);
      }
    }

    // 2. Implement logical unit batching with timing constraints
    const gameIds = Object.keys(gameTasksMap).map(id => parseInt(id));
    const batches: GameBatch[] = [];
    let batchIndex = 0;

    // Track scheduled execution time for each account's request groups
    const scheduledTimes: { [accountId: number]: number[] } = {};

    // Pre-calculate scheduled times for all request groups based on timing constraints
    for (const gameId of gameIds) {
      const gameTasks = gameTasksMap[gameId];
      if (gameTasks && gameTasks.length > 0) {
        for (const task of gameTasks) {
          const accountId = task.account.id;
          if (task.requestGroups && task.requestGroups.length > 0) {
            scheduledTimes[accountId] = [];
            let currentScheduledTime = Date.now(); // Start from now

            for (let i = 0; i < task.requestGroups.length; i++) {
              const group = task.requestGroups[i];

              if (i > 0) {
                const prevGroup = task.requestGroups[i - 1];
                const timeDifference = group.time_spent - prevGroup.time_spent;
                // Use full time difference
                const minimumWaitTime = timeDifference * 1000;
                currentScheduledTime += minimumWaitTime;
              }

              scheduledTimes[accountId].push(currentScheduledTime);
            }
          }
        }
      }
    }

    // Track which request group index each account is on
    const accountGroupIndex: { [accountId: number]: number } = {};

    // Continue until all request groups are assigned to batches
    while (true) {
      const currentBatchTasks: DailyTask[] = [];
      let hasAnyGroups = false;

      // Take one request group from each game/account for this batch
      for (const gameId of gameIds) {
        const gameTasks = gameTasksMap[gameId];
        if (gameTasks && gameTasks.length > 0) {
          // Find an account in this game that has an available request group
          for (const task of gameTasks) {
            const accountId = task.account.id;
            const currentGroupIndex = accountGroupIndex[accountId] || 0;

            if (task.requestGroups && currentGroupIndex < task.requestGroups.length) {
              // We remove the readiness check here so that all tasks are assigned to batches
              // and visible to the user, even if they are not yet ready.
              // The TaskItem component will handle the "Not Ready" UI and countdown.

              // Create a task with only the current request group
              const currentGroup = task.requestGroups[currentGroupIndex];
              const groupTask: DailyTask = {
                account: task.account,
                requests: currentGroup.requests,
                targetDate: task.targetDate,
                completedTasks: new Set(),
              };

              // Record the task assignment (for internal tracking, though we show it anyway)
              const assignment: AccountTaskAssignment = {
                accountId,
                assignedTime: Date.now(),
                eventToken: currentGroup.event_token,
                timeSpent: currentGroup.time_spent,
              };

              this.options.setAccountTaskAssignments(prev => ({
                ...prev,
                [accountId]: [...(prev[accountId] || []), assignment]
              }));

              currentBatchTasks.push(groupTask);
              accountGroupIndex[accountId] = currentGroupIndex + 1;
              hasAnyGroups = true;
              break; // Found a suitable group for this game, move to next game
            }
          }
        }
      }

      // If we got any groups for this batch, add it
      if (currentBatchTasks.length > 0) {
        batches.push({
          batchIndex: batchIndex++,
          tasks: currentBatchTasks,
        });
      }

      // If no groups were added in this iteration, we're done
      if (!hasAnyGroups) {
        break;
      }
    }

    return { batches, accountScheduledTime: scheduledTimes };
  }
}