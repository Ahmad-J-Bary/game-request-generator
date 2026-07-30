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
  onAddPurchaseEvent?: (data: { event_token: string; level_name: string; days_offset: number; max_days_offset: number | null; is_restricted: boolean }) => void;
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
  const [newPurchase, setNewPurchase] = useState({ event_token: '', level_name: '', days_offset: 0, max_days_offset: null as number | null, is_restricted: false });

  const resetForms = () => {
    setNewLevel({ level_name: '', event_token: '', days_offset: 0, time_spent: 0, is_bonus: false });
    setNewPurchase({ event_token: '', level_name: '', days_offset: 0, max_days_offset: null, is_restricted: false });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addKind === 'level' && onAddLevel) {
      onAddLevel(newLevel);
    } else if (addKind === 'purchase' && onAddPurchaseEvent) {
      onAddPurchaseEvent(newPurchase);
    }
    resetForms();
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

      const mapField = (f: string): string => {
        if (f === 'token') return 'event_token';
        if (f === 'daysOffset') return 'days_offset';
        if (f === 'timeSpent') return 'time_spent';
        if (f === 'maxDaysOffset') return 'max_days_offset';
        if (f === 'name') return 'level_name';
        return f;
      };

      const handleChange = (newValue: any, fieldOverride?: string) => {
        const targetField = fieldOverride || field;
        const dbField = mapField(targetField);
        if (col.kind === 'level' && onUpdateLevel) {
          let processedValue: any = newValue;
          if (dbField === 'days_offset' || dbField === 'time_spent') {
            processedValue = newValue === '' ? null : Number(newValue);
          }
          onUpdateLevel(col.id as number, dbField, processedValue);
        } else if (col.kind === 'purchase' && onUpdatePurchaseEvent) {
          let processedValue: any = newValue;
          if (dbField === 'days_offset' || dbField === 'max_days_offset') {
            processedValue = newValue === '' ? null : Number(newValue);
          }
          onUpdatePurchaseEvent(col.id as number, dbField, processedValue);
        }
      };

      if (col.kind === 'level' && field === 'name') {
        return (
          <div className="flex flex-col gap-1 min-w-0">
            <Input
              value={col.name}
              onChange={(e) => handleChange(e.target.value, 'name')}
              className="h-7 text-[10px]"
              placeholder={t('levels.levelName')}
            />
            <div className="flex items-center gap-1.5 group cursor-pointer" onClick={() => handleChange(!col.isBonus, 'is_bonus')}>
              <input
                type="checkbox"
                checked={col.isBonus}
                onChange={() => {}}
                className="h-3 w-3 cursor-pointer"
              />
              <span className="text-[9px] whitespace-nowrap leading-none select-none text-muted-foreground">
                {t('levels.isBonus', 'Bonus Level')}
              </span>
            </div>
          </div>
        );
      }

      if (col.kind === 'purchase' && field === 'name') {
        return (
          <div className="flex flex-col gap-1 min-w-0">
            <Input
              value={col.name}
              onChange={(e) => handleChange(e.target.value, 'name')}
              className="h-7 text-[10px]"
              placeholder={t('levels.eventToken')}
            />
            <div className="flex items-center gap-1.5 group cursor-pointer" onClick={() => handleChange(!col.isRestricted, 'is_restricted')}>
              <input
                type="checkbox"
                checked={col.isRestricted}
                onChange={() => {}}
                className="h-3 w-3 cursor-pointer"
              />
              <span className="text-[9px] whitespace-nowrap leading-none select-none text-muted-foreground">
                {t('purchaseEvents.isRestricted')}
              </span>
            </div>
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
        if (col.kind === 'level' && col.isBonus) return `${col.name} ★`;
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

  const actionsColumnStyle: React.CSSProperties = {
    backgroundColor: colors.headerColor,
    color: theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)',
    width: 56,
    minWidth: 56,
    maxWidth: 56,
    padding: 0,
    verticalAlign: 'middle',
    borderLeft: '1px solid color-mix(in srgb, transparent 85%, currentColor)',
  };

  // Vertical layout
  return (
    <Table>
      <TableBody>
        <TableRow>
          <TableHead style={headerStyle}>{t('levels.eventToken')}</TableHead>
          {columns.map((col) => {
            const columnStyle = getColumnSpecificStyle(col);
            const combinedStyle = { ...dataRowStyle, ...columnStyle };

            return (
              <DataTableCell key={`token-${col.kind}-${col.id}`} style={combinedStyle}>
                {renderCellContent(col, 'token')}
              </DataTableCell>
            );
          })}
          <TableCell style={actionsColumnStyle}>
            <Popover open={isAdding} onOpenChange={setIsAdding}>
                <PopoverTrigger asChild>
                    <Button variant="ghost" className="h-full w-full p-1.5 flex items-center justify-center bg-transparent hover:bg-white/25 dark:hover:bg-black/25 active:bg-white/35 dark:active:bg-black/35 transition-colors duration-150 rounded-none focus-visible:ring-1 focus-visible:ring-foreground/30">
                        <Plus className="h-6 w-6 text-foreground/60" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-0 overflow-hidden backdrop-blur-2xl bg-popover/95 border-border/40 shadow-2xl" side="bottom" align="end">
                    <div className="px-4 pt-3 pb-2 border-b border-border/10">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('common.add', 'Add')}</span>
                    </div>
                    <form onSubmit={handleAddSubmit} className="space-y-4 p-4">
                        <div className="flex rounded-lg overflow-hidden border border-border/30 bg-accent/30 p-0.5">
                            <button
                                type="button"
                                onClick={() => setAddKind('level')}
                                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${addKind === 'level' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {t('levels.title', 'Level')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setAddKind('purchase')}
                                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${addKind === 'purchase' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {t('purchaseEvents.title', 'Purchase')}
                            </button>
                        </div>

                        {addKind === 'level' ? (
                            <div className="space-y-3">
                                <div className="grid gap-1">
                                    <Label className="text-xs">{t('levels.eventToken')}</Label>
                                    <Input value={newLevel.event_token} onChange={e => setNewLevel({...newLevel, event_token: e.target.value})} className="h-8" />
                                </div>
                                <div className="grid gap-1">
                                    <Label className="text-xs">{t('levels.levelName')}</Label>
                                    <Input value={newLevel.level_name} onChange={e => setNewLevel({...newLevel, level_name: e.target.value})} className="h-8" />
                                </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="grid gap-1">
                                            <Label className="text-[10px]">{t('levels.daysOffset')}</Label>
                                            <Input type="number" value={newLevel.days_offset} onChange={e => setNewLevel({...newLevel, days_offset: Number(e.target.value)})} className="h-8" />
                                        </div>
                                        <div className="grid gap-1">
                                            <Label className="text-[10px]">{t('levels.timeSpent')}</Label>
                                            <Input type="number" value={newLevel.time_spent} onChange={e => setNewLevel({...newLevel, time_spent: Number(e.target.value)})} className="h-8" />
                                        </div>
                                    </div>
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" checked={newLevel.is_bonus} onChange={e => setNewLevel({...newLevel, is_bonus: e.target.checked})} className="h-3.5 w-3.5" />
                                    <Label className="text-xs cursor-pointer">{t('levels.isBonus', 'Bonus Level')}</Label>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="grid gap-1">
                                    <Label className="text-xs">{t('levels.eventToken')}</Label>
                                    <Input value={newPurchase.event_token} onChange={e => setNewPurchase({...newPurchase, event_token: e.target.value})} className="h-8" />
                                </div>
                                <div className="grid gap-1">
                                    <Label className="text-xs">{t('levels.levelName')}</Label>
                                    <Input value={newPurchase.level_name} onChange={e => setNewPurchase({...newPurchase, level_name: e.target.value})} className="h-8" />
                                </div>
                                <div className="grid gap-1">
                                    <Label className="text-xs">{t('levels.daysOffset')}</Label>
                                    <Input type="number" value={newPurchase.days_offset} onChange={e => setNewPurchase({...newPurchase, days_offset: Number(e.target.value)})} className="h-8" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" checked={newPurchase.is_restricted} onChange={e => setNewPurchase({...newPurchase, is_restricted: e.target.checked})} className="h-3.5 w-3.5" />
                                    <Label className="text-xs cursor-pointer">{t('purchaseEvents.isRestricted')}</Label>
                                </div>
                                {newPurchase.is_restricted && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground shrink-0">{t('purchaseEvents.lessThan')}</span>
                                        <Input
                                            type="number"
                                            value={newPurchase.max_days_offset ?? ''}
                                            onChange={e => setNewPurchase({...newPurchase, max_days_offset: e.target.value ? Number(e.target.value) : null})}
                                            className="h-8"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <Button type="submit" size="sm" className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-600/20 hover:shadow-green-500/30 transition-all duration-200">
                            {t('common.add', 'Add Column')}
                        </Button>
                    </form>
                </PopoverContent>
            </Popover>
          </TableCell>
        </TableRow>

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
          <TableCell style={actionsColumnStyle} />
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
          <TableCell style={actionsColumnStyle} />
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
          <TableCell style={actionsColumnStyle} />
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
            <TableCell style={actionsColumnStyle} />
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
