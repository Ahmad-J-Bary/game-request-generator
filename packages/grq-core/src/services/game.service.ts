import { TauriService } from './tauri.service';
import { BaseApiService, ApiResponse } from './base-api.service';

// ===== Game API Service =====

export class GameService extends BaseApiService {
  // ===== Game CRUD Operations =====
  static async getGames(): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getGames());
  }

  static async createGame(gameData: any): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.addGame(gameData),
      'Game created successfully',
      'Failed to create game'
    );
  }

  static async updateGame(gameData: any): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.updateGame(gameData),
      'Game updated successfully',
      'Failed to update game'
    );
  }

  static async deleteGame(gameId: number): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.deleteGame(gameId),
      'Game deleted successfully',
      'Failed to delete game'
    );
  }

  static async getGameById(gameId: number): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getGameById(gameId));
  }
}
