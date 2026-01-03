// ===== Excel Parser Module =====

import XLSX from 'xlsx-js-style';
import { readExcelFile } from './excel-file-operations';
import type { Level, PurchaseEvent, Account } from '../../types';

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
  }[];
  fullCompletionUpToDate?: string;
  completedToday?: any[];
}

/**
 * Parse Excel file and extract data based on sheet structure
 */
export async function parseExcelFile(filePath: string): Promise<ImportData> {
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
          
          // Add to overall results
          result.accounts.push(...parsedData.accounts);
          
          // For matrix sheets, if it's the only sheet or dedicated ones are missing, 
          // we might want results from it. However, with the new 3-sheet format,
          // it's safer to only take accounts from here and definitions from _Lvl/_Evt.
          if (workbook.SheetNames.length === 1) {
            result.levels.push(...parsedData.levels);
            result.purchaseEvents.push(...parsedData.purchaseEvents);
          }

          // Extract progress (completion markers)
          // Matrix rows start after accountHeaderRow
          let accountHeaderRow = -1;
          for (let i = 4; i < matrixData.length; i++) {
            if (matrixData[i] && matrixData[i][0] && matrixData[i][0].toString().toLowerCase().includes('account')) {
              accountHeaderRow = i;
              break;
            }
          }

          if (accountHeaderRow !== -1) {
            // Level/Event headers are in rows 0 and 1
            const maxCols = Math.max(...matrixData.slice(0, accountHeaderRow).map(row => row.length));
            const colHeaders: { name: string; isPurchase: boolean; token: string }[] = [];
            
            for (let col = 4; col < maxCols; col++) {
              const token = matrixData[0] && matrixData[0][col] ? matrixData[0][col].toString().trim() : '';
              const name = matrixData[1] && matrixData[1][col] ? matrixData[1][col].toString().trim() : '';
              if (token) {
                colHeaders.push({ name, token, isPurchase: name === '$$$' });
              }
            }

            for (let i = accountHeaderRow + 1; i < matrixData.length; i++) {
              const row = matrixData[i];
              if (!row || !row[0]) continue;
              const accountName = row[0].toString().trim();
              
              for (let col = 4; col < row.length; col++) {
                const cellVal = row[col] ? row[col].toString().trim() : '';
                if (cellVal.endsWith('(C)')) {
                  const header = colHeaders[col - 4];
                  if (header) {
                    result.progress.push({
                      gameName,
                      accountName,
                      levelName: header.isPurchase ? undefined : header.name,
                      purchaseToken: header.isPurchase ? header.token : undefined,
                      token: header.token,
                      isCompleted: true
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    // Try to parse data from all sheets
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
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
          parsedData.accounts.forEach(a => (a as any).gameName = gameName);
          // For matrix sheets, the levels/events are often just progress, 
          // but if it's the only sheet, we take everything.
          // If we have _Lvl/_Evt sheets, we prefer those for definitions.
          result.accounts.push(...parsedData.accounts);
          
          // Only add levels/events from matrix if we haven't found dedicated sheets for this game
          // OR if this is the only sheet.
          if (workbook.SheetNames.length === 1) {
            result.levels.push(...parsedData.levels);
            result.purchaseEvents.push(...parsedData.purchaseEvents);
          }
        }
      }
    }

    // Deduplicate any data if overlapping (simple approach)
    // ... logic could be added here if needed ...

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

  // Look for "Account" header in the first column around row 5-6
  for (let i = 4; i < Math.min(8, rows.length); i++) {
    if (rows[i] && rows[i][0] && rows[i][0].toString().toLowerCase().includes('account')) {
      return true;
    }
  }
  return false;
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

  // Find the account header row
  let accountHeaderRow = -1;
  for (let i = 4; i < rows.length; i++) {
    if (rows[i] && rows[i][0] && rows[i][0].toString().toLowerCase().includes('account')) {
      accountHeaderRow = i;
      break;
    }
  }

  if (accountHeaderRow === -1) {
    // Fallback to game detail parsing if no account section found
    const gameData = parseVerticalLayoutData(rows);
    return { levels: gameData.levels, purchaseEvents: gameData.purchaseEvents, accounts };
  }

  // Parse levels and purchase events (rows 0-3 before account header)
  const maxCols = Math.max(...rows.slice(0, accountHeaderRow).map(row => row.length));
  // Skip the first 4 columns (Account, Start Date, Start Time, Last Completed Token)
  for (let col = 4; col < maxCols; col++) {
    const eventToken = rows[0] && rows[0][col] ? rows[0][col].toString().trim() : '';
    const levelName = rows[1] && rows[1][col] ? rows[1][col].toString().trim() : '';
    const daysOffsetCell = rows[2] && rows[2][col];
    const daysOffsetStr = daysOffsetCell != null ? daysOffsetCell.toString().trim() : '';
    const timeSpentCell = rows[3] && rows[3][col];
    const timeSpentStr = timeSpentCell != null ? timeSpentCell.toString().trim() : '';

    if (!eventToken) continue;

    if (levelName === '$$$') {
      // Purchase event
      const purchaseEvent: Partial<PurchaseEvent> = {
        event_token: eventToken,
        is_restricted: false,
      };

      if (daysOffsetStr && daysOffsetStr.toLowerCase().includes('less than')) {
        const match = daysOffsetStr.match(/less than (\d+)/i);
        if (match) {
          purchaseEvent.max_days_offset = parseInt(match[1], 10);
        }
      } else {
        const daysOffset = parseInt(daysOffsetStr, 10);
        if (!isNaN(daysOffset)) {
          purchaseEvent.max_days_offset = daysOffset;
        } else {
          const numValue = Number(daysOffsetStr);
          if (!isNaN(numValue) && isFinite(numValue)) {
            purchaseEvent.max_days_offset = Math.floor(numValue);
          }
        }
      }

      purchaseEvents.push(purchaseEvent);
    } else {
      // Level
      const level: Partial<Level> = {
        event_token: eventToken,
        level_name: levelName,
      };

      if (daysOffsetStr !== '-' && daysOffsetStr !== '') {
        const daysOffset = parseInt(daysOffsetStr, 10);
        if (!isNaN(daysOffset)) {
          level.days_offset = daysOffset;
        } else {
          const numValue = Number(daysOffsetStr);
          if (!isNaN(numValue) && isFinite(numValue)) {
            level.days_offset = Math.floor(numValue);
          }
        }
      }

      if (timeSpentStr !== '-' && timeSpentStr !== '') {
        const timeSpent = parseInt(timeSpentStr);
        if (!isNaN(timeSpent)) {
          level.time_spent = timeSpent;
        }
      } else {
        level.time_spent = level.time_spent || 0;
      }

      level.is_bonus = false; // As requested by user - import all as regular levels without bonus

      // Only add levels that have required fields
      if (level.event_token && level.level_name &&
        level.days_offset != null && level.time_spent != null) {
        levels.push(level);
      }
    }
  }

  // Parse accounts (starting from accountHeaderRow + 1)
  for (let i = accountHeaderRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const accountName = row[0] ? row[0].toString().trim() : '';

    // Handle start date - could be string or Excel date value
    let startDateStr = '';
    if (row[1]) {
      if (row[1] instanceof Date) {
        const dateObj = row[1] as Date;
        startDateStr = dateObj.toISOString().split('T')[0];
      } else {
        startDateStr = row[1].toString().trim();
      }
    }

    // Handle start time - could be string or Excel time value
    let startTimeStr = '';
    if (row[2]) {
      if (row[2] instanceof Date) {
        const timeObj = row[2] as Date;
        const hours = timeObj.getHours().toString().padStart(2, '0');
        const minutes = timeObj.getMinutes().toString().padStart(2, '0');
        const seconds = timeObj.getSeconds().toString().padStart(2, '0');
        startTimeStr = `${hours}:${minutes}:${seconds}`;
      } else {
        startTimeStr = row[2].toString().trim();
      }
    }

    if (!accountName) continue;

    const account: Partial<Account> & { lastCompletedToken?: string } = {
      name: accountName,
      request_template: 'Needs to be filled in - imported from Excel export',
      lastCompletedToken: row[3] ? row[3].toString().trim() : undefined,
    };

    // Parse start date - handle various formats and store in standardized YYYY-MM-DD format
    if (startDateStr) {
      let parsedDate: Date | null = null;

      // Try MM/DD/YYYY format (e.g., "12/23/2025")
      const slashDateMatch = startDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (slashDateMatch) {
        const month = parseInt(slashDateMatch[1]) - 1; // JS months are 0-based
        const day = parseInt(slashDateMatch[2]);
        const year = parseInt(slashDateMatch[3]);
        parsedDate = new Date(year, month, day);
        if (!isNaN(parsedDate.getTime())) {
          account.start_date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }

      // Try YYYY-MM-DD format (e.g., "2025-12-23")
      if (!parsedDate && startDateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        parsedDate = new Date(startDateStr);
        if (!isNaN(parsedDate.getTime())) {
          account.start_date = startDateStr;
        }
      }

      // Try DD-MMM-YYYY format (e.g., "23-Dec-2025") - REQUIRES YEAR
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

    // Parse start time - handle various formats and store in standardized 24-hour HH:mm:ss format
    if (startTimeStr) {
      let parsedTime = startTimeStr.trim();
      let finalTime = '';

      // Handle AM/PM formats and convert to 24-hour format
      // Matches: "03:40 PM", "3:40 PM", "03:40:00 PM", "15:40"
      const timeMatch = parsedTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const minutes = timeMatch[2];
        const seconds = timeMatch[3] || '00';
        const ampm = timeMatch[4]?.toUpperCase();

        if (ampm) {
          // Convert to 24-hour format
          if (ampm === 'PM' && hours !== 12) {
            hours += 12;
          } else if (ampm === 'AM' && hours === 12) {
            hours = 0;
          }
        }

        // Store in standardized HH:mm:ss format
        finalTime = `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
      } else if (parsedTime.match(/^(\d{1,2}):(\d{2})$/)) {
        // Already in HH:MM format, add seconds
        finalTime = `${parsedTime}:00`;
      } else if (parsedTime.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)) {
        // Already in HH:MM:SS format
        finalTime = parsedTime;
      }

      if (finalTime) {
        account.start_time = finalTime;
      }
    }

    accounts.push(account);
  }

  return { levels, purchaseEvents, accounts };
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

  // Find the maximum number of columns
  const maxCols = Math.max(...rows.map(row => row.length));

  // Skip the first column (index 0) as it contains headers, start from column 1
  for (let col = 1; col < maxCols; col++) {
    const eventToken = rows[0] && rows[0][col] ? rows[0][col].toString().trim() : '';
    const levelName = rows[1] && rows[1][col] ? rows[1][col].toString().trim() : '';
    const daysOffsetStr = rows[2] && rows[2][col] ? rows[2][col].toString().trim() : '';
    const timeSpentStr = rows[3] && rows[3][col] ? rows[3][col].toString().trim() : '';

    if (!eventToken) continue; // Skip empty columns

    // Check if this is a purchase event ($$$ in level name)
    if (levelName === '$$$') {
      // This is a purchase event
      const purchaseEvent: Partial<PurchaseEvent> = {
        event_token: eventToken,
        is_restricted: false, // Default to unrestricted
      };

      // Parse days offset - for purchase events it might be "Less Than X"
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

      purchaseEvents.push(purchaseEvent);
    } else {
      // This is a level
      const level: Partial<Level> = {
        event_token: eventToken,
        level_name: levelName,
      };

      // Parse days offset
      if (daysOffsetStr !== '-' && daysOffsetStr !== '') {
        const daysOffset = parseInt(daysOffsetStr);
        if (!isNaN(daysOffset)) {
          level.days_offset = daysOffset;
        }
      }

      // Parse time spent
      if (timeSpentStr !== '-' && timeSpentStr !== '') {
        const timeSpent = parseInt(timeSpentStr);
        if (!isNaN(timeSpent)) {
          level.time_spent = timeSpent;
        }
      }

      // Determine if it's a bonus level (simple heuristic - check if level name contains bonus indicators)
      level.is_bonus = levelName.toLowerCase().includes('bonus') ||
        levelName.toLowerCase().includes('extra') ||
        levelName.match(/\+\d+/) !== null; // Contains +number

      // Only add levels that have meaningful data
      if (level.level_name) {
        levels.push(level);
      }
    }
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

