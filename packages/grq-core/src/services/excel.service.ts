// src/services/excel.service.ts
// Main Excel Service Facade - Delegates to decomposed modules

import XLSX from 'xlsx-js-style';
import { TauriService } from './tauri.service';
import type { Game, Account, Level, PurchaseEvent, CompletedDailyTask } from '@grq/api-bindings';
import type { ExcelColorSettings as ColorSettings } from '../types/excel';

// Import decomposed modules
import { saveExcelFile } from './excel/excel-file-operations';
import { parseExcelFile, type ImportData } from './excel/excel-parser';
import { importFromExcel } from './excel/excel-import';
import { getCellStyle } from './excel/excel-styling';
import { formatTimeAMPM, sortAccountsByDate } from './excel/excel-date-utils';
import { buildColumns, filterStandaloneSessionLevels } from './excel/excel-column-builder';
import { generateGameMatrixData, buildGameDetailSheetData, buildAccountDetailSheetData } from './excel/excel-export-sheet-builder';

export type { ImportData };

export interface ExportData {
  levels?: Level[];
  purchaseEvents?: PurchaseEvent[];
  accounts?: Account[];
  game?: Game;
}

export class ExcelService {
  private static async saveFile(filename: string, buffer: any): Promise<boolean> {
    return saveExcelFile(filename, buffer);
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

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile(filename, buffer);
    } catch (error) {
      console.error('Export error:', error);
      return false;
    }
  }

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

  static async exportGameDetailData(gameId: number, layout: 'horizontal' | 'vertical', colorSettings: ColorSettings, theme: 'light' | 'dark', data?: any): Promise<boolean> {
    try {
      const game = await TauriService.getGameById(gameId);
      const gameName = game?.name || 'Game';

      let finalData = data;
      let levels: Level[] = [];
      let purchaseEvents: PurchaseEvent[] = [];

      if (!data) {
        levels = await TauriService.getGameLevels(gameId);
        purchaseEvents = await TauriService.getGamePurchaseEvents(gameId);
      }

      return await this.exportGameDetailToExcel(levels, purchaseEvents, gameName, layout, colorSettings, theme, finalData);
    } catch (error) {
      console.error('Export game detail data error:', error);
      return false;
    }
  }

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
    mode: 'event-only' | 'all' = 'event-only',
    taskHistory?: CompletedDailyTask[]
  ): Promise<boolean> {
    try {
      const workbook = XLSX.utils.book_new();

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

      const { wsData, merges, cols } = generateGameMatrixData(
        levels,
        purchaseEvents,
        accounts,
        columns,
        layout,
        colorSettings,
        theme,
        getCellStyle,
        levelsProgressRecord,
        purchaseProgressRecord,
        undefined,
        taskHistory
      );

      const worksheet = XLSX.utils.aoa_to_sheet(wsData);
      (worksheet as any)['!merges'] = merges;
      (worksheet as any)['!cols'] = cols;

      XLSX.utils.book_append_sheet(workbook, worksheet, gameName.substring(0, 31));

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile(`${gameName}.xlsx`, buffer);
    } catch (error) {
      console.error('Export matrix error:', error);
      return false;
    }
  }

  static async exportGameData(gameId: number, layout: 'horizontal' | 'vertical', colorSettings: ColorSettings, theme: 'light' | 'dark', columns?: any[], levelsProgress?: any, purchaseProgress?: any, branchId?: number, mode: 'event-only' | 'all' = 'event-only'): Promise<boolean> {
    try {
      const game = await TauriService.getGameById(gameId);
      const gameName = game?.name || 'Game';
      const taskHistory = await TauriService.getTaskHistory();

      if (branchId) {
        const [levels, purchaseEvents, accounts] = await Promise.all([
          TauriService.getGameLevels(branchId),
          TauriService.getGamePurchaseEvents(branchId),
          TauriService.getAccounts(gameId).then(accs => accs.filter(a => a.branch_id === branchId))
        ]);

        const sortedAccounts = sortAccountsByDate(accounts);
        return await this.exportToExcelMatrix(levels, purchaseEvents, sortedAccounts, gameName, layout, colorSettings, theme, columns, levelsProgress, purchaseProgress, mode, taskHistory);
      }

      const branches = await TauriService.getGameBranches(gameId);
      if (branches.length === 0) return false;

      const workbook = XLSX.utils.book_new();
      let masterWsData: any[][] = [];
      let masterMerges: any[] = [];
      let masterCols: any[] = [];

      const allAccounts = await TauriService.getAccounts(gameId);
      const branchesWithAccounts = branches.filter(b => allAccounts.some(a => a.branch_id === b.id));
      if (branchesWithAccounts.length === 0) return false;
      const showBranchTitles = branchesWithAccounts.length > 1;

      for (const branch of branchesWithAccounts) {
        const accounts = allAccounts.filter(a => a.branch_id === branch.id);
        const [levels, purchaseEvents] = await Promise.all([
          TauriService.getGameLevels(branch.id),
          TauriService.getGamePurchaseEvents(branch.id),
        ]);

        const sortedAccounts = sortAccountsByDate(accounts);
        const branchColumns = buildColumns(levels, purchaseEvents);

        let filteredColumns = branchColumns;
        if (mode === 'event-only') {
           filteredColumns = branchColumns.filter(c => !(c.kind === 'level' && c.name === '-'));
        }
        const finalColumns = [...filteredColumns.filter(c => c.kind === 'level'), ...filteredColumns.filter(c => c.kind === 'purchase')];

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
            masterWsData.push([]);
        }

        const { wsData, merges, cols } = generateGameMatrixData(
          levels,
          purchaseEvents,
          sortedAccounts,
          finalColumns,
          layout,
          colorSettings,
          theme,
          getCellStyle,
          effectiveLevelsProgress,
          effectivePurchaseProgress,
          showBranchTitles ? branch.name : undefined,
          taskHistory
        );

        const adjustedMerges = merges.map(m => ({
            s: { r: m.s.r + currentOffset + (currentOffset > 0 ? 1 : 0), c: m.s.c },
            e: { r: m.e.r + currentOffset + (currentOffset > 0 ? 1 : 0), c: m.e.c }
        }));

        masterWsData.push(...wsData);
        masterMerges.push(...adjustedMerges);

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

  private static async generateAllGamesWorkbook(layout: 'horizontal' | 'vertical', colorSettings: ColorSettings, theme: 'light' | 'dark', mode: 'event-only' | 'all' = 'event-only'): Promise<any> {
    try {
      const games = await TauriService.getGames();
      const workbook = XLSX.utils.book_new();

      for (const game of games) {
        const branches = await TauriService.getGameBranches(game.id);
        if (branches.length === 0) continue;

        let masterWsData: any[][] = [];
        let masterMerges: any[] = [];
        let masterCols: any[] = [];
        const taskHistory = await TauriService.getTaskHistory();

        const sheetBaseName = game.name.substring(0, 27);

        const allAccounts = await TauriService.getAccounts(game.id);
        const branchesWithAccounts = branches.filter(b => allAccounts.some(a => a.branch_id === b.id));
        if (branchesWithAccounts.length === 0) continue;
        const showBranchTitles = branchesWithAccounts.length > 1;

        for (const branch of branchesWithAccounts) {
          const accounts = allAccounts.filter(a => a.branch_id === branch.id);
          const [levels, purchaseEvents] = await Promise.all([
            TauriService.getGameLevels(branch.id),
            TauriService.getGamePurchaseEvents(branch.id)
          ]);

          const sortedAccounts = sortAccountsByDate(accounts);

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

          const filteredLevels =
            mode === 'event-only'
              ? levels.filter((l) => l.level_name !== '-')
              : filterStandaloneSessionLevels(levels);

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
              name: p.level_name || '$$$',
              isRestricted,
              daysOffset: formattedDaysOffset,
              synthetic: false,
            };
          });

          const columns = [...levelCols, ...peCols];

          const currentOffset = masterWsData.length;
          const separatorRowsCount = currentOffset > 0 ? 1 : 0;
          if (separatorRowsCount > 0) {
              masterWsData.push([]);
          }

          const { wsData, merges, cols } = generateGameMatrixData(
            levels,
            purchaseEvents,
            sortedAccounts,
            columns,
            layout,
            colorSettings,
            theme,
            getCellStyle,
            levelsProgress,
            purchaseProgress,
            showBranchTitles ? branch.name : undefined,
            taskHistory
          );

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

      }

      return workbook;
    } catch (error) {
      console.error('Generate all games workbook error:', error);
      return null;
    }
  }

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

      let dataGroups: Array<{ branchName?: string; columns: any[] }> = [];

      if (Array.isArray(columns) && columns.length > 0) {
        if ('branchName' in columns[0]) {
          dataGroups = columns as Array<{ branchName: string; columns: any[] }>;
        } else {
          dataGroups = [{ columns }];
        }
      } else {
        const fallbackColumns = [
          ...levels.map(l => ({ kind: 'level', token: l.event_token.split('_day')[0], name: l.level_name, daysOffset: l.days_offset, timeSpent: l.time_spent, isBonus: l.is_bonus, synthetic: l.level_name === '-' })),
          ...purchaseEvents.map(p => {
            const isRestricted = (p as any).is_restricted ?? false;
            const base = (p as any).days_offset !== undefined && (p as any).days_offset !== null ? String((p as any).days_offset) : '-';
            let formattedOffset = base;
            if (isRestricted && p.max_days_offset != null) {
                formattedOffset = `${base} (Less Than ${p.max_days_offset})`;
            }
            return { kind: 'purchase', token: p.event_token, name: p.level_name || '$$$', daysOffset: formattedOffset, timeSpent: '-', isRestricted: isRestricted, synthetic: false };
          })
        ];
        dataGroups = [{ columns: fallbackColumns }];
      }

      const { wsData, merges } = buildGameDetailSheetData(dataGroups, layout, colorSettings, theme, getCellStyle);

      const worksheet = XLSX.utils.aoa_to_sheet(wsData);
      (worksheet as any)['!merges'] = merges;

      worksheet['!cols'] = [
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 20 },
        ...Array(Math.max(0, (layout === 'vertical' ? wsData[0].length - 4 : 0))).fill({ wch: 12 })
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, gameName);

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile(`${gameName}_Details.xlsx`, buffer);
    } catch (error) {
      console.error('Export game detail error:', error);
      return false;
    }
  }

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

      const { wsData } = buildAccountDetailSheetData(
        account, levels, purchaseEvents, layout, colorSettings, theme, getCellStyle,
        columns, levelsProgress, purchaseProgress
      );

      const worksheet = XLSX.utils.aoa_to_sheet(wsData);
      worksheet['!cols'] = [
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 25 },
        { wch: 15 },
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

  static async exportAllGamesDetailData(
    layout: 'horizontal' | 'vertical',
    colorSettings: ColorSettings,
    theme: 'light' | 'dark',
    allGamesData: Array<{ gameId: number; gameName: string; branches: Array<{ branchName: string; columns: any[] }> }>
  ): Promise<boolean> {
    try {
      const workbook = XLSX.utils.book_new();

      for (const gameData of allGamesData) {
        const sheetName = gameData.gameName.substring(0, 31);

        const dataGroups = gameData.branches.map(b => ({
          branchName: b.branchName,
          columns: b.columns
        }));

        const { wsData, merges } = buildGameDetailSheetData(
          dataGroups, layout, colorSettings, theme, getCellStyle
        );

        const worksheet = XLSX.utils.aoa_to_sheet(wsData);
        (worksheet as any)['!merges'] = merges;

        worksheet['!cols'] = [
          { wch: 15 },
          { wch: 12 },
          { wch: 12 },
          { wch: 20 },
          ...Array(Math.max(0, (layout === 'vertical' ? (wsData[0]?.length || 4) - 4 : 0))).fill({ wch: 12 })
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return await this.saveFile('All_Games_Details.xlsx', buffer);
    } catch (error) {
      console.error('Export all games detail data error:', error);
      return false;
    }
  }
}
