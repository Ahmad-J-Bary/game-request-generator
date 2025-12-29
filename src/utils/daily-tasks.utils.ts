// src/utils/daily-tasks.utils.ts
import { Account } from '../types';
import { DailyTask, GameBatch, AccountCompletionRecord, AccountStartState } from '../types/daily-tasks.types';

export const calculateFirstRequestAllowedTime = (account: Account, firstEventTimeSpent: number): number => {
    try {
        let baseDate: Date;

        if (account.start_date && account.start_time) {
            const datePart = account.start_date.includes('T') ? account.start_date.split('T')[0] : account.start_date;
            baseDate = new Date(`${datePart}T${account.start_time}`);
        } else {
            baseDate = new Date(account.start_date);
        }

        if (isNaN(baseDate.getTime())) {
            console.warn(`Could not parse start time for account ${account.id}. Falling back to current time.`);
            return Date.now();
        }

        const delayMs = firstEventTimeSpent * 1000;
        return baseDate.getTime() + delayMs;
    } catch (error) {
        console.error(`Error calculating first request time for account ${account.id}:`, error);
        return Date.now();
    }
};

export const checkTaskReadiness = (
    task: DailyTask,
    batchIndex: number,
    allBatches: GameBatch[],
    currentTime: number,
    accountCompletionRecords: { [accountId: number]: AccountCompletionRecord },
    accountStartStates: { [accountId: number]: AccountStartState }
): boolean => {
    const accountId = task.account.id;
    const completionRecord = accountCompletionRecords[accountId];

    // 1. Check for sequential dependency (Blocked)
    const isBlocked = allBatches.some(b =>
        b.batchIndex < batchIndex &&
        b.tasks.some(t => t.account.id === accountId)
    );

    if (isBlocked) return false;

    // 2. Check completion record readiness (Cooldown)
    let isCompletionReady = true;
    if (completionRecord) {
        const currentGroup = task.requestGroups?.[0] || { time_spent: task.requests[0]?.time_spent || 0 };
        const diff = Math.max(0, currentGroup.time_spent - completionRecord.timeSpent);
        const requiredCooldown = diff * 1000;
        const timeSinceCompletion = currentTime - completionRecord.completionTime;
        isCompletionReady = timeSinceCompletion >= requiredCooldown;
    }

    // 3. Check account start state
    const startState = accountStartStates[accountId];
    let isStartReady = true;

    if (!completionRecord) {
        let firstRequestAllowedAt = startState?.firstRequestAllowedAt;

        if (!firstRequestAllowedAt && task.requests.length > 0) {
            const firstEvent = task.requests
                .filter(r => r.request_type === 'session' || r.request_type === 'event')
                .sort((a, b) => a.time_spent - b.time_spent)[0];

            if (firstEvent) {
                firstRequestAllowedAt = calculateFirstRequestAllowedTime(task.account, firstEvent.time_spent);
            }
        }

        if (firstRequestAllowedAt) {
            isStartReady = currentTime >= firstRequestAllowedAt;
        }
    }

    return isCompletionReady && isStartReady;
};

export const getTaskReadinessDetails = (
    task: DailyTask,
    batchIndex: number,
    allBatches: GameBatch[],
    currentTime: number,
    accountCompletionRecords: { [accountId: number]: AccountCompletionRecord },
    accountStartStates: { [accountId: number]: AccountStartState }
) => {
    const accountId = task.account.id;
    const completionRecord = accountCompletionRecords[accountId];

    // 1. Blocked
    const isBlocked = allBatches.some(b =>
        b.batchIndex < batchIndex &&
        b.tasks.some(t => t.account.id === accountId)
    );

    // 2. Cooldown
    let isCompletionReady = true;
    let completionRemainingTime = 0;
    let completionComeBackTime: Date | null = null;

    if (completionRecord) {
        const currentGroup = task.requestGroups?.[0] || { time_spent: task.requests[0]?.time_spent || 0 };
        const diff = Math.max(0, currentGroup.time_spent - completionRecord.timeSpent);
        const requiredCooldown = diff * 1000;
        const timeSinceCompletion = currentTime - completionRecord.completionTime;
        isCompletionReady = timeSinceCompletion >= requiredCooldown;

        if (!isCompletionReady) {
            completionRemainingTime = Math.ceil((requiredCooldown - timeSinceCompletion) / 1000);
            completionComeBackTime = new Date(currentTime + (requiredCooldown - timeSinceCompletion));
        }
    }

    // 3. Start State
    const startState = accountStartStates[accountId];
    let isStartReady = true;
    let startRemainingTime = 0;
    let startComeBackTime: Date | null = null;

    if (!completionRecord) {
        let firstRequestAllowedAt = startState?.firstRequestAllowedAt;

        if (!firstRequestAllowedAt && task.requests.length > 0) {
            const firstEvent = task.requests
                .filter(r => r.request_type === 'session' || r.request_type === 'event')
                .sort((a, b) => a.time_spent - b.time_spent)[0];

            if (firstEvent) {
                firstRequestAllowedAt = calculateFirstRequestAllowedTime(task.account, firstEvent.time_spent);
            }
        }
        if (firstRequestAllowedAt) {
            isStartReady = currentTime >= firstRequestAllowedAt;
            if (!isStartReady) {
                startRemainingTime = Math.ceil((firstRequestAllowedAt - currentTime) / 1000);
                startComeBackTime = new Date(firstRequestAllowedAt);
            }
        }
    }

    const isReady = !isBlocked && isCompletionReady && isStartReady;
    const remainingTime = Math.max(completionRemainingTime, startRemainingTime);
    const comeBackTime = startComeBackTime || completionComeBackTime;

    return { isReady, isBlocked, remainingTime, comeBackTime };
};

export const getInterpolatedTimeSpent = (day: number, gameLevels: any[]): number => {
    if (gameLevels.length === 0) return 0;

    const numeric = gameLevels
        .filter((l) => typeof l.days_offset === 'number')
        .sort((a, b) => a.days_offset - b.days_offset);

    if (numeric.length === 0) return 0;

    // Find exact match
    const exact = numeric.find((l) => l.days_offset === day);
    if (exact) return exact.time_spent;

    // Find surrounding real levels
    const prevReal = [...numeric].reverse().find((l) => l.days_offset < day);
    const nextReal = numeric.find((l) => l.days_offset > day);

    if (nextReal && !prevReal) {
        // Before first real level
        const firstRealDay = nextReal.days_offset;
        const increment = nextReal.time_spent / (firstRealDay + 1);
        return Math.round((day + 1) * increment);
    }

    if (prevReal && nextReal) {
        // Between two real levels
        const ratio = (day - prevReal.days_offset) / (nextReal.days_offset - prevReal.days_offset);
        return Math.round(prevReal.time_spent + ratio * (nextReal.time_spent - prevReal.time_spent));
    }

    if (prevReal && !nextReal) {
        // After last real level - assume it stays the same or grows slightly? 
        // For now, just return the last real level's time_spent
        return prevReal.time_spent;
    }

    return 0;
};
