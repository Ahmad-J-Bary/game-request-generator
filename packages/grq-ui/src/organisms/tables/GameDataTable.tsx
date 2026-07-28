// src/components/tables/GameDataTable.tsx
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@grq/ui/atoms/table';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { useSettings, useColorStyle } from '@grq/ui/contexts/SettingsContext';
import { useTheme } from '@grq/ui/contexts/ThemeContext';
import { DataTableCell } from './DataTableCell';
import { Trash2 } from 'lucide-react';

type ColumnData =
  | { kind: 'level'; id: number | string; token: string; name: string; daysOffset: number | string | null; timeSpent: number | null; isBonus: boolean; synthetic?: boolean }
  | { kind: 'purchase'; id: number | string; token: string; name: string; isRestricted: boolean; daysOffset: number | null; maxDaysOffset: number | string | null; timeSpent: number | null; synthetic?: boolean };

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@grq/ui/atoms/popover';
import { Plus } from 'lucide-react';
import { Label } from '@grq/ui/atoms/label';
import { useState } from 'react';

interface GameDataTableProps {
  columns: ColumnData[];
  isEditMode?: boolean;
  onDeleteLevel?: (levelId: number) => void;
  onDeletePurchaseEvent?: (eventId: number) => void;
  onUpdateLevel?: (levelId: number, field: string, value: any) => void;
  onUpdatePurchaseEvent?: (eventId: number, field: string, value: any) => void;
  onAddLevel?: (data: { level_name: string; event_token: string; days_offset: number; time_spent: number; is_bonus: boolean }) => void;
  onAddPurchaseEvent?: (data: { event_token: string; days_offset: number; max_days_offset: number | null; is_restricted: boolean }) => void;
  mode?: 'event-only' | 'all';
}

export function GameDataTable({
  columns,
  isEditMode = false,
  onDeleteLevel,
  onDeletePurchaseEvent,
  onUpdateLevel,
  onUpdatePurchaseEvent,
  onAddLevel,
  onAddPurchaseEvent,
  mode = 'event-only'
}: GameDataTableProps) {
  const { t } = useTranslation();
  const { colors } = useSettings();
  const { theme } = useTheme();
  const getColorStyle = useColorStyle();

  // Form State for new columns
  const [isAdding, setIsAdding] = useState(false);
  const [addKind, setAddKind] = useState<'level' | 'purchase'>('level');
  const [newLevel, setNewLevel] = useState({ level_name: '', event_token: '', days_offset: 0, time_spent: 0, is_bonus: false });
  const [newPurchase, setNewPurchase] = useState({ event_token: '', days_offset: 0, max_days_offset: null as number | null, is_restricted: false });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addKind === 'level' && onAddLevel) {
      onAddLevel(newLevel);
    } else if (addKind === 'purchase' && onAddPurchaseEvent) {
      onAddPurchaseEvent(newPurchase);
    }
    setIsAdding(false);
  };

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

      const handleChange = (newValue: any, fieldOverride?: string) => {
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

      if (col.kind === 'purchase' && field === 'name') {
        return (
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => handleChange(!col.isRestricted, 'is_restricted')}>
            <input
              type="checkbox"
              checked={col.isRestricted}
              onChange={() => {}} // Controlled by onClick on container for better touch/click area
              className="h-3.5 w-3.5 cursor-pointer"
            />
            <span className="text-[10px] whitespace-nowrap leading-none select-none">
                {t('purchaseEvents.isRestricted')}
            </span>
          </div>
        );
      }

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

  // Remove the empty check to allow the Plus button to always show in the header

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
          <TableHead style={headerStyle} className="w-12 p-0">
                <Popover open={isAdding} onOpenChange={setIsAdding}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-full w-full hover:bg-black/10">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-4" side="bottom" align="end">
                        <form onSubmit={handleAddSubmit} className="space-y-4">
                            <div className="flex items-center gap-4 mb-2">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="radio" checked={addKind === 'level'} onChange={() => setAddKind('level')} name="addKindDetails" />
                                    {t('levels.title', 'Level')}
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="radio" checked={addKind === 'purchase'} onChange={() => setAddKind('purchase')} name="addKindDetails" />
                                    {t('purchaseEvents.title', 'Purchase')}
                                </label>
                            </div>

                            {addKind === 'level' ? (
                                <div className="space-y-3">
                                    <div className="grid gap-1">
                                        <Label className="text-xs">{t('levels.levelName')}</Label>
                                        <Input value={newLevel.level_name} onChange={e => setNewLevel({...newLevel, level_name: e.target.value})} className="h-8" />
                                    </div>
                                    <div className="grid gap-1">
                                        <Label className="text-xs">{t('levels.eventToken')}</Label>
                                        <Input value={newLevel.event_token} onChange={e => setNewLevel({...newLevel, event_token: e.target.value})} className="h-8" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="grid gap-1">
                                            <Label className="text-xs">{t('levels.daysOffset')}</Label>
                                            <Input type="number" value={newLevel.days_offset} onChange={e => setNewLevel({...newLevel, days_offset: Number(e.target.value)})} className="h-8" />
                                        </div>
                                        <div className="grid gap-1">
                                            <Label className="text-xs">{t('levels.timeSpent')}</Label>
                                            <Input type="number" value={newLevel.time_spent} onChange={e => setNewLevel({...newLevel, time_spent: Number(e.target.value)})} className="h-8" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="grid gap-1">
                                        <Label className="text-xs">{t('levels.eventToken')}</Label>
                                        <Input value={newPurchase.event_token} onChange={e => setNewPurchase({...newPurchase, event_token: e.target.value})} className="h-8" />
                                    </div>
                                    <div className="grid gap-1">
                                        <Label className="text-xs">{t('levels.daysOffset')}</Label>
                                        <Input type="number" value={newPurchase.days_offset} onChange={e => setNewPurchase({...newPurchase, days_offset: Number(e.target.value)})} className="h-8" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" checked={newPurchase.is_restricted} onChange={e => setNewPurchase({...newPurchase, is_restricted: e.target.checked})} />
                                        <Label className="text-xs cursor-pointer">{t('purchaseEvents.isRestricted')}</Label>
                                    </div>
                                </div>
                            )}

                            <Button type="submit" size="sm" className="w-full bg-green-600 hover:bg-green-700">
                                {t('common.add', 'Add Column')}
                            </Button>
                        </form>
                    </PopoverContent>
                </Popover>
          </TableHead>
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
          <TableCell style={dataRowStyle} />
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
          <TableCell style={dataRowStyle} />
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
          <TableCell style={dataRowStyle} />
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
            <TableCell style={dataRowStyle} />
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
