import type { DailyTask, GameBatch } from "@grq/api-bindings";
import { normalizeState } from "./proxy-state.utils.ts";

/**
 * The three display levels a Daily Tasks card is grouped into, based on its
 * position in the account's full-day plan:
 *
 *   Level 1 (top):   n === 1
 *   Level 2 (middle): 1 < n < N
 *   Level 3 (bottom): n === N, where N > 1
 *
 * A day with a single card (N === 1) belongs to Level 1.
 */
export type TaskLevel = "first" | "middle" | "last";

export const TASK_LEVEL_ORDER: readonly TaskLevel[] = [
  "first",
  "middle",
  "last",
];

/**
 * Resolve the level of a task given its day index (n) and total day cards (N).
 * Falls back to "middle" when either value is missing (defensive; generated
 * tasks always carry both).
 */
export const taskLevelOf = (
  n: number | null | undefined,
  N: number | null | undefined,
): TaskLevel => {
  if (n == null || N == null) return "middle";
  if (n === 1) return "first";
  if (N > 1 && n === N) return "last";
  return "middle";
};

/**
 * Level of a DailyTask card using the same n/N sources TaskItem displays:
 * the first request's day_index and the task's frozen day total.
 */
export const taskLevel = (task: DailyTask): TaskLevel =>
  taskLevelOf(task.requests?.[0]?.day_index, task.dayTotalTasks);

/**
 * Check if all requests within a DailyTask are marked completed.
 */
export const isTaskFullyCompleted = (task: DailyTask): boolean => {
  if (!task.completedTasks || !task.requests) return false;
  return (
    task.requests.length > 0 &&
    task.requests.every((_, idx) => task.completedTasks.has(idx.toString()))
  );
};

/**
 * Generic reordering algorithm for stage/task items based on current order:
 *
 * Rule 1: If a stage is completed and NOT all stages before it in the CURRENT order are completed,
 * it is moved to be placed right after the last completed stage in the contiguous completed prefix.
 *
 * Rule 2: If a stage is completed and ALL stages before it in the CURRENT order are completed,
 * it is NOT reordered; it remains in its exact current position in the sequence.
 */
export function applyStageReorderingRules<T>(
  currentItems: T[],
  getIsCompleted: (item: T) => boolean,
): T[] {
  const result = [...currentItems];

  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (getIsCompleted(item)) {
      const previousItems = result.slice(0, i);
      const allPreviousCompleted = previousItems.every((prev) =>
        getIsCompleted(prev),
      );

      if (!allPreviousCompleted) {
        let lastContiguousCompletedIdx = -1;
        for (let j = 0; j < i; j++) {
          if (getIsCompleted(result[j])) {
            lastContiguousCompletedIdx = j;
          } else {
            break;
          }
        }

        result.splice(i, 1);
        const targetIndex = lastContiguousCompletedIdx + 1;
        result.splice(targetIndex, 0, item);
      }
    }
  }

  return result;
}

/**
 * Map each task to its effective level for UI rendering and grouping.
 *
 * Rule:
 * For each account, the FIRST active (uncompleted) task is assigned to Level 1 ("first")
 * because all stages before it for that account are completed.
 * It will NOT be moved down to Level 2 or Level 3 when earlier tasks finish.
 */
export const buildEffectiveTaskLevelMap = (
  tasks: DailyTask[],
): Map<DailyTask, TaskLevel> => {
  const levelMap = new Map<DailyTask, TaskLevel>();
  const tasksByAccount: Record<number, DailyTask[]> = {};

  for (const task of tasks) {
    const accId = task.account.id;
    if (!tasksByAccount[accId]) {
      tasksByAccount[accId] = [];
    }
    tasksByAccount[accId].push(task);
  }

  for (const accIdStr of Object.keys(tasksByAccount)) {
    const originalAccTasks = tasksByAccount[Number(accIdStr)];
    const reorderedAccTasks = applyStageReorderingRules(
      originalAccTasks,
      isTaskFullyCompleted,
    );
    const pendingTasks = reorderedAccTasks.filter((t) => !isTaskFullyCompleted(t));

    for (const task of reorderedAccTasks) {
      if (isTaskFullyCompleted(task)) {
        levelMap.set(
          task,
          "first"
        );
      } else {
        const pendingIdx = pendingTasks.indexOf(task);
        if (pendingIdx === 0) {
          levelMap.set(task, "first");
        } else if (
          pendingTasks.length > 1 &&
          pendingIdx === pendingTasks.length - 1
        ) {
          levelMap.set(task, "last");
        } else {
          levelMap.set(task, "middle");
        }
      }
    }
  }

  return levelMap;
};

/**
 * Rebuild the batch system within a single level using the SAME mechanism the
 * TaskGenerator uses: tasks are first grouped by region (proxy_state, in
 * first-seen order which mirrors the generator's region processing order),
 * then within each region grouped by game_id and rotated into batches of one
 * task per game. Batch indices continue from `startIndex` (a global counter
 * across levels) so the numbering stays continuous, exactly as the generator
 * numbered batches across the whole page.
 */
export const buildLevelBatches = (
  tasks: DailyTask[],
  startIndex = 0,
): GameBatch[] => {
  const stateOrder: string[] = [];
  const tasksByState: { [state: string]: DailyTask[] } = {};
  for (const task of tasks) {
    const state = normalizeState(task.account.proxy_state) || "Unknown";
    if (!tasksByState[state]) {
      tasksByState[state] = [];
      stateOrder.push(state);
    }
    tasksByState[state].push(task);
  }

  const batches: GameBatch[] = [];
  for (const state of stateOrder) {
    const tasksByGame: { [gameId: number]: DailyTask[] } = {};
    for (const task of tasksByState[state]) {
      const gid = task.account.game_id;
      if (!tasksByGame[gid]) tasksByGame[gid] = [];
      tasksByGame[gid].push(task);
    }

    const gameIds = Object.keys(tasksByGame).map(Number);
    const maxTasksInAnyGame = Math.max(
      0,
      ...Object.values(tasksByGame).map((arr) => arr.length),
    );

    for (let i = 0; i < maxTasksInAnyGame; i++) {
      const currentBatchTasks: DailyTask[] = [];
      for (const gid of gameIds) {
        const gameTasks = tasksByGame[gid];
        if (i < gameTasks.length) {
          currentBatchTasks.push(gameTasks[i]);
        }
      }
      if (currentBatchTasks.length > 0) {
        batches.push({
          batchIndex: startIndex + batches.length,
          tasks: currentBatchTasks,
        });
      }
    }
  }

  return batches;
};


