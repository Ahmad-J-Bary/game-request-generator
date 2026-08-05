// ===== Excel Export Sheet Builders =====

import type { Level, PurchaseEvent, Account, CompletedDailyTask } from '@grq/api-bindings';
import type { ExcelColorSettings as ColorSettings } from '../../types/excel';
import { getNoFillStyle } from './excel-styling.ts';
import { formatDateShort, formatDateWithYear, parseDate, addDays, formatTimeAMPM } from './excel-date-utils.ts';
import { createDateMatrix, getColumnStyle, filterStandaloneSessionLevels } from './excel-column-builder.ts';

type GetCellStyleFn = (backgroundColor: string, theme: 'light' | 'dark', isHeader?: boolean, isSynthetic?: boolean) => any;

function makeGetCellStyle(getter: GetCellStyleFn, theme: 'light' | 'dark') {
  return (backgroundColor: string, isHeader: boolean = false, isSynthetic: boolean = false) =>
    getter(backgroundColor, theme, isHeader, isSynthetic);
}

export function generateGameMatrixData(
  _levels: Level[],
  _purchaseEvents: PurchaseEvent[],
  accounts: Account[],
  columns: any[],
  layout: 'horizontal' | 'vertical',
  colorSettings: ColorSettings,
  theme: 'light' | 'dark',
  getCellStyleBase: GetCellStyleFn,
  levelsProgress?: Record<string, any>,
  purchaseProgress?: Record<string, any>,
  branchName?: string,
  taskHistory?: CompletedDailyTask[]
): { wsData: any[][]; merges: any[]; cols: any[] } {
  const getCellStyleLocal = makeGetCellStyle(getCellStyleBase, theme);

  const getColumnStyleLocal = (kind: 'level' | 'purchase', isBonus?: boolean, isRestricted?: boolean, isSynthetic?: boolean, isHeader: boolean = false): any => {
    return getColumnStyle(kind, isBonus, isRestricted, isSynthetic, isHeader, getCellStyleBase, colorSettings, theme);
  };

  const matrix = createDateMatrix(accounts, columns, formatDateShort, parseDate, addDays);

  const wsData: any[][] = [];
  const merges: any[] = [];

  if (branchName) {
    wsData.push([`Branch: ${branchName}`]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 + columns.length } });
  }

  const rowOffset = wsData.length;

  if (layout === 'vertical') {
    const headerRow1 = ['Event Token', '', ''];
    const headerRow2 = ['Level Name', '', ''];
    const headerRow3 = ['Days Offset', '', ''];
    const headerRow4 = ['Time Spent (1000 seconds)', '', ''];
    const headerRow5 = ['Account', 'Start Date', 'Start Time'];

    columns.forEach((col) => {
      headerRow1.push(col.token);
      headerRow2.push(col.name);
      headerRow3.push(col.daysOffset !== null && col.daysOffset !== undefined && col.daysOffset !== '' ? col.daysOffset.toString() : '-');
      headerRow4.push(col.kind === 'level' ? (col.timeSpent !== null && col.timeSpent !== undefined ? col.timeSpent.toString() : '-') : '-');
      headerRow5.push('');
    });
    headerRow5.push('Session', 'Time');

    wsData.push(headerRow1, headerRow2, headerRow3, headerRow4, headerRow5);

    const levelMapById = new Map(((_levels || []) as any[]).map((l: any) => [l.id, l]));
    const peMapById = new Map(((_purchaseEvents || []) as any[]).map((p: any) => [p.id, p]));

    const historyLevelMap = new Map<string, number>();
    const historyPEMap = new Map<string, number>();
    const latestHistoryTimeByAccount = new Map<number, number>();
    const histGameId = accounts[0]?.game_id;
    if (taskHistory && histGameId != null) {
      for (const h of taskHistory) {
        if (h.gameId !== histGameId) continue;
        if (!h.isPurchase && h.levelId != null) {
          historyLevelMap.set(`${h.accountId}_${h.levelId}`, h.timeSpent);
        } else if (h.isPurchase) {
          historyPEMap.set(`${h.accountId}_${h.eventToken}`, h.timeSpent);
        }
        // History is UPSERTed per account (id: last_${accountId}) and ordered
        // DESC, so the first occurrence per account is the latest completion.
        if (!latestHistoryTimeByAccount.has(h.accountId)) {
          latestHistoryTimeByAccount.set(h.accountId, h.timeSpent);
        }
      }
    }

    accounts.forEach((acc, accIdx) => {
      const matrixRow = matrix[accIdx];
      const row: any[] = [acc.name, formatDateWithYear(acc.start_date), formatTimeAMPM(acc.start_time)];

      const start = parseDate(acc.start_date);
      let lastCompletedDate = '-';
      let lastCompletedTimeSpent: string | number = '-';
      let maxOffset = -1;

      for (const [key, prog] of Object.entries(levelsProgress || {})) {
        const [accIdStr, levelIdStr] = key.split('_');
        if (Number(accIdStr) !== acc.id || !(prog as any)?.is_completed) continue;
        const level = levelMapById.get(Number(levelIdStr));
        if (!level) continue;
        const offsetNum = Number((level as any).days_offset) ?? -1;
        if (offsetNum > maxOffset) {
          maxOffset = offsetNum;
          if (start) lastCompletedDate = formatDateShort(addDays(start, offsetNum));
          const hTime = historyLevelMap.get(`${acc.id}_${(level as any).id}`);
          const progTime = (prog as any).time_spent;
          lastCompletedTimeSpent = hTime ?? ((progTime != null && progTime !== 0) ? progTime : ((level as any).time_spent ?? '-'));
        }
      }

      for (const [key, prog] of Object.entries(purchaseProgress || {})) {
        const [accIdStr, peIdStr] = key.split('_');
        if (Number(accIdStr) !== acc.id || !(prog as any)?.is_completed) continue;
        const pe = peMapById.get(Number(peIdStr));
        if (!pe) continue;
        const offsetNum = (prog as any)?.days_offset ?? -1;
        if (offsetNum > maxOffset) {
          maxOffset = offsetNum;
          if (start) lastCompletedDate = formatDateShort(addDays(start, offsetNum));
          const hTime = historyPEMap.get(`${acc.id}_${(pe as any).event_token}`);
          const progTime = (prog as any).time_spent;
          lastCompletedTimeSpent = hTime ?? ((progTime != null && progTime !== 0) ? progTime : '-');
        }
      }

      // Time column = the account's LAST used time_spent, exactly as the
      // "Dur. (ms)" value in the History Report (the per-account history row).
      // Falls back to the last-completed-event derivation when no history exists.
      const historyTime = latestHistoryTimeByAccount.get(acc.id);
      if (historyTime != null) {
        lastCompletedTimeSpent = historyTime;
      }

      matrixRow.forEach((date, colIdx) => {
        const col = columns[colIdx];
        const progressKey = `${acc.id}_${col.id}`;
        const progress = col.kind === 'level' ? (levelsProgress as any)?.[progressKey] : (purchaseProgress as any)?.[progressKey];
        const isCompleted = progress?.is_completed ?? false;

        let displayDate = date;

        if (col.kind === 'purchase' && progress && typeof progress.days_offset === 'number') {
           const start2 = parseDate(acc.start_date);
           if (start2) {
               const actualDate = addDays(start2, progress.days_offset);
               displayDate = formatDateShort(actualDate);
           }
        }

        row.push(isCompleted ? `${displayDate} (C)` : displayDate);
      });

      row.push(lastCompletedDate, lastCompletedTimeSpent);
      wsData.push(row);
    });

    merges.push(
      { s: { r: rowOffset + 0, c: 0 }, e: { r: rowOffset + 0, c: 2 } },
      { s: { r: rowOffset + 1, c: 0 }, e: { r: rowOffset + 1, c: 2 } },
      { s: { r: rowOffset + 2, c: 0 }, e: { r: rowOffset + 2, c: 2 } },
      { s: { r: rowOffset + 3, c: 0 }, e: { r: rowOffset + 3, c: 2 } },
      { s: { r: rowOffset + 4, c: 3 }, e: { r: rowOffset + 4, c: 2 + columns.length } },
    );

    const headerStyle = getCellStyleLocal(colorSettings.headerColor, true);
    const dataRowStyle = getCellStyleLocal(colorSettings.dataRowColor);
    const branchTitleStyle = getCellStyleLocal(colorSettings.headerColor, true);
    const noFillHeaderStyle = getNoFillStyle(theme, true);

    if (branchName) {
      wsData[0][0] = { v: wsData[0][0], s: branchTitleStyle };
    }

    const eventColCount = columns.length;
    const lastEventCol = 2 + eventColCount;

    for (let r = rowOffset; r < wsData.length; r++) {
      const localRowIdx = r - rowOffset;
      for (let c = 0; c < wsData[r].length; c++) {
        const val = wsData[r][c];
        const cellObj = typeof val === 'object' && val !== null && 'v' in val ? val : { v: val };

        if (localRowIdx < 5) {
          if (c < 3) {
            cellObj.s = headerStyle;
          } else if (c <= lastEventCol) {
            if (localRowIdx === 4) {
              cellObj.s = noFillHeaderStyle;
            } else {
              const col = columns[c - 3];
              cellObj.s = getColumnStyleLocal(col.kind, col.isBonus, col.isRestricted, col.synthetic, true);
            }
          } else {
            cellObj.s = headerStyle;
          }
        } else {
          if (c < 3) {
            cellObj.s = dataRowStyle;
          } else if (c <= lastEventCol) {
            const col = columns[c - 3];
            const acc = accounts[localRowIdx - 5];
            const progressKey = `${acc.id}_${col.id}`;
            const progress = col.kind === 'level' ? (levelsProgress as any)?.[progressKey] : (purchaseProgress as any)?.[progressKey];
            const isCompleted = progress?.is_completed ?? false;
            const bgColor = isCompleted ? colorSettings.completeScheduledStyle : colorSettings.incompleteScheduledStyle;
            cellObj.s = getCellStyleLocal(bgColor, false, col.synthetic);
          } else {
            cellObj.s = dataRowStyle;
          }
        }
        wsData[r][c] = cellObj;
      }
    }

    const cols = [
      { wch: 20 }, { wch: 12 }, { wch: 12 },
      ...columns.map(() => ({ wch: 12 })),
      { wch: 15 }, { wch: 12 }
    ];

    return { wsData, merges, cols };
  } else {
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

      accounts.forEach((acc, accIdx) => {
        const dateVal = matrix[accIdx][colIdx];
        const progressKey = `${acc.id}_${col.id}`;
        const progress = col.kind === 'level' ? (levelsProgress as any)?.[progressKey] : (purchaseProgress as any)?.[progressKey];
        const isCompleted = progress?.is_completed ?? false;
        row.push(isCompleted ? `${dateVal} (C)` : dateVal);
      });
      wsData.push(row);
    });

    const headerStyle = getCellStyleLocal(colorSettings.headerColor, true);
    const branchTitleStyle = getCellStyleLocal(colorSettings.headerColor, true);

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

export function buildGameDetailSheetData(
  dataGroups: Array<{ branchName?: string; columns: any[] }>,
  layout: 'horizontal' | 'vertical',
  colorSettings: ColorSettings,
  theme: 'light' | 'dark',
  getCellStyleBase: GetCellStyleFn
): { wsData: any[][]; merges: any[] } {
  const getCellStyleLocal = makeGetCellStyle(getCellStyleBase, theme);

  const wsData: any[][] = [];
  const merges: any[] = [];

  if (dataGroups.length === 1) {
    delete dataGroups[0].branchName;
  }

  for (const group of dataGroups) {
      const currentOffset = wsData.length;
      const { columns: groupCols, branchName } = group;

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

        groupCols.forEach((item: any) => {
          row1.push(item.token);
          row2.push(item.name);
          row3.push(item.daysOffset !== null && item.daysOffset !== undefined && item.daysOffset !== '' ? item.daysOffset.toString() : '-');
          row4.push(item.timeSpent !== null && item.timeSpent !== undefined ? item.timeSpent.toString() : '-');
        });
        wsData.push(row1, row2, row3, row4);

        for (let r = rowOffset; r < wsData.length; r++) {
           for (let c = 0; c < wsData[r].length; c++) {
               const cell = { v: wsData[r][c] } as any;
               if (c === 0) {
                   cell.s = getCellStyleLocal(colorSettings.headerColor, true);
               } else {
                   const item = groupCols[c - 1];
                   let backgroundColor: string;
                   if (item.kind === 'level') {
                       backgroundColor = item.isBonus ? colorSettings.levelBonus : colorSettings.levelNormal;
                   } else {
                       backgroundColor = item.isRestricted ? colorSettings.purchaseRestricted : colorSettings.purchaseUnrestricted;
                   }
                   cell.s = getCellStyleLocal(backgroundColor, true, item.synthetic);
               }
               wsData[r][c] = cell;
           }
        }
      } else {
        wsData.push(['Event Token', 'Level Name', 'Days Offset', 'Time Spent (1000 seconds)']);

        const headerRowIdx = rowOffset;
        for (let c = 0; c < 4; c++) {
            wsData[headerRowIdx][c] = { v: wsData[headerRowIdx][c], s: getCellStyleLocal(colorSettings.headerColor, true) };
        }

        groupCols.forEach((item: any) => {
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
          const rowStyle = getCellStyleLocal(backgroundColor, false, item.synthetic);

          wsData.push(row.map(v => ({ v, s: rowStyle })));
        });
      }

      wsData.push([]);
  }

  if (wsData.length > 0 && wsData[wsData.length - 1].length === 0) {
      wsData.pop();
  }

  return { wsData, merges };
}

export function buildAccountDetailSheetData(
  account: Account,
  levels: Level[],
  purchaseEvents: PurchaseEvent[],
  layout: 'horizontal' | 'vertical',
  colorSettings: ColorSettings,
  theme: 'light' | 'dark',
  getCellStyleBase: GetCellStyleFn,
  columns?: any[],
  levelsProgress?: any[],
  purchaseProgress?: any[]
): { wsData: any[][] } {
  const getCellStyleLocal = makeGetCellStyle(getCellStyleBase, theme);

  const startDateObj = parseDate(account.start_date) || new Date();

  let allItems: any[] = [];

  if (columns && columns.length > 0) {
    allItems = columns.map((col: any) => {
      let isCompleted = false;
      let daysOffsetToUse = Number(col.daysOffset || 0);

      if (col.kind === 'level') {
        const prog = levelsProgress?.find(p => p.level_id === col.id);
        isCompleted = prog ? prog.is_completed : false;
      } else {
        const prog = purchaseProgress?.find(p => p.purchase_event_id === col.id);
        isCompleted = prog ? prog.is_completed : false;
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
    allItems = [
      ...filterStandaloneSessionLevels(levels).map(l => {
        const dd = addDays(startDateObj, l.days_offset);
        const prog = levelsProgress?.find(p => p.level_id === l.id);
        return { kind: 'level', token: l.event_token, name: l.level_name, daysOffset: l.days_offset, timeSpent: l.time_spent, dateStr: formatDateShort(dd), isCompleted: prog ? prog.is_completed : false, isBonus: l.is_bonus, synthetic: l.level_name === '-' };
      }),
      ...purchaseEvents.map(p => {
        const prog = purchaseProgress?.find(pr => pr.purchase_event_id === p.id);

        let dateStr = '-';
        if (prog && typeof prog.days_offset === 'number') {
             const dd = addDays(startDateObj, prog.days_offset);
             dateStr = formatDateShort(dd);
        } else if ((p as any).days_offset !== undefined && (p as any).days_offset !== null) {
            const dd = addDays(startDateObj, (p as any).days_offset);
            dateStr = formatDateShort(dd);
        }

        const isRestricted = (p as any).is_restricted ?? false;
        const base = (p as any).days_offset !== undefined && (p as any).days_offset !== null ? String((p as any).days_offset) : '-';
        let displayOffset = base;
        if (isRestricted && p.max_days_offset != null) {
            displayOffset = `${base} (Less Than ${p.max_days_offset})`;
        }

        return {
            kind: 'purchase',
            token: p.event_token,
            name: p.level_name || '$$$',
            daysOffset: displayOffset,
            timeSpent: null,
            dateStr,
            isCompleted: prog ? prog.is_completed : false,
            isRestricted: p.is_restricted
        };
      })
    ];
  }

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

  return { wsData: applyAccountDetailStyles(wsData, allItems, layout, colorSettings, getCellStyleLocal) };
}

function applyAccountDetailStyles(
  wsData: any[][],
  allItems: any[],
  layout: 'horizontal' | 'vertical',
  colorSettings: ColorSettings,
  getCellStyleLocal: ReturnType<typeof makeGetCellStyle>
): any[][] {
  const styledData = wsData.map(row => [...row]);

  for (let R = 0; R < styledData.length; R++) {
    for (let C = 0; C < styledData[R].length; C++) {
      const cellVal = styledData[R][C];

      if (layout === 'vertical') {
        if (R < 4) {
          if (C === 0) {
            styledData[R][C] = { v: cellVal, s: getCellStyleLocal(colorSettings.headerColor, true) };
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
              styledData[R][C] = { v: cellVal, s: getCellStyleLocal(backgroundColor, true, item.synthetic) };
            } else {
              styledData[R][C] = { v: cellVal, s: getCellStyleLocal(colorSettings.headerColor, true) };
            }
          }
        } else {
          const itemIdx = C - 1;
          if (itemIdx >= 0 && itemIdx < allItems.length) {
            const item = allItems[itemIdx];
            const backgroundColor = item.isCompleted ? colorSettings.completeScheduledStyle : colorSettings.incompleteScheduledStyle;
            styledData[R][C] = { v: cellVal, s: getCellStyleLocal(backgroundColor, false, item.synthetic) };
          } else {
            styledData[R][C] = { v: cellVal, s: getCellStyleLocal(colorSettings.dataRowColor) };
          }
        }
      } else {
        if (R === 0) {
          styledData[R][C] = { v: cellVal, s: getCellStyleLocal(colorSettings.headerColor, true) };
        } else {
          const itemIdx = R - 1;
          if (itemIdx >= 0 && itemIdx < allItems.length) {
            const item = allItems[itemIdx];
            let backgroundColor: string;
            if (C < 4) {
              if (item.kind === 'level') {
                backgroundColor = item.isBonus ? colorSettings.levelBonus : colorSettings.levelNormal;
              } else {
                backgroundColor = item.isRestricted ? colorSettings.purchaseRestricted : colorSettings.purchaseUnrestricted;
              }
            } else {
              backgroundColor = item.isCompleted ? colorSettings.completeScheduledStyle : colorSettings.incompleteScheduledStyle;
            }
            styledData[R][C] = { v: cellVal, s: getCellStyleLocal(backgroundColor, false, item.synthetic) };
          } else {
            styledData[R][C] = { v: cellVal, s: getCellStyleLocal(colorSettings.dataRowColor) };
          }
        }
      }
    }
  }

  return styledData;
}
