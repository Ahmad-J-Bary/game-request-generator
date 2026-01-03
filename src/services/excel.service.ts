// src/services/excel.service.ts
// Main Excel Service Facade - Delegates to decomposed modules

import XLSX from 'xlsx-js-style';
import { TauriService } from './tauri.service';
import type { Game, Account, Level, PurchaseEvent } from '../types';
import type { ColorSettings } from '../contexts/SettingsContext';

// Import decomposed modules
import { saveExcelFile } from './excel/excel-file-operations';
import { parseExcelFile } from './excel/excel-parser';
import { importFromExcel } from './excel/excel-import';
import { getCellStyle } from './excel/excel-styling';
import { formatDateShort, formatDateWithYear, parseDate, addDays, formatTimeAMPM } from './excel/excel-date-utils';
import { buildColumns, createDateMatrix, getColumnStyle } from './excel/excel-column-builder';

export interface ImportData {
  levels: Partial<Level>[];
  purchaseEvents: Partial<PurchaseEvent>[];
  accounts: Partial<Account>[];
}

export interface ExportData {
  levels?: Level[];
  purchaseEvents?: PurchaseEvent[];
  accounts?: Account[];
  game?: Game;
}

export class ExcelService {
  // ===== Private Helper Methods (delegated to modules) =====

  private static async saveFile(filename: string, buffer: any): Promise<boolean> {
    return saveExcelFile(filename, buffer);
  }

  /**
   * Sort accounts by start date and time (oldest to newest)
   */
  private static sortAccountsByDate(accounts: Account[]): Account[] {
    return [...accounts].sort((a, b) => {
      try {
        const dateA = new Date(`${a.start_date}T${a.start_time}`);
        const dateB = new Date(`${b.start_date}T${b.start_time}`);
        
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          if (a.start_date !== b.start_date) {
            return a.start_date.localeCompare(b.start_date);
          }
          return a.start_time.localeCompare(b.start_time);
        }
        
        return dateA.getTime() - dateB.getTime();
      } catch (e) {
        return 0;
      }
    });
  }

  static async parseExcelFile(filePath: string): Promise<ImportData> {
    return parseExcelFile(filePath);
  }

  // ===== Import Operations =====

  static async importFromExcel(): Promise<{ success: boolean; message: string; imported: ImportData }> {
    return importFromExcel();
  }


  /**
   * Export data to Excel file
   */
  static async exportToExcel(data: ExportData, filename: string): Promise<boolean> {
    try {
      const workbook = XLSX.utils.book_new();

      // Create Levels sheet
      if (data.levels && data.levels.length > 0) {
        const levelHeaders = ['Event Token', 'Level Name', 'Days Offset', 'Time Spent (1000 seconds)', 'Bonus'];
        const levelRows = data.levels.map(level => [
          level.event_token,
          level.level_name,
          level.days_offset,
          level.time_spent,
          level.is_bonus ? 'Yes' : 'No'
        ]);
        const levelSheet = XLSX.utils.aoa_to_sheet([levelHeaders, ...levelRows]);
        XLSX.utils.book_append_sheet(workbook, levelSheet, 'Levels');
      }

      // Create Purchase Events sheet
      if (data.purchaseEvents && data.purchaseEvents.length > 0) {
        const purchaseHeaders = ['Event Token', 'Restricted', 'Max Days Offset'];
        const purchaseRows = data.purchaseEvents.map(event => [
          event.event_token,
          event.is_restricted ? 'Yes' : 'No',
          event.max_days_offset
        ]);
        const purchaseSheet = XLSX.utils.aoa_to_sheet([purchaseHeaders, ...purchaseRows]);
        XLSX.utils.book_append_sheet(workbook, purchaseSheet, 'Purchase Events');
      }

      // Create Accounts sheet
      if (data.accounts && data.accounts.length > 0) {
        const accountHeaders = ['Account', 'Start Date', 'Start Time'];
        const accountRows = data.accounts.map(account => [
          account.name,
          account.start_date,
          formatTimeAMPM(account.start_time)
        ]);
        const accountSheet = XLSX.utils.aoa_to_sheet([accountHeaders, ...accountRows]);
        XLSX.utils.book_append_sheet(workbook, accountSheet, 'Accounts');
      }

      // Save file
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile(filename, buffer);
    } catch (error) {
      console.error('Export error:', error);
      return false;
    }
  }

  /**
   * Export data for a single account (legacy function - keeping for compatibility)
   */
  static async exportAccountData(accountId: number, _layout?: 'horizontal' | 'vertical', _colorSettings?: ColorSettings, _theme?: 'light' | 'dark'): Promise<boolean> {
    try {
      const account = await TauriService.getAccountById(accountId);
      if (!account) return false;

      const filename = `${account.name}_Data_${new Date().toISOString().split('T')[0]}.xlsx`;

      return await this.exportToExcel({
        accounts: [account]
      }, filename);
    } catch (error) {
      console.error('Export account data error:', error);
      return false;
    }
  }

  /**
   * Export game detail data (only levels and purchase events) from GameDetailPage
   */
  /**
   * Export game detail data (only levels and purchase events) from GameDetailPage
   */
  static async exportGameDetailData(gameId: number, layout: 'horizontal' | 'vertical', colorSettings: ColorSettings, theme: 'light' | 'dark', columns?: any[]): Promise<boolean> {
    try {
      const [levels, purchaseEvents] = await Promise.all([
        TauriService.getGameLevels(gameId),
        TauriService.getGamePurchaseEvents(gameId)
      ]);

      const game = await TauriService.getGameById(gameId);
      const gameName = game?.name || 'Game';

      return await this.exportGameDetailToExcel(levels, purchaseEvents, gameName, layout, colorSettings, theme, columns);
    } catch (error) {
      console.error('Export game detail data error:', error);
      return false;
    }
  }

  /**
   * Export account detail data from AccountDetailPage
   */
  /**
   * Export account detail data from AccountDetailPage
   */
  static async exportAccountDetailData(
    accountId: number,
    layout: 'horizontal' | 'vertical',
    colorSettings: ColorSettings,
    theme: 'light' | 'dark',
    columns?: any[],
    levelsProgress?: any[],
    purchaseProgress?: any[]
  ): Promise<boolean> {
    try {
      const account = await TauriService.getAccountById(accountId);
      if (!account) return false;

      const [levels, purchaseEvents] = await Promise.all([
        TauriService.getGameLevels(account.game_id),
        TauriService.getGamePurchaseEvents(account.game_id)
      ]);

      return await this.exportAccountDetailToExcel(account, levels, purchaseEvents, layout, colorSettings, theme, columns, levelsProgress, purchaseProgress);
    } catch (error) {
      console.error('Export account detail data error:', error);
      return false;
    }
  }

  /**
   * Create a worksheet for a game using matrix layout (helper method)
   * This is used by both exportToExcelMatrix and exportAllGamesData
   */
  private static async createGameMatrixWorksheet(
    _levels: Level[],
    _purchaseEvents: PurchaseEvent[],
    accounts: Account[],
    columns: any[],
    layout: 'horizontal' | 'vertical',
    colorSettings: ColorSettings,
    theme: 'light' | 'dark',
    levelsProgress?: Record<string, any>,
    purchaseProgress?: Record<string, any>
  ): Promise<XLSX.WorkSheet> {
    const getCellStyleLocal = (backgroundColor: string, isHeader: boolean = false, isSynthetic: boolean = false) =>
      this.getCellStyle(backgroundColor, theme, isHeader, isSynthetic);

    const getCellStyleWrapper = (backgroundColor: string, themeParam: 'light' | 'dark', isHeader: boolean, isSynthetic: boolean) =>
      this.getCellStyle(backgroundColor, themeParam, isHeader, isSynthetic);

    const getColumnStyleLocal = (kind: 'level' | 'purchase', isBonus?: boolean, isRestricted?: boolean, isSynthetic?: boolean, isHeader: boolean = false): any => {
      return getColumnStyle(kind, isBonus, isRestricted, isSynthetic, isHeader, getCellStyleWrapper, colorSettings, theme);
    };

    // Create matrix for date calculations
    const matrix = createDateMatrix(accounts, columns, formatDateShort, parseDate, addDays);

    const wsData: any[][] = [];

    if (layout === 'vertical') {
      // Vertical layout: Accounts as rows, Levels as columns
      const headerRow1 = ['Event Token', '', '', ''];
      const headerRow2 = ['Level Name', '', '', ''];
      const headerRow3 = ['Days Offset', '', '', ''];
      const headerRow4 = ['Time Spent (1000 seconds)', '', '', ''];
      const headerRow5 = ['Account', 'Start Date', 'Start Time', 'Last Completed Token'];

      columns.forEach((col) => {
        headerRow1.push(col.token);
        headerRow2.push(col.name);
        headerRow3.push(col.kind === 'level' ? (col.daysOffset !== null && col.daysOffset !== undefined ? col.daysOffset.toString() : '-') : col.maxDaysOffset || '-');
        headerRow4.push(col.kind === 'level' ? (col.timeSpent !== null && col.timeSpent !== undefined ? col.timeSpent.toString() : '-') : '-');
        headerRow5.push('');
      });

      wsData.push(headerRow1, headerRow2, headerRow3, headerRow4, headerRow5);

      accounts.forEach((acc, accIdx) => {
        // Find last completed token
        let lastCompletedToken = '';
        const matrixRow = matrix[accIdx];
        
        // Iterate backwards from columns to find the last completed one
        for (let colIdx = columns.length - 1; colIdx >= 0; colIdx--) {
          const col = columns[colIdx];
          const progressKey = `${acc.id}_${col.id}`;
          const progress = col.kind === 'level' ? (levelsProgress as any)?.[progressKey] : (purchaseProgress as any)?.[progressKey];
          if (progress?.is_completed) {
            lastCompletedToken = col.uniqueKey;
            break;
          }
        }

        const row = [acc.name, formatDateWithYear(acc.start_date), formatTimeAMPM(acc.start_time), lastCompletedToken];
        matrixRow.forEach((date, colIdx) => {
          const col = columns[colIdx];
          const progressKey = `${acc.id}_${col.id}`;
          const progress = col.kind === 'level' ? (levelsProgress as any)?.[progressKey] : (purchaseProgress as any)?.[progressKey];
          const isCompleted = progress?.is_completed ?? false;
          
          row.push(isCompleted ? `${date} (C)` : date);
        });
        wsData.push(row);
      });

      const worksheet = XLSX.utils.aoa_to_sheet(wsData);

      // Apply merging
      (worksheet as any)['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
      ];

      // Apply styling
      const headerStyle = getCellStyleLocal(colorSettings.headerColor, true);
      const dataRowStyle = getCellStyleLocal(colorSettings.dataRowColor);

    for (let r = 0; r < wsData.length; r++) {
        for (let c = 0; c < wsData[r].length; c++) {
          const cellAddress = XLSX.utils.encode_cell({ r, c });
          const cell = (worksheet as any)[cellAddress];
          if (!cell) continue;

          if (r < 5) {
            if (c < 4) {
              cell.s = headerStyle;
            } else {
              const col = columns[c - 4];
              cell.s = getColumnStyleLocal(col.kind, col.isBonus, col.isRestricted, col.synthetic, true);
            }
          } else {
            if (c < 4) {
              cell.s = dataRowStyle;
            } else {
              const col = columns[c - 4];
              const acc = accounts[r - 5];
              const progressKey = `${acc.id}_${col.id}`;
              const progress = col.kind === 'level' ? (levelsProgress as any)?.[progressKey] : (purchaseProgress as any)?.[progressKey];
              const isCompleted = progress?.is_completed ?? false;
              const bgColor = isCompleted ? colorSettings.completeScheduledStyle : colorSettings.incompleteScheduledStyle;
              cell.s = getCellStyleLocal(bgColor, false, col.synthetic);
            }
          }
        }
      }

      (worksheet as any)['!cols'] = [
        { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
        ...columns.map(() => ({ wch: 12 }))
      ];

      return worksheet;
    } else {
      // Horizontal layout: Levels as rows, Accounts as columns
      const headerRow = ['Event Token', 'Level Name', 'Days Offset', 'Time Spent (1000 seconds)'];
      accounts.forEach(acc => {
        headerRow.push(`${acc.name} (${formatDateWithYear(acc.start_date)})`);
      });
      wsData.push(headerRow);

      columns.forEach((col, colIdx) => {
        const row = [
          col.token,
          col.name,
          col.kind === 'level' ? (col.daysOffset !== null && col.daysOffset !== undefined ? col.daysOffset.toString() : '-') : col.maxDaysOffset || '-',
          col.kind === 'level' ? (col.timeSpent !== null && col.timeSpent !== undefined ? col.timeSpent.toString() : '-') : '-',
        ];

        accounts.forEach((_acc, accIdx) => {
          row.push(matrix[accIdx][colIdx]);
        });
        wsData.push(row);
      });

      const worksheet = XLSX.utils.aoa_to_sheet(wsData);

      const headerStyle = getCellStyleLocal(colorSettings.headerColor, true);

      for (let r = 0; r < wsData.length; r++) {
        for (let c = 0; c < wsData[r].length; c++) {
          const cellAddress = XLSX.utils.encode_cell({ r, c });
          const cell = (worksheet as any)[cellAddress];
          if (!cell) continue;

          if (r === 0) {
            cell.s = headerStyle;
          } else {
            if (c < 4) {
              const col = columns[r - 1];
              cell.s = getColumnStyleLocal(col.kind, col.isBonus, col.isRestricted, col.synthetic, false);
            } else {
              const acc = accounts[c - 4];
              const col = columns[r - 1];
              const progressKey = `${acc.id}_${col.id}`;
              const progress = col.kind === 'level' ? (levelsProgress as any)?.[progressKey] : (purchaseProgress as any)?.[progressKey];
              const isCompleted = progress?.is_completed ?? false;
              const bgColor = isCompleted ? colorSettings.completeScheduledStyle : colorSettings.incompleteScheduledStyle;
              cell.s = getCellStyleLocal(bgColor, false, col.synthetic);
            }
          }
        }
      }

      (worksheet as any)['!cols'] = [
        { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 25 },
        ...accounts.map(() => ({ wch: 15 }))
      ];

      return worksheet;
    }
  }

  /**
   * Export data to Excel with matrix layout (matching AccountsDetailPage table)
   */
  static async exportToExcelMatrix(
    levels: Level[],
    purchaseEvents: PurchaseEvent[],
    accounts: Account[],
    gameName: string,
    layout: 'horizontal' | 'vertical',
    colorSettings: ColorSettings,
    theme: 'light' | 'dark',
    columnsData?: any[],
    levelsProgress?: any[],
    purchaseProgress?: any[]
  ): Promise<boolean> {
    try {
      const workbook = XLSX.utils.book_new();

      // Create columns array (similar to AccountsDetailPage)
      let columns: any[] = [];
      if (columnsData && columnsData.length > 0) {
        columns = columnsData;
      } else {
        columns = buildColumns(levels, purchaseEvents);
      }

      // Convert progress arrays to records for the helper method
      const levelsProgressRecord: Record<string, any> = {};
      const purchaseProgressRecord: Record<string, any> = {};

      if (levelsProgress && Array.isArray(levelsProgress)) {
        levelsProgress.forEach((p: any) => {
          if (p.account_id && p.level_id) {
            const key = `${p.account_id}_${p.level_id}`;
            levelsProgressRecord[key] = p;
          }
        });
      } else if (levelsProgress && typeof levelsProgress === 'object') {
        Object.assign(levelsProgressRecord, levelsProgress);
      }

      if (purchaseProgress && Array.isArray(purchaseProgress)) {
        purchaseProgress.forEach((p: any) => {
          if (p.account_id && p.purchase_event_id) {
            const key = `${p.account_id}_${p.purchase_event_id}`;
            purchaseProgressRecord[key] = p;
          }
        });
      } else if (purchaseProgress && typeof purchaseProgress === 'object') {
        Object.assign(purchaseProgressRecord, purchaseProgress);
      }

      // Use helper method to create worksheet
      const worksheet = await this.createGameMatrixWorksheet(
        levels,
        purchaseEvents,
        accounts,
        columns,
        layout,
        colorSettings,
        theme,
        levelsProgressRecord,
        purchaseProgressRecord
      );

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, gameName.substring(0, 31));

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile(`${gameName}.xlsx`, buffer);
    } catch (error) {
      console.error('Export matrix error:', error);
      return false;
    }
  }

  /**
   * Export game data with matrix layout
   */
  static async exportGameData(gameId: number, layout: 'horizontal' | 'vertical', colorSettings: ColorSettings, theme: 'light' | 'dark', columns?: any[], levelsProgress?: any[], purchaseProgress?: any[]): Promise<boolean> {
    try {
      const [levels, purchaseEvents, accounts] = await Promise.all([
        TauriService.getGameLevels(gameId),
        TauriService.getGamePurchaseEvents(gameId),
        TauriService.getAccounts(gameId)
      ]);

      const game = await TauriService.getGameById(gameId);
      const gameName = game?.name || 'Game';

      // Sort accounts by date (oldest to newest)
      const sortedAccounts = this.sortAccountsByDate(accounts);

      return await this.exportToExcelMatrix(levels, purchaseEvents, sortedAccounts, gameName, layout, colorSettings, theme, columns, levelsProgress, purchaseProgress);
    } catch (error) {
      console.error('Export game data error:', error);
      return false;
    }
  }

  /**
   * Export all games data with matrix layout
   * Each game gets 3 sheets: accounts progress, levels definitions, and events definitions
   */
  static async exportAllGamesData(layout: 'horizontal' | 'vertical', colorSettings: ColorSettings, theme: 'light' | 'dark', mode: 'event-only' | 'all' = 'event-only'): Promise<boolean> {
    try {
      const games = await TauriService.getGames();
      const workbook = XLSX.utils.book_new();

      // Process each game and create sheets
      for (const game of games) {
        const [levels, purchaseEvents, accounts] = await Promise.all([
          TauriService.getGameLevels(game.id),
          TauriService.getGamePurchaseEvents(game.id),
          TauriService.getAccounts(game.id)
        ]);

        if (accounts.length === 0) {
          // Skip games with no accounts
          continue;
        }

        // Sort accounts by date (oldest to newest)
        const sortedAccounts = this.sortAccountsByDate(accounts);

        // Fetch progress data for all accounts in this game
        const levelsProgress: Record<string, any> = {};
        const purchaseProgress: Record<string, any> = {};

        for (const account of sortedAccounts) {
          try {
            const [accountLevelsProgress, accountPurchaseProgress] = await Promise.all([
              TauriService.getAccountLevelProgress(account.id),
              TauriService.getAccountPurchaseEventProgress(account.id)
            ]);

            // Store progress data with keys matching exportToExcelMatrix format
            accountLevelsProgress.forEach(p => {
              const key = `${account.id}_${p.level_id}`;
              levelsProgress[key] = p;
            });

            accountPurchaseProgress.forEach(p => {
              const key = `${account.id}_${p.purchase_event_id}`;
              purchaseProgress[key] = p;
            });
          } catch (error) {
            console.error(`Failed to fetch progress for account ${account.id}:`, error);
          }
        }

        // Build columns based on the selected mode
        let filteredLevels = levels;
        if (mode === 'event-only') {
          filteredLevels = levels.filter(l => l.level_name !== '-');
        }

        const levelCols = filteredLevels.map((l) => ({
          kind: 'level' as const,
          id: l.id,
          token: l.event_token.split('_day')[0],
          fullToken: l.event_token,
          name: l.level_name,
          daysOffset: l.days_offset,
          timeSpent: l.time_spent,
          isBonus: l.is_bonus,
          synthetic: l.level_name === '-',
        }));

        const peCols = purchaseEvents.map((p: PurchaseEvent) => ({
          kind: 'purchase' as const,
          id: p.id,
          token: p.event_token,
          fullToken: p.event_token,
          name: '$$$',
          isRestricted: (p as any).is_restricted ?? false,
          maxDaysOffset: p.max_days_offset != null ? `Less Than ${p.max_days_offset}` : '-',
          synthetic: false,
        }));

        const columns = [...levelCols, ...peCols];

        // 1. Create accounts progress worksheet
        const accountsWorksheet = await this.createGameMatrixWorksheet(
          levels,
          purchaseEvents,
          sortedAccounts,
          columns,
          layout,
          colorSettings,
          theme,
          levelsProgress,
          purchaseProgress
        );

        // Add accounts worksheet (sheet names limited to 31 characters)
        // Truncate base name to allow for _Lvl and _Evt suffixes (max 31 total)
        const sheetBaseName = game.name.substring(0, 27);
        XLSX.utils.book_append_sheet(workbook, accountsWorksheet, sheetBaseName);

        // 2. Create Levels sheet
        if (levels.length > 0) {
          const levelHeaders = ['Event Token', 'Level Name', 'Days Offset', 'Time Spent (1000 seconds)', 'Bonus'];
          const levelRows = levels.map(level => [
            level.event_token,
            level.level_name,
            level.days_offset,
            level.time_spent,
            level.is_bonus ? 'Yes' : 'No'
          ]);
          const levelSheet = XLSX.utils.aoa_to_sheet([levelHeaders, ...levelRows]);
          XLSX.utils.book_append_sheet(workbook, levelSheet, `${sheetBaseName}_Lvl`);
        }

        // 3. Create Purchase Events sheet
        if (purchaseEvents.length > 0) {
          const purchaseHeaders = ['Event Token', 'Restricted', 'Max Days Offset'];
          const purchaseRows = purchaseEvents.map(event => [
            event.event_token,
            event.is_restricted ? 'Yes' : 'No',
            event.max_days_offset
          ]);
          const purchaseSheet = XLSX.utils.aoa_to_sheet([purchaseHeaders, ...purchaseRows]);
          XLSX.utils.book_append_sheet(workbook, purchaseSheet, `${sheetBaseName}_Evt`);
        }
      }

      // 4. Create Completion Info sheet
      const now = new Date();
      const todayString = now.toISOString().split('T')[0];
      
      // Yesterday calculation
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0];

      const completedKey = `dailyTasks_completed_${todayString}`;
      const existingCompleted = localStorage.getItem(completedKey);
      const todayCompletions = existingCompleted ? JSON.parse(existingCompleted) : [];

      const infoRows = [
        ['Field', 'Value', 'Description'],
        ['Full Completion Up To Date', yesterdayString, 'All items before or on this date will be marked completed upon import (YYYY-MM-DD)'],
        [''],
        ['--- Completed Today Records ---'],
        ['ID', 'Account Name', 'Game Name', 'Event Token', 'Level Name', 'Time Spent', 'Completion Time', 'Completion Date', 'Level ID', 'Request Type', 'Is Purchase']
      ];

      todayCompletions.forEach((c: any) => {
        // Format timestamp to HH:mm:ss AM/PM
        let formattedTime = '';
        if (c.completionTime) {
          const date = new Date(c.completionTime);
          formattedTime = date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            hour12: true 
          });
        }

        infoRows.push([
          c.id,
          c.accountName,
          c.gameName,
          c.eventToken,
          c.levelName || '-',
          c.timeSpent,
          formattedTime,
          c.completionDate,
          c.levelId || '',
          c.requestType || '',
          c.isPurchase ? 'Yes' : 'No'
        ]);
      });

      const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);
      XLSX.utils.book_append_sheet(workbook, infoSheet, 'Completion_Info');

      // Save file
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile('All_Games.xlsx', buffer);
    } catch (error) {
      console.error('Export all games data error:', error);
      return false;
    }
  }

  /**
   * Export game detail data to Excel (GameDetailPage format)
   */
  private static async exportGameDetailToExcel(
    levels: Level[],
    purchaseEvents: PurchaseEvent[],
    gameName: string,
    layout: 'horizontal' | 'vertical',
    colorSettings: ColorSettings,
    theme: 'light' | 'dark',
    columns?: any[]
  ): Promise<boolean> {
    try {
      const workbook = XLSX.utils.book_new();

      const getCellStyle = (backgroundColor: string, isHeader: boolean = false, isSynthetic: boolean = false) =>
        this.getCellStyle(backgroundColor, theme, isHeader, isSynthetic);

      // Prepare data
      let allItems: any[] = [];

      if (columns && columns.length > 0) {
        allItems = columns;
      } else {
        // Fallback to raw data
        allItems = [
          ...levels.map(l => ({ kind: 'level', token: l.event_token, name: l.level_name, daysOffset: l.days_offset, timeSpent: l.time_spent, isBonus: l.is_bonus })),
          ...purchaseEvents.map(p => ({ kind: 'purchase', token: p.event_token, name: '$$$', daysOffset: p.max_days_offset ? `Less Than ${p.max_days_offset}` : '-', timeSpent: '-', isRestricted: p.is_restricted }))
        ];
      }

      // Create worksheet data
      const wsData: any[][] = [];

      if (layout === 'vertical') {
        // Headers
        const row1 = ['Event Token'];
        const row2 = ['Level Name'];
        const row3 = ['Days Offset'];
        const row4 = ['Time Spent (1000 seconds)'];

        allItems.forEach(item => {
          row1.push(item.token);
          row2.push(item.name);
          row3.push(item.daysOffset !== null && item.daysOffset !== undefined ? item.daysOffset.toString() : '-');
          row4.push(item.timeSpent !== null && item.timeSpent !== undefined ? item.timeSpent.toString() : '-');
        });
        wsData.push(row1, row2, row3, row4);
      } else {
        // Horizontal layout
        wsData.push(['Event Token', 'Level Name', 'Days Offset', 'Time Spent (1000 seconds)']);

        allItems.forEach(item => {
          wsData.push([
            item.token,
            item.name,
            item.daysOffset !== null && item.daysOffset !== undefined ? item.daysOffset.toString() : '-',
            item.timeSpent !== null && item.timeSpent !== undefined ? item.timeSpent.toString() : '-'
          ]);
        });
      }

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(wsData);

      // Apply styles
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddress];
          if (!cell) continue;

          if (layout === 'vertical') {
            if (R < 4) {
              if (C === 0) {
                cell.s = getCellStyle(colorSettings.headerColor, true);
              } else {
                const itemIdx = C - 1;
                if (itemIdx >= 0 && itemIdx < allItems.length) {
                  const item = allItems[itemIdx];
                  let backgroundColor: string;
                  if (item.kind === 'level') {
                    backgroundColor = item.isBonus ? colorSettings.levelBonus : colorSettings.levelNormal;
                  } else {
                    backgroundColor = item.isRestricted ? colorSettings.purchaseRestricted : colorSettings.purchaseUnrestricted;
                  }
                  cell.s = getCellStyle(backgroundColor, true, item.synthetic);
                } else {
                  cell.s = getCellStyle(colorSettings.headerColor, true);
                }
              }
            }
          } else {
            // Horizontal
            if (R === 0) {
              cell.s = getCellStyle(colorSettings.headerColor, true);
            } else {
              const itemIdx = R - 1;
              if (itemIdx >= 0 && itemIdx < allItems.length) {
                const item = allItems[itemIdx];
                let backgroundColor: string;
                if (item.kind === 'level') {
                  backgroundColor = item.isBonus ? colorSettings.levelBonus : colorSettings.levelNormal;
                } else {
                  backgroundColor = item.isRestricted ? colorSettings.purchaseRestricted : colorSettings.purchaseUnrestricted;
                }
                cell.s = getCellStyle(backgroundColor, false, item.synthetic);
              } else {
                cell.s = getCellStyle(colorSettings.dataRowColor);
              }
            }
          }
        }
      }

      // Set column widths
      worksheet['!cols'] = [
        { wch: 15 }, // Event Token/Level Name
        { wch: 12 }, // Level Name
        { wch: 12 }, // Days Offset
        { wch: 20 }, // Time Spent
        ...Array(Math.max(0, (layout === 'vertical' ? wsData[0].length - 4 : 0))).fill({ wch: 12 })
      ];

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, gameName);

      // Save file
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile(`${gameName}_Details.xlsx`, buffer);
    } catch (error) {
      console.error('Export game detail error:', error);
      return false;
    }
  }

  /**
   * Export account detail data to Excel (AccountDetailPage format)
   */
  private static async exportAccountDetailToExcel(
    account: Account,
    levels: Level[],
    purchaseEvents: PurchaseEvent[],
    layout: 'horizontal' | 'vertical',
    colorSettings: ColorSettings,
    theme: 'light' | 'dark',
    columns?: any[],
    levelsProgress?: any[],
    purchaseProgress?: any[]
  ): Promise<boolean> {
    try {
      const workbook = XLSX.utils.book_new();

      const getCellStyle = (backgroundColor: string, isHeader: boolean = false, isSynthetic: boolean = false) =>
        this.getCellStyle(backgroundColor, theme, isHeader, isSynthetic);

      // Helper function to parse date and add days
      const parseDate = (input?: string): Date | null => {
        if (!input) return null;
        const d = new Date(input);
        return Number.isNaN(d.getTime()) ? null : d;
      };

      const addDays = (date: Date, days: number): Date => {
        const r = new Date(date);
        r.setDate(r.getDate() + days);
        return r;
      };

      const formatDateShort = (date: Date | null): string => {
        if (!date) return '-';
        const day = date.getDate();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${day}-${months[date.getMonth()]}`;
      };

      const startDateObj = parseDate(account.start_date) || new Date();

      // Prepare data
      let allItems: any[] = [];

      if (columns && columns.length > 0) {
        allItems = columns.map(col => {
          const dd = addDays(startDateObj, Number(col.daysOffset || 0));
          const dateStr = formatDateShort(dd);

          let isCompleted = false;
          if (col.kind === 'level') {
            const prog = levelsProgress?.find(p => p.level_id === col.id);
            isCompleted = prog ? prog.is_completed : false;
          } else {
            const prog = purchaseProgress?.find(p => p.purchase_event_id === col.id);
            isCompleted = prog ? prog.is_completed : false;
          }

          return {
            ...col,
            dateStr,
            isCompleted
          };
        });
      } else {
        // Fallback
        allItems = [
          ...levels.map(l => {
            const dd = addDays(startDateObj, l.days_offset);
            const prog = levelsProgress?.find(p => p.level_id === l.id);
            return { kind: 'level', token: l.event_token, name: l.level_name, daysOffset: l.days_offset, timeSpent: l.time_spent, dateStr: formatDateShort(dd), isCompleted: prog ? prog.is_completed : false, isBonus: l.is_bonus };
          }),
          ...purchaseEvents.map(p => {
            const prog = purchaseProgress?.find(p => p.purchase_event_id === p.id);
            return { kind: 'purchase', token: p.event_token, name: '$$$', daysOffset: p.max_days_offset, timeSpent: null, dateStr: '-', isCompleted: prog ? prog.is_completed : false, isRestricted: p.is_restricted };
          })
        ];
      }

      // Create worksheet data
      const wsData: any[][] = [];

      if (layout === 'vertical') {
        const row1 = ['Event Token'];
        const row2 = ['Level Name'];
        const row3 = ['Days Offset'];
        const row4 = ['Time Spent (1000 seconds)'];
        const row5 = ['Date'];

        allItems.forEach(item => {
          row1.push(item.token);
          row2.push(item.name);
          row3.push(item.daysOffset !== null && item.daysOffset !== undefined ? item.daysOffset.toString() : '-');
          row4.push(item.kind === 'level' && item.timeSpent !== null && item.timeSpent !== undefined ? item.timeSpent.toString() : '-');
          row5.push(item.isCompleted ? `${item.dateStr} (C)` : item.dateStr);
        });
        wsData.push(row1, row2, row3, row4, row5);
      } else {
        wsData.push(['Event Token', 'Level Name', 'Days Offset', 'Time Spent (1000 seconds)', 'Date']);
        allItems.forEach(item => {
          wsData.push([
            item.token,
            item.name,
            item.daysOffset !== null && item.daysOffset !== undefined ? item.daysOffset.toString() : '-',
            item.kind === 'level' && item.timeSpent !== null && item.timeSpent !== undefined ? item.timeSpent.toString() : '-',
            item.isCompleted ? `${item.dateStr} (C)` : item.dateStr
          ]);
        });
      }

      const worksheet = XLSX.utils.aoa_to_sheet(wsData);

      // Apply styles
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddress];
          if (!cell) continue;

          if (layout === 'vertical') {
            if (R < 5) {
              if (C === 0) {
                cell.s = getCellStyle(colorSettings.headerColor, true);
              } else {
                const itemIdx = C - 1;
                if (itemIdx >= 0 && itemIdx < allItems.length) {
                  const item = allItems[itemIdx];
                  let backgroundColor: string;
                  if (item.kind === 'level') {
                    backgroundColor = item.isBonus ? colorSettings.levelBonus : colorSettings.levelNormal;
                  } else {
                    backgroundColor = item.isRestricted ? colorSettings.purchaseRestricted : colorSettings.purchaseUnrestricted;
                  }
                  cell.s = getCellStyle(backgroundColor, true, item.synthetic);
                } else {
                  cell.s = getCellStyle(colorSettings.headerColor, true);
                }
              }
            } else {
              // Data row (Date) - now at row 5
              const itemIdx = C - 1;
              if (itemIdx >= 0 && itemIdx < allItems.length) {
                const item = allItems[itemIdx];
                const backgroundColor = item.isCompleted ? colorSettings.completeScheduledStyle : colorSettings.incompleteScheduledStyle;
                cell.s = getCellStyle(backgroundColor, false, item.synthetic);
              } else {
                cell.s = getCellStyle(colorSettings.dataRowColor);
              }
            }
          } else {
            // Horizontal
            if (R === 0) {
              cell.s = getCellStyle(colorSettings.headerColor, true);
            } else {
              const itemIdx = R - 1;
              if (itemIdx >= 0 && itemIdx < allItems.length) {
                const item = allItems[itemIdx];
                let backgroundColor: string;
                if (C < 4) {
                  // Header-like columns (Event Token, Level Name, Days Offset, Time Spent)
                  if (item.kind === 'level') {
                    backgroundColor = item.isBonus ? colorSettings.levelBonus : colorSettings.levelNormal;
                  } else {
                    backgroundColor = item.isRestricted ? colorSettings.purchaseRestricted : colorSettings.purchaseUnrestricted;
                  }
                } else {
                  // Date column (column 4)
                  backgroundColor = item.isCompleted ? colorSettings.completeScheduledStyle : colorSettings.incompleteScheduledStyle;
                }
                cell.s = getCellStyle(backgroundColor, false, item.synthetic);
              } else {
                cell.s = getCellStyle(colorSettings.dataRowColor);
              }
            }
          }
        }
      }

      worksheet['!cols'] = [
        { wch: 15 }, // Event Token
        { wch: 12 }, // Level Name
        { wch: 12 }, // Days Offset
        { wch: 25 }, // Time Spent (1000 seconds)
        { wch: 15 }, // Date
        ...Array(Math.max(0, (layout === 'vertical' ? wsData[0].length - 5 : 0))).fill({ wch: 12 })
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, account.name);

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile(`${account.name}.xlsx`, buffer);
    } catch (error) {
      console.error('Export account detail error:', error);
      return false;
    }
  }
  // ===== Styling Methods (delegated to styling module) =====

  private static getCellStyle(backgroundColor: string, theme: 'light' | 'dark', isHeader: boolean = false, isSynthetic: boolean = false) {
    return getCellStyle(backgroundColor, theme, isHeader, isSynthetic);
  }
}
