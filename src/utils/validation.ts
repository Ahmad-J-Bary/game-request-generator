// ===== Validation Utilities (Legacy Support) =====
// This file provides backward compatibility while new code should use the decomposed validation files

import {
  AccountValidation,
  GameValidation,
  LevelValidation,
  PurchaseEventValidation
} from './validation/index';
import type { ValidationResult } from './validation/index';

// ===== Legacy ValidationUtils Class =====
// Provides backward compatibility for existing code

export type { ValidationResult };

export class ValidationUtils {
  // ===== Account Validation =====
  static validateAccountName(name: string): ValidationResult {
    return AccountValidation.validateAccountName(name);
  }

  static validateStartDate(date: string): ValidationResult {
    return AccountValidation.validateStartDate(date);
  }

  static validateStartTime(time: string): ValidationResult {
    return AccountValidation.validateStartTime(time);
  }

  static validateRequestTemplate(template: string): ValidationResult {
    return AccountValidation.validateRequestTemplate(template);
  }

  // ===== Game Validation =====
  static validateGameName(name: string): ValidationResult {
    return GameValidation.validateGameName(name);
  }

  static validateGameId(id: string): ValidationResult {
    return GameValidation.validateGameId(id);
  }

  // ===== Level Validation =====
  static validateLevelName(name: string): ValidationResult {
    return LevelValidation.validateLevelName(name);
  }

  static validateEventToken(token: string): ValidationResult {
    return LevelValidation.validateEventToken(token);
  }

  static validateDaysOffset(daysOffset: number): ValidationResult {
    return LevelValidation.validateDaysOffset(daysOffset);
  }

  static validateTimeSpent(timeSpent: number): ValidationResult {
    return LevelValidation.validateTimeSpent(timeSpent);
  }

  static validateIsBonus(isBonus: boolean): ValidationResult {
    return LevelValidation.validateIsBonus(isBonus);
  }

  // ===== Purchase Event Validation =====
  static validatePurchaseEventName(name: string): ValidationResult {
    return PurchaseEventValidation.validatePurchaseEventName(name);
  }

  static validateMaxDaysOffset(maxDaysOffset: number): ValidationResult {
    return PurchaseEventValidation.validateMaxDaysOffset(maxDaysOffset);
  }

  static validateIsRestricted(isRestricted: boolean): ValidationResult {
    return PurchaseEventValidation.validateIsRestricted(isRestricted);
  }


  /**
   * Validate date string
   */
  static validateDate(dateString: string): ValidationResult {
    const errors: string[] = [];

    if (!dateString || dateString.trim().length === 0) {
      errors.push('validation.required');
    } else {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        errors.push('validation.invalidDate');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate time string
   */
  static validateTime(timeString: string): ValidationResult {
    const errors: string[] = [];

    if (!timeString || timeString.trim().length === 0) {
      errors.push('validation.required');
    } else if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(timeString)) {
      errors.push('validation.invalidTime');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate email (for future use)
   */
  static validateEmail(email: string): ValidationResult {
    const errors: string[] = [];

    if (!email || email.trim().length === 0) {
      errors.push('validation.required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('validation.invalidEmail');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Combine multiple validation results
   */
  static combine(results: ValidationResult[]): ValidationResult {
    const allErrors = results.flatMap(result => result.errors);
    return {
      isValid: allErrors.length === 0,
      errors: allErrors
    };
  }
}

// ===== Validation Rules =====
export const ValidationRules = {
  account: {
    name: ValidationUtils.validateAccountName,
  },
  game: {
    name: ValidationUtils.validateGameName,
  },
  level: {
    name: ValidationUtils.validateLevelName,
    daysOffset: ValidationUtils.validateDaysOffset,
    timeSpent: ValidationUtils.validateTimeSpent,
    eventToken: ValidationUtils.validateEventToken,
  },
  general: {
    date: ValidationUtils.validateDate,
    time: ValidationUtils.validateTime,
    email: ValidationUtils.validateEmail,
  },
} as const;
