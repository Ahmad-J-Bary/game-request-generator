import { TauriService } from './tauri.service';
import { BaseApiService, ApiResponse } from './base-api.service';

// ===== Level API Service =====

export class LevelService extends BaseApiService {
  // ===== Level CRUD Operations =====
  static async getLevels(gameId: number): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getGameLevels(gameId));
  }

  static async createLevel(levelData: any): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.addLevel(levelData),
      'Level created successfully',
      'Failed to create level'
    );
  }

  static async updateLevel(levelData: any): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.updateLevel(levelData),
      'Level updated successfully',
      'Failed to update level'
    );
  }

  static async deleteLevel(levelId: number): Promise<ApiResponse> {
    return this.handleApiCall(
      () => TauriService.deleteLevel(levelId),
      'Level deleted successfully',
      'Failed to delete level'
    );
  }

  static async getLevelById(levelId: number): Promise<ApiResponse> {
    return this.handleReadOperation(() => TauriService.getLevelById(levelId));
  }
}
