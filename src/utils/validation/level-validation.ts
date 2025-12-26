import { VALIDATION } from '../../constants';

// ===== Level Validation =====

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class LevelValidation {
  /**
   * Validate level name
   */
  static validateLevelName(name: string): ValidationResult {
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
   * Validate days offset
   */
  static validateDaysOffset(daysOffset: number): ValidationResult {
    const errors: string[] = [];

    if (daysOffset < VALIDATION.MIN_DAYS_OFFSET) {
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
   * Validate level bonus flag
   */
  static validateIsBonus(_isBonus: boolean): ValidationResult {
    return {
      isValid: true,
      errors: []
    };
  }
}
