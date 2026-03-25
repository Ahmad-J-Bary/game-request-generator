import { TauriService } from './tauri.service';
import { BaseApiService, ApiResponse } from './base-api.service';

// ===== Account API Service =====

export class AccountService extends BaseApiService {
  // ===== Account CRUD Operations =====
  static async getAccounts(gameId: number): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getAccounts(gameId));
  }

  static async createAccount(accountData: any): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.addAccount(accountData),
      'Account created successfully',
      'Failed to create account'
    );
  }

  static async updateAccount(accountData: any): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.updateAccount(accountData),
      'Account updated successfully',
      'Failed to update account'
    );
  }

  static async deleteAccount(accountId: number): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.deleteAccount(accountId),
      'Account deleted successfully',
      'Failed to delete account'
    );
  }

  static async getAccountById(accountId: number): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getAccountById(accountId));
  }
}
