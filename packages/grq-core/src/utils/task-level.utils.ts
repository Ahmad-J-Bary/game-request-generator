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
