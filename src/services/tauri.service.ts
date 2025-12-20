// src/services/tauri.service.ts

import { invoke } from '@tauri-apps/api/core';
import type { 
  Game, 
  CreateGameRequest, 
  UpdateGameRequest,
  Account,
  CreateAccountRequest,
  UpdateAccountRequest,
  Level,
  CreateLevelRequest,
  UpdateLevelRequest,
  GenerateRequestData,
  AccountProgress,
  PurchaseEvent,
  CreatePurchaseEventRequest,
  UpdatePurchaseEventRequest,
  DailyRequestsResponse
} from '../types';

export class TauriService {
  // ========== Game Commands ==========
  static async addGame(request: CreateGameRequest): Promise<number> {
    return await invoke<number>('add_game', { request });
  }

  static async getGames(): Promise<Game[]> {
    return await invoke<Game[]>('get_games');
  }

  static async getGameById(id: number): Promise<Game | null> {
    return await invoke<Game | null>('get_game_by_id', { id });
  }

  static async updateGame(request: UpdateGameRequest): Promise<boolean> {
    return await invoke<boolean>('update_game', { request });
  }

  static async deleteGame(id: number): Promise<boolean> {
    return await invoke<boolean>('delete_game', { id });
  }

  // ========== Account Commands ==========
  static async addAccount(request: CreateAccountRequest): Promise<number> {
    return await invoke<number>('add_account', { request });
  }

  static async getAccounts(gameId: number): Promise<Account[]> {
    return await invoke<Account[]>('get_accounts', { gameId });
  }

  static async getAccountById(id: number): Promise<Account | null> {
    return await invoke<Account | null>('get_account_by_id', { id });
  }

  static async updateAccount(request: UpdateAccountRequest): Promise<boolean> {
    return await invoke<boolean>('update_account', { request });
  }

  static async deleteAccount(id: number): Promise<boolean> {
    return await invoke<boolean>('delete_account', { id });
  }

  // ========== Level Commands ==========
// ✅ الآن صحيح
static async addLevel(request: CreateLevelRequest): Promise<number> {
  console.log('TauriService.addLevel called with:', request);
  try {
    const result = await invoke<number>('add_level', { request });
    console.log('TauriService.addLevel result:', result);
    return result;
  } catch (error) {
    console.error('TauriService.addLevel error:', error);
    throw error;
  }
}

  static async getGameLevels(gameId: number): Promise<Level[]> {
    return await invoke<Level[]>('get_game_levels', { gameId });
  }

  static async getLevelById(id: number): Promise<Level | null> {
    return await invoke<Level | null>('get_level_by_id', { id });
  }

  static async updateLevel(request: UpdateLevelRequest): Promise<boolean> {
    return await invoke<boolean>('update_level', { request });
  }

  static async deleteLevel(id: number): Promise<boolean> {
    return await invoke<boolean>('delete_level', { id });
  }

  // ========== Purchase Event Commands (NEW) ==========
// GET purchase events for a game
static async getGamePurchaseEvents(gameId: number): Promise<PurchaseEvent[]> {
  return await invoke<PurchaseEvent[]>('get_game_purchase_events', { gameId });
}

// add purchase event
static async addPurchaseEvent(request: CreatePurchaseEventRequest): Promise<number> {
  return await invoke<number>('add_purchase_event', { request });
}

static async getPurchaseEventById(id: number): Promise<PurchaseEvent | null> {
  return await invoke<PurchaseEvent | null>('get_purchase_event_by_id', { id });
}

static async updatePurchaseEvent(request: UpdatePurchaseEventRequest): Promise<boolean> {
  return await invoke<boolean>('update_purchase_event', { request });
}

static async deletePurchaseEvent(id: number): Promise<boolean> {
  return await invoke<boolean>('delete_purchase_event', { id });
}

  // ========== Request Generation Commands (UPDATED) ==========
  static async generateDailyRequest(data: GenerateRequestData): Promise<string> {
    return await invoke<string>('generate_daily_request', { data });
  }

  static async getDailyRequests(accountId: number, targetDate: string): Promise<DailyRequestsResponse> {
    return await invoke<DailyRequestsResponse>('get_daily_requests', { accountId, targetDate });
  }

  static async getAccountProgress(accountId: number, targetDate: string): Promise<AccountProgress> {
    return await invoke<AccountProgress>('get_account_progress', { accountId, targetDate });
  }

  static async getLevelDates(accountId: number): Promise<Array<[string, string, string, number]>> {
    return await invoke<Array<[string, string, string, number]>>('get_level_dates', { accountId });
  }
}

export const tauriService = new TauriService();