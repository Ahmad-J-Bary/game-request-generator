// src/components/tables/GameDataTable.tsx
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useSettings, useColorStyle } from '../../contexts/SettingsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { DataTableCell } from './DataTableCell';
import { Trash2 } from 'lucide-react';

type ColumnData =
  | { kind: 'level'; id: number | string; token: string; name: string; daysOffset: number | string | null; timeSpent: number | null; isBonus: boolean; synthetic?: boolean }
  | { kind: 'purchase'; id: number; token: string; name: string; isRestricted: boolean; daysOffset: number | null; maxDaysOffset: number | null; timeSpent: number | null; synthetic?: boolean };

interface GameDataTableProps {
  columns: ColumnData[];
  layout: 'horizontal' | 'vertical';
  isEditMode?: boolean;
  onDeleteLevel?: (levelId: number) => void;
  onDeletePurchaseEvent?: (eventId: number) => void;
  onUpdateLevel?: (levelId: number, field: string, value: any) => void;
  onUpdatePurchaseEvent?: (eventId: number, field: string, value: any) => void;
  mode?: 'event-only' | 'all';
}

export function GameDataTable({
  columns,
  layout,
  isEditMode = false,
  onDeleteLevel,
  onDeletePurchaseEvent,
  onUpdateLevel,
  onUpdatePurchaseEvent,
  mode = 'event-only'
}: GameDataTableProps) {
  const { t } = useTranslation();
  const { colors } = useSettings();
  const { theme } = useTheme();
  const getColorStyle = useColorStyle();

  const renderCellContent = (col: ColumnData, field: 'token' | 'name' | 'daysOffset' | 'timeSpent') => {
    if (isEditMode && !col.synthetic) {
      const value = (() => {
        switch (field) {
          case 'token':
            return col.token;
          case 'name':
            return col.name;
          case 'daysOffset':
            return col.daysOffset != null ? String(col.daysOffset) : '';
          case 'timeSpent':
            if (col.kind === 'level') {
              return col.timeSpent != null ? String(col.timeSpent) : '';
            }
            if (mode === 'all' && col.timeSpent != null) {
              return String(col.timeSpent);
            }
            return '';
          default:
            return '';
        }
      })();

      const handleChange = (newValue: string, fieldOverride?: string) => {
        const targetField = fieldOverride || field;
        if (col.kind === 'level' && onUpdateLevel) {
          let processedValue: any = newValue;
          if (targetField === 'daysOffset' || targetField === 'timeSpent') {
            processedValue = newValue === '' ? null : Number(newValue);
          }
          onUpdateLevel(col.id as number, targetField === 'daysOffset' ? 'days_offset' : targetField === 'timeSpent' ? 'time_spent' : targetField, processedValue);
        } else if (col.kind === 'purchase' && onUpdatePurchaseEvent) {
          let processedValue: any = newValue;
          if (targetField === 'daysOffset' || targetField === 'maxDaysOffset') {
            processedValue = newValue === '' ? null : Number(newValue);
          }
          onUpdatePurchaseEvent(col.id as number, targetField === 'daysOffset' ? 'days_offset' : targetField === 'maxDaysOffset' ? 'max_days_offset' : targetField, processedValue);
        }
      };

      if (col.kind === 'purchase' && field === 'daysOffset') {
        return (
          <div className="flex flex-col gap-1">
            <Input
              value={col.daysOffset != null ? String(col.daysOffset) : ''}
              onChange={(e) => handleChange(e.target.value, 'daysOffset')}
              className="h-8 text-xs"
              placeholder={t('levels.daysOffset')}
            />
            {col.isRestricted && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] whitespace-nowrap text-muted-foreground">{t('purchaseEvents.lessThan')}</span>
                <Input
                  value={col.maxDaysOffset != null ? String(col.maxDaysOffset) : ''}
                  onChange={(e) => handleChange(e.target.value, 'maxDaysOffset')}
                  className="h-7 text-[10px] px-1"
                />
              </div>
            )}
          </div>
        );
      }

      return (
        <Input
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="h-8 text-xs"
          disabled={field === 'timeSpent' && col.kind === 'purchase'}
        />
      );
    }

    switch (field) {
      case 'token':
        return col.token;
      case 'name':
        return col.name;
      case 'daysOffset':
        if (col.kind === 'level') {
          return col.daysOffset != null ? col.daysOffset : '-';
        }
        if (col.kind === 'purchase') {
          const base = col.daysOffset != null ? String(col.daysOffset) : '-';
          if (col.isRestricted && col.maxDaysOffset != null) {
            return `${base} (${t('purchaseEvents.lessThan')} ${col.maxDaysOffset})`;
          }
          return base;
        }
        return '-';
      case 'timeSpent':
        return col.kind === 'level' ? (col.timeSpent != null ? col.timeSpent : '-') : '-';
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

  if (columns.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {t('games.noDetails')}
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
            {isEditMode && columns.some(col => !col.synthetic) && (
              <TableHead style={headerStyle} className="w-16">{t('common.actions', 'Actions')}</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((col) => {
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
                {isEditMode && !col.synthetic && (
                  <TableCell style={combinedStyle} className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (col.kind === 'level' && onDeleteLevel) {
                          onDeleteLevel(col.id as number);
                        } else if (col.kind === 'purchase' && onDeletePurchaseEvent) {
                          onDeletePurchaseEvent(col.id as number);
                        }
                      }}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
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

        {isEditMode && columns.some(col => !col.synthetic) && (
          <TableRow>
            <TableHead style={headerStyle}>{t('common.actions', 'Actions')}</TableHead>
            {columns.map((col) => {
              const columnStyle = getColumnSpecificStyle(col);
              const combinedStyle = { ...dataRowStyle, ...columnStyle };

              return (
                <TableCell key={`actions-${col.kind}-${col.id}`} style={combinedStyle} className="text-center">
                  {!col.synthetic ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (col.kind === 'level' && onDeleteLevel) {
                          onDeleteLevel(col.id as number);
                        } else if (col.kind === 'purchase' && onDeletePurchaseEvent) {
                          onDeletePurchaseEvent(col.id as number);
                        }
                      }}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
