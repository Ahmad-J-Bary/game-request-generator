// src/types/daily-tasks.types.ts
import type { Account, DailyRequestsResponse } from '../types';

export interface CompletedDailyTask {
    id: string;
    accountId: number;
    accountName: string;
    gameId: number;
    gameName: string;
    accountStartDate?: string; // account.start_date, for same-day sibling cooldown
    eventToken: string;
    timeSpent: number;
    completionTime: number; 
    completionDate: string;
    completedAt?: string;
    levelId?: number;
    levelName?: string;
    requestType: string;
    isPurchase: boolean;
}

export interface AddCompletedTaskRequest {
    id: string;
    accountId: number;
    accountName: string;
    gameId: number;
    gameName: string;
    eventToken: string;
    timeSpent: number;
    completionTime: number;
    completionDate: string;
    levelId?: number;
    levelName?: string;
    requestType: string;
    isPurchase: boolean;
}

export interface DailyTasksStorage {
    date: string; // YYYY-MM-DD
    batches: any[]; // Store the generated batches
    accountRandoms: {
        [accountId: number]: {
            [eventToken: string]: number; // random time_spent
        }
    }
}

export interface AccountCompletionRecord {
    accountId: number;
    timeSpent: number;
    completionTime: number; // timestamp when both Session and Event were completed
    levelId: number;
    eventToken: string;
}

export interface AccountTaskAssignment {
    accountId: number;
    assignedTime: number; // timestamp when task was first assigned
    eventToken: string;
    timeSpent: number;
}

export interface AccountStartState {
    accountId: number;
    startTime: string; // account start_time
    firstRequestAllowedAt: number; // calculated timestamp when first request is allowed
    isInitialized: boolean; // whether the initial delay has been calculated
}

export interface RequestGroup {
    event_token: string;
    time_spent: number;
    requests: DailyRequestsResponse['requests'];
}

export interface DailyTask {
    account: Account;
    requests: DailyRequestsResponse['requests'];
    requestGroups?: RequestGroup[]; // Groups of related requests (Session + Event pairs)
    targetDate: string;
    completedTasks: Set<string>; // Track completed tasks by index
    dayTotalTasks?: number; // Full day's task (card) count incl. completed, frozen at generation
}

export interface GameBatch {
    batchIndex: number | string;
    tasks: DailyTask[];
}

/**
 * Compact per-account day-plan stats produced by the `get_all_daily_stats`
 * bulk command so the Dashboard can compute Daily Tasks totals and the ready
 * count immediately, without running the Daily Tasks generator.
 */
export interface DailyAccountStat {
    accountId: number;
    gameId: number;
    totalTasks: number;          // N = full-day card count incl. completed
    pendingCards: number;        // non-completed card count for today
    completedCards: number;      // cards completed as of today (lenient, includes manual)
    firstPendingCardTimeSpent: number | null; // midpoint seconds (deterministic)
    firstPendingEventToken: string | null;
    firstPendingLevelId: number | null;
    lastCompletionTimeMs: number | null;   // most recent completed_at (epoch ms), any day
    lastCompletionTimeSpent: number | null; // that completion's time_spent (seconds)
}

/**
 * A completion recorded within the last hour, used for the global 1-hour
 * cooldown check in the Dashboard ready count.
 */
export interface DailyRecentCompletion {
    accountId: number;
    gameId: number;
    levelId: number | null;
    eventToken: string;
    completionTime: number; // epoch ms
    startDate?: string; // account.start_date, for same-day sibling cooldown
}

/**
 * Bundled response of the `get_all_daily_stats` command.
 */
export interface GetAllDailyStatsResponse {
    stats: DailyAccountStat[];
    recentCompletions: DailyRecentCompletion[];
}

export interface TaskItemProps {
    task: DailyTask;
    onCompleteTask: (accountId: number, requestIndex: number, batchIndex: number | string, task: DailyTask) => void;
    onCopyRequest: (content: string, eventToken?: string, timeSpent?: number) => void;
    accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
    accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
    accountStartStates: { [accountId: number]: AccountStartState };
    batchIndex: number | string;
    allBatches: GameBatch[];
    completedTasks: CompletedDailyTask[];
    deferredTasks?: DailyTask[];
    disableAnimation?: boolean;
    /** Region name -> color, so the badge/card color matches the region's
     * configured color. Falls back to the legacy/palette resolver when a
     * region is absent. */
    regionColorMap?: Record<string, string>;
}

