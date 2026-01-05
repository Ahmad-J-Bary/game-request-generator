// src/components/tables/AccountsDataTable.tsx
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { useSettings, useColorStyle } from '../../contexts/SettingsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { DataTableCell } from './DataTableCell';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { SimpleCalendar } from '../ui/simple-calendar';
import { Button } from '../ui/button';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

type ColumnData =
  | { kind: 'level'; id: number | string; token: string; name: string; daysOffset: number; timeSpent: number; isBonus: boolean; synthetic?: boolean }
  | { kind: 'purchase'; id: number; token: string; name: string; isRestricted: boolean; daysOffset: number | null; maxDaysOffset: string | null; synthetic?: boolean };

interface Account {
  id: number;
  name: string;
  start_date: string;
  start_time: string;
}

interface AccountsDataTableProps {
  accounts: Account[];
  columns: ColumnData[];
  matrix: string[][];
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

  const renderCellContent = (col: ColumnData, field: 'token' | 'name' | 'daysOffset' | 'timeSpent' | 'accountDate') => {
    switch (field) {
      case 'token':
        return col.token;
      case 'name':
        return col.name;
      case 'daysOffset':
        if (col.kind === 'level') {
          return col.daysOffset;
        }
        const offsetStr = col.daysOffset != null ? String(col.daysOffset) : '';
        if (col.isRestricted && col.maxDaysOffset) {
          return `${offsetStr} (${col.maxDaysOffset})`;
        }
        return offsetStr;
      case 'timeSpent':
        return col.kind === 'level' ? col.timeSpent : '-';
      default:
        return '-';
    }
  };

  const getColumnSpecificStyle = (col: ColumnData): React.CSSProperties => {
    let style: React.CSSProperties;
    if (col.kind === 'level') {
      style = getColorStyle('level', col.isBonus, undefined, theme);
    } else {
      style = getColorStyle('purchase', undefined, col.isRestricted, theme);
    }

    return {
      ...style,
      opacity: col.synthetic ? 0.6 : 1,
      fontStyle: col.synthetic ? 'italic' : 'normal'
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

  const getDateCellStyle = (accountId: number, col: ColumnData): React.CSSProperties => {
    // In edit mode, we check tempProgress
    if (isEditMode && tempProgress) {
      if (col.kind === 'level') {
        // Use composite key for levels in tempProgress to handle multiple accounts
        // We need a unique key for each cell in tempProgress: `${accountId}_${col.id}`
        const cellKey = `${accountId}_${col.id}`;
        return tempProgress.levels[cellKey] ? completeScheduledStyle : incompleteScheduledStyle;
      } else {
        const cellKey = `${accountId}_${col.id}`;
        // tempProgress.purchases is keyed by event ID? No, needs account context too
        // The singular page used simple IDs because it was one account.
        // Here we need account-specific keys.
        // Wait, tempProgress structure passed from singular page was generic.
        // We need to adapt tempProgress for matrix.
        // Let's assume tempProgress uses keys: `${accountId}_${id}` like the progress maps.
        // But for TypeScript safety, let's cast logic.
        return (tempProgress.purchases as { [key: string]: boolean })[cellKey] ? completeScheduledStyle : incompleteScheduledStyle;
      }
    }

    if (col.kind === 'level') {
      const progressKey = `${accountId}_${col.id}`;
      const progress = levelsProgress[progressKey];
      return progress && progress.is_completed ? completeScheduledStyle : incompleteScheduledStyle;
    } else {
      const progressKey = `${accountId}_${col.id}`;
      const progress = purchaseProgress[progressKey];
      return progress && progress.is_completed ? completeScheduledStyle : incompleteScheduledStyle;
    }
  };

  if (columns.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No levels or purchase events
      </div>
    );
  }



  // Render cell content (Checkbox + Date Picker in Edit Mode, or Text)
  const renderCell = (acc: Account, col: ColumnData, colIdx: number, accIdx: number) => {
    if (isEditMode && tempProgress && onProgressChange) {
      const cellKey = `${acc.id}_${col.id}`;
      // Logic for levels and purchase events
      let isCompleted = false;
      if (col.kind === 'level') {
          isCompleted = tempProgress.levels[cellKey] ?? levelsProgress[cellKey]?.is_completed ?? false;
      } else {
          // Cast to any to access dynamic key if index signature is missing in prop type def, 
          // or ideally fix the interface.
          // Interface defined as: purchases: { [key: number]: boolean };
          // But here we use 'string' key (accId_colId).
          const purchasesMap = tempProgress.purchases as unknown as { [key: string]: boolean };
          isCompleted = purchasesMap[cellKey] ?? purchaseProgress[cellKey]?.is_completed ?? false;
      }
      
      const purchaseDateOverride = col.kind === 'purchase' && tempPurchaseDates 
          ? tempPurchaseDates[acc.id * 100000 + (col.id as number)] 
          : null;


      return (
        <div className="flex flex-col items-center gap-1">
          {/* Checkbox for Completion - Native Input to match AccountDetail */}
          <div className="flex items-center justify-center w-full h-6">
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={(e) => {
                 const newVal = e.target.checked;
                 onProgressChange?.(col.kind, col.kind === 'level' ? cellKey : cellKey, newVal);
              }}
              className="w-4 h-4"
            />
          </div>
          
          {/* Date Picker for Purchase Events Only - Using SimpleCalendar and ghost button */}
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
                  onClose={() => {}} // Popover handles closing
                />
              </PopoverContent>
            </Popover>
          )}
          
          {/* For levels, just show the date text if not purchase */}
          {col.kind === 'level' && (
            <span className={`text-xs ${isCompleted ? 'line-through decoration-gray-500' : ''}`}>{matrix[accIdx][colIdx]}</span>
          )}
        </div>
      );
    }

    return matrix[accIdx][colIdx];
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
