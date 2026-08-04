// src/types/daily-tasks.types.ts
import type { Account, DailyRequestsResponse } from '../types';

export interface CompletedDailyTask {
    id: string;
    accountId: number;
    accountName: string;
    gameId: number;
    gameName: string;
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
    firstPendingCardTimeSpent: number | null; // midpoint seconds (deterministic)
    firstPendingEventToken: string | null;
    firstPendingLevelId: number | null;
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
}

