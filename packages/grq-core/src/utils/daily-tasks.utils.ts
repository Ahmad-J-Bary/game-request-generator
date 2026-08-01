// src/utils/daily-tasks.utils.ts
import type { Account } from '@grq/api-bindings';

/**
 * Parse the account's configured start date/time into a Date, handling
 * AM/PM formats and ISO date parts robustly. Returns null when unparseable.
 */
export const parseAccountStartDate = (account: Account): Date | null => {
    try {
        let baseDate: Date;

        if (account.start_date && account.start_time) {
            const datePart = account.start_date.includes('T') ? account.start_date.split('T')[0] : account.start_date;

            // Robust time parsing
            let timeStr = account.start_time.trim();
            const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);

            if (timeMatch) {
                let hours = parseInt(timeMatch[1], 10);
                const minutes = timeMatch[2];
                const seconds = timeMatch[3] || '00';
                const ampm = timeMatch[4]?.toUpperCase();

                if (ampm) {
                    if (ampm === 'PM' && hours !== 12) hours += 12;
                    else if (ampm === 'AM' && hours === 12) hours = 0;
                }

                const standardizedTime = `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
                baseDate = new Date(`${datePart}T${standardizedTime}`);
            } else {
                baseDate = new Date(`${datePart}T${timeStr}`);
            }
        } else {
            baseDate = new Date(account.start_date);
        }

        if (isNaN(baseDate.getTime())) return null;
        return baseDate;
    } catch (error) {
        console.error(`Error parsing start time for account ${account.id}:`, error);
        return null;
    }
};

export const calculateFirstRequestAllowedTime = (account: Account, firstEventTimeSpent: number): number => {
    try {
        const baseDate = parseAccountStartDate(account);

        if (!baseDate) {
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

