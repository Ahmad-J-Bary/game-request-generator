// src/utils/timer.utils.ts
/**
 * Timer utilities for managing task readiness and countdown logic
 */

import type {
  DailyTask,
  GameBatch,
  AccountCompletionRecord,
  AccountStartState,
} from "@grq/api-bindings";

export interface TimerState {
  isReady: boolean;
  isBlocked: boolean;
  remainingTime: number;
  comeBackTime: Date | null;
  reason: "ready" | "blocked" | "cooldown" | "initializing";
  /**
   * Total duration (in seconds) of the current wait, used to render
   * a meaningful countdown progress bar. 0 when ready or blocked.
   */
  totalWaitSec: number;
}

/**
 * Calculate the timer state for a task
 * This function is called every second by the currentTime update
 */
export const calculateTimerState = (
  task: DailyTask,
  _batchIndex: number | string,
  allBatches: GameBatch[],
  currentTime: number,
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord },
  accountStartStates: { [accountId: number]: AccountStartState },
  completedTasks: any[] = [],
  extraTasks: DailyTask[] = [],
  previousTask?: DailyTask | null,
): TimerState => {
  const accountId = task.account.id;

  const completionRecord = accountCompletionRecords[accountId];
  const startState = accountStartStates[accountId];

  // Helper to get timeSpent of a task
  const getTaskTimeSpent = (t: DailyTask): number => {
    return (
      (t as any).requestGroups?.[0]?.time_spent ||
      t.requests[0]?.time_spent ||
      0
    );
  };

  const currentTimeSpent = getTaskTimeSpent(task);

  // Use caller-provided previousTask (O(1)) when available, otherwise search all batches
  if (previousTask === undefined) {
    previousTask = null;
    let foundCurrent = false;

    for (const batch of allBatches) {
      for (const t of batch.tasks) {
        if (t.account.id === accountId) {
          if (
            t === task ||
            (t.account.id === task.account.id &&
              t.requests[0]?.event_token === task.requests[0]?.event_token &&
              t.requests[0]?.level_id === task.requests[0]?.level_id &&
              (t.requests[0] as any).days_offset ===
                (task.requests[0] as any).days_offset &&
              getTaskTimeSpent(t) === currentTimeSpent)
          ) {
            foundCurrent = true;
            break;
          }
          previousTask = t;
        }
      }
      if (foundCurrent) break;
    }

    if (!foundCurrent) {
      for (const t of extraTasks) {
        if (t.account.id === accountId) {
          if (
            t === task ||
            (t.account.id === task.account.id &&
              t.requests[0]?.event_token === task.requests[0]?.event_token &&
              t.requests[0]?.level_id === task.requests[0]?.level_id &&
              (t.requests[0] as any).days_offset ===
                (task.requests[0] as any).days_offset &&
              getTaskTimeSpent(t) === currentTimeSpent)
          ) {
            foundCurrent = true;
            break;
          }
          previousTask = t;
        }
      }
    }
  }

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
      reason: "blocked",
      totalWaitSec: 0,
    };
  }

  // 2. Calculate Target Availability Time
  let targetTime = 0;
  let totalWaitSec = 0;
  let reason: TimerState["reason"] = "cooldown";
  if (completionRecord) {
    // Subsequent tasks: Wait from the moment the previous unit was finished.
    // Target = Previous Completion Time + (Current Task TimeSpent - Previous
    // Task TimeSpent). time_spent (and completionRecord.timeSpent) are both in
    // SECONDS, so the diff stays in seconds; only the final delta is converted
    // to ms for the epoch target.
    const prevTimeSpent = completionRecord.timeSpent ?? 0;
    const waitDuration = Math.max(0, currentTimeSpent - prevTimeSpent);
    totalWaitSec = waitDuration;
    targetTime = completionRecord.completionTime + waitDuration * 1000;
  } else if (startState && startState.startTime) {
    // First task: the account's configured start time is the "zero" reference.
    // Target = Account Start Time + (First Task TimeSpent * 1000) as in v1.4.9.
    reason = "initializing";
    const parsedStart = new Date(startState.startTime).getTime();
    if (!isNaN(parsedStart)) {
      targetTime = parsedStart + currentTimeSpent * 1000;
      totalWaitSec = currentTimeSpent;
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
      reason: reason,
      totalWaitSec,
    };
  }

  // 3. Global Cooldown Check (1 hour)
  // Check if ANY account completed this SAME level or event within the last hour
  const taskLevelId = task.requests[0]?.level_id;
  const taskEventToken = task.requests[0]?.event_token;
  const taskGameId = task.account.game_id;

  if (taskLevelId || taskEventToken) {
    let globalCooldownTarget = 0;
    const OneHourMs = 3600 * 1000;

    for (const completedTask of completedTasks) {
      // Skip own completions as they are handled by the sequential logic
      if (completedTask.accountId === accountId) continue;
      if (completedTask.gameId !== taskGameId) continue;

      // Sibling gate: the 1-hour cooldown only applies between accounts of the
      // same game created on the SAME day. Accounts started on other days (or
      // other branches sharing a purchase token) must NOT trigger it.
      const otherStartDate =
        completedTask.accountStartDate ?? (completedTask as any).startDate;
      const thisStartDate = (task.account as any).start_date;
      if (
        !otherStartDate ||
        !thisStartDate ||
        otherStartDate !== thisStartDate
      ) {
        continue;
      }

      const isSameLevel = taskLevelId && completedTask.levelId === taskLevelId;
      const isSameEvent =
        taskEventToken &&
        completedTask.eventToken === taskEventToken &&
        !taskLevelId;

      if (isSameLevel || isSameEvent) {
        const cooldownEnd = completedTask.completionTime + OneHourMs;
        if (cooldownEnd > globalCooldownTarget) {
          globalCooldownTarget = cooldownEnd;
        }
      }
    }

    if (globalCooldownTarget > currentTime) {
      const remainingTime = Math.ceil(
        (globalCooldownTarget - currentTime) / 1000,
      );
      return {
        isReady: false,
        isBlocked: false,
        remainingTime,
        comeBackTime: new Date(globalCooldownTarget),
        reason: "cooldown",
        totalWaitSec: 3600,
      };
    }
  }

  // 3. Task is ready
  return {
    isReady: true,
    isBlocked: false,
    remainingTime: 0,
    comeBackTime: null,
    reason: "ready",
    totalWaitSec: 0,
  };
};

/**
 * Format remaining time in a human-readable format
 */
export const formatRemainingTime = (seconds: number): string => {
  if (seconds <= 0) return "0s";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
};

/**
 * Get a descriptive message for the timer state
 */
export const getTimerMessage = (
  timerState: TimerState,
  t: (key: string, options?: any) => string,
): string => {
  if (timerState.isReady) {
    return t("dailyTasks.ready");
  }

  if (timerState.isBlocked) {
    return t("dailyTasks.blockedByPrevious");
  }

  if (timerState.reason === "cooldown" && timerState.comeBackTime) {
    return t("dailyTasks.requestAvailable", {
      time: timerState.comeBackTime.toLocaleString(),
    });
  }

  if (timerState.reason === "initializing" && timerState.comeBackTime) {
    return t("dailyTasks.accountInitializing", {
      time: timerState.comeBackTime.toLocaleString(),
    });
  }

  return t("dailyTasks.waitingTime", { seconds: timerState.remainingTime });
};

/**
 * Check if a batch is ready (all tasks in the batch are ready)
 */
export const isBatchReady = (
  batch: GameBatch,
  allBatches: GameBatch[],
  currentTime: number,
  accountCompletionRecords: { [accountId: number]: AccountCompletionRecord },
  accountStartStates: { [accountId: number]: AccountStartState },
  completedTasks: any[] = [],
): boolean => {
  return batch.tasks.every((task) => {
    const timerState = calculateTimerState(
      task,
      batch.batchIndex,
      allBatches,
      currentTime,
      accountCompletionRecords,
      accountStartStates,
      completedTasks,
    );
    return timerState.isReady;
  });
};
