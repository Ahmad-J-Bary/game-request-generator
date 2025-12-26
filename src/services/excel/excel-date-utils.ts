// ===== Excel Date Utilities =====

/**
 * Format date to short format (e.g., "23-Dec")
 */
export function formatDateShort(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()}-${months[d.getMonth()]}`;
}

/**
 * Parse date string to Date object
 */
export function parseDate(input?: string): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

/**
 * Convert date and time strings to Excel Date/Time objects
 */
export function createExcelDateTime(startDate?: string, startTime?: string): { date: Date | string; time: Date | string } {
  let dateValue: Date | string = startDate || '';
  let timeValue: Date | string = startTime || '';

  // Try to create proper date object
  if (startDate) {
    const dateObj = new Date(startDate);
    if (!isNaN(dateObj.getTime())) {
      dateValue = dateObj;
    }
  }

  // Try to create proper time object
  if (startTime) {
    const today = new Date();
    const timeParts = startTime.split(':');
    if (timeParts.length >= 2) {
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);
      const seconds = timeParts.length >= 3 ? parseInt(timeParts[2], 10) : 0;

      if (!isNaN(hours) && !isNaN(minutes)) {
        const timeObj = new Date(today);
        timeObj.setHours(hours, minutes, seconds || 0, 0);
        timeValue = timeObj;
      }
    }
  }

  return { date: dateValue, time: timeValue };
}

