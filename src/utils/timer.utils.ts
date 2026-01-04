// src/utils/timer.utils.ts
/**
 * Timer utilities for managing task readiness and countdown logic
 */

import type { DailyTask, GameBatch, AccountCompletionRecord, AccountStartState } from '../types/daily-tasks.types';

export interface TimerState {
  isReady: boolean;
  isBlocked: boolean;
  remainingTime: number;
  comeBackTime: Date | null;
  reason: 'ready' | 'blocked' | 'cooldown' | 'initializing';
}

/**
 * Calculate the timer state for a task
 * This function is called every second by the currentTime update
 */
export const calculateTimerState = (
  task: DailyTask,
  _batchIndex: number,
  allBatches: GameBatch[],
  currentTime: number,
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord },
  accountStartStates: { [accountId: number]: AccountStartState }
): TimerState => {
  const accountId = task.account.id;
  const completionRecord = accountCompletionRecords[accountId];
  const startState = accountStartStates[accountId];

  // flattened list of all tasks for this account in order to find previous task
  let previousTask: DailyTask | null = null;
  let foundCurrent = false;

  for (const batch of allBatches) {
      for (const t of batch.tasks) {
          if (t.account.id === accountId) {
              if (t === task || (t.account.id === task.account.id && t.requests[0]?.event_token === task.requests[0]?.event_token && t.requests[0]?.level_id === task.requests[0]?.level_id)) { 
                  foundCurrent = true;
                  break;
              }
              previousTask = t;
          }
      }
      if (foundCurrent) break;
  }
  
  // Helper to get timeSpent of a task
  const getTaskTimeSpent = (t: DailyTask): number => {
       return t.requestGroups?.[0]?.time_spent || t.requests[0]?.time_spent || 0;
  };
  
  // Helper to check if a task is completed
  const isTaskCompleted = (t: DailyTask): boolean => {
      if (!t.requests || t.requests.length === 0) return true;
      return t.requests.every((_, idx) => t.completedTasks.has(idx.toString()));
  };

  // 1. Check for sequential dependency (Pending Previous)
  if (previousTask && !isTaskCompleted(previousTask)) {
    return {
      isReady: false,
      isBlocked: true,
      remainingTime: 0,
      comeBackTime: null,
      reason: 'blocked'
    };
  }

  // 2. Calculate Target Availability Time
  let targetTime = 0;
  let reason: TimerState['reason'] = 'cooldown';

  const currentTimeSpent = getTaskTimeSpent(task);

  if (completionRecord) {
      // Subsequent tasks: Wait from the moment the previous unit was finished
      // Target = Previous Completion Time + (Current Task TimeSpent - Previous Task TimeSpent)
      const prevTimeSpent = completionRecord.timeSpent;
      const waitDuration = Math.max(0, currentTimeSpent - prevTimeSpent);
      targetTime = completionRecord.completionTime + (waitDuration * 1000);
  } else if (startState && startState.startTime) {
      // First Task: Wait from the account's configured start time (the "zero" reference)
      // Target = Start Time + (Current Task TimeSpent - 0)
      reason = 'initializing';
      const baseTime = new Date(startState.startTime).getTime();
      if (!isNaN(baseTime)) {
          targetTime = baseTime + (currentTimeSpent * 1000);
      }
  }

  // Check if we need to wait
  if (targetTime > 0 && currentTime < targetTime) {
       const remainingTime = Math.ceil((targetTime - currentTime) / 1000);
       return {
          isReady: false,
          isBlocked: false,
          remainingTime,
          comeBackTime: new Date(targetTime),
          reason: reason
       };
  }

  // 3. Task is ready
  return {
    isReady: true,
    isBlocked: false,
    remainingTime: 0,
    comeBackTime: null,
    reason: 'ready'
  };
};

/**
 * Format remaining time in a human-readable format
 */
export const formatRemainingTime = (seconds: number): string => {
  if (seconds <= 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
};

/**
 * Get a descriptive message for the timer state
 */
export const getTimerMessage = (
  timerState: TimerState,
  t: (key: string, options?: any) => string
): string => {
  if (timerState.isReady) {
    return t('dailyTasks.ready');
  }

  if (timerState.isBlocked) {
    return t('dailyTasks.blockedByPrevious');
  }

  if (timerState.reason === 'cooldown' && timerState.comeBackTime) {
    return t('dailyTasks.requestAvailable', { 
        time: timerState.comeBackTime.toLocaleString() 
    });
  }

  if (timerState.reason === 'initializing' && timerState.comeBackTime) {
    return t('dailyTasks.accountInitializing', {
      time: timerState.comeBackTime.toLocaleString()
    });
  }

  return t('dailyTasks.waitingTime', { seconds: timerState.remainingTime });
};

/**
 * Check if a batch is ready (all tasks in the batch are ready)
 */
export const isBatchReady = (
  batch: GameBatch,
  allBatches: GameBatch[],
  currentTime: number,
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord },
  accountStartStates: { [accountId: number]: AccountStartState }
): boolean => {
  return batch.tasks.every(task => {
    const timerState = calculateTimerState(
      task,
      batch.batchIndex,
      allBatches,
      currentTime,
      accountCompletionRecords,
      accountStartStates
    );
    return timerState.isReady;
  });
};