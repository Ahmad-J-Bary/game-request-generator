import { TauriService } from './tauri.service';
import { BaseApiService, ApiResponse } from './base-api.service';

// ===== Purchase Event API Service =====

export class PurchaseEventService extends BaseApiService {
  // ===== Purchase Event CRUD Operations =====
  static async getPurchaseEvents(gameId: number): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getGamePurchaseEvents(gameId));
  }

  static async createPurchaseEvent(eventData: any): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.addPurchaseEvent(eventData),
      'Purchase event created successfully',
      'Failed to create purchase event'
    );
  }

  static async updatePurchaseEvent(eventData: any): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.updatePurchaseEvent(eventData),
      'Purchase event updated successfully',
      'Failed to update purchase event'
    );
  }

  static async deletePurchaseEvent(eventId: number): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.deletePurchaseEvent(eventId),
      'Purchase event deleted successfully',
      'Failed to delete purchase event'
    );
  }

  static async getPurchaseEventById(eventId: number): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getPurchaseEventById(eventId));
  }
}
