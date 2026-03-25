// ===== Error Handling Utilities =====

export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

export class ErrorHandler {
  /**
   * Create a standardized error object
   */
  static createError(code: string, message: string, details?: any): AppError {
    return {
      code,
      message,
      details,
      timestamp: new Date(),
    };
  }

  /**
   * Handle API errors
   */
  static handleApiError(error: any): AppError {
    if (typeof error === 'string') {
      return this.createError('API_ERROR', error);
    }

    if (error?.message) {
      return this.createError('API_ERROR', error.message, error);
    }

    if (error?.response?.data?.message) {
      return this.createError(
        error.response.data.code || 'API_ERROR',
        error.response.data.message,
        error.response.data
      );
    }

    return this.createError('UNKNOWN_ERROR', 'An unexpected error occurred', error);
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(field: string, errors: string[]): AppError {
    return this.createError(
      'VALIDATION_ERROR',
      `Validation failed for ${field}`,
      { field, errors }
    );
  }

  /**
   * Handle Tauri-specific errors
   */
  static handleTauriError(error: any): AppError {
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return this.createError(
        'DUPLICATE_ERROR',
        'A record with these details already exists',
        error
      );
    }

    if (error?.message?.includes('FOREIGN KEY constraint failed')) {
      return this.createError(
        'FOREIGN_KEY_ERROR',
        'Cannot delete this item as it is being used elsewhere',
        error
      );
    }

    return this.handleApiError(error);
  }

  /**
   * Log errors to console
   */
  static logError(error: AppError): void {
    console.error(`[${error.timestamp.toISOString()}] ${error.code}: ${error.message}`, error.details);
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
      'UNKNOWN_ERROR': 'An unexpected error occurred',
    };

    return messageMap[error.code] || error.message || 'An error occurred';
  }

  /**
   * Handle file read errors
   */
  static handleFileReadError(filePath: string, error: any): AppError {
    return this.createError(
      'FILE_READ_ERROR',
      `Failed to read file: ${filePath}`,
      { filePath, error }
    );
  }

  /**
   * Handle file write errors
   */
  static handleFileWriteError(filePath: string, error: any): AppError {
    return this.createError(
      'FILE_WRITE_ERROR',
      `Failed to write file: ${filePath}`,
      { filePath, error }
    );
  }

  /**
   * Handle Excel parsing errors
   */
  static handleExcelParseError(fileName: string, error: any): AppError {
    return this.createError(
      'EXCEL_PARSE_ERROR',
      `Failed to parse Excel file: ${fileName}`,
      { fileName, error }
    );
  }
}

// ===== Error Codes =====
export const ERROR_CODES = {
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUIRED_FIELD: 'REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Network
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',

  // API
  API_ERROR: 'API_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  SERVER_ERROR: 'SERVER_ERROR',

  // File operations
  FILE_ERROR: 'FILE_ERROR',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',

  // Database
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',

  // General
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

// ===== Error Categories =====
export const ERROR_CATEGORIES = {
  VALIDATION: 'VALIDATION',
  NETWORK: 'NETWORK',
  API: 'API',
  FILE: 'FILE',
  DATABASE: 'DATABASE',
  UNKNOWN: 'UNKNOWN',
} as const;
