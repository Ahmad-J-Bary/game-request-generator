// src/utils/taskGenerator.ts
// @ts-nocheck
import { TauriService } from '@grq/core/services/tauri.service';
import { calculateFirstRequestAllowedTime } from './daily-tasks.utils';
import { calculateTimerState } from './timer.utils';
import type { DailyRequestsResponse } from '@grq/api-bindings';
import type { DailyTask, GameBatch, AccountCompletionRecord, AccountStartState, AccountTaskAssignment, CompletedDailyTask } from '@grq/api-bindings';

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
  currentTime: number;
  completedTasks: CompletedDailyTask[];
}

export class TaskGenerator {
  private options: TaskGenerationOptions;

  constructor(options: TaskGenerationOptions) {
    this.options = options;
  }

  async generateTodaysTasks(): Promise<{ batches: GameBatch[], deferredTasks: DailyTask[], accountScheduledTime: { [accountId: number]: number[] } }> {
    const today = new Date().toISOString().split('T')[0];
    const statesOrder = ["FLORIDA", "CALIFORNIA", "TEXAS", "New York", "UK"];
    
    // 1. Get all accounts and group them by state
    const allAccounts = await TauriService.getAllAccounts();
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
      ...statesOrder.filter(s => allStateKeys.includes(s)),
      ...allStateKeys.filter(s => !statesOrder.includes(s))
    ];
      
    const allBatches: GameBatch[] = [];
    const globalDeferredTasks: DailyTask[] = [];
    let batchIndex = 0;
    const scheduledTimes: { [accountId: number]: number[] } = {};

    // 2. Prepare branch data cache
    const branchDataCache: { [branchId: number]: { levels: any[], purchases: any[] } } = {};
    const getBranchData = async (branchId: number) => {
      if (!branchDataCache[branchId]) {
        const [levels, purchases] = await Promise.all([
          TauriService.getGameLevels(branchId),
          TauriService.getGamePurchaseEvents(branchId)
        ]);
        branchDataCache[branchId] = { levels, purchases };
      }
      return branchDataCache[branchId];
    };

    // Helper to check if a request group is completed
    const isGroupCompleted = (accId: number, eventToken: string, timeSpent: number): boolean => {
      return this.options.completedTasks.some(ct => 
        ct.accountId === accId && 
        ct.eventToken === eventToken && 
        ct.timeSpent === timeSpent
      );
    };

    // 3. Process states in order
    for (const stateName of processingOrder) {
      const stateAccounts = stateGroups[stateName];
      const readyTasksInState: DailyTask[] = [];
      
      for (const account of stateAccounts) {
        try {
          const branchId = account.branch_id || 0;
          const { levels: gameLevels, purchases: gamePurchaseEvents } = await getBranchData(branchId);
          const response = await TauriService.getDailyRequests(account.id, today);
          
          const validRequests: any[] = [];
          const tempRequests: any[] = [];
          
          for (const req of response.requests) {
            const matchingLevel = gameLevels.find(l => l.event_token === req.event_token);
            const matchingPurchase = gamePurchaseEvents.find(p => p.event_token === req.event_token);
            if (matchingLevel || matchingPurchase) {
              tempRequests.push(req);
            }
          }

          for (const req of tempRequests) {
            const matchingLevel = gameLevels.find(l => l.event_token === req.event_token);
            const matchingPurchase = gamePurchaseEvents.find(p => p.event_token === req.event_token);

            if (matchingLevel) {
              req.level_name = matchingLevel.level_name;
              const rawType = (req.request_type as string).toLowerCase();
              if (rawType === 'session' || rawType === 'session only') {
                const hasCorrespondingEvent = tempRequests.some(r =>
                  r.event_token === req.event_token &&
                  (r.request_type as string).toLowerCase() === 'event' &&
                  r.level_id === req.level_id
                );
                req.request_type = hasCorrespondingEvent ? 'Level Session' : 'Session Only';
              } else if (rawType === 'event') {
                req.request_type = 'Level Event';
              }
              validRequests.push(req);
            } else if (matchingPurchase) {
              req.level_name = '$$$';
              const rawType = req.request_type as string;
              req.request_type = rawType === 'session' ? 'Purchase Session' : 'Purchase Event';
              validRequests.push(req);
            }
          }

          if (validRequests.length > 0) {
            const requestGroups: RequestGroup[] = [];
            for (const request of validRequests) {
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
            requestGroups.sort((a, b) => a.time_spent - b.time_spent);

            // Calculate allowed start time if not already there
            const firstEvent = validRequests
              .filter(r => (r.request_type as string).includes('Session') || (r.request_type as string).includes('Event'))
              .sort((a, b) => a.time_spent - b.time_spent)[0];

            if (firstEvent) {
              const firstAllowedAt = calculateFirstRequestAllowedTime(account, firstEvent.time_spent);
              this.options.setAccountStartStates(prev => ({
                ...prev,
                [account.id]: {
                  accountId: account.id,
                  startTime: `${account.start_date} ${account.start_time}`,
                  firstRequestAllowedAt: firstAllowedAt,
                  isInitialized: true,
                }
              }));
            }

            // Find all pending groups
            const pendingGroups = requestGroups.filter(g => !isGroupCompleted(account.id, g.event_token, g.time_spent));

            pendingGroups.forEach((group, index) => {
              const task: DailyTask = {
                account,
                requests: group.requests,
                requestGroups: [group],
                targetDate: response.target_date,
                completedTasks: new Set(),
              };

              // Only the first pending group can be "Ready"
              // Others will automatically be "Pending Previous"
              if (index === 0) {
                const timerState = calculateTimerState(
                  task,
                  0, // Dummy batch index
                  [], // No batches yet
                  this.options.currentTime,
                  this.options.accountCompletionRecords,
                  this.options.accountStartStates,
                  this.options.completedTasks
                );

                if (timerState.isReady) {
                  readyTasksInState.push(task);
                } else {
                  globalDeferredTasks.push(task);
                }
              } else {
                // Subsequent pending tasks always go to deferred
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
                currentScheduledTime += (group.time_spent - prevGroup.time_spent) * 1000;
              }
              scheduledTimes[account.id].push(currentScheduledTime);
            }
          }
        } catch (accountError) {
          console.error(`Error generating tasks for account ${account.name}:`, accountError);
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
        const maxTasksInAnyGame = Math.max(...Object.values(tasksByGame).map(arr => arr.length));
        
        // Create numStateBatches
        for (let i = 0; i < maxTasksInAnyGame; i++) {
          const currentBatchTasks: DailyTask[] = [];
          
          for (const gid of gameIds) {
            const gameTasks = tasksByGame[gid];
            if (i < gameTasks.length) {
              const task = gameTasks[i];
              currentBatchTasks.push(task);

              // Record assignment (optional, for tracking)
              const group = task.requestGroups![0];
              this.options.setAccountTaskAssignments(prev => ({
                ...prev,
                [task.account.id]: [...(prev[task.account.id] || []), {
                  accountId: task.account.id,
                  assignedTime: Date.now(),
                  eventToken: group.event_token,
                  timeSpent: group.time_spent,
                }]
              }));
            }
          }

          if (currentBatchTasks.length > 0) {
            allBatches.push({
              batchIndex: batchIndex++,
              tasks: currentBatchTasks,
            });
          }
        }
      }
    }

    return { batches: allBatches, deferredTasks: globalDeferredTasks, accountScheduledTime: scheduledTimes };
  }
}