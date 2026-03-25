// ===== API Error Handling =====

export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

export class ApiErrorHandler {
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
   * Handle API errors from Tauri backend
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
}
