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

            // Filter out requests for events that don't exist and attach names/types
            const validRequests: any[] = [];

            // First pass: collect all valid requests to analyze pairings
            const tempRequests: any[] = [];
            for (const req of response.requests) {
              const matchingLevel = gameLevels.find(l => l.event_token === req.event_token);
              const matchingPurchase = gamePurchaseEvents.find(p => p.event_token === req.event_token);

              if (matchingLevel || matchingPurchase) {
                tempRequests.push(req);
              }
            }

            // Second pass: determine session types based on whether they have corresponding events
            for (const req of tempRequests) {
              const matchingLevel = gameLevels.find(l => l.event_token === req.event_token);
              const matchingPurchase = gamePurchaseEvents.find(p => p.event_token === req.event_token);

              if (matchingLevel) {
                req.level_name = matchingLevel.level_name;
                const rawType = (req.request_type as string).toLowerCase();

                if (rawType === 'session' || rawType === 'session only') {
                  // Check if this session has a corresponding Level Event with the same event_token
                  const hasCorrespondingEvent = tempRequests.some(r =>
                    r.event_token === req.event_token &&
                    (r.request_type as string).toLowerCase() === 'event' &&
                    r.level_id === req.level_id // Same level_id for level events
                  );

                  req.request_type = hasCorrespondingEvent ? 'Level Session' : 'Session Only';
                } else if (rawType === 'event') {
                  req.request_type = 'Level Event';
                }
                validRequests.push(req);
              } else if (matchingPurchase) {
                req.level_name = '$$$';
                const rawType = req.request_type as string;
                if (rawType === 'session') {
                   req.request_type = 'Purchase Session';
                } else {
                   req.request_type = 'Purchase Event';
                }
                validRequests.push(req);
              }
            }
            response.requests = validRequests;

            if (response.requests.length > 0) {
              // Find the first event (smallest time_spent)
              const firstEvent = response.requests
                .filter(r => (r.request_type as string).includes('Session') || (r.request_type as string).includes('Event'))
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
                totalDailyRequests: response.requests.length
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
    const batches: GameBatch[] = [];
    let currentBatchIndex = 0;

    // Track scheduled execution time for each account's request groups
    const scheduledTimes: { [accountId: number]: number[] } = {};

    // Pre-calculate scheduled times for all request groups based on timing constraints
    for (const gameId of Object.keys(gameTasksMap).map(Number)) {
        const gameTasks = gameTasksMap[gameId];
        for (const task of gameTasks) {
            const accountId = task.account.id;
            if (task.requestGroups && task.requestGroups.length > 0) {
                scheduledTimes[accountId] = [];
                let currentScheduledTime = Date.now();

                for (let i = 0; i < task.requestGroups.length; i++) {
                    const group = task.requestGroups[i];
                    if (i > 0) {
                        const prevGroup = task.requestGroups[i - 1];
                        const timeDifference = group.time_spent - prevGroup.time_spent;
                        currentScheduledTime += timeDifference * 1000;
                    }
                    scheduledTimes[accountId].push(currentScheduledTime);
                }
            }
        }
    }

    // Sort accounts into priority (>1 request) and regular (1 request)
    const allTasks: DailyTask[] = Object.values(gameTasksMap).flat();
    const priorityTasks = allTasks.filter(t => (t.requestGroups?.length || 0) > 1);
    const regularTasks = allTasks.filter(t => (t.requestGroups?.length || 0) <= 1);

    const accountGroupIndex: { [accountId: number]: number } = {};

    // Helper to add tasks to batches
    const processAccountList = (taskList: DailyTask[]) => {
        while (true) {
            const currentBatchTasks: DailyTask[] = [];
            let hasAnyGroups = false;

            // Sort task list by totalDailyRequests (DESC) then name
            const sortedList = [...taskList].sort((a, b) => {
                const countA = a.totalDailyRequests || 0;
                const countB = b.totalDailyRequests || 0;
                if (countB !== countA) return countB - countA;
                return a.account.name.localeCompare(b.account.name);
            });

            for (const task of sortedList) {
                const accountId = task.account.id;
                const currentIdx = accountGroupIndex[accountId] || 0;

                if (task.requestGroups && currentIdx < task.requestGroups.length) {
                    const currentGroup = task.requestGroups[currentIdx];
                    const groupTask: DailyTask = {
                        account: task.account,
                        requests: currentGroup.requests,
                        targetDate: task.targetDate,
                        completedTasks: new Set(),
                        totalDailyRequests: task.totalDailyRequests
                    };

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
                    accountGroupIndex[accountId] = currentIdx + 1;
                    hasAnyGroups = true;
                }
            }

            if (currentBatchTasks.length > 0) {
                // Ensure sorting within the batch as well
                currentBatchTasks.sort((a, b) => {
                    const countA = a.totalDailyRequests || 0;
                    const countB = b.totalDailyRequests || 0;
                    if (countB !== countA) return countB - countA;
                    return a.account.name.localeCompare(b.account.name);
                });

                batches.push({
                    batchIndex: currentBatchIndex++,
                    tasks: currentBatchTasks,
                });
            }

            if (!hasAnyGroups) break;
        }
    };

    // Process priority accounts first
    processAccountList(priorityTasks);
    // Then process regular accounts
    processAccountList(regularTasks);

    return { batches, accountScheduledTime: scheduledTimes };
  }
}