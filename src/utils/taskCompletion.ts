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
      if (!request.level_id) {
        throw new Error('Task completion error');
      }

      // Ensure progress record exists, then update it
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

      const result = await ApiService.updateLevelProgress(updateRequest);

      if (result.success) {
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
                levelId: request.level_id,
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
        throw new Error(result.error || 'Failed to update progress');
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
