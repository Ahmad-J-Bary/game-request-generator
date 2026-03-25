// src/components/tables/AccountDataTable.tsx
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@grq/ui/atoms/table';
import { Button } from '@grq/ui/atoms/button';
import { Popover, PopoverContent, PopoverTrigger } from '@grq/ui/atoms/popover';
import { useSettings, useColorStyle } from '@grq/ui/contexts/SettingsContext';
import { useTheme } from '@grq/ui/contexts/ThemeContext';
import { DataTableCell } from './DataTableCell';
import { SimpleCalendar } from '@grq/ui/atoms/simple-calendar';

type ColumnData =
  | { kind: 'level'; id: number | string; token: string; name: string; daysOffset: number; timeSpent: number; isBonus: boolean; synthetic?: boolean }
  | { kind: 'purchase'; id: number; token: string; name: string; isRestricted: boolean; daysOffset: number | null; timeSpent: number; maxDaysOffset: string | null; synthetic?: boolean };

interface AccountDataTableProps {
  columns: ColumnData[];
  computedLevelDates: string[];
  layout: 'horizontal' | 'vertical';
  levelsProgress?: { level_id: number; is_completed: boolean }[];
  purchaseProgress?: { purchase_event_id: number; is_completed: boolean }[];
  isEditMode?: boolean;
  tempProgress?: {
    levels: { [key: number]: boolean };
    purchases: { [key: number]: boolean };
  };
  onProgressChange?: (type: 'level' | 'purchase', id: number | string, completed: boolean) => void;
  onPurchaseDateChange?: (purchaseId: number, date: Date | null) => void;
  tempPurchaseDates?: { [key: number]: Date | null };
  levels?: any[];
  mode?: 'event-only' | 'all';
}

export function AccountDataTable({
  columns,
  computedLevelDates,
  layout,
  levelsProgress = [],
  purchaseProgress = [],
  isEditMode = false,
  tempProgress = { levels: {}, purchases: {} },
  onProgressChange,
  onPurchaseDateChange,
  tempPurchaseDates = {},
  levels = [],
  mode = 'event-only'
}: AccountDataTableProps) {
  const { t } = useTranslation();
  const { colors } = useSettings();

  const { theme } = useTheme();
  const getColorStyle = useColorStyle();

  const renderCellContent = (col: ColumnData, field: 'token' | 'name' | 'daysOffset' | 'timeSpent' | 'accountDate', idx?: number) => {
    switch (field) {
      case 'token':
        return col.token;
      case 'name':
        return col.name;
      case 'daysOffset':
        if (col.kind === 'level') {
          return col.daysOffset;
        }
        return col.daysOffset != null ? String(col.daysOffset) : '';
      case 'timeSpent':
        if (col.kind === 'level') {
          return col.timeSpent;
        }
        if (mode === 'all' && col.timeSpent > 0) {
          return col.timeSpent;
        }
        return '-';
      case 'accountDate':
        const dateStr = idx !== undefined ? computedLevelDates[idx] : '-';
        if (isEditMode && col.kind === 'purchase' && onPurchaseDateChange) {
          // Use the Date object from tempPurchaseDates if available
          const currentDate = tempPurchaseDates[col.id as number];

          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-16 h-6 p-0 text-xs hover:bg-accent justify-center"
                >
                  <Calendar className="h-3 w-3 mr-1" />
                  {dateStr === '-' ? 'Pick' : dateStr}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <SimpleCalendar
                  selectedDate={currentDate}
                  onDateSelect={(date) => {
                    onPurchaseDateChange(col.id as number, date);
                  }}
                  onClose={() => {}} // Popover handles closing
                />
              </PopoverContent>
            </Popover>
          );
        }
        return dateStr;
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

  // التحقق من حالة التقدم
  const isItemCompleted = (col: ColumnData): boolean => {
    if (isEditMode) {
      if (col.kind === 'level') {
        return tempProgress.levels[col.id as keyof typeof tempProgress.levels] ?? false;
      } else {
        return tempProgress.purchases[col.id as keyof typeof tempProgress.purchases] ?? false;
      }
    }

    if (col.kind === 'level') {
      // For session levels, check if there's a real level at the same position that has progress
      if (col.synthetic && typeof col.id === 'string' && col.id.startsWith('synth-')) {
        // Extract days offset from session level ID
        const parts = col.id.split('-');
        if (parts.length >= 3) {
          const daysOffset = parseInt(parts[2]);
          // Find if there's a real level at this days offset with progress
          const realLevelWithProgress = levelsProgress.find(p => {
            // We need to find the level that has this days offset
            const level = levels.find(l => l.id === p.level_id);
            return level && level.days_offset === daysOffset;
          });
          if (realLevelWithProgress) {
            return realLevelWithProgress.is_completed;
          }
        }
      }

      const progress = levelsProgress.find(p => p.level_id === col.id);
      return progress ? progress.is_completed : false;
    } else {
      const progress = purchaseProgress.find(p => p.purchase_event_id === col.id);
      return progress ? progress.is_completed : false;
    }
  };

  const handleCheckboxChange = (col: ColumnData, checked: boolean | 'indeterminate') => {
    if (onProgressChange && checked !== 'indeterminate') {
      onProgressChange(col.kind, col.id, checked);
    }
  };


  if (columns.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No levels or purchase events
      </div>
    );
  }

  if (layout === 'horizontal') {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead style={headerStyle}>{t('levels.eventToken')}</TableHead>
            <TableHead style={headerStyle}>{t('levels.levelName')}</TableHead>
            <TableHead style={headerStyle}>{t('levels.daysOffset')}</TableHead>
            <TableHead style={headerStyle}>{t('levels.timeSpent')}</TableHead>
            <TableHead style={headerStyle}>{t('levels.accountDate')}</TableHead>
            {isEditMode && <TableHead style={headerStyle}>{t('common.edit', 'Edit')}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((col, idx) => {
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
                <DataTableCell style={isItemCompleted(col) ? completeScheduledStyle : incompleteScheduledStyle}>
                  {renderCellContent(col, 'accountDate', idx)}
                </DataTableCell>
                {isEditMode && (
                  <DataTableCell style={dataRowStyle}>
                    <div className="flex flex-col items-center gap-1">
                      <input
                        type="checkbox"
                        checked={isItemCompleted(col)}
                        onChange={(e) => handleCheckboxChange(col, e.target.checked)}
                        className="w-4 h-4"
                      />
                      
                      {col.kind === 'purchase' && onPurchaseDateChange && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`w-16 h-6 p-0 text-xs hover:bg-accent justify-center ${!tempPurchaseDates[col.id as number] && "text-muted-foreground"}`}
                            >
                               <Calendar className="h-3 w-3 mr-1" />
                               {tempPurchaseDates[col.id as number] ? format(tempPurchaseDates[col.id as number] as Date, "MMM d") : 'Pick'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="center">
                            <SimpleCalendar
                              selectedDate={tempPurchaseDates[col.id as number] || null}
                              onDateSelect={(date) => onPurchaseDateChange(col.id as number, date)}
                              onClose={() => {}}
                            />
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </DataTableCell>
                )}
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
          <TableHead style={headerStyle}>{t('levels.eventToken')}</TableHead>
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
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableHead style={headerStyle}>{t('levels.levelName')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...dataRowStyle, ...columnStyle };

            return (
              <DataTableCell key={`name-${col.kind}-${col.id}`} style={combinedStyle}>
                {renderCellContent(col, 'name')}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('levels.daysOffset')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...dataRowStyle, ...columnStyle };

            return (
              <DataTableCell key={`offset-${col.kind}-${col.id}`} style={combinedStyle}>
                {renderCellContent(col, 'daysOffset')}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('levels.timeSpent')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...dataRowStyle, ...columnStyle };

            return (
              <DataTableCell key={`time-${col.kind}-${col.id}`} style={combinedStyle}>
                {renderCellContent(col, 'timeSpent')}
              </DataTableCell>
            );
          })}
        </TableRow>

        <TableRow>
          <TableHead style={headerStyle}>{t('levels.accountDate')}</TableHead>
          {columns.map((col, idx) => {
            return (
              <DataTableCell
                key={`accdate-${col.kind}-${col.id}`}
                style={isItemCompleted(col) ? completeScheduledStyle : incompleteScheduledStyle}
              >
                {renderCellContent(col, 'accountDate', idx)}
              </DataTableCell>
            );
          })}
        </TableRow>

        {isEditMode && (
          <TableRow>
            <TableHead style={headerStyle}>{t('common.edit', 'Edit')}</TableHead>
            {columns.map((col) => {
              return (
                <DataTableCell key={`edit-${col.kind}-${col.id}`} style={dataRowStyle}>
                  <div className="flex flex-col items-center gap-1">
                    <input
                      type="checkbox"
                      checked={isItemCompleted(col)}
                      onChange={(e) => handleCheckboxChange(col, e.target.checked)}
                      className="w-4 h-4"
                    />
                    
                    {col.kind === 'purchase' && onPurchaseDateChange && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`w-16 h-6 p-0 text-xs hover:bg-accent justify-center ${!tempPurchaseDates[col.id as number] && "text-muted-foreground"}`}
                          >
                             <Calendar className="h-3 w-3 mr-1" />
                             {tempPurchaseDates[col.id as number] ? format(tempPurchaseDates[col.id as number] as Date, "MMM d") : 'Pick'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="center">
                          <SimpleCalendar
                            selectedDate={tempPurchaseDates[col.id as number] || null}
                            onDateSelect={(date) => onPurchaseDateChange(col.id as number, date)}
                            onClose={() => {}}
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </DataTableCell>
              );
            })}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}