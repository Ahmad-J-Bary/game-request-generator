// src/services/tauri.service.ts

import { invoke } from "@tauri-apps/api/core";
import type {
  Game,
  CreateGameRequest,
  UpdateGameRequest,
  GameBranch,
  CreateBranchRequest,
  UpdateBranchRequest,
  Account,
  CompletedAccount,
  CreateAccountRequest,
  UpdateAccountRequest,
  AccountBranchTransferResult,
  TransferPreview,
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
  UpdateAccountPurchaseEventProgressRequest,
  BulkProgressUpdateRequest,
  TelegramImportPreview,
  TelegramConfig,
  CompletedDailyTask,
  AddCompletedTaskRequest,
} from "@grq/api-bindings";

export class TauriService {
  // ========== Game Commands ==========
  static async addGame(request: CreateGameRequest): Promise<number> {
    return await invoke<number>("add_game", { request });
  }

  static async getGames(): Promise<Game[]> {
    return await invoke<Game[]>("get_games");
  }

  static async getGameById(id: number): Promise<Game | null> {
    return await invoke<Game | null>("get_game_by_id", { id });
  }

  static async updateGame(request: UpdateGameRequest): Promise<boolean> {
    return await invoke<boolean>("update_game", { request });
  }

  static async deleteGame(id: number): Promise<boolean> {
    return await invoke<boolean>("delete_game", { id });
  }

  // ========== Branch Commands ==========
  static async getGameBranches(gameId: number): Promise<GameBranch[]> {
    return await invoke<GameBranch[]>("get_game_branches", { gameId });
  }

  static async addBranch(request: CreateBranchRequest): Promise<number> {
    return await invoke<number>("add_branch", { request });
  }

  static async updateBranch(request: UpdateBranchRequest): Promise<boolean> {
    return await invoke<boolean>("update_branch", { request });
  }

  static async deleteBranch(id: number): Promise<boolean> {
    return await invoke<boolean>("delete_branch", { id });
  }

  // ========== Account Commands ==========
  static async addAccount(request: CreateAccountRequest): Promise<number> {
    return await invoke<number>("add_account", { request });
  }

  static async getAccounts(gameId: number): Promise<Account[]> {
    return await invoke<Account[]>("get_accounts", { gameId });
  }

  static async getAllAccounts(): Promise<Account[]> {
    return await invoke<Account[]>("get_all_accounts");
  }

  static async getCompletedAccounts(): Promise<CompletedAccount[]> {
    return await invoke<CompletedAccount[]>("get_completed_accounts");
  }

  static async getAccountById(id: number): Promise<Account | null> {
    return await invoke<Account | null>("get_account_by_id", { id });
  }

  static async updateAccount(request: UpdateAccountRequest): Promise<boolean> {
    return await invoke<boolean>("update_account", { request });
  }

  static async deleteAccount(id: number): Promise<boolean> {
    return await invoke<boolean>("delete_account", { id });
  }

  static async transferAccountBranch(
    accountId: number,
    targetBranchId: number,
  ): Promise<AccountBranchTransferResult> {
    return await invoke<AccountBranchTransferResult>(
      "transfer_account_branch",
      { accountId, targetBranchId },
    );
  }

  static async previewTransferAccountBranch(
    accountId: number,
    targetBranchId: number,
  ): Promise<TransferPreview> {
    return await invoke<TransferPreview>(
      "preview_transfer_account_branch",
      { accountId, targetBranchId },
    );
  }

  // ========== Level Commands ==========
  // ✅ الآن صحيح
  static async addLevel(request: CreateLevelRequest): Promise<number> {
    console.log("TauriService.addLevel called with:", request);
    try {
      const result = await invoke<number>("add_level", { request });
      console.log("TauriService.addLevel result:", result);
      return result;
    } catch (error) {
      console.error("TauriService.addLevel error:", error);
      throw error;
    }
  }

  static async getGameLevels(branchId: number): Promise<Level[]> {
    return await invoke<Level[]>("get_game_levels", { branchId });
  }

  static async getLevelById(id: number): Promise<Level | null> {
    return await invoke<Level | null>("get_level_by_id", { id });
  }

  static async updateLevel(request: UpdateLevelRequest): Promise<boolean> {
    return await invoke<boolean>("update_level", { request });
  }

  static async deleteLevel(id: number): Promise<boolean> {
    return await invoke<boolean>("delete_level", { id });
  }

  // ========== Purchase Event Commands (NEW) ==========
  // GET purchase events for a branch
  static async getGamePurchaseEvents(
    branchId: number,
  ): Promise<PurchaseEvent[]> {
    return await invoke<PurchaseEvent[]>("get_game_purchase_events", {
      branchId,
    });
  }

  // add purchase event
  static async addPurchaseEvent(
    request: CreatePurchaseEventRequest,
  ): Promise<number> {
    return await invoke<number>("add_purchase_event", { request });
  }

  static async getPurchaseEventById(id: number): Promise<PurchaseEvent | null> {
    return await invoke<PurchaseEvent | null>("get_purchase_event_by_id", {
      id,
    });
  }

  static async updatePurchaseEvent(
    request: UpdatePurchaseEventRequest,
  ): Promise<boolean> {
    return await invoke<boolean>("update_purchase_event", { request });
  }

  static async deletePurchaseEvent(id: number): Promise<boolean> {
    return await invoke<boolean>("delete_purchase_event", { id });
  }

  // ========== Request Generation Commands (UPDATED) ==========
  static async generateDailyRequest(
    data: GenerateRequestData,
  ): Promise<string> {
    return await invoke<string>("generate_daily_request", { data });
  }

  static async getDailyRequests(
    accountId: number,
    targetDate: string,
  ): Promise<DailyRequestsResponse> {
    return await invoke<DailyRequestsResponse>("get_daily_requests", {
      accountId,
      targetDate,
    });
  }

  static async getAccountProgress(
    accountId: number,
    targetDate: string,
  ): Promise<AccountProgress> {
    return await invoke<AccountProgress>("get_account_progress", {
      accountId,
      targetDate,
    });
  }

  static async getLevelDates(
    accountId: number,
  ): Promise<Array<[string, string, string, number]>> {
    return await invoke<Array<[string, string, string, number]>>(
      "get_level_dates",
      { accountId },
    );
  }

  // ===== Level progress =====
  static async createLevelProgress(
    request: CreateAccountLevelProgressRequest,
  ): Promise<void> {
    return await invoke<void>("create_level_progress", { request });
  }

  static async updateLevelProgress(
    request: UpdateAccountLevelProgressRequest,
  ): Promise<boolean> {
    return await invoke<boolean>("update_level_progress", { request });
  }

  static async getAccountLevelProgress(
    accountId: number,
  ): Promise<AccountLevelProgress[]> {
    return await invoke<AccountLevelProgress[]>("get_account_level_progress", {
      accountId,
    });
  }

  // ===== Purchase event progress =====
  static async createPurchaseEventProgress(
    request: CreateAccountPurchaseEventProgressRequest,
  ): Promise<void> {
    return await invoke<void>("create_purchase_event_progress", { request });
  }

  static async updatePurchaseEventProgress(
    request: UpdateAccountPurchaseEventProgressRequest,
  ): Promise<boolean> {
    return await invoke<boolean>("update_purchase_event_progress", { request });
  }

  static async saveBulkProgressUpdates(
    request: BulkProgressUpdateRequest,
  ): Promise<void> {
    return await invoke<void>("save_bulk_progress_updates", { request });
  }

  static async getAccountPurchaseEventProgress(
    accountId: number,
  ): Promise<AccountPurchaseEventProgress[]> {
    return await invoke<AccountPurchaseEventProgress[]>(
      "get_account_purchase_event_progress",
      { accountId },
    );
  }

  // ===== File Operations =====
  static async selectFilesOrFolder(): Promise<string[]> {
    return await invoke<string[]>("select_files_or_folder");
  }

  static async readTextFile(filePath: string): Promise<string> {
    return await invoke<string>("read_text_file", { filePath });
  }

  // ========== Database Path Commands ==========
  static async getDbPath(): Promise<string> {
    return await invoke<string>("get_db_path");
  }

  static async setDbPath(path: string | null): Promise<void> {
    return await invoke<void>("set_db_path", { path });
  }

  static async exportDatabaseToBytes(): Promise<number[]> {
    return await invoke<number[]>("export_database_to_bytes");
  }

  // ========== Telegram Commands (NEW) ==========
  static async getTelegramConfig(): Promise<TelegramConfig> {
    return await invoke<TelegramConfig>("get_telegram_config");
  }

  static async getTelegramUpdates(): Promise<TelegramImportPreview[]> {
    return await invoke<TelegramImportPreview[]>("get_telegram_updates");
  }

  static async downloadTelegramFile(fileId: string): Promise<string> {
    return await invoke<string>("download_telegram_file", { fileId });
  }

  static async updateTelegramOffset(offset: number): Promise<void> {
    return await invoke<void>("update_telegram_offset", { offset });
  }

  // ========== KeyValue Store ==========
  static async getStoreValue(key: string): Promise<string | null> {
    return await invoke<string | null>("get_store_value", { key });
  }

  static async setStoreValue(key: string, value: string): Promise<void> {
    return await invoke<void>("set_store_value", { key, value });
  }

  static async deleteStoreValue(key: string): Promise<void> {
    return await invoke<void>("delete_store_value", { key });
  }

  static async sendAndClearHallOfFame(): Promise<{
    sent: number;
    deleted: number;
    message: string;
  }> {
    return await invoke<{
      sent: number;
      deleted: number;
      message: string;
    }>("send_and_clear_hall_of_fame");
  }

  static async scheduleExitMaintenance(
    shouldBackupDb: boolean,
    shouldSendHallOfFame: boolean,
  ): Promise<void> {
    return await invoke<void>("schedule_exit_maintenance", {
      shouldBackupDb,
      shouldSendHallOfFame,
    });
  }

  static async runBackupIfChangedInBackgroundAndQuit(): Promise<void> {
    return await invoke<void>("run_backup_if_changed_in_background_and_quit");
  }

  static async finalizeExitMaintenanceAndQuit(): Promise<void> {
    return await invoke<void>("finalize_app_exit");
  }

  // ========== Local Backup Commands ==========
  static async getBackupConfig(): Promise<{ useSameLocation: boolean; customPath: string | null; backupDir: string | null; lastCleanupDate: string | null; latestBackupTime: number | null }> {
    return await invoke("get_backup_config");
  }

  static async setBackupConfig(useSameLocation: boolean, customPath: string | null): Promise<void> {
    return await invoke("set_backup_config", { useSameLocation, customPath });
  }

  static async backupDatabaseLocalNow(): Promise<void> {
    return await invoke("backup_database_local_now");
  }

  // ========== Import with Pointer (Smart Import) ==========
  static async importDatabaseWithPointer(sourcePath: string): Promise<void> {
    return await invoke("import_database_with_pointer", { sourcePath });
  }

  static async restoreFromAutoBackup(): Promise<void> {
    return await invoke("restore_from_auto_backup");
  }

  static async acceptCurrentAsLatest(): Promise<void> {
    return await invoke("accept_current_as_latest");
  }

  static async getPointerInfo(): Promise<{ pointerPath: string | null; autoBackupPath: string | null }> {
    return await invoke("get_pointer_info");
  }

  static async listBackupFiles(): Promise<Array<{ name: string; path: string; label: string; size: number }>> {
    return await invoke("list_backup_files");
  }

  // ========== Daily Task History Commands ==========
  static async addCompletedTask(request: AddCompletedTaskRequest): Promise<void> {
    return await invoke<void>("add_completed_task", { request });
  }

  static async getTaskHistory(
    limit?: number,
    accountId?: number,
  ): Promise<CompletedDailyTask[]> {
    return await invoke<CompletedDailyTask[]>("get_task_history", {
      limit,
      accountId,
    });
  }

  static async clearTaskHistory(): Promise<void> {
    return await invoke<void>("clear_task_history");
  }
}

export const tauriService = new TauriService();

import { TEMPLATE_PATTERNS } from "../constants";

// ===== Request Processing Utilities =====
export class RequestProcessor {
  /**
   * Process request content to apply template pattern matching
   * Replaces &event_token=&time_spent=& with actual values
   */
  static processRequestContent(
    content: string,
    eventToken: string,
    timeSpent: number,
  ): string {
    let processedContent = content;

    // Find &event_token=&time_spent=& pattern and replace with actual values
    const eventTokenIndex = processedContent.indexOf(
      TEMPLATE_PATTERNS.EVENT_TOKEN,
    );
    if (eventTokenIndex !== -1) {
      const afterEventToken =
        eventTokenIndex + TEMPLATE_PATTERNS.EVENT_TOKEN.length;
      const timeSpentIndex = processedContent.indexOf(
        TEMPLATE_PATTERNS.TIME_SPENT,
        afterEventToken,
      );

      if (timeSpentIndex !== -1) {
        const afterTimeSpent =
          timeSpentIndex + TEMPLATE_PATTERNS.TIME_SPENT.length;
        const nextAmpersand = processedContent.indexOf("&", afterTimeSpent);

        // If we found the pattern, replace it
        if (nextAmpersand !== -1 || afterTimeSpent < processedContent.length) {
          const endPos =
            nextAmpersand !== -1 ? nextAmpersand : processedContent.length;
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
  static async importRequestTemplates(gameId: number): Promise<{
    imported_templates: Array<{
      account_name: string;
      filename: string;
      status: string;
    }>;
    errors: string[];
    total_processed: number;
    successful_imports: number;
    cancelled?: boolean;
  }> {
    return await invoke("import_request_templates", { gameId });
  }

  /**
   * Confirm and apply template imports
   */
  static async confirmTemplateImport(
    templates: Array<{
      filename: string;
      accountName: string;
      content: string;
      matchedAccount?: any;
    }>,
  ): Promise<{ importedCount: number }> {
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
          console.error(
            "Failed to update account template:",
            template.accountName,
            error,
          );
        }
      }
    }

    return { importedCount };
  }
}
