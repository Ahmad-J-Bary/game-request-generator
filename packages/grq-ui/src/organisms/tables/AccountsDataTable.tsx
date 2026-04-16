// src/components/tables/AccountsDataTable.tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@grq/ui/atoms/table';
import { useSettings, useColorStyle } from '@grq/ui/contexts/SettingsContext';
import { useTheme } from '@grq/ui/contexts/ThemeContext';
import { DataTableCell } from './DataTableCell';
import { Popover, PopoverContent, PopoverTrigger } from '@grq/ui/atoms/popover';
import { SimpleCalendar } from '@grq/ui/atoms/simple-calendar';
import { Button } from '@grq/ui/atoms/button';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

export type ColumnData =
  | LevelColumn
  | PurchaseColumn;

export type LevelColumn = { kind: 'level'; id: number | string; token: string; name: string; daysOffset: number; timeSpent: number; isBonus: boolean; synthetic?: boolean; isRestricted?: boolean; maxDaysOffset?: number | string | null };
export type PurchaseColumn = { kind: 'purchase'; id: number | string; token: string; name: string; isRestricted: boolean; daysOffset: number | null; maxDaysOffset: number | string | null; synthetic?: boolean; timeSpent?: number | null; isBonus?: boolean };
export type SplitColumn = {
  kind: 'split';
  id: string;
  token: string;
  name: string;
  daysOffset: number;
  timeSpent: number;
  isBonus: boolean;
  synthetic?: boolean;
  isRestricted?: boolean;
  maxDaysOffset?: number | string | null;
  session: LevelColumn;
  event?: LevelColumn | PurchaseColumn;
};

export type TimelineCell = string | { session: string; event?: string };
export type TimelineColumnData = ColumnData | SplitColumn;

interface Account {
  id: number;
  name: string;
  start_date: string;
  start_time: string;
}

interface AccountsDataTableProps {
  accounts: Account[];
  columns: TimelineColumnData[];
  matrix: TimelineCell[][];
  layout: 'horizontal' | 'vertical';
  levelsProgress?: Record<string, { level_id: number; is_completed: boolean }>;
  purchaseProgress?: Record<string, { purchase_event_id: number; is_completed: boolean }>;
  isEditMode?: boolean;
  tempProgress?: {
    levels: { [key: string]: boolean };
    purchases: { [key: string]: boolean };
  };
  onProgressChange?: (type: 'level' | 'purchase', id: number | string, completed: boolean) => void;
  tempPurchaseDates?: { [key: number]: Date | null };
  onPurchaseDateChange?: (purchaseId: number, date: Date | null) => void;
}

export function AccountsDataTable({
  accounts,
  columns,
  matrix,
  layout,
  levelsProgress = {},
  purchaseProgress = {},
  isEditMode = false,
  tempProgress,
  onProgressChange,
  tempPurchaseDates,
  onPurchaseDateChange,
}: AccountsDataTableProps) {
  const { t } = useTranslation();
  const { colors } = useSettings();
  const { theme } = useTheme();
  const getColorStyle = useColorStyle();
  const purchasesProgressMap = tempProgress?.purchases as { [key: string]: boolean } | undefined;

  const getDisplayToken = (col: TimelineColumnData): string => {
    if (col.kind === 'split') return col.event?.token ?? col.session.token;
    return col.token;
  };

  const getDisplayName = (col: TimelineColumnData): string => {
    if (col.kind === 'split') return col.event?.name ?? col.session.name;
    return col.name;
  };

  const getDisplayDaysOffsetText = (col: TimelineColumnData): string | number => {
    if (col.kind === 'split') {
      if (col.event?.kind === 'purchase') {
        const offsetStr = col.event.daysOffset != null ? String(col.event.daysOffset) : '';
        if (col.event.isRestricted && col.event.maxDaysOffset) return `${offsetStr} (${col.event.maxDaysOffset})`;
        return offsetStr;
      }
      if (col.event?.kind === 'level') return col.event.daysOffset;
      return col.session.daysOffset;
    }
    if (col.kind === 'level') return col.daysOffset;
    const offsetStr = col.daysOffset != null ? String(col.daysOffset) : '';
    if (col.isRestricted && col.maxDaysOffset) return `${offsetStr} (${col.maxDaysOffset})`;
    return offsetStr;
  };

  const getDisplayTimeSpent = (col: TimelineColumnData): string | number => {
    if (col.kind === 'split') {
      if (col.event?.kind === 'purchase') return col.event.timeSpent ?? '-';
      if (col.event?.kind === 'level') return col.event.timeSpent;
      return col.session.timeSpent;
    }
    return col.kind === 'level' ? col.timeSpent : '-';
  };

  const renderTimelineCell = (cell: TimelineCell) => {
    if (typeof cell === 'string') return cell;
    if (cell.event === undefined || cell.event === cell.session) return cell.session;
    if (layout === 'vertical') {
      return (
        <div className="flex items-center justify-center gap-1 whitespace-nowrap">
          <span className="text-xs">{cell.session}</span>
          {cell.event !== undefined && (
            <>
              <span className="text-xs opacity-60">/</span>
              <span className="text-xs">{cell.event}</span>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center leading-tight">
        <span className="text-xs">{cell.session}</span>
        {cell.event !== undefined && (
          <span className="text-xs mt-0.5">{cell.event}</span>
        )}
      </div>
    );
  };

  const renderCellContent = (col: TimelineColumnData, field: 'token' | 'name' | 'daysOffset' | 'timeSpent' | 'accountDate') => {
    switch (field) {
      case 'token':
        return getDisplayToken(col);
      case 'name':
        return getDisplayName(col);
      case 'daysOffset':
        return getDisplayDaysOffsetText(col);
      case 'timeSpent':
        return getDisplayTimeSpent(col);
      default:
        return '-';
    }
  };

  const getColumnSpecificStyle = (col: TimelineColumnData): React.CSSProperties => {
    let style: React.CSSProperties;
    const base = col.kind === 'split' ? (col.event ?? col.session) : col;
    if (base.kind === 'level') style = getColorStyle('level', base.isBonus, undefined, theme);
    else style = getColorStyle('purchase', undefined, base.isRestricted, theme);

    return {
      ...style,
      opacity: (base as any).synthetic ? 0.6 : 1,
      fontStyle: (base as any).synthetic ? 'italic' : 'normal'
    };
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: colors.headerColor,
    color: theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)',
    fontWeight: 'bold',
  };

  const dataRowStyle: React.CSSProperties = {
    backgroundColor: colors.dataRowColor,
    color: theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)',
  };

  const incompleteScheduledStyle: React.CSSProperties = {
    backgroundColor: colors.incompleteScheduledStyle,
    color: theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(0, 0, 0)',
    fontStyle: 'italic',
    opacity: 0.8
  };

  const completeScheduledStyle: React.CSSProperties = {
    backgroundColor: colors.completeScheduledStyle,
    color: theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(0, 0, 0)',
    fontStyle: 'italic',
    opacity: 0.8
  };

  const getSplitCellStyle = (sessionCompleted: boolean, eventCompleted?: boolean): React.CSSProperties => {
    const leftBg = sessionCompleted ? colors.completeScheduledStyle : colors.incompleteScheduledStyle;
    const rightBg = (eventCompleted ?? sessionCompleted) ? colors.completeScheduledStyle : colors.incompleteScheduledStyle;
    return {
      backgroundImage:
        layout === 'vertical'
          ? `linear-gradient(to right, ${leftBg} 0 50%, ${rightBg} 50% 100%)`
          : `linear-gradient(to bottom, ${leftBg} 0 50%, ${rightBg} 50% 100%)`,
      color: theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(0, 0, 0)',
      fontStyle: 'italic',
      opacity: 0.8
    };
  };

  const splitStateCache = useMemo(() => {
    const cache = new Map<string, { sessionCompleted: boolean; eventCompleted: boolean }>();

    accounts.forEach((account) => {
      columns.forEach((column) => {
        if (column.kind !== 'split') return;

        const sessionKey = `${account.id}_${column.session.id}`;
        const sessionCompleted = isEditMode && tempProgress
          ? !!tempProgress.levels[sessionKey]
          : !!levelsProgress[sessionKey]?.is_completed;

        const eventKey = column.event ? `${account.id}_${column.event.id}` : null;
        const eventCompleted = column.event && eventKey
          ? (
              column.event.kind === 'level'
                ? (
                    isEditMode && tempProgress
                      ? !!tempProgress.levels[eventKey]
                      : !!levelsProgress[eventKey]?.is_completed
                  )
                : (
                    isEditMode && purchasesProgressMap
                      ? !!purchasesProgressMap[eventKey]
                      : !!purchaseProgress[eventKey]?.is_completed
                  )
            )
          : false;

        cache.set(`${account.id}::${column.id}`, { sessionCompleted, eventCompleted });
      });
    });

    return cache;
  }, [accounts, columns, isEditMode, levelsProgress, purchaseProgress, purchasesProgressMap, tempProgress]);

  const getDateCellStyle = (accountId: number, col: TimelineColumnData): React.CSSProperties => {
    // In edit mode, we check tempProgress
    if (isEditMode && tempProgress) {
      if (col.kind === 'split') {
        const splitState = splitStateCache.get(`${accountId}::${col.id}`);
        const sessionCompleted = splitState?.sessionCompleted ?? false;
        if (!col.event) return sessionCompleted ? completeScheduledStyle : incompleteScheduledStyle;
        const eventCompleted = splitState?.eventCompleted ?? false;
        return getSplitCellStyle(sessionCompleted, eventCompleted);
      }

      const cellKey = `${accountId}_${col.id}`;
      if (col.kind === 'level') return tempProgress.levels[cellKey] ? completeScheduledStyle : incompleteScheduledStyle;
      return (tempProgress.purchases as { [key: string]: boolean })[cellKey] ? completeScheduledStyle : incompleteScheduledStyle;
    }

    if (col.kind === 'split') {
      const splitState = splitStateCache.get(`${accountId}::${col.id}`);
      const sessionCompleted = splitState?.sessionCompleted ?? false;
      if (!col.event) return sessionCompleted ? completeScheduledStyle : incompleteScheduledStyle;
      const eventCompleted = splitState?.eventCompleted ?? false;
      return getSplitCellStyle(sessionCompleted, eventCompleted);
    }

    const progressKey = `${accountId}_${col.id}`;
    if (col.kind === 'level') return levelsProgress[progressKey]?.is_completed ? completeScheduledStyle : incompleteScheduledStyle;
    return purchaseProgress[progressKey]?.is_completed ? completeScheduledStyle : incompleteScheduledStyle;
  };

  if (columns.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No levels or purchase events
      </div>
    );
  }



  // Render cell content (Checkbox + Date Picker in Edit Mode, or Text)
  const renderCell = (acc: Account, col: TimelineColumnData, colIdx: number, accIdx: number) => {
    if (isEditMode && tempProgress && onProgressChange) {
      if (col.kind === 'split') {
        const sessionKey = `${acc.id}_${col.session.id}`;
        const eventKey = col.event ? `${acc.id}_${col.event.id}` : null;
        const splitState = splitStateCache.get(`${acc.id}::${col.id}`);
        const sessionCompleted = splitState?.sessionCompleted ?? false;
        const eventCompleted = splitState?.eventCompleted ?? false;

        const eventPurchaseId = col.event?.kind === 'purchase' ? (col.event.id as number) : null;
        const purchaseDateOverride = eventPurchaseId != null && tempPurchaseDates
          ? tempPurchaseDates[acc.id * 100000 + eventPurchaseId]
          : null;

        return (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center justify-center w-full h-6">
              <input
                type="checkbox"
                checked={sessionCompleted}
                onChange={(e) => onProgressChange?.('level', sessionKey, e.target.checked)}
                className="w-4 h-4"
              />
            </div>

            {col.event && (
              <div className="flex items-center justify-center w-full h-6">
                <input
                  type="checkbox"
                  checked={eventCompleted}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    onProgressChange?.(col.event!.kind, eventKey as string, checked);
                  }}
                  className="w-4 h-4"
                />
              </div>
            )}

            {eventPurchaseId != null && tempPurchaseDates && onPurchaseDateChange && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`w-16 h-6 p-0 text-xs hover:bg-accent justify-center ${!purchaseDateOverride && "text-muted-foreground"} ${eventCompleted ? 'line-through decoration-gray-500' : ''}`}
                  >
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {purchaseDateOverride ? format(purchaseDateOverride, "MMM d") : 'Pick'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <SimpleCalendar
                    selectedDate={purchaseDateOverride || null}
                    onDateSelect={(date) => onPurchaseDateChange?.(acc.id * 100000 + eventPurchaseId, date)}
                    onClose={() => {}}
                  />
                </PopoverContent>
              </Popover>
            )}

            <div className="text-xs">
              {renderTimelineCell(matrix[accIdx][colIdx])}
            </div>
          </div>
        );
      }

      const cellKey = `${acc.id}_${col.id}`;
      let isCompleted = false;
      if (col.kind === 'level') {
        isCompleted = tempProgress.levels[cellKey] ?? levelsProgress[cellKey]?.is_completed ?? false;
      } else {
        const purchasesMap = tempProgress.purchases as unknown as { [key: string]: boolean };
        isCompleted = purchasesMap[cellKey] ?? purchaseProgress[cellKey]?.is_completed ?? false;
      }

      const purchaseDateOverride = col.kind === 'purchase' && tempPurchaseDates
        ? tempPurchaseDates[acc.id * 100000 + (col.id as number)]
        : null;

      return (
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center justify-center w-full h-6">
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={(e) => onProgressChange?.(col.kind, cellKey, e.target.checked)}
              className="w-4 h-4"
            />
          </div>

          {col.kind === 'purchase' && tempPurchaseDates && onPurchaseDateChange && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`w-16 h-6 p-0 text-xs hover:bg-accent justify-center ${!purchaseDateOverride && "text-muted-foreground"} ${isCompleted ? 'line-through decoration-gray-500' : ''}`}
                >
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {purchaseDateOverride ? format(purchaseDateOverride, "MMM d") : 'Pick'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <SimpleCalendar
                  selectedDate={purchaseDateOverride || null}
                  onDateSelect={(date) => onPurchaseDateChange?.(acc.id * 100000 + (col.id as number), date)}
                  onClose={() => {}}
                />
              </PopoverContent>
            </Popover>
          )}

          {col.kind === 'level' && (
            <span className={`text-xs ${isCompleted ? 'line-through decoration-gray-500' : ''}`}>{renderTimelineCell(matrix[accIdx][colIdx])}</span>
          )}
        </div>
      );
    }

    return renderTimelineCell(matrix[accIdx][colIdx]);
  };

  if (layout === 'horizontal') {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead style={headerStyle}>{t('levels.eventToken')}</TableHead>
            <TableHead style={headerStyle}>{t('levels.levelName')}</TableHead>
            <TableHead style={headerStyle}>{t('levels.daysOffset')}</TableHead>
            <TableHead style={headerStyle}>{t('levels.timeSpent')}</TableHead>
            <TableHead style={headerStyle}>{t('accounts.account')}</TableHead>
            <TableHead style={headerStyle}>{t('accounts.startDate')}</TableHead>
            <TableHead style={headerStyle}>{t('accounts.startTime')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((col, colIdx) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...dataRowStyle, ...columnStyle };

            return (
              <TableRow key={`${col.kind}-${col.id}`}>
                <TableCell className="font-mono" style={combinedStyle}>
                  {renderCellContent(col, 'token')}
                </TableCell>
                <DataTableCell style={combinedStyle}>
                  {renderCellContent(col, 'name')}
                </DataTableCell>
                <DataTableCell style={combinedStyle}>
                  {renderCellContent(col, 'daysOffset')}
                </DataTableCell>
                <DataTableCell style={combinedStyle}>
                  {renderCellContent(col, 'timeSpent')}
                </DataTableCell>

                {accounts.map((acc, accIdx) => {
                  return (
                    <TableCell key={acc.id} className="text-center" style={getDateCellStyle(acc.id, col)}>
                      {renderCell(acc, col, colIdx, accIdx)}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  // Vertical layout
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead colSpan={3} style={headerStyle}>{t('levels.eventToken')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...headerStyle, ...columnStyle };

            return (
              <TableHead
                key={`${col.kind}-${col.id}`}
                className="text-center font-mono"
                style={combinedStyle}
              >
                {col.token}
              </TableHead>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead colSpan={3} style={headerStyle}>{t('levels.levelName')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...headerStyle, ...columnStyle };

            return (
              <TableHead
                key={`name-${col.kind}-${col.id}`}
                className="text-center"
                style={combinedStyle}
              >
                {renderCellContent(col, 'name')}
              </TableHead>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead colSpan={3} style={headerStyle}>{t('levels.daysOffset')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...headerStyle, ...columnStyle };

            return (
              <TableHead
                key={`offset-${col.kind}-${col.id}`}
                className="text-center"
                style={combinedStyle}
              >
                {renderCellContent(col, 'daysOffset')}
              </TableHead>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead colSpan={3} style={headerStyle}>{t('levels.timeSpent')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...headerStyle, ...columnStyle };

            return (
              <TableHead
                key={`time-${col.kind}-${col.id}`}
                className="text-center"
                style={combinedStyle}
              >
                {renderCellContent(col, 'timeSpent')}
              </TableHead>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('accounts.account')}</TableHead>
          <TableHead style={headerStyle}>{t('accounts.startDate')}</TableHead>
          <TableHead style={headerStyle}>{t('accounts.startTime')}</TableHead>
          {columns.map((col) => <TableHead key={col.id} />)}
        </TableRow>
      </TableHeader>

      <TableBody>
        {accounts.map((acc, accIdx) => (
          <TableRow key={acc.id}>
            <TableCell style={dataRowStyle}>{acc.name}</TableCell>
            <TableCell style={dataRowStyle}>{formatDateShort(acc.start_date)}</TableCell>
            <TableCell style={dataRowStyle}>{formatTimeAMPM(acc.start_time)}</TableCell>

            {columns.map((c, colIdx) => {
              return (
                <TableCell
                  key={colIdx}
                  className="text-center"
                  style={getDateCellStyle(acc.id, c)}
                >
                  {renderCell(acc, c, colIdx, accIdx)}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Helper functions moved from the parent component
function formatDateShort(input?: string): string {
  if (!input) return '-';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '-';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()}-${months[d.getMonth()]}`;
}

function formatTimeAMPM(timeStr?: string): string {
  if (!timeStr) return '-';

  // Check if it's already in AM/PM format
  if (timeStr.match(/\s*(AM|PM)$/i)) return timeStr;

  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;

  let hour = parseInt(parts[0], 10);
  const minute = parts[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';

  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${String(hour).padStart(2, '0')}:${minute} ${ampm}`;
}
