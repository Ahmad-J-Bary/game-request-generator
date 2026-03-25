// src/types/daily-tasks.types.ts
import type { Account, DailyRequestsResponse } from '../types';

export interface CompletedDailyTask {
    id: string;
    accountId: number;
    accountName: string;
    gameId: number;
    gameName: string;
    eventToken: string;
    timeSpent: number; // randomly generated once per day
    completionTime: number; // actual computer clock time (timestamp)
    completionDate: string; // YYYY-MM-DD
    levelId?: number;
    levelName?: string;
    requestType?: 'Session Only' | 'Level Session' | 'Level Event' | 'Purchase Session' | 'Purchase Event'; // Type of request that was completed
    isPurchase?: boolean;
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
}

export interface GameBatch {
    batchIndex: number;
    tasks: DailyTask[];
}

export interface TaskItemProps {
    task: DailyTask;
    onCompleteTask: (accountId: number, requestIndex: number, batchIndex: number) => void;
    onCopyRequest: (content: string, eventToken?: string, timeSpent?: number) => void;
    accountCompletionRecords: { [accountId: number]: AccountCompletionRecord };
    accountTaskAssignments: { [accountId: number]: AccountTaskAssignment[] };
    accountStartStates: { [accountId: number]: AccountStartState };
    batchIndex: number;
    allBatches: GameBatch[];
}
