// src/utils/taskCompletion.ts
import { ApiService } from '../services/api.service';
import { TauriService } from '../services/tauri.service';
import type { DailyTask, GameBatch, AccountCompletionRecord, CompletedDailyTask } from '../types/daily-tasks.types';

export interface TaskCompletionOptions {
  batches: GameBatch[];
  setBatches: React.Dispatch<React.SetStateAction<GameBatch[]>>;
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

  async completeTask(accountId: number, requestIndex: number): Promise<void> {
    try {
      // Find the task across all batches
      let foundTask: DailyTask | null = null;
      let foundBatch: GameBatch | null = null;
      for (const batch of this.options.batches) {
        foundTask = batch.tasks.find(t => t.account.id === accountId) || null;
        if (foundTask) {
          foundBatch = batch;
          break;
        }
      }

      if (!foundTask) return;

      const request = foundTask.requests[requestIndex];

      // Handle purchase events differently (they don't have level_id)
      // Purchase events have event_token set and level_id as null
      const isPurchaseEvent = request.event_token && request.event_token.trim() !== '' && request.level_id == null;

      if (!request.level_id && !isPurchaseEvent) {
        console.error('Task completion error: request missing level_id and not identified as purchase event', {
          requestType: request.request_type,
          eventToken: request.event_token,
          levelId: request.level_id,
          hasEventToken: !!request.event_token,
          eventTokenLength: request.event_token ? request.event_token.length : 0
        });
        throw new Error('Task completion error');
      }

      let result;

      if (isPurchaseEvent) {
        // Handle purchase event completion
        if (!request.event_token) {
          throw new Error('Purchase event token is missing');
        }

        // Get account details to find the game ID
        const account = await TauriService.getAccountById(accountId);
        if (!account) {
          throw new Error('Account not found');
        }

        // Get purchase events for this game to find the one with matching event_token
        const gamePurchaseEvents = await TauriService.getGamePurchaseEvents(account.game_id);
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
        };

        result = await TauriService.updatePurchaseEventProgress(updateRequest);
      } else {
        // Handle level event completion
        // Ensure progress record exists, then update it
        if (!request.level_id) {
          throw new Error('Level ID is required for level event completion');
        }

        const createRequest = {
          account_id: accountId,
          level_id: request.level_id,
        };

        try {
          await TauriService.createLevelProgress(createRequest);
        } catch (error) {
          console.warn('Failed to create level progress (likely FK constraint for session event), proceeding to update:', error);
        }

        // Now update the progress
        const updateRequest = {
          account_id: accountId,
          level_id: request.level_id,
          is_completed: true,
        };

        result = await ApiService.updateLevelProgress(updateRequest);
      }

      if (result === true || (typeof result === 'object' && result.success)) {
        const now = Date.now();

        // Update task completion status
        const updatedBatches = this.options.batches.map(batch => ({
          ...batch,
          tasks: batch.tasks.map(task => {
            if (task.account.id === accountId) {
              const newCompletedTasks = new Set(task.completedTasks);
              newCompletedTasks.add(requestIndex.toString());
              return { ...task, completedTasks: newCompletedTasks };
            }
            return task;
          })
        }));

        // Check if this completes a Session+Event pair (both requests in the group)
        if (foundTask && foundTask.requestGroups) {
          // Find which group this request belongs to
          for (const group of foundTask.requestGroups) {
            const groupIndices = group.requests.map((_, idx) =>
              foundTask!.requests.indexOf(group.requests[idx])
            );

            // Check if all requests in this group are now completed
            const allGroupCompleted = groupIndices.every(idx =>
              updatedBatches
                .find(b => b.batchIndex === foundBatch!.batchIndex)
                ?.tasks.find(t => t.account.id === accountId)
                ?.completedTasks.has(idx.toString())
            );

            if (allGroupCompleted && groupIndices.includes(requestIndex)) {
              // Record the completion of this Session+Event pair

              const completionRecord: AccountCompletionRecord = {
                accountId,
                timeSpent: group.time_spent,
                completionTime: now,
                levelId: request.level_id!,
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

              // Add to completed tasks
              const completedTask: CompletedDailyTask = {
                id: `${accountId}_${group.event_token}_${now}`,
                accountId,
                accountName: foundTask!.account.name,
                gameId: foundTask!.account.game_id,
                gameName: this.options.games.find(g => g.id === foundTask!.account.game_id)?.name || 'Unknown',
                eventToken: group.event_token,
                timeSpent: group.time_spent,
                completionTime: now,
                completionDate: new Date().toISOString().split('T')[0],
                levelId: request.level_id,
              };

              // Save to localStorage
              const completedDate = new Date().toISOString().split('T')[0];
              const completedKey = `dailyTasks_completed_${completedDate}`;
              const existingCompleted = localStorage.getItem(completedKey);
              const completedList: CompletedDailyTask[] = existingCompleted ? JSON.parse(existingCompleted) : [];
              completedList.push(completedTask);
              localStorage.setItem(completedKey, JSON.stringify(completedList));

              // Dispatch event to update sidebar
              window.dispatchEvent(new CustomEvent('daily-task-completed'));

              // Remove this task from batches
              const filteredBatches = updatedBatches.map(batch => ({
                ...batch,
                tasks: batch.tasks.filter(task => task.account.id !== accountId)
              })).filter(batch => batch.tasks.length > 0);

              this.options.setBatches(filteredBatches);

              // Update localStorage
              const serializedFilteredBatches = filteredBatches.map(batch => ({
                ...batch,
                tasks: batch.tasks.map(task => ({
                  ...task,
                  completedTasks: Array.from(task.completedTasks)
                }))
              }));
              localStorage.setItem(`dailyTasks_batches_${completedDate}`, JSON.stringify({
                batches: serializedFilteredBatches,
                accountScheduledTime: {} // This would need to be passed in or managed differently
              }));

              // Dispatch progress-updated event
              window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));

              return; // Exit early since we've handled everything
            }
          }
        }

        // Check if the current batch is complete
        const currentBatch = updatedBatches.find(b => b.batchIndex === foundBatch!.batchIndex);
        if (currentBatch) {
          const isBatchComplete = currentBatch.tasks.every(task =>
            task.requests.every((_, idx) => task.completedTasks.has(idx.toString()))
          );

          if (isBatchComplete) {
            // Batch completed - user can manually regenerate tasks to see next ready batch
            // Automatic regeneration is disabled to prevent issues with already completed tasks
          }
        }

        this.options.setBatches(updatedBatches);

        // Dispatch progress-updated event to refresh other components
        window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));
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
