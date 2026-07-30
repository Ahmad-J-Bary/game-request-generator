// ===== Excel Sheet Parser (orchestrator) =====

import XLSX from 'xlsx-js-style';
import { readExcelFile } from './excel-file-operations';
import type { Level, PurchaseEvent, Account } from '@grq/api-bindings';
import {
  parseCellCompletion,
  dateStrLte,
  computeEventDateStr,
  parseAccountDateStr,
  detectStartCol,
  detectSpecialColumns,
  isPurchaseEvent,
} from './excel-parse-utils';
import {
  parseLevelsData,
  parsePurchaseEventsData,
  parseAccountsData,
} from './excel-simple-parser';
import {
  isAccountsDetailFormat,
  parseAccountsDetailVerticalLayout,
} from './excel-accounts-detail-parser';
import {
  isVerticalGameDetailFormat,
  isHorizontalGameDetailFormat,
  parseVerticalLayoutData,
  parseHorizontalLayoutData,
} from './excel-game-detail-parser';

export interface ImportData {
  levels: Partial<Level>[];
  purchaseEvents: Partial<PurchaseEvent>[];
  accounts: Partial<Account>[];
  progress: {
    gameName?: string;
    accountName: string;
    levelName?: string;
    purchaseToken?: string;
    token: string;
    isCompleted: boolean;
    completionDate?: string;
  }[];
  fullCompletionUpToDate?: string;
  completedToday?: any[];
}

export async function parseExcelFile(filePath: string): Promise<ImportData> {
  try {
    const fileContent = await readExcelFile(filePath);
    const workbook = XLSX.read(fileContent, { type: 'buffer' });

    const result: ImportData = {
      levels: [],
      purchaseEvents: [],
      accounts: [],
      progress: []
    };

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (sheetName === 'Completion_Info') {
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const fullCompletionRow = rows.find(r => r[0] === 'Full Completion Up To Date');
        if (fullCompletionRow && fullCompletionRow[1]) {
          result.fullCompletionUpToDate = fullCompletionRow[1].toString().trim();
        }

        const startIndex = rows.findIndex(r => r[0] === '--- Completed Today Records ---');
        if (startIndex !== -1 && rows.length > startIndex + 2) {
          const records: any[] = [];
          const header = rows[startIndex + 1] as string[];
          for (let i = startIndex + 2; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0 || !row[0]) continue;

            const record: any = {};
            header.forEach((h, idx) => {
              const val = row[idx];
              if (h === 'ID') record.id = val;
              else if (h === 'Account Name') record.accountName = val;
              else if (h === 'Game Name') record.gameName = val;
              else if (h === 'Event Token') record.eventToken = val;
              else if (h === 'Level Name') record.levelName = val;
              else if (h === 'Time Spent') record.timeSpent = val;
              else if (h === 'Completion Time') record.rawTime = val;
              else if (h === 'Completion Date') record.completionDate = val;
              else if (h === 'Level ID') record.levelId = val;
              else if (h === 'Request Type') record.requestType = val;
              else if (h === 'Is Purchase') record.isPurchase = val === 'Yes';
            });

            if (record.rawTime && record.completionDate) {
              try {
                const dateStr = record.completionDate.toString().split('T')[0];
                const timeStr = record.rawTime.toString();
                const fullDate = new Date(`${dateStr} ${timeStr}`);
                if (!isNaN(fullDate.getTime())) {
                  record.completionTime = fullDate.getTime();
                } else {
                  record.completionTime = Date.now();
                }
              } catch (e) {
                record.completionTime = Date.now();
              }
            } else {
              record.completionTime = Date.now();
            }
            delete record.rawTime;

            records.push(record);
          }
          result.completedToday = records;
        }
        continue;
      }

      if (!sheet) continue;

      let gameName = sheetName;
      if (sheetName.endsWith('_Lvl')) {
        gameName = sheetName.substring(0, sheetName.length - 4);
        const levelsData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        const parsedLevels = parseLevelsData(levelsData);
        parsedLevels.forEach(l => (l as any).gameName = gameName);
        result.levels.push(...parsedLevels);
      } else if (sheetName.endsWith('_Evt')) {
        gameName = sheetName.substring(0, sheetName.length - 4);
        const purchaseData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        const parsedEvents = parsePurchaseEventsData(purchaseData);
        parsedEvents.forEach(e => (e as any).gameName = gameName);
        result.purchaseEvents.push(...parsedEvents);
      } else if (sheetName === 'Levels') {
        const levelsData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        result.levels.push(...parseLevelsData(levelsData));
      } else if (sheetName === 'Purchase Events') {
        const purchaseData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        result.purchaseEvents.push(...parsePurchaseEventsData(purchaseData));
      } else if (sheetName === 'Accounts') {
        const accountsData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        result.accounts.push(...parseAccountsData(accountsData));
      } else {
        const matrixData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (isAccountsDetailFormat(matrixData)) {
          const parsedData = parseAccountsDetailVerticalLayout(matrixData);

          parsedData.accounts.forEach(a => (a as any).gameName = gameName);
          parsedData.levels.forEach(l => (l as any).gameName = gameName);
          parsedData.purchaseEvents.forEach(e => (e as any).gameName = gameName);

          result.accounts.push(...parsedData.accounts);
          result.levels.push(...parsedData.levels);
          result.purchaseEvents.push(...parsedData.purchaseEvents);

          let headerOffset = 0;
          while (headerOffset < matrixData.length && String(matrixData[headerOffset]?.[0] ?? '').toLowerCase().startsWith('branch:')) {
            headerOffset++;
          }

          let accountHeaderRow = -1;
          for (let i = headerOffset + 3; i < Math.min(headerOffset + 10, matrixData.length); i++) {
            if (matrixData[i] && matrixData[i][0] && matrixData[i][0].toString().toLowerCase().includes('account')) {
              accountHeaderRow = i;
              break;
            }
          }

          let dataRowsStart = accountHeaderRow !== -1 ? accountHeaderRow + 1 : headerOffset + 4;

          const maxCols = Math.max(...matrixData.slice(headerOffset, headerOffset + 4).map(row => row.length));
          let startCol = detectStartCol(matrixData.slice(headerOffset), maxCols);

          const colHeaders: { name: string; isPurchase: boolean; token: string; daysOffset?: number }[] = [];
          for (let col = startCol; col < maxCols; col++) {
            const tokenRaw = matrixData[headerOffset] && matrixData[headerOffset][col] !== undefined && matrixData[headerOffset][col] !== null ? matrixData[headerOffset][col] : '';
            const token = tokenRaw.toString().trim();
            const nameRaw = matrixData[headerOffset + 1] && matrixData[headerOffset + 1][col] !== undefined && matrixData[headerOffset + 1][col] !== null ? matrixData[headerOffset + 1][col] : '';
            const name = nameRaw.toString().trim();
            const daysOffsetRaw = matrixData[headerOffset + 2] && matrixData[headerOffset + 2][col] !== undefined && matrixData[headerOffset + 2][col] !== null ? matrixData[headerOffset + 2][col] : '';
            const daysOffsetStr = daysOffsetRaw.toString().trim();
            const daysOffset = !isNaN(Number(daysOffsetStr)) ? parseInt(daysOffsetStr, 10) : undefined;
            const timeSpentRaw = matrixData[headerOffset + 3] && matrixData[headerOffset + 3][col] !== undefined && matrixData[headerOffset + 3][col] !== null ? matrixData[headerOffset + 3][col] : '';
            const timeSpentStr = timeSpentRaw.toString().trim();
            if (token && token.toLowerCase() !== 'event token') {
              colHeaders.push({ name, token, isPurchase: isPurchaseEvent(name, timeSpentStr), daysOffset });
            } else {
              colHeaders.push({ name: '', token: '', isPurchase: false, daysOffset: undefined });
            }
          }

          let sessionCol = -1;
          let timeCol = -1;
          if (accountHeaderRow >= 0 && matrixData[accountHeaderRow]) {
            const cols = detectSpecialColumns(matrixData[accountHeaderRow]);
            sessionCol = cols.sessionCol;
            timeCol = cols.timeCol;
          }

          for (let i = dataRowsStart; i < matrixData.length; i++) {
            const row = matrixData[i];
            if (!row || !row[0]) continue;
            const firstCell = row[0].toString().trim();
            if (firstCell.toLowerCase().startsWith('branch:') || firstCell.toLowerCase().includes('event token')) continue;
            const accountName = firstCell;

            let timeValue: number | undefined;
            if (timeCol >= 0 && row.length > timeCol && row[timeCol] !== undefined && row[timeCol] !== null) {
              const cell = row[timeCol].toString().trim();
              if (cell !== '-' && cell !== '') {
                const n = Number(cell);
                if (!isNaN(n) && isFinite(n)) timeValue = n;
              }
            }
            const completionThreshold = timeValue !== undefined ? Math.round(timeValue / 1000) : undefined;

            let sessionDateStr: string | undefined;
            if (sessionCol >= 0 && row.length > sessionCol && row[sessionCol] !== undefined && row[sessionCol] !== null) {
              const cell = row[sessionCol].toString().trim();
              if (cell !== '-' && cell !== '') sessionDateStr = cell;
            }

            let accountStartDate: Date | undefined;
            const parsedDate = parseAccountDateStr(row[1]?.toString().trim() || '');
            if (parsedDate) accountStartDate = new Date(parsedDate);
            if (!accountStartDate) {
              const raw = row[1]?.toString().trim();
              if (raw) {
                const d = new Date(raw);
                if (!isNaN(d.getTime())) accountStartDate = d;
              }
            }

            const computeEvtDateStr = (daysOffset: number): string => {
              if (!accountStartDate) return '';
              return computeEventDateStr(accountStartDate, daysOffset);
            };

            const refYear = accountStartDate?.getFullYear();

            const rowEvents: {
              header: typeof colHeaders[0];
              isCompleted: boolean;
              dateStr: string;
              hasDateCell: boolean;
            }[] = [];
            for (let col = startCol; col < row.length; col++) {
              const header = colHeaders[col - startCol];
              if (!header || !header.token) continue;

              const cellVal = row[col] ? row[col].toString().trim() : '';
              const { isCompleted, dateStr, hasDateCell } = parseCellCompletion(cellVal);
              rowEvents.push({ header, isCompleted, dateStr, hasDateCell });
            }

            if (sessionDateStr && accountStartDate) {
              for (const evt of rowEvents) {
                if (evt.isCompleted) continue;
                if (evt.header.daysOffset === undefined) continue;
                const evtDateStr = computeEvtDateStr(evt.header.daysOffset);
                if (evtDateStr && dateStrLte(evtDateStr, sessionDateStr, refYear)) {
                  evt.isCompleted = true;
                }
              }
            }

            let maxLevelFromC = -1;
            let maxPurchaseFromC = -1;
            for (const evt of rowEvents) {
              if (!evt.isCompleted || evt.header.daysOffset === undefined) continue;
              if (evt.header.isPurchase) {
                if (evt.header.daysOffset > maxPurchaseFromC) maxPurchaseFromC = evt.header.daysOffset;
              } else {
                if (evt.header.daysOffset > maxLevelFromC) maxLevelFromC = evt.header.daysOffset;
              }
            }

            const maxLevelOffset = maxLevelFromC >= 0 ? maxLevelFromC : completionThreshold;
            const maxPurchaseOffset = maxPurchaseFromC >= 0 ? maxPurchaseFromC : completionThreshold;

            for (const evt of rowEvents) {
              let { isCompleted, header, dateStr, hasDateCell } = evt;

              if (!isCompleted && header.daysOffset !== undefined) {
                if (!header.isPurchase && maxLevelOffset !== undefined && header.daysOffset <= maxLevelOffset) {
                  isCompleted = true;
                }
                if (header.isPurchase && maxPurchaseOffset !== undefined && header.daysOffset <= maxPurchaseOffset) {
                  isCompleted = true;
                }
              }

              if (isCompleted || hasDateCell) {
                result.progress.push({
                  gameName,
                  accountName,
                  levelName: header.isPurchase ? undefined : header.name,
                  purchaseToken: header.isPurchase ? header.token : undefined,
                  token: header.token,
                  isCompleted,
                  completionDate: dateStr || undefined
                });
              }
            }
          }
        } else if (isVerticalGameDetailFormat(matrixData)) {
          const parsedData = parseVerticalLayoutData(matrixData);
          parsedData.levels.forEach(l => (l as any).gameName = gameName);
          parsedData.purchaseEvents.forEach(e => (e as any).gameName = gameName);
          result.levels.push(...parsedData.levels);
          result.purchaseEvents.push(...parsedData.purchaseEvents);
        } else if (isHorizontalGameDetailFormat(matrixData)) {
          const parsedData = parseHorizontalLayoutData(matrixData);
          parsedData.levels.forEach(l => (l as any).gameName = gameName);
          parsedData.purchaseEvents.forEach(e => (e as any).gameName = gameName);
          result.levels.push(...parsedData.levels);
          result.purchaseEvents.push(...parsedData.purchaseEvents);
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
