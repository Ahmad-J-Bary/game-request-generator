import { VALIDATION } from '../../constants';

// ===== Game Validation =====

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class GameValidation {
  /**
   * Validate game name
   */
  static validateGameName(name: string): ValidationResult {
    const errors: string[] = [];

    if (!name || name.trim().length === 0) {
      errors.push('validation.required');
    } else if (name.length > VALIDATION.MAX_GAME_NAME_LENGTH) {
      errors.push('validation.maxLength');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate game identifier
   */
  static validateGameId(id: string): ValidationResult {
    const errors: string[] = [];

    if (!id || id.trim().length === 0) {
      errors.push('validation.required');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      errors.push('validation.invalidGameId');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
