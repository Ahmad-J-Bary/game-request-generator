import { TauriService } from './tauri.service';
import { BaseApiService, ApiResponse } from './base-api.service';

// ===== Request API Service =====

export class RequestService extends BaseApiService {
  // ===== Request Generation =====
  static async getDailyRequests(accountId: number, targetDate: string): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getDailyRequests(accountId, targetDate));
  }

  static async getAccountProgress(accountId: number, targetDate: string): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getAccountProgress(accountId, targetDate));
  }

  static async getLevelDates(accountId: number): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getLevelDates(accountId));
  }
}

// ===== Progress API Service =====

export class ProgressService extends BaseApiService {
  // ===== Progress Operations =====
  static async createLevelProgress(progressData: any): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.createLevelProgress(progressData));
  }

  static async updateLevelProgress(progressData: any): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.updateLevelProgress(progressData),
      'Task completed successfully',
      'Failed to complete task'
    );
  }

  static async getAccountLevelProgress(accountId: number): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getAccountLevelProgress(accountId));
  }

  static async createPurchaseEventProgress(progressData: any): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.createPurchaseEventProgress(progressData));
  }

  static async updatePurchaseEventProgress(progressData: any): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.updatePurchaseEventProgress(progressData));
  }

  static async getAccountPurchaseEventProgress(accountId: number): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getAccountPurchaseEventProgress(accountId));
  }
}
