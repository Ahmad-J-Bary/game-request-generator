import { ErrorHandler } from '../utils/errorHandling';
import { NotificationService } from '../utils/notifications';

// ===== API Response Types =====

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ===== Base API Service =====

export abstract class BaseApiService {
  protected static async handleApiCall<T>(
    operation: () => Promise<T>,
    successMessage?: string,
    errorMessage?: string
  ): Promise<ApiResponse<T>> {
    try {
      const data = await operation();
      if (successMessage) {
        NotificationService.success(successMessage);
      }
      return { success: true, data };
    } catch (error) {
      const appError = ErrorHandler.handleApiError(error);
      ErrorHandler.logError(appError);
      if (errorMessage) {
        NotificationService.error(errorMessage);
      }
      return { success: false, error: ErrorHandler.getUserMessage(appError) };
    }
  }

  protected static async handleReadOperation<T>(
    operation: () => Promise<T>
  ): Promise<ApiResponse<T>> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      const appError = ErrorHandler.handleApiError(error);
      ErrorHandler.logError(appError);
      return { success: false, error: ErrorHandler.getUserMessage(appError) };
    }
  }
}

