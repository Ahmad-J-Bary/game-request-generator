import { VALIDATION } from '../../constants';

// ===== Purchase Event Validation =====

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class PurchaseEventValidation {
  /**
   * Validate purchase event name
   */
  static validatePurchaseEventName(name: string): ValidationResult {
    const errors: string[] = [];

    if (!name || name.trim().length === 0) {
      errors.push('validation.required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate event token
   */
  static validateEventToken(token: string): ValidationResult {
    const errors: string[] = [];

    if (!token || token.trim().length === 0) {
      errors.push('validation.required');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(token)) {
      errors.push('validation.invalidEventToken');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate max days offset
   */
  static validateMaxDaysOffset(maxDaysOffset: number): ValidationResult {
    const errors: string[] = [];

    if (maxDaysOffset < VALIDATION.MIN_DAYS_OFFSET) {
      errors.push('validation.minValue');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate time spent
   */
  static validateTimeSpent(timeSpent: number): ValidationResult {
    const errors: string[] = [];

    if (timeSpent <= 0) {
      errors.push('validation.minValue');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate purchase event restricted flag
   */
  static validateIsRestricted(_isRestricted: boolean): ValidationResult {
    return {
      isValid: true,
      errors: []
    };
  }
}
