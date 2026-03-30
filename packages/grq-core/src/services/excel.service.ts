// src/services/excel.service.ts
// Main Excel Service Facade - Delegates to decomposed modules

import XLSX from 'xlsx-js-style';
import { TauriService } from './tauri.service';
import { asyncStorageService } from './storage.service';
import type { Game, Account, Level, PurchaseEvent } from '@grq/api-bindings';
import type { ColorSettings } from '@grq/ui/contexts/SettingsContext';

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
  static async exportGameDetailData(gameId: number, layout: 'horizontal' | 'vertical', colorSettings: ColorSettings, theme: 'light' | 'dark', data?: any): Promise<boolean> {
    try {
      const game = await TauriService.getGameById(gameId);
      const gameName = game?.name || 'Game';
      
      let finalData = data;
      let levels: Level[] = [];
      let purchaseEvents: PurchaseEvent[] = [];

      if (!data) {
        // Fallback: Fetch all levels and events for the game's default branch if not provided
        levels = await TauriService.getGameLevels(gameId);
        purchaseEvents = await TauriService.getGamePurchaseEvents(gameId);
      }

      return await this.exportGameDetailToExcel(levels, purchaseEvents, gameName, layout, colorSettings, theme, finalData);
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
    levelsProgress?: any,
    purchaseProgress?: any
  ): Promise<boolean> {
    try {
      const account = await TauriService.getAccountById(accountId);
      if (!account) return false;

      const [levels, purchaseEvents] = await Promise.all([
        TauriService.getGameLevels(account.branch_id || 0),
        TauriService.getGamePurchaseEvents(account.branch_id || 0)
      ]);

      return await this.exportAccountDetailToExcel(account, levels, purchaseEvents, layout, colorSettings, theme, columns, levelsProgress, purchaseProgress);
    } catch (error) {
      console.error('Export account detail data error:', error);
      return false;
    }
  }

  /**
   * Generate matrix data for a game/branch using matrix layout (helper method)
   */
  private static async generateGameMatrixData(
    _levels: Level[],
    _purchaseEvents: PurchaseEvent[],
    accounts: Account[],
    columns: any[],
    layout: 'horizontal' | 'vertical',
    colorSettings: ColorSettings,
    theme: 'light' | 'dark',
    levelsProgress?: Record<string, any>,
    purchaseProgress?: Record<string, any>,
    branchName?: string
  ): Promise<{ wsData: any[][]; merges: any[]; cols: any[] }> {
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
    const merges: any[] = [];

    // Add Branch Title if provided
    if (branchName) {
      wsData.push([`Branch: ${branchName}`]);
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 3 + columns.length } });
    }

    const rowOffset = wsData.length;

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
        headerRow3.push(col.daysOffset !== null && col.daysOffset !== undefined && col.daysOffset !== '' ? col.daysOffset.toString() : '-');
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

        const row: any[] = [acc.name, formatDateWithYear(acc.start_date), formatTimeAMPM(acc.start_time), lastCompletedToken];
        matrixRow.forEach((date, colIdx) => {
          const col = columns[colIdx];
          const progressKey = `${acc.id}_${col.id}`;
          const progress = col.kind === 'level' ? (levelsProgress as any)?.[progressKey] : (purchaseProgress as any)?.[progressKey];
          const isCompleted = progress?.is_completed ?? false;
          
          let displayDate = date;
          
          if (col.kind === 'purchase' && progress && typeof progress.days_offset === 'number') {
             const start = parseDate(acc.start_date);
             if (start) {
                 const actualDate = addDays(start, progress.days_offset);
                 displayDate = formatDateShort(actualDate);
             }
          }
          
          row.push(isCompleted ? `${displayDate} (C)` : displayDate);
        });
        wsData.push(row);
      });

      // Apply merging relative to rowOffset
      merges.push(
        { s: { r: rowOffset + 0, c: 0 }, e: { r: rowOffset + 0, c: 3 } },
        { s: { r: rowOffset + 1, c: 0 }, e: { r: rowOffset + 1, c: 3 } },
        { s: { r: rowOffset + 2, c: 0 }, e: { r: rowOffset + 2, c: 3 } },
        { s: { r: rowOffset + 3, c: 0 }, e: { r: rowOffset + 3, c: 3 } },
      );

      // Apply styling directly to cell content in wsData
      const headerStyle = getCellStyleLocal(colorSettings.headerColor, true);
      const dataRowStyle = getCellStyleLocal(colorSettings.dataRowColor);
      const branchTitleStyle = getCellStyleLocal(colorSettings.headerColor, true);

      // Branch Title Styling
      if (branchName) {
        wsData[0][0] = { v: wsData[0][0], s: branchTitleStyle };
      }

      for (let r = rowOffset; r < wsData.length; r++) {
        const localRowIdx = r - rowOffset;
        for (let c = 0; c < wsData[r].length; c++) {
          const val = wsData[r][c];
          const cellObj = typeof val === 'object' && val !== null && 'v' in val ? val : { v: val };
          
          if (localRowIdx < 5) {
            if (c < 4) {
              cellObj.s = headerStyle;
            } else {
              const col = columns[c - 4];
              cellObj.s = getColumnStyleLocal(col.kind, col.isBonus, col.isRestricted, col.synthetic, true);
            }
          } else {
            if (c < 4) {
              cellObj.s = dataRowStyle;
            } else {
              const col = columns[c - 4];
              const acc = accounts[localRowIdx - 5];
              const progressKey = `${acc.id}_${col.id}`;
              const progress = col.kind === 'level' ? (levelsProgress as any)?.[progressKey] : (purchaseProgress as any)?.[progressKey];
              const isCompleted = progress?.is_completed ?? false;
              const bgColor = isCompleted ? colorSettings.completeScheduledStyle : colorSettings.incompleteScheduledStyle;
              cellObj.s = getCellStyleLocal(bgColor, false, col.synthetic);
            }
          }
          wsData[r][c] = cellObj;
        }
      }

      const cols = [
        { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
        ...columns.map(() => ({ wch: 12 }))
      ];

      return { wsData, merges, cols };
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
          col.daysOffset !== null && col.daysOffset !== undefined && col.daysOffset !== '' ? col.daysOffset.toString() : '-',
          col.kind === 'level' ? (col.timeSpent !== null && col.timeSpent !== undefined ? col.timeSpent.toString() : '-') : '-',
        ];

        accounts.forEach((_acc, accIdx) => {
          row.push(matrix[accIdx][colIdx]);
        });
        wsData.push(row);
      });

      const headerStyle = getCellStyleLocal(colorSettings.headerColor, true);
      const branchTitleStyle = getCellStyleLocal(colorSettings.headerColor, true);

      // Branch Title Styling
      if (branchName) {
        wsData[0][0] = { v: wsData[0][0], s: branchTitleStyle };
      }

      for (let r = rowOffset; r < wsData.length; r++) {
        const localRowIdx = r - rowOffset;
        for (let c = 0; c < wsData[r].length; c++) {
          const val = wsData[r][c];
          const cellObj = typeof val === 'object' && val !== null && 'v' in val ? val : { v: val };

          if (localRowIdx === 0) {
            cellObj.s = headerStyle;
          } else {
            if (c < 4) {
              const col = columns[localRowIdx - 1];
              cellObj.s = getColumnStyleLocal(col.kind, col.isBonus, col.isRestricted, col.synthetic, false);
            } else {
              const acc = accounts[c - 4];
              const col = columns[localRowIdx - 1];
              const progressKey = `${acc.id}_${col.id}`;
              const progress = col.kind === 'level' ? (levelsProgress as any)?.[progressKey] : (purchaseProgress as any)?.[progressKey];
              const isCompleted = progress?.is_completed ?? false;
              const bgColor = isCompleted ? colorSettings.completeScheduledStyle : colorSettings.incompleteScheduledStyle;
              cellObj.s = getCellStyleLocal(bgColor, false, col.synthetic);
            }
          }
          wsData[r][c] = cellObj;
        }
      }

      const cols = [
        { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 25 },
        ...accounts.map(() => ({ wch: 15 }))
      ];

      return { wsData, merges, cols };
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
    levelsProgress?: any,
    purchaseProgress?: any,
    mode: 'event-only' | 'all' = 'event-only'
  ): Promise<boolean> {
    try {
      const workbook = XLSX.utils.book_new();

      // Create columns array (similar to AccountsDetailPage)
      let columns: any[] = [];
      if (columnsData && columnsData.length > 0) {
        columns = columnsData;
      } else {
        const branchColumns = buildColumns(levels, purchaseEvents);
        let filteredColumns = branchColumns;
        if (mode === 'event-only') {
           filteredColumns = branchColumns.filter(c => !(c.kind === 'level' && c.name === '-'));
        }
        columns = [...filteredColumns.filter(c => c.kind === 'level'), ...filteredColumns.filter(c => c.kind === 'purchase')];
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

      // Use helper method to generate data
      const { wsData, merges, cols } = await this.generateGameMatrixData(
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

      // Create worksheet from generated data
      const worksheet = XLSX.utils.aoa_to_sheet(wsData);
      (worksheet as any)['!merges'] = merges;
      (worksheet as any)['!cols'] = cols;

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
  static async exportGameData(gameId: number, layout: 'horizontal' | 'vertical', colorSettings: ColorSettings, theme: 'light' | 'dark', columns?: any[], levelsProgress?: any, purchaseProgress?: any, branchId?: number, mode: 'event-only' | 'all' = 'event-only'): Promise<boolean> {
    try {
      const game = await TauriService.getGameById(gameId);
      const gameName = game?.name || 'Game';

      // If branchId is provided, export ONLY that branch (legacy/specific behavior)
      if (branchId) {
        const [levels, purchaseEvents, accounts] = await Promise.all([
          TauriService.getGameLevels(branchId),
          TauriService.getGamePurchaseEvents(branchId),
          TauriService.getAccounts(gameId).then(accs => accs.filter(a => a.branch_id === branchId))
        ]);

        const sortedAccounts = this.sortAccountsByDate(accounts);
        return await this.exportToExcelMatrix(levels, purchaseEvents, sortedAccounts, gameName, layout, colorSettings, theme, columns, levelsProgress, purchaseProgress, mode);
      }

      // If no branchId, export ALL branches stacked vertically
      const branches = await TauriService.getGameBranches(gameId);
      if (branches.length === 0) return false;

      const workbook = XLSX.utils.book_new();
      let masterWsData: any[][] = [];
      let masterMerges: any[] = [];
      let masterCols: any[] = [];

      for (const branch of branches) {
        const [levels, purchaseEvents, accounts] = await Promise.all([
          TauriService.getGameLevels(branch.id),
          TauriService.getGamePurchaseEvents(branch.id),
          TauriService.getAccounts(gameId).then(accs => accs.filter(a => a.branch_id === branch.id))
        ]);

        if (accounts.length === 0) continue;

        const sortedAccounts = this.sortAccountsByDate(accounts);
        const branchColumns = buildColumns(levels, purchaseEvents);
        
        // Apply Mode-based Filtering
        let filteredColumns = branchColumns;
        if (mode === 'event-only') {
           filteredColumns = branchColumns.filter(c => !(c.kind === 'level' && c.name === '-'));
        }
        const finalColumns = [...filteredColumns.filter(c => c.kind === 'level'), ...filteredColumns.filter(c => c.kind === 'purchase')];

        // Fetch progress for these accounts if not provided
        let effectiveLevelsProgress = levelsProgress;
        let effectivePurchaseProgress = purchaseProgress;

        if (!levelsProgress || !purchaseProgress) {
            const lp: Record<string, any> = {};
            const pp: Record<string, any> = {};
            for (const acc of sortedAccounts) {
                const [accLp, accPp] = await Promise.all([
                    TauriService.getAccountLevelProgress(acc.id),
                    TauriService.getAccountPurchaseEventProgress(acc.id)
                ]);
                accLp.forEach(p => lp[`${acc.id}_${p.level_id}`] = p);
                accPp.forEach(p => pp[`${acc.id}_${p.purchase_event_id}`] = p);
            }
            effectiveLevelsProgress = lp;
            effectivePurchaseProgress = pp;
        }

        const currentOffset = masterWsData.length;
        if (currentOffset > 0) {
            masterWsData.push([]); // Add separator row
        }
        
        const { wsData, merges, cols } = await this.generateGameMatrixData(
          levels,
          purchaseEvents,
          sortedAccounts,
          finalColumns,
          layout,
          colorSettings,
          theme,
          effectiveLevelsProgress,
          effectivePurchaseProgress,
          branch.name
        );

        // Adjust merge indices
        const adjustedMerges = merges.map(m => ({
            s: { r: m.s.r + currentOffset + (currentOffset > 0 ? 1 : 0), c: m.s.c },
            e: { r: m.e.r + currentOffset + (currentOffset > 0 ? 1 : 0), c: m.e.c }
        }));

        masterWsData.push(...wsData);
        masterMerges.push(...adjustedMerges);
        
        // Keep the widest column configuration
        if (cols.length > masterCols.length) {
            masterCols = cols;
        }
      }

      if (masterWsData.length === 0) return false;

      const worksheet = XLSX.utils.aoa_to_sheet(masterWsData);
      (worksheet as any)['!merges'] = masterMerges;
      (worksheet as any)['!cols'] = masterCols;

      XLSX.utils.book_append_sheet(workbook, worksheet, gameName.substring(0, 31));

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile(`${gameName}.xlsx`, buffer);
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
      const buffer = await this.generateAllGamesBuffer(layout, colorSettings, theme, mode);
      if (!buffer) return false;
      return await this.saveFile('All_Games.xlsx', buffer);
    } catch (error) {
      console.error('Export all games data error:', error);
      return false;
    }
  }

  /**
   * Generates the Excel workbook buffer for all games
   */
  static async generateAllGamesBuffer(layout: 'horizontal' | 'vertical', colorSettings: ColorSettings, theme: 'light' | 'dark', mode: 'event-only' | 'all' = 'event-only'): Promise<any> {
    try {
      const workbook = await this.generateAllGamesWorkbook(layout, colorSettings, theme, mode);
      if (!workbook) return null;
      return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    } catch (error) {
      console.error('Generate all games buffer error:', error);
      return null;
    }
  }

  /**
   * Internal logic to generate the workbook object for all games
   */
  private static async generateAllGamesWorkbook(layout: 'horizontal' | 'vertical', colorSettings: ColorSettings, theme: 'light' | 'dark', mode: 'event-only' | 'all' = 'event-only'): Promise<any> {
    try {
      const games = await TauriService.getGames();
      const workbook = XLSX.utils.book_new();

      // Process each game and create sheets
      for (const game of games) {
        const branches = await TauriService.getGameBranches(game.id);
        if (branches.length === 0) continue;

        let masterWsData: any[][] = [];
        let masterMerges: any[] = [];
        let masterCols: any[] = [];
        const allGameLevels: Level[] = [];
        const allGamePurchaseEvents: PurchaseEvent[] = [];

        // Truncate base name to allow for _Lvl and _Evt suffixes (max 31 total)
        const sheetBaseName = game.name.substring(0, 27);

        for (const branch of branches) {
          const [levels, purchaseEvents, accounts] = await Promise.all([
            TauriService.getGameLevels(branch.id),
            TauriService.getGamePurchaseEvents(branch.id),
            TauriService.getAccounts(game.id).then(accs => accs.filter(a => a.branch_id === branch.id))
          ]);

          if (accounts.length === 0) continue;

          // Collect unique levels/events for definition sheets
          levels.forEach(l => { if (!allGameLevels.find(xl => xl.id === l.id)) allGameLevels.push(l); });
          purchaseEvents.forEach(pe => { if (!allGamePurchaseEvents.find(xpe => xpe.id === pe.id)) allGamePurchaseEvents.push(pe); });

          // Sort accounts by date (oldest to newest)
          const sortedAccounts = this.sortAccountsByDate(accounts);

          // Fetch progress data for these accounts
          const levelsProgress: Record<string, any> = {};
          const purchaseProgress: Record<string, any> = {};

          for (const account of sortedAccounts) {
            try {
              const [accountLevelsProgress, accountPurchaseProgress] = await Promise.all([
                TauriService.getAccountLevelProgress(account.id),
                TauriService.getAccountPurchaseEventProgress(account.id)
              ]);

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

          // Build columns for this branch
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

          const peCols = purchaseEvents.map((p: PurchaseEvent) => {
            const isRestricted = (p as any).is_restricted ?? false;
            const base = (p as any).days_offset !== undefined && (p as any).days_offset !== null ? String((p as any).days_offset) : '-';
            let formattedDaysOffset = base;
            
            if (isRestricted && p.max_days_offset != null) {
                formattedDaysOffset = `${base} (Less Than ${p.max_days_offset})`;
            }

            return {
              kind: 'purchase' as const,
              id: p.id,
              token: p.event_token,
              fullToken: p.event_token,
              name: '$$$',
              isRestricted,
              daysOffset: formattedDaysOffset,
              synthetic: false,
            };
          });

          const columns = [...levelCols, ...peCols];

          const currentOffset = masterWsData.length;
          const separatorRowsCount = currentOffset > 0 ? 1 : 0;
          if (separatorRowsCount > 0) {
              masterWsData.push([]); // Add separator row
          }

          const { wsData, merges, cols } = await this.generateGameMatrixData(
            levels,
            purchaseEvents,
            sortedAccounts,
            columns,
            layout,
            colorSettings,
            theme,
            levelsProgress,
            purchaseProgress,
            branch.name
          );

          // Adjust merge indices
          const adjustedMerges = merges.map(m => ({
              s: { r: m.s.r + currentOffset + separatorRowsCount, c: m.s.c },
              e: { r: m.e.r + currentOffset + separatorRowsCount, c: m.e.c }
          }));

          masterWsData.push(...wsData);
          masterMerges.push(...adjustedMerges);
          
          if (cols.length > masterCols.length) {
              masterCols = cols;
          }
        }

        if (masterWsData.length === 0) continue;

        const accountsWorksheet = XLSX.utils.aoa_to_sheet(masterWsData);
        (accountsWorksheet as any)['!merges'] = masterMerges;
        (accountsWorksheet as any)['!cols'] = masterCols;

        XLSX.utils.book_append_sheet(workbook, accountsWorksheet, sheetBaseName);

        // 2. Create Levels sheet
        if (allGameLevels.length > 0) {
          const levelHeaders = ['Event Token', 'Level Name', 'Days Offset', 'Time Spent (1000 seconds)', 'Bonus'];
          const levelRows = allGameLevels.map(level => [
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
        if (allGamePurchaseEvents.length > 0) {
          const purchaseHeaders = ['Event Token', 'Restricted', 'Max Days Offset'];
          const purchaseRows = allGamePurchaseEvents.map(event => [
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
      const existingCompleted = await asyncStorageService.get<any[]>(completedKey);
      const todayCompletions = existingCompleted ? existingCompleted : [];

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

      return workbook;
    } catch (error) {
      console.error('Generate all games workbook error:', error);
      return null;
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

      // Prepare data groups (branches)
      let dataGroups: Array<{ branchName?: string; columns: any[] }> = [];

      if (Array.isArray(columns) && columns.length > 0) {
        if ('branchName' in columns[0]) {
          dataGroups = columns as Array<{ branchName: string; columns: any[] }>;
        } else {
          dataGroups = [{ columns }];
        }
      } else {
        // Fallback to raw data
        const fallbackColumns = [
          ...levels.map(l => ({ kind: 'level', token: l.event_token.split('_day')[0], name: l.level_name, daysOffset: l.days_offset, timeSpent: l.time_spent, isBonus: l.is_bonus, synthetic: l.level_name === '-' })),
          ...purchaseEvents.map(p => {
            const isRestricted = (p as any).is_restricted ?? false;
            const base = (p as any).days_offset !== undefined && (p as any).days_offset !== null ? String((p as any).days_offset) : '-';
            let formattedOffset = base;
            if (isRestricted && p.max_days_offset != null) {
                formattedOffset = `${base} (Less Than ${p.max_days_offset})`;
            }
            return { kind: 'purchase', token: p.event_token, name: '$$$', daysOffset: formattedOffset, timeSpent: '-', isRestricted: isRestricted, synthetic: false };
          })
        ];
        dataGroups = [{ columns: fallbackColumns }];
      }

      const wsData: any[][] = [];
      const merges: any[] = [];

      for (const group of dataGroups) {
          const currentOffset = wsData.length;
          const { columns: groupCols, branchName } = group;

          // Add Branch Title if provided
          if (branchName) {
            wsData.push([`Branch: ${branchName}`]);
            merges.push({ s: { r: currentOffset, c: 0 }, e: { r: currentOffset, c: (layout === 'vertical' ? groupCols.length : 3) } });
          }

          const rowOffset = wsData.length;

          if (layout === 'vertical') {
            const row1 = ['Event Token'];
            const row2 = ['Level Name'];
            const row3 = ['Days Offset'];
            const row4 = ['Time Spent (1000 seconds)'];

            groupCols.forEach(item => {
              row1.push(item.token);
              row2.push(item.name);
              row3.push(item.daysOffset !== null && item.daysOffset !== undefined && item.daysOffset !== '' ? item.daysOffset.toString() : '-');
              row4.push(item.timeSpent !== null && item.timeSpent !== undefined ? item.timeSpent.toString() : '-');
            });
            wsData.push(row1, row2, row3, row4);

            // Apply styles to these rows
            for (let r = rowOffset; r < wsData.length; r++) {
               for (let c = 0; c < wsData[r].length; c++) {
                   const cell = { v: wsData[r][c] } as any;
                   if (c === 0) {
                       cell.s = getCellStyle(colorSettings.headerColor, true);
                   } else {
                       const item = groupCols[c - 1];
                       let backgroundColor: string;
                       if (item.kind === 'level') {
                           backgroundColor = item.isBonus ? colorSettings.levelBonus : colorSettings.levelNormal;
                       } else {
                           backgroundColor = item.isRestricted ? colorSettings.purchaseRestricted : colorSettings.purchaseUnrestricted;
                       }
                       cell.s = getCellStyle(backgroundColor, true, item.synthetic);
                   }
                   wsData[r][c] = cell;
               }
            }
          } else {
            // Horizontal layout
            wsData.push(['Event Token', 'Level Name', 'Days Offset', 'Time Spent (1000 seconds)']);
            
            // Apply header style
            const headerRowIdx = rowOffset;
            for (let c = 0; c < 4; c++) {
                wsData[headerRowIdx][c] = { v: wsData[headerRowIdx][c], s: getCellStyle(colorSettings.headerColor, true) };
            }

            groupCols.forEach((item) => {
              const row = [
                item.token,
                item.name,
                item.daysOffset !== null && item.daysOffset !== undefined && item.daysOffset !== '' ? item.daysOffset.toString() : '-',
                item.timeSpent !== null && item.timeSpent !== undefined ? item.timeSpent.toString() : '-'
              ];
              
              let backgroundColor: string;
              if (item.kind === 'level') {
                  backgroundColor = item.isBonus ? colorSettings.levelBonus : colorSettings.levelNormal;
              } else {
                  backgroundColor = item.isRestricted ? colorSettings.purchaseRestricted : colorSettings.purchaseUnrestricted;
              }
              const rowStyle = getCellStyle(backgroundColor, false, item.synthetic);
              
              wsData.push(row.map(v => ({ v, s: rowStyle })));
            });
          }

          // Add a spacer row between groups
          wsData.push([]);
      }
      
      // Cleanup last spacer row
      if (wsData.length > 0 && wsData[wsData.length - 1].length === 0) {
          wsData.pop();
      }

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(wsData);
      (worksheet as any)['!merges'] = merges;

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
          let isCompleted = false;
          let daysOffsetToUse = Number(col.daysOffset || 0);

          if (col.kind === 'level') {
            const prog = levelsProgress?.find(p => p.level_id === col.id);
            isCompleted = prog ? prog.is_completed : false;
          } else {
            const prog = purchaseProgress?.find(p => p.purchase_event_id === col.id);
            isCompleted = prog ? prog.is_completed : false;
            // Use actual execution date if available
            if (prog && typeof prog.days_offset === 'number') {
                daysOffsetToUse = prog.days_offset;
            }
          }

          const dd = addDays(startDateObj, daysOffsetToUse);
          const dateStr = formatDateShort(dd);
          
          let formattedDaysOffset: string | number = (col as any).displayDaysOffset ?? col.daysOffset;
          if (col.kind === 'purchase' && !(col as any).displayDaysOffset) {
             const base = col.daysOffset !== undefined && col.daysOffset !== null ? String(col.daysOffset) : '-';
             if (col.isRestricted && col.maxDaysOffset != null) {
                 formattedDaysOffset = `${base} (Less Than ${col.maxDaysOffset})`;
             } else {
                 formattedDaysOffset = base;
             }
          }

          return {
            ...col,
            daysOffset: formattedDaysOffset,
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
            const prog = purchaseProgress?.find(pr => pr.purchase_event_id === p.id);
            
            let dateStr = '-';
            if (prog && typeof prog.days_offset === 'number') {
                 const dd = addDays(startDateObj, prog.days_offset);
                 dateStr = formatDateShort(dd);
            } else if ((p as any).days_offset !== undefined && (p as any).days_offset !== null) {
                 // Use reference days_offset
                  const dd = addDays(startDateObj, (p as any).days_offset);
                  dateStr = formatDateShort(dd);
            }
            
            // Prioritize showing the reference days_offset in the 'Days Offset' column
            const isRestricted = (p as any).is_restricted ?? false;
            const base = (p as any).days_offset !== undefined && (p as any).days_offset !== null ? String((p as any).days_offset) : '-';
            let displayOffset = base;
            if (isRestricted && p.max_days_offset != null) {
                displayOffset = `${base} (Less Than ${p.max_days_offset})`;
            }

            return { 
                kind: 'purchase', 
                token: p.event_token, 
                name: '$$$', 
                daysOffset: displayOffset, // Use calculated/reference offset
                timeSpent: null, 
                dateStr, 
                isCompleted: prog ? prog.is_completed : false, 
                isRestricted: p.is_restricted 
            };
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
