// src/utils/taskCompletion.ts
// @ts-nocheck
import { ApiService } from '@grq/core/services/api.service';
import { TauriService } from '@grq/core/services/tauri.service';
import type { ApiResponse } from '@grq/core/services/api.service';
import type { DailyTask, GameBatch, AccountCompletionRecord, CompletedDailyTask } from '@grq/api-bindings';
import { asyncStorageService } from '@grq/core/services/storage.service';

export interface TaskCompletionOptions {
  batches: GameBatch[];
  setBatches: React.Dispatch<React.SetStateAction<GameBatch[]>>;
  deferredTasks: DailyTask[];
  setDeferredTasks: React.Dispatch<React.SetStateAction<DailyTask[]>>;
  games: any[];
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
  setAccountCompletionRecords: React.Dispatch<React.SetStateAction<{ [accountId: number]: AccountCompletionRecord }>>;
  setAccountTaskAssignments: React.Dispatch<React.SetStateAction<{ [accountId: number]: any[] }>>;
}

export class TaskCompletionHandler {
  private options: TaskCompletionOptions;

  constructor(options: TaskCompletionOptions) {
    this.options = options;
  }

  async completeTask(accountId: number, requestIndex: number, batchIndex: number, taskRef: DailyTask, response?: RepeaterResponse): Promise<ApiResponse> {
    try {
      const deriveFinalType = (req: any): any => {
        const currentType = (req.request_type as string);

        if (currentType === 'Session Only' || currentType === 'Level Session' ||
            currentType === 'Level Event' || currentType === 'Purchase Session' ||
            currentType === 'Purchase Event') {
          return currentType;
        }

        if (currentType.includes('Purchase')) {
          return currentType.includes('Session') ? 'Purchase Session' : 'Purchase Event';
        }

        if (currentType.includes('Event')) {
          return 'Level Event';
        }

        return 'Session Only';
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
        tasks.map(task => {
          if (!matchesTask(task)) return task;

          const newCompletedTasks = new Set(task.completedTasks);
          newCompletedTasks.add(requestIndex.toString());

          const newLastResponses = { ...(task.lastResponses || {}) };
          if (response) {
            newLastResponses[requestIndex] = response;
          }

          return { ...task, completedTasks: newCompletedTasks, lastResponses: newLastResponses };
        });

      // Find the matching task in batches or deferred tasks
      let foundTask: DailyTask | null = null;
      let foundBatch: GameBatch | null = null;
      let foundInDeferred = false;

      if (batchIndex >= 0) {
        const batch = this.options.batches.find(b => b.batchIndex === batchIndex) || null;
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

      if (!foundTask) return { success: false, error: 'Task not found' };

      const request = foundTask.requests[requestIndex];
      const finalRequestType = deriveFinalType(request);
      const isPurchaseEvent = finalRequestType === 'Purchase Event';
      const isPurchaseSession = finalRequestType === 'Purchase Session';
      const isLevelSession = finalRequestType === 'Level Session';
      const isSessionOnly = finalRequestType === 'Session Only';
      const usesSyntheticSessionLevel = isPurchaseSession || isLevelSession || isSessionOnly;
      
      const toMidnightUTC = (dateStr: string) => {
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return null;
        return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).getTime();
      };

      const resolveSessionLevelId = async (): Promise<number> => {
        const account = await TauriService.getAccountById(accountId);
        if (!account) throw new Error('Account not found');
        if (!account.branch_id) throw new Error('Account has no branch associated with it');

        const gameLevels = await TauriService.getGameLevels(account.branch_id);
        let baseToken = (request.event_token || '').split('_day')[0];
        let daysOffset = 0;
        let timeSpent = request.time_spent || 0;

        if (request.level_id) {
          const sourceLevel = gameLevels.find(level => level.id === request.level_id);
          if (sourceLevel) {
            baseToken = (sourceLevel.event_token || baseToken).split('_day')[0];
            // Initialize daysOffset from level as fallback, but we will likely override it for Session Only
            daysOffset = typeof sourceLevel.days_offset === 'number' ? sourceLevel.days_offset : 0;
            timeSpent = sourceLevel.time_spent || timeSpent;
          }
        } else if (isPurchaseSession && request.event_token) {
          const purchaseEvents = await TauriService.getGamePurchaseEvents(account.branch_id);
          const purchaseEvent = purchaseEvents.find(event => event.event_token === request.event_token);
          if (purchaseEvent) {
            daysOffset = typeof purchaseEvent.days_offset === 'number' ? purchaseEvent.days_offset : 0;
          }
        }

        // For Session Only or any gap-filler, ALWAYS verify day offset against the target date
        if (isSessionOnly || !request.level_id) {
          const eventTokenMatch = (request.event_token || '').match(/_day(-?\d+)$/);
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
          const relatedRealLevels = gameLevels.filter(
            (level) =>
              level.level_name !== "-" &&
              (level.event_token || "").split("_day")[0] === baseToken
          ).sort((a, b) => a.days_offset - b.days_offset);

          const searchLevels = relatedRealLevels.length > 0 ? relatedRealLevels : gameLevels.filter(l => l.level_name !== "-");
          const nextMatch = searchLevels.find((l) => l.days_offset > daysOffset);
          const firstRealDay = Number(searchLevels[0]?.days_offset ?? 0);

          if (nextMatch && daysOffset < firstRealDay) {
            timeSpent = Math.round((daysOffset + 1) * ((nextMatch.time_spent || 0) / (firstRealDay + 1)));
          } else if (nextMatch) {
            const prevLevels = searchLevels.filter((l) => l.days_offset < daysOffset);
            const prevReal = prevLevels[prevLevels.length - 1];
            timeSpent = prevReal?.time_spent || request.time_spent || 0;
          } else {
            const prevReal = searchLevels.filter((l) => l.days_offset <= daysOffset).slice(-1)[0];
            timeSpent = prevReal?.time_spent || request.time_spent || 0;
          }
        }

        if (!baseToken) {
          throw new Error('Session token could not be resolved');
        }

        const sessionEventToken = `${baseToken}_day${daysOffset}`;
        const existingSessionLevel = gameLevels.find(level =>
          level.level_name === '-' &&
          level.event_token === sessionEventToken &&
          level.days_offset === daysOffset
        );

        if (existingSessionLevel) {
          return existingSessionLevel.id;
        }

        return TauriService.addLevel({
          game_id: account.game_id,
          branch_id: account.branch_id,
          level_name: '-',
          event_token: sessionEventToken,
          days_offset: daysOffset,
          time_spent: timeSpent,
          is_bonus: false,
        });
      };

      if (!request.level_id && !isPurchaseEvent && !usesSyntheticSessionLevel) {
        console.error('Task completion error: request missing level_id and not identified as supported request type', {
          requestType: request.request_type,
          eventToken: request.event_token,
          levelId: request.level_id,
          finalRequestType
        });
        throw new Error('Task completion error');
      }

      let result: ApiResponse;
      let resolvedLevelId = request.level_id ?? undefined;

      if (isPurchaseEvent) {
        // Handle purchase event completion
        if (!request.event_token) {
          throw new Error('Purchase event token is missing');
        }

        // Get account details to find the branch ID
        const account = await TauriService.getAccountById(accountId);
        if (!account) {
          throw new Error('Account not found');
        }

        if (!account.branch_id) {
          throw new Error('Account has no branch associated with it');
        }

        // Get purchase events for this branch to find the one with matching event_token
        const gamePurchaseEvents = await TauriService.getGamePurchaseEvents(account.branch_id);
        const purchaseEventDetails = gamePurchaseEvents.find(pe => pe.event_token === request.event_token);

        if (!purchaseEventDetails) {
          throw new Error('Purchase event not found in game configuration');
        }

        // Ensure purchase event progress exists, create if necessary
        let purchaseEventProgress = await TauriService.getAccountPurchaseEventProgress(accountId);
        let purchaseEvent = purchaseEventProgress.find(pe => pe.purchase_event_id === purchaseEventDetails.id);

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
            purchaseEventProgress = await TauriService.getAccountPurchaseEventProgress(accountId);
            purchaseEvent = purchaseEventProgress.find(pe => pe.purchase_event_id === purchaseEventDetails.id);
          } catch (createError) {
            console.warn('Failed to create purchase event progress, it may already exist:', createError);
            // Try one more time to get the progress
            purchaseEventProgress = await TauriService.getAccountPurchaseEventProgress(accountId);
            purchaseEvent = purchaseEventProgress.find(pe => pe.purchase_event_id === purchaseEventDetails.id);
          }
        }

        if (!purchaseEvent) {
          throw new Error('Purchase event progress not found and could not be created');
        }

        // Update purchase event progress
        const updateRequest = {
          account_id: accountId,
          purchase_event_id: purchaseEvent.purchase_event_id,
          is_completed: true,
          time_spent: request.time_spent,
          target_date: foundTask.targetDate,
        };

        result = await TauriService.updatePurchaseEventProgress(updateRequest);

        // Record completed purchase event
        const completedTask: CompletedDailyTask = {
          id: `${accountId}_${request.event_token}_${finalRequestType.replace(/\s+/g, '_')}_${Date.now()}`,
          accountId,
          accountName: account.name,
          gameId: account.game_id,
          gameName: this.options.games.find(g => g.id === account.game_id)?.name || 'Unknown',
          eventToken: request.event_token!,
          timeSpent: request.time_spent || 0, // Use the request's time_spent
          completionTime: Date.now(),
          completionDate: new Date().toISOString().split('T')[0],
          levelId: undefined, 
          levelName: request.level_name || '$$$',
          requestType: finalRequestType,
          isPurchase: true,
        };

        // Save to AsyncStorage
        const completedDate = new Date().toISOString().split('T')[0];
        const completedKey = `dailyTasks_completed_${completedDate}`;
        const existingCompleted = await asyncStorageService.get<CompletedDailyTask[]>(completedKey);
        const completedList: CompletedDailyTask[] = existingCompleted ? existingCompleted : [];
        completedList.push(completedTask);
        await asyncStorageService.set(completedKey, completedList);

        // Dispatch event to update sidebar
        window.dispatchEvent(new CustomEvent('daily-task-completed'));
      } else {
        let targetLevelId = request.level_id;

        if (usesSyntheticSessionLevel) {
          targetLevelId = await resolveSessionLevelId();
        }

        if (!targetLevelId) {
          throw new Error('Level ID is required for level event completion');
        }

        resolvedLevelId = targetLevelId;

        // Ensure level progress record exists before updating
        // This is critical for the "first-time" completion of session-only tasks
        const existingProgress = await TauriService.getAccountLevelProgress(accountId);
        const hasProgress = existingProgress.some(p => p.level_id === targetLevelId);

        if (!hasProgress) {
          try {
            await TauriService.createLevelProgress({
              account_id: accountId,
              level_id: targetLevelId,
            });
          } catch (error) {
            console.warn('Level progress creation failed, it might have been created by another process:', error);
          }
        }

        // Now update the progress to completed status
        // Aligning with AccountDetailPage.tsx by omitting target_date and time_spent
        // which ensures the update targets the correct persistent record.
        const updateRequest = {
          account_id: accountId,
          level_id: targetLevelId,
          is_completed: true,
          bypass_cooldown: true,
        };

        result = await ApiService.updateLevelProgress(updateRequest);
      }

      // Check if the operation was successful (handles both boolean and ApiResponse results)
      // @ts-ignore - TypeScript has trouble with union type checking here
      const success = result === true || (result && typeof result === 'object' && result.success);

      if (success) {
        const now = Date.now();

        // Create individual completion records for all level events
        if (!isPurchaseEvent) {
          const levelCompletedTask: CompletedDailyTask = {
            id: `${accountId}_level_${resolvedLevelId}_${finalRequestType.replace(/\s+/g, '_')}_${now}`,
            accountId,
            accountName: foundTask!.account.name,
            gameId: foundTask!.account.game_id,
            gameName: this.options.games.find(g => g.id === foundTask!.account.game_id)?.name || 'Unknown',
            eventToken: request.event_token || '',
            timeSpent: request.time_spent || 0,
            completionTime: now,
            completionDate: new Date().toISOString().split('T')[0],
            levelId: resolvedLevelId,
            levelName: (request.level_name?.trim() || '') || '-',
            requestType: finalRequestType,
            isPurchase: false,
          };

          // Save to AsyncStorage
          const completedDate = new Date().toISOString().split('T')[0];
          const completedKey = `dailyTasks_completed_${completedDate}`;
          const existingCompleted = await asyncStorageService.get<CompletedDailyTask[]>(completedKey);
          const completedList: CompletedDailyTask[] = existingCompleted ? existingCompleted : [];
          completedList.push(levelCompletedTask);
          await asyncStorageService.set(completedKey, completedList);

          // Dispatch event to update sidebar
          window.dispatchEvent(new CustomEvent('daily-task-completed'));
        }

        // Update task completion status
        const updatedBatches = this.options.batches.map(batch => ({
          ...batch,
          tasks: updateTaskCollection(batch.tasks)
        }));
        const updatedDeferredTasks = updateTaskCollection(this.options.deferredTasks);

        // Check if this completes a Session+Event pair (both requests in the group)
        if (foundTask && foundTask.requestGroups) {
          const updatedTask = foundInDeferred
            ? (updatedDeferredTasks.find(matchesTask) || null)
            : (
                foundBatch
                  ? (updatedBatches.find(b => b.batchIndex === foundBatch!.batchIndex)?.tasks.find(matchesTask) || null)
                  : (updatedBatches.flatMap(batch => batch.tasks).find(matchesTask) || null)
              );

          // Find which group this request belongs to
          for (const group of foundTask.requestGroups) {
            const groupIndices = group.requests.map((_, idx) =>
              foundTask!.requests.indexOf(group.requests[idx])
            );

            // Check if all requests in this group are now completed
            const allGroupCompleted = groupIndices.every(idx => updatedTask?.completedTasks.has(idx.toString()));

            if (allGroupCompleted && groupIndices.includes(requestIndex)) {
              const completionRecord: AccountCompletionRecord = {
                accountId,
                timeSpent: group.time_spent,
                completionTime: now,
                levelId: resolvedLevelId ?? 0,
                eventToken: group.event_token,
              };

              this.options.setAccountCompletionRecords(prev => ({
                ...prev,
                [accountId]: completionRecord
              }));

              // Clear task assignments for this account since the pair is completed
              this.options.setAccountTaskAssignments(prev => ({
                ...prev,
                [accountId]: []
              }));

              const completedDate = new Date().toISOString().split('T')[0];
              this.options.setBatches(updatedBatches);
              this.options.setDeferredTasks(updatedDeferredTasks);

              // Update AsyncStorage with updated batches
              const serializedBatches = updatedBatches.map(batch => ({
                ...batch,
                tasks: batch.tasks.map(task => ({
                  ...task,
                  completedTasks: Array.from(task.completedTasks)
                }))
              }));
              const serializedDeferredTasks = updatedDeferredTasks.map(task => ({
                ...task,
                completedTasks: Array.from(task.completedTasks)
              }));

              await asyncStorageService.set(`dailyTasks_batches_${completedDate}`, {
                batches: serializedBatches,
                deferredTasks: serializedDeferredTasks,
                accountScheduledTime: {} // This would need to be passed in or managed differently
              });

              // Dispatch progress-updated event
              window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));

              return; // Exit early since we've handled everything
            }
          }
        }

        // If we get here, the task was partially completed (only one request in a pair)
        // We still update the completion record for timing purposes
        this.options.setAccountCompletionRecords(prev => ({
          ...prev,
          [accountId]: {
            accountId,
            timeSpent: request.time_spent || 0,
            completionTime: now,
            levelId: resolvedLevelId ?? 0,
            eventToken: request.event_token || '',
          }
        }));

        this.options.setBatches(updatedBatches);
        this.options.setDeferredTasks(updatedDeferredTasks);

        // Dispatch progress-updated event to refresh other components
        window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));
        
        return result; // Return the successful result
      } else {
        const errorMessage = typeof result === 'object' && result.error ? result.error : 'Failed to update progress';
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
