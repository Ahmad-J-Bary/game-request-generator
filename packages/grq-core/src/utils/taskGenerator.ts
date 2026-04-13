// src/utils/taskGenerator.ts
// @ts-nocheck
import { TauriService } from '@grq/core/services/tauri.service';
import { calculateFirstRequestAllowedTime } from './daily-tasks.utils';
import type { DailyRequestsResponse } from '@grq/api-bindings';
import type { DailyTask, GameBatch, AccountCompletionRecord, AccountStartState, AccountTaskAssignment } from '@grq/api-bindings';

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
    const statesOrder = ["FLORIDA", "CALIFORNIA", "TEXAS", "New York", "UK"];
    
    // 1. Get all accounts and group them by state, then by package_id
    const allAccounts = await TauriService.getAllAccounts();
    const stateGroups: { [state: string]: { [packageId: number]: Account[] } } = {};
    
    for (const acc of allAccounts) {
      const state = acc.proxy_state || "Unknown";
      const pid = acc.package_id || 0;
      if (!stateGroups[state]) {
        stateGroups[state] = {};
      }
      if (!stateGroups[state][pid]) {
        stateGroups[state][pid] = [];
      }
      stateGroups[state][pid].push(acc);
    }
    
    const allStateKeys = Object.keys(stateGroups);
    // Combine ordered states with any other states found in the data
    const processingOrder = [
      ...statesOrder.filter(s => allStateKeys.includes(s)),
      ...allStateKeys.filter(s => !statesOrder.includes(s))
    ];
      
    const allBatches: GameBatch[] = [];
    let batchIndex = 0;
    const scheduledTimes: { [accountId: number]: number[] } = {};

    // 2. Prepare branch data cache to avoid repeated backend calls
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

    // 3. Process states in order, then packages within them
    for (const stateName of processingOrder) {
      const packagesInState = stateGroups[stateName];
      const sortedPackageIds = Object.keys(packagesInState)
        .map(id => parseInt(id))
        .sort((a, b) => a - b);

      for (const packageId of sortedPackageIds) {
        const packageAccounts = packagesInState[packageId];
        const packageTasks: DailyTask[] = [];

        for (const account of packageAccounts) {
          try {
            const branchId = account.branch_id || 0; // Backend handles 0/default mapping if needed, but should have valid branch_id
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
              
              packageTasks.push({
                account,
                requests: requestGroups.flatMap(g => g.requests),
                requestGroups,
                targetDate: response.target_date,
                completedTasks: new Set(),
              });

              // Calculate scheduled times for this account
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

        // 4. Create batches for this specific package within the current state
        if (packageTasks.length > 0) {
          const accountGroupIndex: { [accountId: number]: number } = {};
          while (true) {
            const currentBatchTasks: DailyTask[] = [];
            let hasAnyGroups = false;

            for (const task of packageTasks) {
              const accId = task.account.id;
              const groupIdx = accountGroupIndex[accId] || 0;

              if (task.requestGroups && groupIdx < task.requestGroups.length) {
                const group = task.requestGroups[groupIdx];
                currentBatchTasks.push({
                  account: task.account,
                  requests: group.requests,
                  targetDate: task.targetDate,
                  completedTasks: new Set(),
                });

                this.options.setAccountTaskAssignments(prev => ({
                  ...prev,
                  [accId]: [...(prev[accId] || []), {
                    accountId: accId,
                    assignedTime: Date.now(),
                    eventToken: group.event_token,
                    timeSpent: group.time_spent,
                  }]
                }));

                accountGroupIndex[accId] = groupIdx + 1;
                hasAnyGroups = true;
              }
            }

            if (currentBatchTasks.length > 0) {
              allBatches.push({
                batchIndex: batchIndex++,
                tasks: currentBatchTasks,
              });
            }
            if (!hasAnyGroups) break;
          }
        }
      }
    }

    return { batches: allBatches, accountScheduledTime: scheduledTimes };
  }
}