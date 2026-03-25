// ===== General Error Handling =====

import { AppError } from './api-error-handler';

export class GeneralErrorHandler {
  /**
   * Log errors to console with proper formatting
   */
  static logError(error: AppError): void {
    console.error(`[${error.timestamp.toISOString()}] ${error.code}: ${error.message}`, {
      details: error.details,
      stack: error instanceof Error ? error.stack : undefined
    });
  }

  /**
   * Get user-friendly error message
   */
  static getUserMessage(error: AppError): string {
    // Map error codes to user-friendly messages
    const messageMap: Record<string, string> = {
      'API_ERROR': 'An error occurred while communicating with the server',
      'VALIDATION_ERROR': error.message,
      'DUPLICATE_ERROR': 'This item already exists',
      'FOREIGN_KEY_ERROR': 'Cannot delete this item as it is being used',
      'FILE_READ_ERROR': 'Failed to read the file',
      'FILE_WRITE_ERROR': 'Failed to save the file',
      'FILE_NOT_FOUND_ERROR': 'File not found',
      'EXCEL_PARSE_ERROR': 'Failed to process the Excel file',
      'FILE_PERMISSION_ERROR': 'Permission denied for file operation',
      'FORM_VALIDATION_ERROR': error.message,
      'REQUIRED_FIELD_ERROR': error.message,
      'INVALID_FORMAT_ERROR': error.message,
      'UNKNOWN_ERROR': 'An unexpected error occurred',
    };

    return messageMap[error.code] || error.message || 'An error occurred';
  }

  /**
   * Check if error is recoverable
   */
  static isRecoverableError(error: AppError): boolean {
    const recoverableCodes = [
      'VALIDATION_ERROR',
      'FILE_NOT_FOUND_ERROR',
      'FORM_VALIDATION_ERROR',
      'REQUIRED_FIELD_ERROR',
      'INVALID_FORMAT_ERROR',
    ];

    return recoverableCodes.includes(error.code);
  }

  /**
   * Handle unhandled errors
   */
  static handleUnhandledError(error: any, context?: string): AppError {
    const appError = {
      code: 'UNHANDLED_ERROR',
      message: `Unhandled error${context ? ` in ${context}` : ''}: ${error?.message || 'Unknown error'}`,
      details: { originalError: error, context },
      timestamp: new Date(),
    };

    this.logError(appError);
    return appError;
  }
}
