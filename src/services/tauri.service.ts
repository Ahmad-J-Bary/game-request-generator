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
  DailyRequestsResponse,
  AccountLevelProgress,
  CreateAccountLevelProgressRequest,
  UpdateAccountLevelProgressRequest,
  AccountPurchaseEventProgress,
  CreateAccountPurchaseEventProgressRequest,
  UpdateAccountPurchaseEventProgressRequest
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

  // ===== Level progress =====
  static async createLevelProgress(request: CreateAccountLevelProgressRequest): Promise<void> {
    return await invoke<void>('create_level_progress', { request });
  }

  static async updateLevelProgress(request: UpdateAccountLevelProgressRequest): Promise<boolean> {
    return await invoke<boolean>('update_level_progress', { request });
  }

  static async getAccountLevelProgress(accountId: number): Promise<AccountLevelProgress[]> {
    return await invoke<AccountLevelProgress[]>('get_account_level_progress', { accountId });
  }

  // ===== Purchase event progress =====
  static async createPurchaseEventProgress(request: CreateAccountPurchaseEventProgressRequest): Promise<void> {
    return await invoke<void>('create_purchase_event_progress', { request });
  }

  static async updatePurchaseEventProgress(request: UpdateAccountPurchaseEventProgressRequest): Promise<boolean> {
    return await invoke<boolean>('update_purchase_event_progress', { request });
  }

  static async getAccountPurchaseEventProgress(accountId: number): Promise<AccountPurchaseEventProgress[]> {
    return await invoke<AccountPurchaseEventProgress[]>('get_account_purchase_event_progress', { accountId });
  }

  // ===== File Operations =====
  static async selectFilesOrFolder(): Promise<string[]> {
    return await invoke<string[]>('select_files_or_folder');
  }

  static async readTextFile(filePath: string): Promise<string> {
    return await invoke<string>('read_text_file', { filePath });
  }

}

export const tauriService = new TauriService();

import { TEMPLATE_PATTERNS } from '../constants';

// ===== Request Processing Utilities =====
export class RequestProcessor {
  /**
   * Process request content to apply template pattern matching
   * Replaces &event_token=&time_spent=& with actual values
   */
  static processRequestContent(content: string, eventToken: string, timeSpent: number): string {
    let processedContent = content;

    // Find &event_token=&time_spent=& pattern and replace with actual values
    const eventTokenIndex = processedContent.indexOf(TEMPLATE_PATTERNS.EVENT_TOKEN);
    if (eventTokenIndex !== -1) {
      const afterEventToken = eventTokenIndex + TEMPLATE_PATTERNS.EVENT_TOKEN.length;
      const timeSpentIndex = processedContent.indexOf(TEMPLATE_PATTERNS.TIME_SPENT, afterEventToken);

      if (timeSpentIndex !== -1) {
        const afterTimeSpent = timeSpentIndex + TEMPLATE_PATTERNS.TIME_SPENT.length;
        const nextAmpersand = processedContent.indexOf('&', afterTimeSpent);

        // If we found the pattern, replace it
        if (nextAmpersand !== -1 || afterTimeSpent < processedContent.length) {
          const endPos = nextAmpersand !== -1 ? nextAmpersand : processedContent.length;
          const remainingPart = processedContent.substring(endPos);

          // Replace the variable part
          const before = processedContent.substring(0, eventTokenIndex);
          const newVariablePart = `${TEMPLATE_PATTERNS.EVENT_TOKEN}${eventToken}${TEMPLATE_PATTERNS.TIME_SPENT}${timeSpent}${remainingPart}`;

          processedContent = before + newVariablePart;
        }
      }
    }

    return processedContent;
  }
}

// ===== Import Service (SOLID - Single Responsibility) =====
export class ImportService {
  /**
   * Import request templates from files
   */
  static async importRequestTemplates(gameId?: number): Promise<{
    success: boolean;
    message: string;
    templates?: Array<{
      filename: string;
      accountName: string;
      content: string;
      matchedAccount?: any;
    }>;
  }> {
    try {
      // Select files or folder
      const filePaths = await TauriService.selectFilesOrFolder();

      if (filePaths.length === 0) {
        return {
          success: false,
          message: 'No files selected'
        };
      }

      // Read all files and match with accounts
      const templates: Array<{
        filename: string;
        accountName: string;
        content: string;
        matchedAccount?: any;
      }> = [];

      const accounts = gameId ? await TauriService.getAccounts(gameId) : [];

      for (const filePath of filePaths) {
        try {
          const content = await TauriService.readTextFile(filePath);

          // Extract account name from filename (remove .txt extension)
          const filename = filePath.split('/').pop() || '';
          const accountName = filename.replace(/\.txt$/, '');

          // Find matching account
          const matchedAccount = accounts.find(account => account.name === accountName);

          templates.push({
            filename,
            accountName,
            content,
            matchedAccount
          });
        } catch (error) {
          console.error(`Failed to read file ${filePath}:`, error);
        }
      }

      const matchedCount = templates.filter(t => t.matchedAccount).length;
      const unmatchedCount = templates.length - matchedCount;

      return {
        success: true,
        message: `Found ${templates.length} template files. ${matchedCount} matched existing accounts, ${unmatchedCount} unmatched.`,
        templates
      };

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to import templates'
      };
    }
  }

  /**
   * Confirm and apply template imports
   */
  static async confirmTemplateImport(templates: Array<{
    filename: string;
    accountName: string;
    content: string;
    matchedAccount?: any;
  }>): Promise<{ importedCount: number }> {
    let importedCount = 0;

    for (const template of templates) {
      if (template.matchedAccount) {
        try {
          await TauriService.updateAccount({
            id: template.matchedAccount.id,
            request_template: template.content,
          });
          importedCount++;
        } catch (error) {
          console.error('Failed to update account template:', template.accountName, error);
        }
      }
    }

    return { importedCount };
  }
}