// src/utils/daily-tasks.utils.ts
import { Account } from '../types';
import { DailyTask, GameBatch, AccountCompletionRecord, AccountStartState } from '../types/daily-tasks.types';
import { calculateTimerState } from './timer.utils';

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

/**
 * Check if a task is ready to be executed
 * This is a simplified wrapper around calculateTimerState for backward compatibility
 */
export const checkTaskReadiness = (
    task: DailyTask,
    batchIndex: number,
    allBatches: GameBatch[],
    currentTime: number,
    accountCompletionRecords: { [accountId: number]: AccountCompletionRecord },
    accountStartStates: { [accountId: number]: AccountStartState }
): boolean => {
    const timerState = calculateTimerState(
        task,
        batchIndex,
        allBatches,
        currentTime,
        accountCompletionRecords,
        accountStartStates
    );
    return timerState.isReady;
};

/**
 * Get detailed readiness information for a task
 * This provides more information than just a boolean
 */
export const getTaskReadinessDetails = (
    task: DailyTask,
    batchIndex: number,
    allBatches: GameBatch[],
    currentTime: number,
    accountCompletionRecords: { [accountId: number]: AccountCompletionRecord },
    accountStartStates: { [accountId: number]: AccountStartState }
) => {
    const timerState = calculateTimerState(
        task,
        batchIndex,
        allBatches,
        currentTime,
        accountCompletionRecords,
        accountStartStates
    );

    return {
        isReady: timerState.isReady,
        isBlocked: timerState.isBlocked,
        remainingTime: timerState.remainingTime,
        comeBackTime: timerState.comeBackTime
    };
};

/**
 * Get interpolated time_spent for a given day
 * Used for calculating purchase event timing
 */
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