// src/utils/taskCompletion.ts
import { ApiService } from '../services/api.service';
import { TauriService } from '../services/tauri.service';
import type { ApiResponse } from '../services/api.service';
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

  async completeTask(accountId: number, requestIndex: number, batchIndex: number): Promise<void> {
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

      let result: boolean | ApiResponse;

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

        const deriveType = (req: any): any => {
           const raw = (req.request_type as string).toLowerCase();
           return raw.includes('session') ? 'Purchase Session' : 'Purchase Event';
        };

        // Record completed purchase event
        const completedTask: CompletedDailyTask = {
          id: `${accountId}_${request.event_token}_${Date.now()}`,
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
          requestType: deriveType(request), 
          isPurchase: true,
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

        this.options.setBatches(updatedBatches);

        // Record the completion of this purchase event task for timing
        this.options.setAccountCompletionRecords(prev => ({
          ...prev,
          [accountId]: {
            accountId,
            timeSpent: request.time_spent || 0,
            completionTime: Date.now(),
            levelId: 0, // Using 0 as levelId for purchase events to satisfy types
            eventToken: request.event_token!,
          }
        }));

        // Check if all requests for this account in this batch are completed
        const currentBatch = updatedBatches.find(b => b.batchIndex === batchIndex);
        const taskInBatch = currentBatch?.tasks.find(t => t.account.id === accountId);
        const allCompleted = taskInBatch && taskInBatch.requests.every((_, idx) => 
          taskInBatch.completedTasks.has(idx.toString())
        );

        if (allCompleted) {
          // Remove this task from the specific batch it was in
          const filteredBatches = updatedBatches.map(batch => {
            if (batch.batchIndex === batchIndex) {
              return {
                ...batch,
                tasks: batch.tasks.filter(task => task.account.id !== accountId)
              };
            }
            return batch;
          }).filter(batch => batch.tasks.length > 0);

          this.options.setBatches(filteredBatches);

          // Update localStorage with filtered batches
          const serializedFilteredBatches = filteredBatches.map(batch => ({
            ...batch,
            tasks: batch.tasks.map(task => ({
              ...task,
              completedTasks: Array.from(task.completedTasks)
            }))
          }));
          localStorage.setItem(`dailyTasks_batches_${completedDate}`, JSON.stringify({
            batches: serializedFilteredBatches,
            accountScheduledTime: {}
          }));
        } else {
          // Update localStorage with partially completed task
          const serializedBatches = updatedBatches.map(batch => ({
            ...batch,
            tasks: batch.tasks.map(task => ({
              ...task,
              completedTasks: Array.from(task.completedTasks)
            }))
          }));
          localStorage.setItem(`dailyTasks_batches_${completedDate}`, JSON.stringify({
            batches: serializedBatches,
            accountScheduledTime: {}
          }));
        }

        // Dispatch progress-updated event
        window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));

        return; // Exit early since we've handled everything for purchase events
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

      // Check if the operation was successful (handles both boolean and ApiResponse results)
      // @ts-ignore - TypeScript has trouble with union type checking here
      const success = result === true || (result && typeof result === 'object' && result.success);

      if (success) {
        const now = Date.now();

        const deriveFinalType = (req: any): any => {
          const currentType = (req.request_type as string);

          // If the type is already properly set from task generator, use it
          if (currentType === 'Session Only' || currentType === 'Level Session' ||
              currentType === 'Level Event' || currentType === 'Purchase Session' ||
              currentType === 'Purchase Event') {
            return currentType;
          }

          // Fallback logic for older or incorrectly set types
          if (currentType.includes('Purchase')) {
            return currentType.includes('Session') ? 'Purchase Session' : 'Purchase Event';
          }

          if (currentType.includes('Event')) {
            return 'Level Event';
          }

          // For session types that aren't properly set, we can't determine without context
          // Default to Session Only as it's the safer assumption
          return 'Session Only';
        };

        const finalRequestType = deriveFinalType(request);

        // Create individual completion records for all level events
        // The pair completion logic will clean up duplicates for Session+Event pairs
        if (!isPurchaseEvent && request.level_id) {
          const levelCompletedTask: CompletedDailyTask = {
            id: `${accountId}_level_${request.level_id}_${now}`,
            accountId,
            accountName: foundTask!.account.name,
            gameId: foundTask!.account.game_id,
            gameName: this.options.games.find(g => g.id === foundTask!.account.game_id)?.name || 'Unknown',
            eventToken: request.event_token || '',
            timeSpent: request.time_spent || 0,
            completionTime: now,
            completionDate: new Date().toISOString().split('T')[0],
            levelId: request.level_id,
            levelName: (request.level_name?.trim() || '') || '-',
            requestType: finalRequestType,
            isPurchase: false,
          };

          // Save to localStorage
          const completedDate = new Date().toISOString().split('T')[0];
          const completedKey = `dailyTasks_completed_${completedDate}`;
          const existingCompleted = localStorage.getItem(completedKey);
          const completedList: CompletedDailyTask[] = existingCompleted ? JSON.parse(existingCompleted) : [];
          completedList.push(levelCompletedTask);
          localStorage.setItem(completedKey, JSON.stringify(completedList));

          // Dispatch event to update sidebar
          window.dispatchEvent(new CustomEvent('daily-task-completed'));
        }

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
              // Record the completion of this Session+Event pair with accurate timestamp
              const completionRecord: AccountCompletionRecord = {
                accountId,
                timeSpent: group.time_spent,
                completionTime: now, // Use current timestamp for accurate cooldown calculation
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

              // For Session+Event pairs, ensure we only have one completion record
              // Remove any existing individual completion records for this pair
              const completedDate = new Date().toISOString().split('T')[0];
              const completedKey = `dailyTasks_completed_${completedDate}`;
              const existingCompleted = localStorage.getItem(completedKey);
              let completedList: CompletedDailyTask[] = existingCompleted ? JSON.parse(existingCompleted) : [];

              // Remove any individual completions for this pair's requests
              completedList = completedList.filter(task => {
                // Keep records that don't match this pair's requests
                const isPairSession = task.id.startsWith(`${accountId}_level_`) &&
                  group.requests.some(req => req.level_id === task.levelId && (req.request_type as string).includes('Session'));
                const isPairEvent = task.eventToken === group.event_token &&
                  task.id.includes(`_${group.event_token}_`);
                return !isPairSession && !isPairEvent;
              });

              // Determine if this is a Purchase Event or Level Event pair
              const isPurchasePair = group.requests.some(r => (r.request_type as string).includes('Purchase'));

              // Add the single pair completion record
              const pairCompletedTask: CompletedDailyTask = {
                id: `${accountId}_${group.event_token}_${now}`,
                accountId,
                accountName: foundTask!.account.name,
                gameId: foundTask!.account.game_id,
                gameName: this.options.games.find(g => g.id === foundTask!.account.game_id)?.name || 'Unknown',
                eventToken: group.event_token,
                timeSpent: group.time_spent,
                completionTime: now,
                completionDate: completedDate,
                levelId: request.level_id,
                levelName: (request.level_name?.trim() || '') || (isPurchasePair ? '$$$' : '-'),
                requestType: isPurchasePair ? 'Purchase Event' : 'Level Event', 
                isPurchase: isPurchasePair,
              };

              completedList.push(pairCompletedTask);
              localStorage.setItem(completedKey, JSON.stringify(completedList));

              // Dispatch event to update sidebar
              window.dispatchEvent(new CustomEvent('daily-task-completed'));

              // Remove this task from the specific batch it was in
              const filteredBatches = updatedBatches.map(batch => {
                if (batch.batchIndex === batchIndex) {
                  return {
                    ...batch,
                    tasks: batch.tasks.filter(task => task.account.id !== accountId)
                  };
                }
                return batch;
              }).filter(batch => batch.tasks.length > 0);

              this.options.setBatches(filteredBatches);

              // Update localStorage with filtered batches
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

        // If we get here, the task was partially completed (only one request in a pair)
        // We still update the completion record for timing purposes
        this.options.setAccountCompletionRecords(prev => ({
          ...prev,
          [accountId]: {
            accountId,
            timeSpent: request.time_spent || 0,
            completionTime: now,
            levelId: request.level_id!,
            eventToken: request.event_token || '',
          }
        }));

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