// src/services/excel.service.ts

import XLSX from 'xlsx-js-style';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { TauriService } from './tauri.service';
import type { Game, Account, Level, PurchaseEvent } from '../types';
import type { ColorSettings } from '../contexts/SettingsContext';

interface ImportData {
  levels: Partial<Level>[];
  purchaseEvents: Partial<PurchaseEvent>[];
  accounts: Partial<Account>[];
}

interface ExportData {
  levels?: Level[];
  purchaseEvents?: PurchaseEvent[];
  accounts?: Account[];
  game?: Game;
}

export class ExcelService {

  /**
   * Helper to save file with filesystem attempt and browser fallback
   */
  private static async saveFile(filename: string, buffer: any): Promise<boolean> {
    const uint8Array = new Uint8Array(buffer);
    const appDir = 'GameRequestGenerator';

    try {
      // Try saving to filesystem using BaseDirectory.Home (Tauri 2.0 way)
      // This is more robust than raw absolute paths for security reasons
      await mkdir(appDir, { recursive: true, baseDir: BaseDirectory.Home });
      const filePath = `${appDir}/${filename}`;
      await writeFile(filePath, uint8Array, { baseDir: BaseDirectory.Home });
      console.log(`File saved to: ${appDir}/${filename} in Home directory`);
      return true;
    } catch (error) {
      console.error('Failed to save file to filesystem, trying fallback:', error);

      try {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      } catch (fallbackError) {
        console.error('Browser download fallback failed:', fallbackError);
        return false;
      }
    }
  }

  /**
   * Simple test export to verify filesystem access
   */
  static async testExport(): Promise<boolean> {
    try {
      const workbook = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['Test', 'Export'], ['Success', 'Yes']]);
      XLSX.utils.book_append_sheet(workbook, ws, 'Test');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile('Test_Export.xlsx', buffer);
    } catch (error) {
      console.error('Test export failed:', error);
      return false;
    }
  }
  /**
   * Parse Excel file and extract data based on sheet structure
   */
  static async parseExcelFile(filePath: string): Promise<ImportData> {
    try {
      console.log('Reading file:', filePath);
      const fileContent = await readFile(filePath);
      console.log('File content length:', fileContent.length);

      console.log('Parsing workbook...');
      const workbook = XLSX.read(fileContent, { type: 'buffer' });
      console.log('Workbook sheets:', workbook.SheetNames);

      const result: ImportData = {
        levels: [],
        purchaseEvents: [],
        accounts: []
      };

      // Parse levels sheet
      const levelsSheet = workbook.Sheets['Levels'];
      if (levelsSheet) {
        const levelsData = XLSX.utils.sheet_to_json(levelsSheet, { header: 1 }) as any[][];
        result.levels = this.parseLevelsData(levelsData);
      }

      // Parse purchase events sheet
      const purchaseSheet = workbook.Sheets['Purchase Events'];
      if (purchaseSheet) {
        const purchaseData = XLSX.utils.sheet_to_json(purchaseSheet, { header: 1 }) as any[][];
        result.purchaseEvents = this.parsePurchaseEventsData(purchaseData);
      }

      // Parse accounts sheet
      const accountsSheet = workbook.Sheets['Accounts'];
      if (accountsSheet) {
        const accountsData = XLSX.utils.sheet_to_json(accountsSheet, { header: 1 }) as any[][];
        result.accounts = this.parseAccountsData(accountsData);
      }

      console.log('Successfully parsed Excel file with data:', {
        levels: result.levels.length,
        purchaseEvents: result.purchaseEvents.length,
        accounts: result.accounts.length
      });

      return result;
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse levels data from Excel rows
   */
  private static parseLevelsData(rows: any[][]): Partial<Level>[] {
    if (rows.length < 2) return [];

    const levels: Partial<Level>[] = [];
    const headers = rows[0];

    // Find column indices
    const eventTokenIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('event token'));
    const levelNameIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('level name'));
    const daysOffsetIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('days offset'));
    const timeSpentIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('time spent'));
    const isBonusIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('bonus'));

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const level: Partial<Level> = {};

      if (eventTokenIndex >= 0 && row[eventTokenIndex]) {
        level.event_token = row[eventTokenIndex].toString();
      }

      if (levelNameIndex >= 0 && row[levelNameIndex]) {
        level.level_name = row[levelNameIndex].toString();
      }

      if (daysOffsetIndex >= 0 && row[daysOffsetIndex] !== undefined) {
        const daysOffset = parseInt(row[daysOffsetIndex].toString());
        if (!isNaN(daysOffset)) {
          level.days_offset = daysOffset;
        }
      }

      if (timeSpentIndex >= 0 && row[timeSpentIndex] !== undefined) {
        const timeSpent = parseInt(row[timeSpentIndex].toString());
        if (!isNaN(timeSpent)) {
          level.time_spent = timeSpent;
        }
      }

      if (isBonusIndex >= 0 && row[isBonusIndex] !== undefined) {
        level.is_bonus = row[isBonusIndex]?.toString().toLowerCase() === 'yes' ||
          row[isBonusIndex]?.toString().toLowerCase() === 'true' ||
          row[isBonusIndex] === 1;
      }

      // Only add if we have at least event_token and level_name
      if (level.event_token && level.level_name) {
        levels.push(level);
      }
    }

    return levels;
  }

  /**
   * Parse purchase events data from Excel rows
   */
  private static parsePurchaseEventsData(rows: any[][]): Partial<PurchaseEvent>[] {
    if (rows.length < 2) return [];

    const events: Partial<PurchaseEvent>[] = [];
    const headers = rows[0];

    // Find column indices
    const eventTokenIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('event token'));
    const isRestrictedIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('restricted'));
    const maxDaysOffsetIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('max days'));

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const event: Partial<PurchaseEvent> = {};

      if (eventTokenIndex >= 0 && row[eventTokenIndex]) {
        event.event_token = row[eventTokenIndex].toString();
      }

      if (isRestrictedIndex >= 0 && row[isRestrictedIndex] !== undefined) {
        event.is_restricted = row[isRestrictedIndex]?.toString().toLowerCase() === 'yes' ||
          row[isRestrictedIndex]?.toString().toLowerCase() === 'true' ||
          row[isRestrictedIndex] === 1;
      }

      if (maxDaysOffsetIndex >= 0 && row[maxDaysOffsetIndex] !== undefined) {
        const maxDays = parseInt(row[maxDaysOffsetIndex].toString());
        if (!isNaN(maxDays)) {
          event.max_days_offset = maxDays;
        }
      }

      // Only add if we have at least event_token
      if (event.event_token) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Parse accounts data from Excel rows
   */
  private static parseAccountsData(rows: any[][]): Partial<Account>[] {
    if (rows.length < 2) return [];

    const accounts: Partial<Account>[] = [];
    const headers = rows[0];

    // Find column indices
    const nameIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('account'));
    const startDateIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('start date'));
    const startTimeIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('start time'));
    const gameIndex = headers.findIndex(h => h?.toString().toLowerCase().includes('game'));

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const account: Partial<Account> = {};

      if (nameIndex >= 0 && row[nameIndex]) {
        account.name = row[nameIndex].toString();
      }

      if (startDateIndex >= 0 && row[startDateIndex]) {
        account.start_date = row[startDateIndex].toString();
      }

      if (startTimeIndex >= 0 && row[startTimeIndex]) {
        account.start_time = row[startTimeIndex].toString();
      }

      // Game name will be handled separately during import process
      if (gameIndex >= 0 && row[gameIndex]) {
        // Store game name for later resolution
        (account as any)._gameName = row[gameIndex].toString();
      }

      // Only add if we have at least name
      if (account.name) {
        accounts.push(account);
      }
    }

    return accounts;
  }

  /**
   * Import data from Excel file
   */
  static async importFromExcel(): Promise<{ success: boolean; message: string; imported: ImportData }> {
    try {
      console.log('Opening file dialog...');
      const selected = await open({
        filters: [{
          name: 'Excel Files',
          extensions: ['xlsx', 'xls']
        }]
      });

      console.log('Selected file:', selected);

      if (!selected || Array.isArray(selected)) {
        return { success: false, message: 'No file selected', imported: { levels: [], purchaseEvents: [], accounts: [] } };
      }

      console.log('Parsing Excel file:', selected);
      const importData = await this.parseExcelFile(selected as string);

      console.log('Parsed data:', importData);

      return {
        success: true,
        message: `Found ${importData.levels.length} levels, ${importData.purchaseEvents.length} purchase events, ${importData.accounts.length} accounts`,
        imported: importData
      };
    } catch (error) {
      console.error('Import error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        message: `Failed to import Excel file: ${errorMessage}`,
        imported: { levels: [], purchaseEvents: [], accounts: [] }
      };
    }
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
          account.start_time
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

      const getCellStyle = (backgroundColor: string, isHeader: boolean = false, isSynthetic: boolean = false) =>
        this.getCellStyle(backgroundColor, theme, isHeader, isSynthetic);

      const getColumnStyle = (kind: 'level' | 'purchase', isBonus?: boolean, isRestricted?: boolean, isSynthetic?: boolean, isHeader: boolean = false): any => {
        let backgroundColor: string;
        if (kind === 'level') {
          backgroundColor = isBonus ? colorSettings.levelBonus : colorSettings.levelNormal;
        } else {
          backgroundColor = isRestricted ? colorSettings.purchaseRestricted : colorSettings.purchaseUnrestricted;
        }
        return getCellStyle(backgroundColor, isHeader, isSynthetic);
      };

      const formatDateShort = (dateStr?: string): string => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return '-';
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${d.getDate()}-${months[d.getMonth()]}`;
      };

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

      // Create columns array (similar to AccountsDetailPage)
      let columns: any[] = [];
      if (columnsData && columnsData.length > 0) {
        columns = columnsData;
      } else {
        const levelCols = levels.map((l) => ({
          kind: 'level' as const,
          id: l.id,
          token: l.event_token,
          name: l.level_name,
          daysOffset: l.days_offset,
          timeSpent: l.time_spent,
          isBonus: l.is_bonus,
          synthetic: false,
        }));

        const peCols = purchaseEvents.map((p: PurchaseEvent) => ({
          kind: 'purchase' as const,
          id: p.id,
          token: p.event_token,
          name: '$$$',
          isRestricted: (p as any).is_restricted ?? false,
          maxDaysOffset: p.max_days_offset != null ? `Less Than ${p.max_days_offset}` : '-',
          synthetic: false,
        }));

        columns = [...levelCols, ...peCols];
      }

      // Create matrix for date calculations
      const matrix = accounts.map((acc) => {
        const start = parseDate(acc.start_date);
        return columns.map((c) => {
          if (c.kind === 'level' && start) {
            const offset = c.daysOffset !== null && c.daysOffset !== undefined ? Number(c.daysOffset) : 0;
            return formatDateShort(addDays(start, offset).toISOString().split('T')[0]);
          }
          return '-';
        });
      });

      const wsData: any[][] = [];

      if (layout === 'vertical') {
        // Vertical layout: Accounts as rows, Levels as columns
        const headerRow1 = ['Event Token', '', ''];
        const headerRow2 = ['Level Name', '', ''];
        const headerRow3 = ['Days Offset', '', ''];
        const headerRow4 = ['Time Spent (1000 seconds)', '', ''];
        const headerRow5 = ['Account', 'Start Date', 'Start Time'];

        columns.forEach((col) => {
          headerRow1.push(col.token);
          headerRow2.push(col.name);
          headerRow3.push(col.kind === 'level' ? (col.daysOffset !== null && col.daysOffset !== undefined ? col.daysOffset.toString() : '-') : col.maxDaysOffset || '-');
          headerRow4.push(col.kind === 'level' ? (col.timeSpent !== null && col.timeSpent !== undefined ? col.timeSpent.toString() : '-') : '-');
          headerRow5.push('');
        });

        wsData.push(headerRow1, headerRow2, headerRow3, headerRow4, headerRow5);

        accounts.forEach((acc, accIdx) => {
          const row = [acc.name, formatDateShort(acc.start_date), acc.start_time];
          matrix[accIdx].forEach(date => row.push(date));
          wsData.push(row);
        });

        const worksheet = XLSX.utils.aoa_to_sheet(wsData);

        // Apply merging
        (worksheet as any)['!merges'] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
          { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
          { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } },
        ];

        // Apply styling
        const headerStyle = getCellStyle(colorSettings.headerColor, true);
        const dataRowStyle = getCellStyle(colorSettings.dataRowColor);

        for (let r = 0; r < wsData.length; r++) {
          for (let c = 0; c < wsData[r].length; c++) {
            const cellAddress = XLSX.utils.encode_cell({ r, c });
            const cell = (worksheet as any)[cellAddress];
            if (!cell) continue;

            if (r < 5) {
              if (c < 3) {
                cell.s = headerStyle;
              } else {
                const col = columns[c - 3];
                cell.s = getColumnStyle(col.kind, col.isBonus, col.isRestricted, col.synthetic, true);
              }
            } else {
              if (c < 3) {
                cell.s = dataRowStyle;
              } else {
                const col = columns[c - 3];
                const acc = accounts[r - 5];
                const progressKey = `${acc.id}_${col.id}`;
                const progress = col.kind === 'level' ? levelsProgress?.[progressKey] : purchaseProgress?.[progressKey];
                const isCompleted = progress?.is_completed ?? false;
                const bgColor = isCompleted ? colorSettings.completeScheduledStyle : colorSettings.incompleteScheduledStyle;
                cell.s = getCellStyle(bgColor, false, col.synthetic);
              }
            }
          }
        }

        (worksheet as any)['!cols'] = [
          { wch: 20 }, { wch: 12 }, { wch: 10 },
          ...columns.map(() => ({ wch: 12 }))
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, gameName.substring(0, 31));
      } else {
        // Horizontal layout: Levels as rows, Accounts as columns
        const headerRow = ['Event Token', 'Level Name', 'Days Offset', 'Time Spent (1000 seconds)'];
        accounts.forEach(acc => {
          headerRow.push(`${acc.name} (${formatDateShort(acc.start_date)})`);
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

        const headerStyle = getCellStyle(colorSettings.headerColor, true);

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
                cell.s = getColumnStyle(col.kind, col.isBonus, col.isRestricted, col.synthetic, false);
              } else {
                const acc = accounts[c - 4];
                const col = columns[r - 1];
                const progressKey = `${acc.id}_${col.id}`;
                const progress = col.kind === 'level' ? levelsProgress?.[progressKey] : purchaseProgress?.[progressKey];
                const isCompleted = progress?.is_completed ?? false;
                const bgColor = isCompleted ? colorSettings.completeScheduledStyle : colorSettings.incompleteScheduledStyle;
                cell.s = getCellStyle(bgColor, false, col.synthetic);
              }
            }
          }
        }

        (worksheet as any)['!cols'] = [
          { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 25 },
          ...accounts.map(() => ({ wch: 15 }))
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, gameName.substring(0, 31));
      }

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

      return await this.exportToExcelMatrix(levels, purchaseEvents, accounts, gameName, layout, colorSettings, theme, columns, levelsProgress, purchaseProgress);
    } catch (error) {
      console.error('Export game data error:', error);
      return false;
    }
  }

  /**
   * Export all games data with matrix layout
   */
  static async exportAllGamesData(_layout: 'horizontal' | 'vertical', colorSettings: ColorSettings, theme: 'light' | 'dark'): Promise<boolean> {
    // Note: Currently only vertical layout is supported for "All Games" export
    try {
      const games = await TauriService.getGames();
      const allAccounts: Account[] = [];
      const allLevels: Level[] = [];
      const allPurchaseEvents: PurchaseEvent[] = [];

      for (const game of games) {
        const [levels, purchaseEvents, accounts] = await Promise.all([
          TauriService.getGameLevels(game.id),
          TauriService.getGamePurchaseEvents(game.id),
          TauriService.getAccounts(game.id)
        ]);

        // Add game name to accounts for identification
        const accountsWithGame = accounts.map(acc => ({ ...acc, game_name: game.name }));

        allLevels.push(...levels);
        allPurchaseEvents.push(...purchaseEvents);
        allAccounts.push(...accountsWithGame);
      }

      // For "All Games", we'll create separate sheets for each game
      const workbook = XLSX.utils.book_new();

      for (const game of games) {
        const gameLevels = allLevels.filter(l => l.game_id === game.id);
        const gamePurchaseEvents = allPurchaseEvents.filter(p => p.game_id === game.id);
        const gameAccounts = allAccounts.filter(a => (a as any).game_name === game.name);

        // Use the matrix export logic for each game sheet
        await this.addGameSheetToWorkbook(workbook, gameLevels, gamePurchaseEvents, gameAccounts, game.name, colorSettings, theme);
      }

      // Save file
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile('Games.xlsx', buffer);
    } catch (error) {
      console.error('Export all games data error:', error);
      return false;
    }
  }

  /**
   * Helper method to add a game sheet to workbook for "All Games" export
   */
  private static async addGameSheetToWorkbook(
    workbook: XLSX.WorkBook,
    levels: Level[],
    purchaseEvents: PurchaseEvent[],
    accounts: Account[],
    gameName: string,
    colorSettings: ColorSettings,
    theme: 'light' | 'dark'
  ): Promise<void> {
    // Reuse the matrix logic from exportToExcelMatrix
    // This is a simplified version - you might want to refactor to avoid duplication

    // Helper function to parse RGB and get hex for Excel
    const rgbToHex = (rgb: string): string => {
      const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!match) return 'FFFFFF';
      const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
      return `${toHex(Number(match[1]))}${toHex(Number(match[2]))}${toHex(Number(match[3]))}`;
    };

    // Helper function to get text color based on background
    const getTextColor = (backgroundColor: string): string => {
      const rgb = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!rgb) return theme === 'dark' ? 'FFFFFF' : '000000';

      const r = parseInt(rgb[1]);
      const g = parseInt(rgb[2]);
      const b = parseInt(rgb[3]);

      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance < 0.5 ? 'FFFFFF' : '000000';
    };

    // Helper function to get cell style for Excel
    const getCellStyle = (backgroundColor: string, isHeader: boolean = false, isSynthetic: boolean = false) => {
      return {
        fill: { fgColor: { rgb: rgbToHex(backgroundColor) } },
        font: {
          color: { rgb: getTextColor(backgroundColor) },
          bold: isHeader,
          italic: isSynthetic,
        },
        border: {
          top: { style: 'thin', color: { auto: 1 } },
          bottom: { style: 'thin', color: { auto: 1 } },
          left: { style: 'thin', color: { auto: 1 } },
          right: { style: 'thin', color: { auto: 1 } },
        },
        alignment: {
          horizontal: 'center',
          vertical: 'center'
        }
      };
    };

    // Helper function to format date short
    const formatDateShort = (dateStr?: string): string => {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return '-';
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${d.getDate()}-${months[d.getMonth()]}`;
    };

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

    // Create columns array
    const levelCols = levels.map((l) => ({
      kind: 'level' as const,
      id: l.id,
      token: l.event_token,
      name: l.level_name,
      daysOffset: l.days_offset,
      timeSpent: l.time_spent,
      isBonus: l.is_bonus,
      synthetic: false,
    }));

    const peCols = purchaseEvents.map((p: PurchaseEvent) => ({
      kind: 'purchase' as const,
      id: p.id,
      token: p.event_token,
      name: '$$$',
      isRestricted: (p as any).is_restricted ?? false,
      maxDaysOffset: p.max_days_offset != null ? `Less Than ${p.max_days_offset}` : '-',
      synthetic: false,
    }));

    const columns = [...levelCols, ...peCols];

    // Create matrix for date calculations
    const matrix = accounts.map((acc) => {
      const start = parseDate(acc.start_date);
      return columns.map((c) => {
        if (c.kind === 'level' && start) {
          const offset = c.daysOffset !== null && c.daysOffset !== undefined ? Number(c.daysOffset) : 0;
          return formatDateShort(addDays(start, offset).toISOString().split('T')[0]);
        }
        return '-';
      });
    });

    // Create worksheet data for vertical layout
    const wsData: any[][] = [];

    // Header rows
    const headerRow1 = ['Event Token'];
    const headerRow2 = ['Level Name'];
    const headerRow3 = ['Days Offset'];
    const headerRow4 = ['Time Spent (1000 seconds)'];
    const headerRow5 = ['Account', 'Start Date', 'Start Time'];

    // Add column headers
    columns.forEach((col) => {
      headerRow1.push(col.token);
      headerRow2.push(col.name);
      headerRow3.push(col.kind === 'level' ? (col.daysOffset !== null && col.daysOffset !== undefined ? col.daysOffset.toString() : '-') : col.maxDaysOffset || '-');
      headerRow4.push(col.kind === 'level' ? (col.timeSpent !== null && col.timeSpent !== undefined ? col.timeSpent.toString() : '-') : '-');
      headerRow5.push('');
    });

    wsData.push(headerRow1, headerRow2, headerRow3, headerRow4, headerRow5);

    // Add account rows
    accounts.forEach((acc, accIdx) => {
      const row = [acc.name, formatDateShort(acc.start_date), acc.start_time];
      columns.forEach(() => row.push(''));
      wsData.push(row);

      // Add the date matrix row for this account
      const dateRow = ['', '', ''];
      matrix[accIdx].forEach(date => dateRow.push(date));
      wsData.push(dateRow);
    });

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(wsData);

    // Apply styles
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = worksheet[cellAddress];
        if (!cell) continue;

        if (R < 4) { // Header rows (Token, Name, Offset, Time)
          if (C === 0) {
            cell.s = getCellStyle(colorSettings.headerColor, true);
          } else {
            const colIdx = C - 1;
            if (colIdx >= 0 && colIdx < columns.length) {
              const col = columns[colIdx];
              // Use manual column style logic here since getColumnStyle isn't defined in this scope
              // Or duplicate the logic
              let backgroundColor: string;
              if (col.kind === 'level') {
                backgroundColor = col.isBonus ? colorSettings.levelBonus : colorSettings.levelNormal;
              } else {
                backgroundColor = (col as any).isRestricted ? colorSettings.purchaseRestricted : colorSettings.purchaseUnrestricted;
              }
              cell.s = getCellStyle(backgroundColor, true, col.synthetic);
            } else {
              cell.s = getCellStyle(colorSettings.headerColor, true);
            }
          }
        } else if (R === 4) { // Account Header Row
          cell.s = getCellStyle(colorSettings.headerColor, true);
        } else {
          cell.s = getCellStyle(colorSettings.dataRowColor);
        }
      }
    }

    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 20 },
      { wch: 12 },
      { wch: 12 },
      ...columns.map(() => ({ wch: 12 }))
    ];

    // Add worksheet to workbook with game name
    XLSX.utils.book_append_sheet(workbook, worksheet, gameName);
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
          row5.push(item.dateStr);
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
            item.dateStr
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
  /**
   * Helper function to parse RGB and get hex for Excel
   */
  private static rgbToHex(rgb: string): string {
    const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return 'FFFFFF';
    const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
    return `${toHex(Number(match[1]))}${toHex(Number(match[2]))}${toHex(Number(match[3]))}`;
  }

  /**
   * Helper function to get text color based on background
   */
  private static getTextColor(backgroundColor: string, theme: 'light' | 'dark'): string {
    const rgb = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!rgb) return theme === 'dark' ? 'FFFFFF' : '000000';

    const r = parseInt(rgb[1]);
    const g = parseInt(rgb[2]);
    const b = parseInt(rgb[3]);

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5 ? 'FFFFFF' : '000000';
  }

  /**
   * Helper function to get cell style for Excel
   */
  private static getCellStyle(backgroundColor: string, theme: 'light' | 'dark', isHeader: boolean = false, isSynthetic: boolean = false) {
    return {
      fill: { fgColor: { rgb: this.rgbToHex(backgroundColor) } },
      font: {
        color: { rgb: this.getTextColor(backgroundColor, theme) },
        bold: isHeader,
        italic: isSynthetic,
      },
      border: {
        top: { style: 'thin', color: { auto: 1 } },
        bottom: { style: 'thin', color: { auto: 1 } },
        left: { style: 'thin', color: { auto: 1 } },
        right: { style: 'thin', color: { auto: 1 } },
      },
      alignment: {
        horizontal: 'center',
        vertical: 'center'
      }
    };
  }
}
