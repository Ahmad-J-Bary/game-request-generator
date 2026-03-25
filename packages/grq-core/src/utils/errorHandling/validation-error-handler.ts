// ===== Validation Error Handling =====

import { AppError } from './api-error-handler';

export class ValidationErrorHandler {
  /**
   * Handle validation errors
   */
  static handleValidationError(field: string, errors: string[]): AppError {
    return {
      code: 'VALIDATION_ERROR',
      message: `Validation failed for ${field}`,
      details: { field, errors },
      timestamp: new Date(),
    };
  }

  /**
   * Handle form validation errors
   */
  static handleFormValidationError(formData: Record<string, any>, validationErrors: Record<string, string[]>): AppError {
    const firstField = Object.keys(validationErrors)[0];
    const firstError = validationErrors[firstField]?.[0] || 'Validation failed';

    return {
      code: 'FORM_VALIDATION_ERROR',
      message: firstError,
      details: { formData, validationErrors },
      timestamp: new Date(),
    };
  }

  /**
   * Handle required field errors
   */
  static handleRequiredFieldError(fieldName: string): AppError {
    return {
      code: 'REQUIRED_FIELD_ERROR',
      message: `${fieldName} is required`,
      details: { fieldName },
      timestamp: new Date(),
    };
  }

  /**
   * Handle invalid format errors
   */
  static handleInvalidFormatError(fieldName: string, expectedFormat: string): AppError {
    return {
      code: 'INVALID_FORMAT_ERROR',
      message: `${fieldName} has an invalid format. Expected: ${expectedFormat}`,
      details: { fieldName, expectedFormat },
      timestamp: new Date(),
    };
  }
}
