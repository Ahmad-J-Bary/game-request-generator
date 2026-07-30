// ===== Excel Parser Module =====

import XLSX from 'xlsx-js-style';
import { readExcelFile } from './excel-file-operations';
import type { Level, PurchaseEvent, Account } from '@grq/api-bindings';

export interface ImportData {
  levels: Partial<Level>[];
  purchaseEvents: Partial<PurchaseEvent>[];
  accounts: Partial<Account>[];
  progress: {
    gameName?: string;
    accountName: string;
    levelName?: string;
    purchaseToken?: string;
    token: string; // The specific event token for matching
    isCompleted: boolean;
    completionDate?: string;
  }[];
  fullCompletionUpToDate?: string;
  completedToday?: any[];
}

/**
 * Parse Excel file and extract data based on sheet structure
 */
export async function parseExcelFile(filePath: string): Promise<ImportData> {
// ... existing code ...
  try {
    console.log('Reading file:', filePath);
    const fileContent = await readExcelFile(filePath);
    console.log('File content length:', fileContent.length);

    console.log('Parsing workbook...');
    const workbook = XLSX.read(fileContent, { type: 'buffer' });
    console.log('Workbook sheets:', workbook.SheetNames);

    const result: ImportData = {
      levels: [],
      purchaseEvents: [],
      accounts: [],
      progress: []
    };

    // Try to parse data from all sheets
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (sheetName === 'Completion_Info') {
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        // Parse Full Completion Up To Date
        const fullCompletionRow = rows.find(r => r[0] === 'Full Completion Up To Date');
        if (fullCompletionRow && fullCompletionRow[1]) {
          result.fullCompletionUpToDate = fullCompletionRow[1].toString().trim();
        }

        // Parse Completed Today Records
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

            // Convert human-readable time back to timestamp if possible
            if (record.rawTime && record.completionDate) {
              try {
                const dateStr = record.completionDate.toString().split('T')[0];
                const timeStr = record.rawTime.toString();
                const fullDate = new Date(`${dateStr} ${timeStr}`);
                if (!isNaN(fullDate.getTime())) {
                  record.completionTime = fullDate.getTime();
                } else {
                  record.completionTime = Date.now(); // Fallback
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

      // Detect game name from sheet name
      // Logic: SheetName, SheetName_Lvl, or SheetName_Evt
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
        // Assume this is a matrix sheet with account progress
        const matrixData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (isAccountsDetailFormat(matrixData)) {
          const parsedData = parseAccountsDetailVerticalLayout(matrixData);
          
          // Tag everything with game name
          parsedData.accounts.forEach(a => (a as any).gameName = gameName);
          parsedData.levels.forEach(l => (l as any).gameName = gameName);
          parsedData.purchaseEvents.forEach(e => (e as any).gameName = gameName);
          
          // Add to overall results
          result.accounts.push(...parsedData.accounts);
          result.levels.push(...parsedData.levels);
          result.purchaseEvents.push(...parsedData.purchaseEvents);

          // Skip leading Branch rows to calculate offset for header parsing
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

          // Detect startCol for progress parsing based on events header
          const maxCols = Math.max(...matrixData.slice(headerOffset, headerOffset + 4).map(row => row.length));
          let startCol = 0;
          for (let col = 0; col < Math.min(5, maxCols); col++) {
            const valDayRaw = matrixData[headerOffset + 2] && matrixData[headerOffset + 2][col] !== undefined && matrixData[headerOffset + 2][col] !== null ? matrixData[headerOffset + 2][col] : '';
            const valDay = valDayRaw.toString().trim();
            const isDayNumeric = valDay !== '' && !isNaN(Number(valDay));
            const isLess = valDay.toLowerCase().includes('less');
            
            const valTokenRaw = matrixData[headerOffset] && matrixData[headerOffset][col] !== undefined && matrixData[headerOffset][col] !== null ? matrixData[headerOffset][col] : '';
            const valToken = valTokenRaw.toString().trim().toLowerCase();
            const isLabelColumn = valToken === 'event token' || valToken === 'levels' || valToken === '' || valToken.includes(' ');
            
            if ((isDayNumeric || isLess) && !isLabelColumn) {
               startCol = col;
               break;
            }
          }

          const colHeaders: { name: string; isPurchase: boolean; token: string }[] = [];
          for (let col = startCol; col < maxCols; col++) {
            const tokenRaw = matrixData[headerOffset] && matrixData[headerOffset][col] !== undefined && matrixData[headerOffset][col] !== null ? matrixData[headerOffset][col] : '';
            const token = tokenRaw.toString().trim();
            const nameRaw = matrixData[headerOffset + 1] && matrixData[headerOffset + 1][col] !== undefined && matrixData[headerOffset + 1][col] !== null ? matrixData[headerOffset + 1][col] : '';
            const name = nameRaw.toString().trim();
            const timeSpentRaw = matrixData[headerOffset + 3] && matrixData[headerOffset + 3][col] !== undefined && matrixData[headerOffset + 3][col] !== null ? matrixData[headerOffset + 3][col] : '';
            const timeSpentStr = timeSpentRaw.toString().trim();
            if (token && token.toLowerCase() !== 'event token') {
              colHeaders.push({ name, token, isPurchase: name === '$$$' || timeSpentStr === '' || timeSpentStr === '-' });
            } else {
              colHeaders.push({ name: '', token: '', isPurchase: false }); // Empty placeholder to align indices
            }
          }

          for (let i = dataRowsStart; i < matrixData.length; i++) {
            const row = matrixData[i];
            if (!row || !row[0]) continue;
            const firstCell = row[0].toString().trim();
            // Skip Branch rows and header-like rows that appear between branch groups
            if (firstCell.toLowerCase().startsWith('branch:') || firstCell.toLowerCase().includes('event token')) continue;
            const accountName = firstCell;
            
            // Note: startCol here relates to the horizontal shift of the overall matrix.
            // Often Accounts are col 0..3, and progress starts at startCol.
            for (let col = startCol; col < row.length; col++) {
              const cellVal = row[col] ? row[col].toString().trim() : '';
              if (cellVal && cellVal !== '-') {
                let isCompleted = false;
                let dateStr = '';

                if (cellVal.endsWith('(C)')) {
                  isCompleted = true;
                  dateStr = cellVal.replace('(C)', '').trim();
                } else if (/^\d{1,2}-[A-Za-z]{3}$/.test(cellVal)) {
                  // It's a date but not completed (scheduled/incomplete with custom offset)
                  isCompleted = false;
                  dateStr = cellVal;
                }

                if (dateStr) {
                  const header = colHeaders[col - startCol];
                  if (header && header.token) {
                    result.progress.push({
                      gameName,
                      accountName,
                      levelName: header.isPurchase ? undefined : header.name,
                      purchaseToken: header.isPurchase ? header.token : undefined,
                      token: header.token,
                      isCompleted,
                      completionDate: dateStr
                    });
                  }
                }
              }
            }
          }
        } else if (isVerticalGameDetailFormat(matrixData)) {
          console.log(`Detected Vertical Game Detail format in sheet: ${sheetName}`);
          const parsedData = parseVerticalLayoutData(matrixData);
          parsedData.levels.forEach(l => (l as any).gameName = gameName);
          parsedData.purchaseEvents.forEach(e => (e as any).gameName = gameName);
          result.levels.push(...parsedData.levels);
          result.purchaseEvents.push(...parsedData.purchaseEvents);
        } else if (isHorizontalGameDetailFormat(matrixData)) {
          console.log(`Detected Horizontal Game Detail format in sheet: ${sheetName}`);
          const parsedData = parseHorizontalLayoutData(matrixData);
          parsedData.levels.forEach(l => (l as any).gameName = gameName);
          parsedData.purchaseEvents.forEach(e => (e as any).gameName = gameName);
          result.levels.push(...parsedData.levels);
          result.purchaseEvents.push(...parsedData.purchaseEvents);
        }
      }
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
export function parseLevelsData(rows: any[][]): Partial<Level>[] {
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

    // Only add if we have at least event_token
    if (level.event_token) {
      levels.push(level);
    }
  }

  return levels;
}

/**
 * Check if the data is in accounts detail vertical layout format
 */
export function isAccountsDetailFormat(rows: any[][]): boolean {
  if (rows.length < 6) return false;

  // Skip leading Branch rows
  let dataStart = 0;
  while (dataStart < rows.length && String(rows[dataStart]?.[0] ?? '').toLowerCase().startsWith('branch:')) {
    dataStart++;
  }

  if (dataStart + 6 > rows.length) return false;

  // Look for "Account" header in the first column around row 4-7 (relative to dataStart)
  for (let i = dataStart + 4; i < Math.min(dataStart + 8, rows.length); i++) {
    if (rows[i] && rows[i][0] && rows[i][0].toString().toLowerCase().includes('account')) {
      return true;
    }
  }
  return false;
}

/**
 * Check if the data is in vertical game detail format (4 rows)
 */
export function isVerticalGameDetailFormat(rows: any[][]): boolean {
  if (rows.length < 4) return false;

  let dataStart = 0;
  while (dataStart < rows.length && String(rows[dataStart]?.[0] ?? '').toLowerCase().startsWith('branch:')) {
    dataStart++;
  }

  if (dataStart + 4 > rows.length) return false;

  let numberCountRow2 = 0;
  for (let i = 0; i < Math.min(10, rows[dataStart + 2].length); i++) {
     const v = rows[dataStart + 2][i];
     if (v !== undefined && v !== null && String(v).trim() !== '' && (!isNaN(Number(v)) || String(v).toLowerCase().includes('less'))) {
         numberCountRow2++;
     }
  }

  return numberCountRow2 >= 2;
}

/**
 * Check if the data is in horizontal game detail format (headers in row 0)
 */
export function isHorizontalGameDetailFormat(rows: any[][]): boolean {
  if (rows.length < 2) return false;
  const headers = rows[0].map((h: any) => h?.toString().toLowerCase() || '');
  return headers.includes('event token') && 
         headers.includes('level name') && 
         headers.includes('days offset');
}

/**
 * Parse accounts detail vertical layout data (from AccountsDetailPage export)
 */
export function parseAccountsDetailVerticalLayout(rows: any[][]): { levels: Partial<Level>[], purchaseEvents: Partial<PurchaseEvent>[], accounts: Partial<Account>[] } {
  const levels: Partial<Level>[] = [];
  const purchaseEvents: Partial<PurchaseEvent>[] = [];
  const accounts: Partial<Account>[] = [];

  if (rows.length < 6) {
    return { levels, purchaseEvents, accounts };
  }

  // Helper to parse a single account from a row
  const parseAccountRow = (row: any[]): Partial<Account> | null => {
    if (!row || row.length < 3) return null;
    const accountName = row[0] ? String(row[0]).trim() : '';
    if (!accountName) return null;

    // Handle start date
    let startDateStr = '';
    if (row[1]) {
      if (row[1] instanceof Date) {
        startDateStr = (row[1] as Date).toISOString().split('T')[0];
      } else {
        startDateStr = String(row[1]).trim();
      }
    }

    // Handle start time
    let startTimeStr = '';
    if (row[2]) {
      if (row[2] instanceof Date) {
        const timeObj = row[2] as Date;
        const hours = timeObj.getHours().toString().padStart(2, '0');
        const minutes = timeObj.getMinutes().toString().padStart(2, '0');
        const seconds = timeObj.getSeconds().toString().padStart(2, '0');
        startTimeStr = `${hours}:${minutes}:${seconds}`;
      } else {
        startTimeStr = String(row[2]).trim();
      }
    }

    const account: Partial<Account> = {
      name: accountName,
      request_template: 'Needs to be filled in - imported from Excel export',
    };

    // Parse start date
    if (startDateStr) {
      let parsedDate: Date | null = null;

      const slashDateMatch = startDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (slashDateMatch) {
        const month = parseInt(slashDateMatch[1]) - 1;
        const day = parseInt(slashDateMatch[2]);
        const year = parseInt(slashDateMatch[3]);
        parsedDate = new Date(year, month, day);
        if (!isNaN(parsedDate.getTime())) {
          account.start_date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }

      if (!parsedDate && startDateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        parsedDate = new Date(startDateStr);
        if (!isNaN(parsedDate.getTime())) {
          account.start_date = startDateStr;
        }
      }

      if (!parsedDate) {
        const dashDateMatch = startDateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
        if (dashDateMatch) {
          const day = parseInt(dashDateMatch[1]);
          const monthStr = dashDateMatch[2].toLowerCase();
          const year = parseInt(dashDateMatch[3]);
          const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
          const monthIndex = months.indexOf(monthStr);
          if (monthIndex >= 0) {
            parsedDate = new Date(year, monthIndex, day);
            if (!isNaN(parsedDate.getTime())) {
              account.start_date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
          }
        }
      }
    }

    // Parse start time
    if (startTimeStr) {
      let finalTime = '';
      const timeMatch = startTimeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const minutes = timeMatch[2];
        const seconds = timeMatch[3] || '00';
        const ampm = timeMatch[4]?.toUpperCase();
        if (ampm === 'PM' && hours !== 12) hours += 12;
        else if (ampm === 'AM' && hours === 12) hours = 0;
        finalTime = `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
      } else if (startTimeStr.match(/^(\d{1,2}):(\d{2})$/)) {
        finalTime = `${startTimeStr}:00`;
      } else if (startTimeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)) {
        finalTime = startTimeStr;
      }
      if (finalTime) account.start_time = finalTime;
    }

    return account;
  };

  // Helper to parse levels/events from a group's 4 header rows
  const parseLevelsAndEvents = (headerRows: any[][], branchName?: string): { groupLevels: Partial<Level>[], groupEvents: Partial<PurchaseEvent>[] } => {
    const groupLevels: Partial<Level>[] = [];
    const groupEvents: Partial<PurchaseEvent>[] = [];

    if (headerRows.length < 4) return { groupLevels, groupEvents };

    const maxCols = Math.max(...headerRows.map(r => r.length));
    let startCol = 0;
    for (let col = 0; col < Math.min(5, maxCols); col++) {
      const valDayRaw = headerRows[2]?.[col] !== undefined && headerRows[2]?.[col] !== null ? headerRows[2][col] : '';
      const valDay = String(valDayRaw).trim();
      const isDayNumeric = valDay !== '' && !isNaN(Number(valDay));
      const isLess = valDay.toLowerCase().includes('less');
      const valTokenRaw = headerRows[0]?.[col] !== undefined && headerRows[0]?.[col] !== null ? headerRows[0][col] : '';
      const valToken = String(valTokenRaw).trim().toLowerCase();
      const isLabelColumn = valToken === 'event token' || valToken === 'levels' || valToken === '' || valToken.includes(' ');
      if ((isDayNumeric || isLess) && !isLabelColumn) {
        startCol = col;
        break;
      }
    }

    for (let col = startCol; col < maxCols; col++) {
      const eventToken = String(headerRows[0]?.[col] ?? '').trim();
      const levelName = String(headerRows[1]?.[col] ?? '').trim();
      const daysOffsetStr = String(headerRows[2]?.[col] ?? '').trim();
      const timeSpentStr = String(headerRows[3]?.[col] ?? '').trim();

      if (!eventToken || eventToken.toLowerCase() === 'event token') continue;

      if (levelName === '$$$' || timeSpentStr === '-' || timeSpentStr === '') {
        const pe: Partial<PurchaseEvent> = { event_token: eventToken, level_name: levelName !== '$$$' ? levelName : '', is_restricted: false };
        if (daysOffsetStr.toLowerCase().includes('less than')) {
          const m = daysOffsetStr.match(/less than (\d+)/i);
          if (m) pe.max_days_offset = parseInt(m[1], 10);
        } else {
          const d = parseInt(daysOffsetStr, 10);
          if (!isNaN(d)) pe.max_days_offset = d;
          else { const n = Number(daysOffsetStr); if (!isNaN(n) && isFinite(n)) pe.max_days_offset = Math.floor(n); }
        }
        (pe as any).branchName = branchName;
        groupEvents.push(pe);
      } else {
        const lvl: Partial<Level> = { event_token: eventToken, level_name: levelName };
        if (daysOffsetStr !== '-' && daysOffsetStr !== '') {
          const d = parseInt(daysOffsetStr, 10);
          if (!isNaN(d)) lvl.days_offset = d;
          else { const n = Number(daysOffsetStr); if (!isNaN(n) && isFinite(n)) lvl.days_offset = Math.floor(n); }
        }
        if (timeSpentStr !== '-' && timeSpentStr !== '') {
          const t = parseInt(timeSpentStr);
          if (!isNaN(t)) lvl.time_spent = t;
        } else {
          lvl.time_spent = lvl.time_spent || 0;
        }
        lvl.is_bonus = false;
        if (lvl.event_token && lvl.level_name && lvl.days_offset != null && lvl.time_spent != null) {
          (lvl as any).branchName = branchName;
          groupLevels.push(lvl);
        }
      }
    }

    return { groupLevels, groupEvents };
  };

  // Multi-branch loop
  let i = 0;
  let currentBranchName: string | undefined;

  while (i < rows.length) {
    // Skip empty rows
    while (i < rows.length && (!rows[i] || rows[i].length === 0 || !rows[i][0])) {
      i++;
    }
    if (i >= rows.length) break;

    // Capture branch name
    currentBranchName = undefined;
    const branchRowRaw = rows[i]?.[0];
    if (branchRowRaw) {
      const branchStr = String(branchRowRaw).trim();
      if (branchStr.toLowerCase().startsWith('branch:')) {
        const colonIdx = branchStr.indexOf(':');
        if (colonIdx >= 0) {
          currentBranchName = branchStr.substring(colonIdx + 1).trim() || undefined;
        }
      }
    }

    // Skip all Branch rows
    while (i < rows.length && String(rows[i]?.[0] ?? '').toLowerCase().startsWith('branch:')) {
      i++;
    }

    // Need at least 5 more rows: Event Token, Level Name, Days Offset, Time Spent, Account header
    if (i + 5 > rows.length) break;

    // Verify first 4 rows look like header (Event Token row has some non-token values)
    const groupHeaders = rows.slice(i, i + 5);
    const hasToken = groupHeaders[0]?.some((v: any) => v && String(v).trim() && !String(v).toLowerCase().includes('event token'));
    if (!hasToken) { i++; continue; }

    // Parse levels/events from first 4 rows
    const { groupLevels, groupEvents } = parseLevelsAndEvents(rows.slice(i, i + 4), currentBranchName);
    levels.push(...groupLevels);
    purchaseEvents.push(...groupEvents);

    // Find Account header within the group (should be row i+4, but scan flexibly)
    let accountRowIdx = -1;
    for (let j = i + 4; j < Math.min(i + 10, rows.length); j++) {
      if (rows[j] && rows[j][0] && String(rows[j][0]).toLowerCase().includes('account')) {
        accountRowIdx = j;
        break;
      }
    }
    if (accountRowIdx === -1) { i += 5; continue; }

    // Find end of this branch group: next Branch row or end of rows
    let groupEnd = rows.length;
    for (let j = accountRowIdx + 1; j < rows.length; j++) {
      const r = rows[j];
      if (!r || r.length === 0) continue;
      if (String(r[0] ?? '').toLowerCase().startsWith('branch:')) {
        groupEnd = j;
        break;
      }
    }

    // Parse accounts from rows after Account header until group end
    for (let j = accountRowIdx + 1; j < groupEnd; j++) {
      const account = parseAccountRow(rows[j]);
      if (account) {
        (account as any).branchName = currentBranchName;
        accounts.push(account);
      }
    }

    // Advance past this group
    i = groupEnd;
  }

  return { levels, purchaseEvents, accounts };
}

/**
 * Parse horizontal layout data (from GameDetailPage export)
 */
export function parseHorizontalLayoutData(rows: any[][]): { levels: Partial<Level>[], purchaseEvents: Partial<PurchaseEvent>[] } {
  const levels: Partial<Level>[] = [];
  const purchaseEvents: Partial<PurchaseEvent>[] = [];
  
  if (rows.length < 2) return { levels, purchaseEvents };

  const headers = rows[0].map((h: any) => h?.toString().toLowerCase() || '');
  
  const eventTokenIndex = headers.indexOf('event token');
  const levelNameIndex = headers.indexOf('level name');
  const daysOffsetIndex = headers.indexOf('days offset');
  const timeSpentIndex = headers.indexOf('time spent (1000 seconds)');

  if (eventTokenIndex === -1) return { levels, purchaseEvents };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || !row[eventTokenIndex]) continue;

    const token = row[eventTokenIndex].toString().trim();
    const name = row[levelNameIndex]?.toString().trim() || '';
    const daysOffsetStr = row[daysOffsetIndex]?.toString().trim() || '';
    const timeSpentStr = row[timeSpentIndex]?.toString().trim() || '';

    if (name === '$$$' || timeSpentStr === '-' || timeSpentStr === '') {
      // Purchase event
      const purchaseEvent: Partial<PurchaseEvent> = {
        event_token: token,
        level_name: name !== '$$$' ? name : '',
        is_restricted: false,
      };

      if (daysOffsetStr.toLowerCase().includes('less than')) {
        const match = daysOffsetStr.match(/less than (\d+)/i);
        if (match) purchaseEvent.max_days_offset = parseInt(match[1]);
      } else {
        const val = parseInt(daysOffsetStr);
        if (!isNaN(val)) purchaseEvent.max_days_offset = val;
      }
      purchaseEvents.push(purchaseEvent);
    } else {
      // Level
      const level: Partial<Level> = {
        event_token: token,
        level_name: name,
      };

      const dOffset = parseInt(daysOffsetStr);
      if (!isNaN(dOffset)) level.days_offset = dOffset;

      const tSpent = parseInt(timeSpentStr);
      if (!isNaN(tSpent)) level.time_spent = tSpent;

      level.is_bonus = name.toLowerCase().includes('bonus') ||
                      name.toLowerCase().includes('extra') ||
                      name.match(/\+\d+/) !== null;

      levels.push(level);
    }
  }

  return { levels, purchaseEvents };
}

/**
 * Parse vertical layout data (from GameDetailPage export)
 */
export function parseVerticalLayoutData(rows: any[][]): { levels: Partial<Level>[], purchaseEvents: Partial<PurchaseEvent>[] } {
  const levels: Partial<Level>[] = [];
  const purchaseEvents: Partial<PurchaseEvent>[] = [];

  if (rows.length < 4) {
    return { levels, purchaseEvents };
  }

  // Parse all branch groups (skip "Branch:" rows, find 4-row header blocks)
  let i = 0;
  let currentBranchName: string | undefined;
  while (i < rows.length) {
    // Capture branch name from current row before skipping
    currentBranchName = undefined;
    const branchRowRaw = rows[i]?.[0];
    if (branchRowRaw) {
      const branchStr = String(branchRowRaw).trim();
      if (branchStr.toLowerCase().startsWith('branch:')) {
        const colonIdx = branchStr.indexOf(':');
        if (colonIdx >= 0) {
          currentBranchName = branchStr.substring(colonIdx + 1).trim() || undefined;
        }
      }
    }

    // Skip branch header rows
    while (i < rows.length && String(rows[i]?.[0] ?? '').toLowerCase().startsWith('branch:')) {
      i++;
    }

    if (i + 4 > rows.length) break;

    const groupRows = rows.slice(i, i + 4);

    // Verify this looks like a valid header group (row 0 has tokens, row 2 has numbers)
    const hasToken = groupRows[0]?.some((v: any) => v && String(v).trim() && !String(v).toLowerCase().includes('event token'));
    let hasNumericOffset = false;
    if (groupRows[2]) {
      for (let c = 0; c < Math.min(10, groupRows[2].length); c++) {
        const v = groupRows[2][c];
        if (v !== undefined && v !== null && String(v).trim() !== '' && (!isNaN(Number(v)) || String(v).toLowerCase().includes('less'))) {
          hasNumericOffset = true;
          break;
        }
      }
    }
    if (!hasToken || !hasNumericOffset) {
      i++;
      continue;
    }

    const maxCols = Math.max(...groupRows.map(row => row.length));

    let startCol = 0;
    for (let col = 0; col < Math.min(5, maxCols); col++) {
      const valDayRaw = groupRows[2] && groupRows[2][col] !== undefined && groupRows[2][col] !== null ? groupRows[2][col] : '';
      const valDay = valDayRaw.toString().trim();
      const isDayNumeric = valDay !== '' && !isNaN(Number(valDay));
      const isLess = valDay.toLowerCase().includes('less');

      const valTokenRaw = groupRows[0] && groupRows[0][col] !== undefined && groupRows[0][col] !== null ? groupRows[0][col] : '';
      const valToken = valTokenRaw.toString().trim().toLowerCase();
      const isLabelColumn = valToken === 'event token' || valToken === 'levels' || valToken === '' || valToken.includes(' ');

      if ((isDayNumeric || isLess) && !isLabelColumn) {
         startCol = col;
         break;
      }
    }

    for (let col = startCol; col < maxCols; col++) {
      const eventTokenRaw = groupRows[0] && groupRows[0][col] !== undefined && groupRows[0][col] !== null ? groupRows[0][col] : '';
      const eventToken = eventTokenRaw.toString().trim();
      const levelNameRaw = groupRows[1] && groupRows[1][col] !== undefined && groupRows[1][col] !== null ? groupRows[1][col] : '';
      const levelName = levelNameRaw.toString().trim();
      const daysOffsetRaw = groupRows[2] && groupRows[2][col] !== undefined && groupRows[2][col] !== null ? groupRows[2][col] : '';
      const daysOffsetStr = daysOffsetRaw.toString().trim();
      const timeSpentRaw = groupRows[3] && groupRows[3][col] !== undefined && groupRows[3][col] !== null ? groupRows[3][col] : '';
      const timeSpentStr = timeSpentRaw.toString().trim();

      if (!eventToken || eventToken.toLowerCase() === 'event token' || eventToken.toLowerCase() === 'levels') continue;

      if (levelName === '$$$' || timeSpentStr === '-' || timeSpentStr === '') {
        const purchaseEvent: Partial<PurchaseEvent> = {
          event_token: eventToken,
          level_name: levelName !== '$$$' ? levelName : '',
          is_restricted: false,
        };

        if (daysOffsetStr && daysOffsetStr.toLowerCase().includes('less than')) {
          const match = daysOffsetStr.match(/less than (\d+)/i);
          if (match) {
            purchaseEvent.max_days_offset = parseInt(match[1]);
          }
        } else {
          const daysOffset = parseInt(daysOffsetStr);
          if (!isNaN(daysOffset)) {
            purchaseEvent.max_days_offset = daysOffset;
          }
        }

        (purchaseEvent as any).branchName = currentBranchName;
        purchaseEvents.push(purchaseEvent);
      } else {
        const level: Partial<Level> = {
          event_token: eventToken,
          level_name: levelName,
        };

        if (daysOffsetStr !== '-' && daysOffsetStr !== '') {
          const daysOffset = parseInt(daysOffsetStr);
          if (!isNaN(daysOffset)) {
            level.days_offset = daysOffset;
          }
        }

        if (timeSpentStr !== '-' && timeSpentStr !== '') {
          const timeSpent = parseInt(timeSpentStr);
          if (!isNaN(timeSpent)) {
            level.time_spent = timeSpent;
          }
        }

        level.is_bonus = levelName.toLowerCase().includes('bonus') ||
          levelName.toLowerCase().includes('extra') ||
          levelName.match(/\+\d+/) !== null;

        if (level.level_name) {
          (level as any).branchName = currentBranchName;
          levels.push(level);
        }
      }
    }

    i += 4;
  }

  return { levels, purchaseEvents };
}

/**
 * Parse purchase events data from Excel rows
 */
export function parsePurchaseEventsData(rows: any[][]): Partial<PurchaseEvent>[] {
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
export function parseAccountsData(rows: any[][]): Partial<Account>[] {
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

