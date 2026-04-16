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

export type LevelColumn = { kind: 'level'; id: number | string; token: string; name: string; daysOffset: number; timeSpent: number; isBonus: boolean; synthetic?: boolean };
export type PurchaseColumn = { kind: 'purchase'; id: number | string; token: string; name: string; isRestricted: boolean; daysOffset: number | null; displayDaysOffset?: string; timeSpent: number | null; maxDaysOffset: number | string | null; synthetic?: boolean };
export type SplitColumn = {
  kind: 'split';
  id: string;
  token: string;
  name: string;
  daysOffset: number;
  timeSpent: number;
  isBonus: boolean;
  synthetic?: boolean;
  session: LevelColumn;
  event?: LevelColumn | PurchaseColumn;
};

export type ColumnData = LevelColumn | PurchaseColumn;
export type TimelineColumnData = ColumnData | SplitColumn;

export type TimelineCell = string | { session: string; event?: string };

interface AccountDataTableProps {
  columns: TimelineColumnData[];
  computedLevelDates: TimelineCell[];
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
        return col.event.displayDaysOffset ?? (col.event.daysOffset != null ? String(col.event.daysOffset) : '-');
      }
      return col.session.daysOffset;
    }
    if (col.kind === 'level') return col.daysOffset;
    return col.displayDaysOffset ?? (col.daysOffset != null ? String(col.daysOffset) : '-');
  };

  const getDisplayTimeSpent = (col: TimelineColumnData): string | number => {
    if (col.kind === 'split') {
      if (col.event?.kind === 'purchase') return col.event.timeSpent ?? '-';
      if (col.event?.kind === 'level') return col.event.timeSpent;
      return col.session.timeSpent;
    }
    if (col.kind === 'level') return col.timeSpent;
    if (mode === 'all' && (col.timeSpent ?? 0) > 0) return col.timeSpent as number;
    return '-';
  };

  const renderAccountDate = (cell: TimelineCell) => {
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

  const renderCellContent = (col: TimelineColumnData, field: 'token' | 'name' | 'daysOffset' | 'timeSpent' | 'accountDate', idx?: number) => {
    switch (field) {
      case 'token':
        return getDisplayToken(col);
      case 'name':
        return getDisplayName(col);
      case 'daysOffset':
        return getDisplayDaysOffsetText(col);
      case 'timeSpent':
        return getDisplayTimeSpent(col);
      case 'accountDate':
        const dateCell = idx !== undefined ? computedLevelDates[idx] : '-';

        if (isEditMode && onPurchaseDateChange) {
          const purchaseCol = col.kind === 'purchase' ? col : (col.kind === 'split' && col.event?.kind === 'purchase' ? col.event : undefined);
          if (purchaseCol) {
            const currentDate = tempPurchaseDates[purchaseCol.id as number];
            const dateText = typeof dateCell === 'string' ? dateCell : (dateCell.event ?? dateCell.session);

            return (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-16 h-6 p-0 text-xs hover:bg-accent justify-center"
                  >
                    <Calendar className="h-3 w-3 mr-1" />
                    {dateText === '-' ? 'Pick' : dateText}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <SimpleCalendar
                    selectedDate={currentDate}
                    onDateSelect={(date) => {
                      onPurchaseDateChange(purchaseCol.id as number, date);
                    }}
                    onClose={() => {}}
                  />
                </PopoverContent>
              </Popover>
            );
          }
        }

        return renderAccountDate(dateCell as TimelineCell);
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

  const isSingleCompleted = (col: ColumnData): boolean => {
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

  const getSplitCompletion = (col: SplitColumn) => {
    const directSessionCompleted = isSingleCompleted(col.session);
    const eventCompleted = col.event ? isSingleCompleted(col.event as ColumnData) : undefined;
    const sessionCompleted = directSessionCompleted || !!eventCompleted;
    return { sessionCompleted, directSessionCompleted, eventCompleted };
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

  const handleCheckboxChange = (col: TimelineColumnData, checked: boolean | 'indeterminate') => {
    if (onProgressChange && checked !== 'indeterminate') {
      if (col.kind === 'split') return;
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
                <DataTableCell
                  style={
                    col.kind === 'split'
                      ? getSplitCellStyle(getSplitCompletion(col).sessionCompleted, getSplitCompletion(col).eventCompleted)
                      : (isSingleCompleted(col) ? completeScheduledStyle : incompleteScheduledStyle)
                  }
                >
                  {renderCellContent(col, 'accountDate', idx)}
                </DataTableCell>
                {isEditMode && (
                  <DataTableCell style={dataRowStyle}>
                    {col.kind === 'split' ? (
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="checkbox"
                          checked={getSplitCompletion(col).sessionCompleted}
                          onChange={(e) => {
                            if (getSplitCompletion(col).eventCompleted && !e.target.checked) return;
                            onProgressChange?.('level', col.session.id, e.target.checked);
                          }}
                          className="w-4 h-4"
                        />
                        {col.event && (
                          <input
                            type="checkbox"
                            checked={getSplitCompletion(col).eventCompleted ?? false}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              onProgressChange?.(col.event!.kind, col.event!.id, checked);
                              if (checked) onProgressChange?.('level', col.session.id, true);
                            }}
                            className="w-4 h-4"
                          />
                        )}

                        {col.event?.kind === 'purchase' && onPurchaseDateChange && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`w-16 h-6 p-0 text-xs hover:bg-accent justify-center ${!tempPurchaseDates[col.event.id as number] && "text-muted-foreground"}`}
                              >
                                <Calendar className="h-3 w-3 mr-1" />
                                {tempPurchaseDates[col.event.id as number] ? format(tempPurchaseDates[col.event.id as number] as Date, "MMM d") : 'Pick'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="center">
                              <SimpleCalendar
                                selectedDate={tempPurchaseDates[col.event.id as number] || null}
                                onDateSelect={(date) => onPurchaseDateChange(col.event!.id as number, date)}
                                onClose={() => {}}
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="checkbox"
                          checked={isSingleCompleted(col)}
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
                    )}
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
                style={
                  col.kind === 'split'
                    ? getSplitCellStyle(getSplitCompletion(col).sessionCompleted, getSplitCompletion(col).eventCompleted)
                    : (isSingleCompleted(col) ? completeScheduledStyle : incompleteScheduledStyle)
                }
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
                  {col.kind === 'split' ? (
                    <div className="flex flex-col items-center gap-1">
                      <input
                        type="checkbox"
                        checked={getSplitCompletion(col).sessionCompleted}
                        onChange={(e) => {
                          if (getSplitCompletion(col).eventCompleted && !e.target.checked) return;
                          onProgressChange?.('level', col.session.id, e.target.checked);
                        }}
                        className="w-4 h-4"
                      />
                      {col.event && (
                        <input
                          type="checkbox"
                          checked={getSplitCompletion(col).eventCompleted ?? false}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            onProgressChange?.(col.event!.kind, col.event!.id, checked);
                            if (checked) onProgressChange?.('level', col.session.id, true);
                          }}
                          className="w-4 h-4"
                        />
                      )}

                      {col.event?.kind === 'purchase' && onPurchaseDateChange && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`w-16 h-6 p-0 text-xs hover:bg-accent justify-center ${!tempPurchaseDates[col.event.id as number] && "text-muted-foreground"}`}
                            >
                              <Calendar className="h-3 w-3 mr-1" />
                              {tempPurchaseDates[col.event.id as number] ? format(tempPurchaseDates[col.event.id as number] as Date, "MMM d") : 'Pick'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="center">
                            <SimpleCalendar
                              selectedDate={tempPurchaseDates[col.event.id as number] || null}
                              onDateSelect={(date) => onPurchaseDateChange(col.event!.id as number, date)}
                              onClose={() => {}}
                            />
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <input
                        type="checkbox"
                        checked={isSingleCompleted(col)}
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
                  )}
                </DataTableCell>
              );
            })}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
