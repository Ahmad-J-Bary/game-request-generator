import { VALIDATION } from '../../constants';

// ===== Account Validation =====

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class AccountValidation {
  /**
   * Validate account name
   */
  static validateAccountName(name: string): ValidationResult {
    const errors: string[] = [];

    if (!name || name.trim().length === 0) {
      errors.push('validation.required');
    } else if (name.length > VALIDATION.MAX_ACCOUNT_NAME_LENGTH) {
      errors.push('validation.maxLength');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate account start date
   */
  static validateStartDate(date: string): ValidationResult {
    const errors: string[] = [];

    if (!date) {
      errors.push('validation.required');
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push('validation.invalidDate');
    } else {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        errors.push('validation.invalidDate');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate account start time
   */
  static validateStartTime(time: string): ValidationResult {
    const errors: string[] = [];

    if (!time) {
      errors.push('validation.required');
    } else if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
      errors.push('validation.invalidTime');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate request template
   */
  static validateRequestTemplate(template: string): ValidationResult {
    const errors: string[] = [];

    if (!template || template.trim().length === 0) {
      errors.push('validation.required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
