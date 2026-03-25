// ===== Validation Utilities Index =====
// Centralizes all validation utilities following the Facade pattern

export { AccountValidation } from './account-validation';
export { GameValidation } from './game-validation';
export { LevelValidation } from './level-validation';
export { PurchaseEventValidation } from './purchase-event-validation';

// ===== Common Types =====
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// ===== Legacy Support =====
// For backward compatibility, re-export common validation methods
export { AccountValidation as ValidationUtils } from './account-validation';
