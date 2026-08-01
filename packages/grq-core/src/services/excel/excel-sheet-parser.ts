// ===== Excel Sheet Parser (orchestrator) =====

import XLSX from 'xlsx-js-style';
import { readExcelFile } from './excel-file-operations';
import type { Level, PurchaseEvent, Account } from '@grq/api-bindings';
import {
  parseCellCompletion,
  parseDMMMDate,
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
    sessionDate?: string;
  }[];
  /**
   * Maps "gameName|accountName" (lowercase) to the Session column date string (e.g. "30-Jul")
   * for every account row parsed from the Excel sheet.
   * Used by the import-persistence layer to complete session-only requests per-account
   * even when the account has no explicit progress entries in data.progress.
   */
  accountSessionDates: Map<string, string>;
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
      progress: [],
      accountSessionDates: new Map<string, string>(),
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

      let gameName = sheetName.trim();
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

          // ===== Multi-group account detail progress parsing =====
          // Iterate through each group independently, using its own
          // column configuration (colHeaders, sessionCol, startCol).
          // This mirrors the group iteration logic in parseAccountsDetailVerticalLayout
          // so that accounts in groups 2+ also get correct session/event parsing.
          let groupPos = 0;
          while (groupPos < matrixData.length) {
            // Skip empty rows
            while (groupPos < matrixData.length && (!matrixData[groupPos] || matrixData[groupPos].length === 0 || !matrixData[groupPos][0])) {
              groupPos++;
            }
            if (groupPos >= matrixData.length) break;

            // Skip branch: header rows
            while (groupPos < matrixData.length && String(matrixData[groupPos]?.[0] ?? '').toLowerCase().startsWith('branch:')) {
              groupPos++;
            }
            if (groupPos + 5 > matrixData.length) break;

            // Basic validity: group header must have event tokens in columns beyond index 0
            const grpValid = matrixData[groupPos]?.some(
              (v: any, ci: number) => ci > 0 && v != null && String(v).trim() && !String(v).toLowerCase().includes('event token'),
            );
            if (!grpValid) { groupPos++; continue; }

            const grpStart = groupPos;

            // Find group end: next branch: row or end of data
            let grpEnd = matrixData.length;
            for (let g = grpStart + 1; g < matrixData.length; g++) {
              if (matrixData[g] && matrixData[g][0] && String(matrixData[g][0]).toLowerCase().startsWith('branch:')) {
                grpEnd = g;
                break;
              }
            }

            // === Build column configuration for this group ===
            const grpHeaders = matrixData.slice(grpStart, Math.min(grpStart + 4, grpEnd));
            const maxCols = Math.max(...grpHeaders.map((r: any[]) => r.length));
            const startCol = detectStartCol(grpHeaders, maxCols);

            const colHeaders: { name: string; isPurchase: boolean; token: string; daysOffset?: number; timeSpent?: number }[] = [];
            for (let col = startCol; col < maxCols; col++) {
              const tokenRaw = matrixData[grpStart] && matrixData[grpStart][col] !== undefined && matrixData[grpStart][col] !== null ? matrixData[grpStart][col] : '';
              const token = tokenRaw.toString().trim();
              const nameRaw = matrixData[grpStart + 1] && matrixData[grpStart + 1][col] !== undefined && matrixData[grpStart + 1][col] !== null ? matrixData[grpStart + 1][col] : '';
              const name = nameRaw.toString().trim();
              const daysOffsetRaw = matrixData[grpStart + 2] && matrixData[grpStart + 2][col] !== undefined && matrixData[grpStart + 2][col] !== null ? matrixData[grpStart + 2][col] : '';
              const daysOffsetStr = daysOffsetRaw.toString().trim();
              const daysOffset = !isNaN(Number(daysOffsetStr)) ? parseInt(daysOffsetStr, 10) : undefined;
              const timeSpentRaw = matrixData[grpStart + 3] && matrixData[grpStart + 3][col] !== undefined && matrixData[grpStart + 3][col] !== null ? matrixData[grpStart + 3][col] : '';
              const timeSpentStr = timeSpentRaw.toString().trim();
              const timeSpentNum = timeSpentStr !== '-' && timeSpentStr !== '' ? Number(timeSpentStr) : NaN;
              const timeSpent = !isNaN(timeSpentNum) && isFinite(timeSpentNum) ? timeSpentNum : undefined;

              // Session-only columns (Level Name "-") share the same base token in
              // the exported matrix (e.g. "lvl" at offsets 0/2/5). Rebuild the full
              // per-day token (e.g. "lvl_day2") so progress entries map back to the
              // correct per-day session level during persistence.
              const isSessionOnlyCol = name === '-';
              const effectiveToken = isSessionOnlyCol && daysOffset !== undefined
                ? `${token.split('_day')[0]}_day${daysOffset}`
                : token;

              if (token && token.toLowerCase() !== 'event token') {
                colHeaders.push({ name, token: effectiveToken, isPurchase: isPurchaseEvent(name, timeSpentStr), daysOffset, timeSpent });
              } else {
                colHeaders.push({ name: '', token: '', isPurchase: false, daysOffset: undefined, timeSpent: undefined });
              }
            }

            // === Find account header row for this group ===
            let accountHeaderRow = -1;
            for (let i = grpStart + 4; i < Math.min(grpStart + 10, grpEnd); i++) {
              if (matrixData[i] && matrixData[i][0] && matrixData[i][0].toString().toLowerCase().includes('account')) {
                accountHeaderRow = i;
                break;
              }
            }

            // === Detect Session column from the account header row ===
            let sessionCol = -1;
            if (accountHeaderRow >= 0 && matrixData[accountHeaderRow]) {
              sessionCol = detectSpecialColumns(matrixData[accountHeaderRow]).sessionCol;
            }

            // === Compute padding target so every data row in this group has all needed columns ===
            const effectiveMinCols = Math.max(
              maxCols,
              sessionCol >= 0 ? sessionCol + 1 : 0,
            );

            const dataRowsStart = accountHeaderRow >= 0 ? accountHeaderRow + 1 : grpStart + 4;

            // === Process account data rows for this group ===
            for (let i = dataRowsStart; i < grpEnd; i++) {
              const row = matrixData[i];
              if (!row || !row[0]) continue;
              const firstCell = row[0].toString().trim();
              const lowerFirst = firstCell.toLowerCase();
              if (lowerFirst.startsWith('branch:') || lowerFirst.includes('event token')) continue;
              if (lowerFirst === 'account' || lowerFirst === 'level name' || lowerFirst === 'days offset' || lowerFirst === 'time spent' || lowerFirst === 'total') continue;
              if (/^\d+$/.test(firstCell) && firstCell.length <= 4) continue;

              // Pad row to effectiveMinCols so session/time/event columns are always accessible
              while (row.length < effectiveMinCols) {
                row.push(undefined);
              }

              const accountName = firstCell;

              let sessionDateStr: string | undefined;
              if (sessionCol >= 0 && row.length > sessionCol && row[sessionCol] !== undefined && row[sessionCol] !== null) {
                const cell = row[sessionCol].toString().trim();
                if (cell !== '-' && cell !== '') sessionDateStr = cell;
              }

              // Record session date for this account so import-persistence can use it
              // even for accounts that produce no progress entries in data.progress.
              if (sessionDateStr) {
                const sessionMapKey = `${gameName.toLowerCase()}|${accountName.toLowerCase()}`;
                result.accountSessionDates.set(sessionMapKey, sessionDateStr);
              }

              let accountStartDate: Date | undefined;
              const parsedDateStr = parseAccountDateStr(row[1]);
              if (parsedDateStr) {
                accountStartDate = new Date(parsedDateStr);
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
              for (let col = startCol; col < row.length && col - startCol < colHeaders.length; col++) {
                const header = colHeaders[col - startCol];
                if (!header || !header.token) continue;

                const cellVal = row[col] ? row[col].toString().trim() : '';
                const { isCompleted, dateStr, hasDateCell } = parseCellCompletion(cellVal);
                rowEvents.push({ header, isCompleted, dateStr, hasDateCell });
              }

              // Session-only ('-') rows are completed by the Session date cutoff:
              // a request scheduled on or before the Session date is completed.
              // Level Events and Purchase Events are EXCLUSIVELY driven by the "(C)"
              // marker — the Session cutoff does not touch them.
              if (sessionDateStr && accountStartDate) {
                const sessionParsed = parseDMMMDate(sessionDateStr, refYear);
                for (const evt of rowEvents) {
                  if (evt.isCompleted) continue;
                  if (evt.header.name !== '-') continue;
                  if (evt.header.daysOffset === undefined) continue;
                  const evtDateStr = computeEvtDateStr(evt.header.daysOffset);
                  if (!evtDateStr) continue;
                  const evtParsed = parseDMMMDate(evtDateStr, refYear);
                  if (!evtParsed || !sessionParsed) continue;
                  if (evtParsed.getTime() <= sessionParsed.getTime()) {
                    evt.isCompleted = true;
                  }
                }
              }

              // Level Events and Purchase Events keep the "(C)" marker result as-is
              // (no cascade, no threshold). Progress entries are emitted for any cell
              // with a date so persistence can explicitly mark it incomplete when it
              // has no "(C)".
              for (const evt of rowEvents) {
                const { isCompleted, header, dateStr, hasDateCell } = evt;

                if (isCompleted || hasDateCell) {
                    result.progress.push({
                      gameName,
                      accountName,
                      levelName: header.isPurchase ? undefined : header.name,
                      purchaseToken: header.isPurchase ? header.token : undefined,
                      token: header.token,
                      isCompleted,
                      completionDate: dateStr || undefined,
                      sessionDate: sessionDateStr || undefined,
                    });
                }
              }
            }

            groupPos = grpEnd;
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
