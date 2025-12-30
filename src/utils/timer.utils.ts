// src/utils/timer.utils.ts
/**
 * Timer utilities for managing task readiness and countdown logic
 */

import type { DailyTask, GameBatch, AccountCompletionRecord, AccountStartState } from '../types/daily-tasks.types';
import { calculateFirstRequestAllowedTime } from './daily-tasks.utils';

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
  batchIndex: number,
  allBatches: GameBatch[],
  currentTime: number,
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord },
  accountStartStates: { [accountId: number]: AccountStartState }
): TimerState => {
  const accountId = task.account.id;
  const completionRecord = accountCompletionRecords[accountId];

  // 1. Check for sequential dependency (Blocked by previous batch)
  const isBlocked = allBatches.some(b =>
    b.batchIndex < batchIndex &&
    b.tasks.some(t => t.account.id === accountId)
  );

  if (isBlocked) {
    return {
      isReady: false,
      isBlocked: true,
      remainingTime: 0,
      comeBackTime: null,
      reason: 'blocked'
    };
  }

  // 2. Check completion record readiness (Cooldown after completing previous task)
  if (completionRecord) {
    const currentGroup = task.requestGroups?.[0] || { time_spent: task.requests[0]?.time_spent || 0 };
    const diff = Math.max(0, currentGroup.time_spent - completionRecord.timeSpent);
    const requiredCooldown = diff * 1000; // Convert to milliseconds

    const timeSinceCompletion = currentTime - completionRecord.completionTime;
    const isCompletionReady = timeSinceCompletion >= requiredCooldown;

    if (!isCompletionReady) {
      const remainingTime = Math.ceil((requiredCooldown - timeSinceCompletion) / 1000);
      const comeBackTime = new Date(currentTime + (requiredCooldown - timeSinceCompletion));

      return {
        isReady: false,
        isBlocked: false,
        remainingTime,
        comeBackTime,
        reason: 'cooldown'
      };
    }
  }

  // 3. Check account start state (Initial delay before first request)
  const startState = accountStartStates[accountId];

  // Only check start state if there's no completion record (first task)
  if (!completionRecord) {
    let firstRequestAllowedAt = startState?.firstRequestAllowedAt;

    // Calculate if not already set
    if (!firstRequestAllowedAt && task.requests.length > 0) {
      const firstEvent = task.requests
        .filter(r => r.request_type === 'session' || r.request_type === 'event')
        .sort((a, b) => a.time_spent - b.time_spent)[0];

      if (firstEvent) {
        firstRequestAllowedAt = calculateFirstRequestAllowedTime(task.account, firstEvent.time_spent);
      }
    }

    if (firstRequestAllowedAt) {
      const isStartReady = currentTime >= firstRequestAllowedAt;

      if (!isStartReady) {
        const remainingTime = Math.ceil((firstRequestAllowedAt - currentTime) / 1000);
        const comeBackTime = new Date(firstRequestAllowedAt);

        return {
          isReady: false,
          isBlocked: false,
          remainingTime,
          comeBackTime,
          reason: 'initializing'
        };
      }
    }
  }

  // Task is ready
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
    return t('dailyTasks.waitingPrevious');
  }

  if (timerState.reason === 'cooldown') {
    return t('dailyTasks.waitingTime', { seconds: timerState.remainingTime });
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