import { GameService } from './game.service';
import { AccountService } from './account.service';
import { LevelService } from './level.service';
import { PurchaseEventService } from './purchase-event.service';
import { RequestService, ProgressService } from './request.service';
import { ApiResponse } from './base-api.service';

// Re-export ApiResponse for backward compatibility
export type { ApiResponse } from './base-api.service';

// ===== Main API Service - Facade Pattern =====
// This provides a unified interface to all decomposed services

export class ApiService {
  // ===== Game Operations =====
  static async getGames(): Promise<ApiResponse> {
    return GameService.getGames();
  }

  static async createGame(gameData: any): Promise<ApiResponse> {
    return GameService.createGame(gameData);
  }

  static async updateGame(gameData: any): Promise<ApiResponse> {
    return GameService.updateGame(gameData);
  }

  static async deleteGame(gameId: number): Promise<ApiResponse> {
    return GameService.deleteGame(gameId);
  }

  static async getGameById(gameId: number): Promise<ApiResponse> {
    return GameService.getGameById(gameId);
  }

  // ===== Account Operations =====
  static async getAccounts(gameId: number): Promise<ApiResponse> {
    return AccountService.getAccounts(gameId);
  }

  static async createAccount(accountData: any): Promise<ApiResponse> {
    return AccountService.createAccount(accountData);
  }

  static async updateAccount(accountData: any): Promise<ApiResponse> {
    return AccountService.updateAccount(accountData);
  }

  static async deleteAccount(accountId: number): Promise<ApiResponse> {
    return AccountService.deleteAccount(accountId);
  }

  static async getAccountById(accountId: number): Promise<ApiResponse> {
    return AccountService.getAccountById(accountId);
  }

  // ===== Level Operations =====
  static async getLevels(gameId: number): Promise<ApiResponse> {
    return LevelService.getLevels(gameId);
  }

  static async createLevel(levelData: any): Promise<ApiResponse> {
    return LevelService.createLevel(levelData);
  }

  static async updateLevel(levelData: any): Promise<ApiResponse> {
    return LevelService.updateLevel(levelData);
  }

  static async deleteLevel(levelId: number): Promise<ApiResponse> {
    return LevelService.deleteLevel(levelId);
  }

  static async getLevelById(levelId: number): Promise<ApiResponse> {
    return LevelService.getLevelById(levelId);
  }

  // ===== Purchase Event Operations =====
  static async getPurchaseEvents(gameId: number): Promise<ApiResponse> {
    return PurchaseEventService.getPurchaseEvents(gameId);
  }

  static async createPurchaseEvent(eventData: any): Promise<ApiResponse> {
    return PurchaseEventService.createPurchaseEvent(eventData);
  }

  static async updatePurchaseEvent(eventData: any): Promise<ApiResponse> {
    return PurchaseEventService.updatePurchaseEvent(eventData);
  }

  static async deletePurchaseEvent(eventId: number): Promise<ApiResponse> {
    return PurchaseEventService.deletePurchaseEvent(eventId);
  }

  static async getPurchaseEventById(eventId: number): Promise<ApiResponse> {
    return PurchaseEventService.getPurchaseEventById(eventId);
  }

  // ===== Request Operations =====
  static async getDailyRequests(accountId: number, targetDate: string): Promise<ApiResponse> {
    return RequestService.getDailyRequests(accountId, targetDate);
  }

  static async getAccountProgress(accountId: number, targetDate: string): Promise<ApiResponse> {
    return RequestService.getAccountProgress(accountId, targetDate);
  }

  static async getLevelDates(accountId: number): Promise<ApiResponse> {
    return RequestService.getLevelDates(accountId);
  }

  // ===== Progress Operations =====
  static async createLevelProgress(progressData: any): Promise<ApiResponse> {
    return ProgressService.createLevelProgress(progressData);
  }

  static async updateLevelProgress(progressData: any): Promise<ApiResponse> {
    return ProgressService.updateLevelProgress(progressData);
  }

  static async getAccountLevelProgress(accountId: number): Promise<ApiResponse> {
    return ProgressService.getAccountLevelProgress(accountId);
  }

  static async createPurchaseEventProgress(progressData: any): Promise<ApiResponse> {
    return ProgressService.createPurchaseEventProgress(progressData);
  }

  static async updatePurchaseEventProgress(progressData: any): Promise<ApiResponse> {
    return ProgressService.updatePurchaseEventProgress(progressData);
  }

  static async getAccountPurchaseEventProgress(accountId: number): Promise<ApiResponse> {
    return ProgressService.getAccountPurchaseEventProgress(accountId);
  }
}
