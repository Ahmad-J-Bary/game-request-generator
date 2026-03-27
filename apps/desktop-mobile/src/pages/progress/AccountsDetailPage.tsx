// src/pages/progress/AccountsDetailPage.tsx

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@grq/ui/atoms/card';
import { LayoutToggle, Layout } from '@grq/ui/molecules/LayoutToggle';
import { GameSelector } from '@grq/ui/molecules/GameSelector';
import { BackButton } from '@grq/ui/molecules/BackButton';
import { AccountsDataTable } from '@grq/ui/organisms/tables/AccountsDataTable';
import { ImportDialog } from '@grq/ui/molecules/ImportDialog';
import { ExportDialog } from '@grq/ui/molecules/ExportDialog';
import { Button } from '@grq/ui/atoms/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@grq/ui/atoms/dropdown-menu';
import { Download, Upload, ChevronDown, Edit3, Save, X, MoreVertical } from 'lucide-react';

import { useAccounts } from '@grq/core/hooks/useAccounts';
import { useLevels } from '@grq/core/hooks/useLevels';
import { usePurchaseEvents } from '@grq/core/hooks/usePurchaseEvents';
import { ProgressProvider } from '@grq/ui/organisms/progress/ProgressProvider';
import { useSettings } from '@grq/ui/contexts/SettingsContext';
import { useTheme } from '@grq/ui/contexts/ThemeContext';
import { useGames } from '@grq/core/hooks/useGames';
import { TauriService } from '@grq/core/services/tauri.service';
import { ExcelTabBar } from '@grq/ui/organisms/ExcelTabBar';
import { Popover, PopoverContent, PopoverTrigger } from '@grq/ui/atoms/popover';
import { Label } from '@grq/ui/atoms/label';

import type { PurchaseEvent } from '@grq/api-bindings';
import type { ColumnData } from '@grq/ui/organisms/tables/AccountsDataTable';
import type { ColorSettings } from '@grq/ui/contexts/SettingsContext';

type Mode = 'all' | 'event-only';

function parseDate(input?: string): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function formatDateShort(date: Date | null): string {
  if (!date) return '-';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()}-${months[date.getMonth()]}`;
}



export default function AccountsDetailPage() {
  const { t } = useTranslation();
  const { colors } = useSettings();
  const { theme } = useTheme();
  const [layout, setLayout] = useState<Layout>('vertical');
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();
  const [mode, setMode] = useState<Mode>('event-only');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportType, setExportType] = useState<'game' | 'account' | 'all'>('game');

  const { accounts = [] } = useAccounts(selectedGameId);
  const { levels = [] } = useLevels(selectedGameId);
  const { events: purchaseEvents = [] } = usePurchaseEvents(selectedGameId);
  const { games } = useGames();

  const handleCreateGameAsync = async (name: string) => {
    try {
        const newId = await TauriService.addGame({ name });
        if (newId) {
            window.dispatchEvent(new CustomEvent('games-updated', { detail: { id: newId } }));
            setSelectedGameId(newId);
        }
    } catch (error) {
        console.error('Failed to create game:', error);
    }
  };

  const columns = useMemo(() => {
    const levelCols = levels.map((l) => ({
      kind: 'level' as const,
      id: l.id,
      token: l.event_token.split('_day')[0],
      name: l.level_name,
      daysOffset: l.days_offset,
      timeSpent: l.time_spent,
      isBonus: l.is_bonus,
      synthetic: l.level_name === '-',
    }));

    const peCols = purchaseEvents.map((p: PurchaseEvent) => {
      const day = p.days_offset;
      let midpointTime: number | null = null;

      if (day != null) {
        const numericLevels = levelCols
          .filter(l => typeof l.daysOffset === 'number' && l.daysOffset !== null)
          .sort((a, b) => (a.daysOffset as number) - (b.daysOffset as number));

        if (numericLevels.length > 0) {
          const sameDayLevels = numericLevels.filter(l => (l.daysOffset as number) === day);
          const nextLevel = numericLevels.find(l => (l.daysOffset as number) > day);

          const levelsToAverage = [...sameDayLevels];
          if (nextLevel) {
            levelsToAverage.push(nextLevel);
          }

          if (levelsToAverage.length > 0) {
            const totalTimeSpent = levelsToAverage.reduce((sum, level) => sum + (level.timeSpent || 0), 0);
            midpointTime = Math.round(totalTimeSpent / levelsToAverage.length);
          }
        }
      }

      return {
        kind: 'purchase' as const,
        id: p.id,
        token: p.event_token,
        name: '$$$',
        isRestricted: p.is_restricted ?? false,
        daysOffset: day != null ? day : null,
        timeSpent: midpointTime,
        maxDaysOffset: p.max_days_offset != null ? `${t('purchaseEvents.lessThan')} ${p.max_days_offset}` : '-',
      } as const;
    });

    const allCols = [...levelCols, ...peCols];
    const numeric = allCols.filter((c) => typeof c.daysOffset === 'number' && c.daysOffset !== null) as (typeof allCols[number] & { daysOffset: number })[];
    numeric.sort((a, b) => {
      if (a.daysOffset !== b.daysOffset) {
        return a.daysOffset - b.daysOffset;
      }
      if (a.kind !== b.kind) {
        return a.kind === 'level' ? -1 : 1;
      }
      return String(a.id).localeCompare(String(b.id));
    });

    if (mode === 'event-only') {
      const levels = allCols.filter((c) => c.kind === 'level' && c.name !== '-');
      const purchases = allCols.filter((c) => c.kind === 'purchase');

      levels.sort((a, b) => (a.daysOffset || 0) - (b.daysOffset || 0));
      purchases.sort((a, b) => {
        if (a.daysOffset === b.daysOffset) return 0;
        if (b.daysOffset == null) return -1;
        if (a.daysOffset == null) return 1;
        return a.daysOffset - b.daysOffset;
      });

      return [...levels, ...purchases];
    }

    // Separate levels and purchase events
    const levelEntries = numeric.filter(entry => entry.kind === 'level');
    const purchaseEntries = numeric.filter(entry => entry.kind === 'purchase');

    // Group level entries by daysOffset to handle multiple entries per day
    const levelEntriesByDay: { [day: number]: typeof levelEntries[number][] } = {};
    levelEntries.forEach(entry => {
      if (!levelEntriesByDay[entry.daysOffset]) {
        levelEntriesByDay[entry.daysOffset] = [];
      }
      levelEntriesByDay[entry.daysOffset].push(entry);
    });

    let minDay = levelEntries.length > 0 ? levelEntries[0].daysOffset : 0;
    const maxDay = levelEntries.length > 0 ? levelEntries[levelEntries.length - 1].daysOffset : 0;

    if (levelEntries.length > 0 && minDay > 0) {
      minDay = 0;
    }

    const result: (typeof numeric[number] | { kind: 'level'; id: string; token: string; name: string; daysOffset: number; timeSpent: number | null; isBonus: boolean; synthetic: boolean })[] = [];

    // Process levels first (including synthetic levels for missing days)
    for (let day = minDay; day <= maxDay; day++) {
      if (levelEntriesByDay[day]) {
        result.push(...levelEntriesByDay[day]);
      } else {
        // Find the next real level after this day
        let nextRealLevel = null;
        for (let d = day + 1; d <= maxDay; d++) {
          if (levelEntriesByDay[d]) {
            const nonSyntheticLevels = levelEntriesByDay[d].filter(entry => entry.kind === 'level' && !entry.synthetic);
            if (nonSyntheticLevels.length > 0) {
              nextRealLevel = nonSyntheticLevels[0];
              break;
            }
          }
        }

        let synthesizedTime: number | null = null;
        let token = '';

        if (nextRealLevel) {
          const realLevelDays = levelEntries
            .filter(entry => entry.kind === 'level' && !entry.synthetic)
            .map(entry => entry.daysOffset);

          const firstRealDay = Math.min(...realLevelDays);
          const isBeforeFirstReal = day < firstRealDay;

          if (isBeforeFirstReal) {
            const increment = nextRealLevel.timeSpent / (firstRealDay + 1);
            synthesizedTime = Math.round((day + 1) * increment);
            token = nextRealLevel.token;
          } else {
            let prevRealLevel = null;
            for (let d = day - 1; d >= minDay; d--) {
              if (levelEntriesByDay[d]) {
                const nonSyntheticLevels = levelEntriesByDay[d].filter(entry => entry.kind === 'level' && !entry.synthetic);
                if (nonSyntheticLevels.length > 0) {
                  prevRealLevel = nonSyntheticLevels[nonSyntheticLevels.length - 1];
                  break;
                }
              }
            }

            if (prevRealLevel) {
              const ratio = (day - prevRealLevel.daysOffset) / (nextRealLevel.daysOffset - prevRealLevel.daysOffset);
              synthesizedTime = Math.round(prevRealLevel.timeSpent + ratio * (nextRealLevel.timeSpent - prevRealLevel.timeSpent));
              token = nextRealLevel.token;
            } else {
              synthesizedTime = Math.round(nextRealLevel.timeSpent / 2);
              token = nextRealLevel.token;
            }
          }
        }

        if (token) {
          result.push({
            kind: 'level' as const,
            id: `synth-${token}-${day}`,
            token: token,
            name: '-',
            daysOffset: day,
            timeSpent: synthesizedTime,
            isBonus: false,
            synthetic: true,
          });
        }
      }
    }

    // Add purchase events at the end
    purchaseEntries.sort((a, b) => {
      if (a.daysOffset === b.daysOffset) return 0;
      if (a.daysOffset == null) return 1;
      if (b.daysOffset == null) return -1;
      return a.daysOffset - b.daysOffset;
    });
    result.push(...purchaseEntries);

    const numericIds = new Set(numeric.map((c) => c.id));
    const nonNumeric = allCols.filter((c) => !numericIds.has(c.id));
    return [...result, ...nonNumeric];
  }, [levels, purchaseEvents, mode, t]);

  // Handlers defined inside the render loop OR we move the render loop up
  // We can define the handlers here but they will need `levelsProgress` which is not yet available.
  // So we will define a InnerComponent or just inline the logic in the render prop.
  // For cleanliness, I'll put the big JSX block inside the render prop and define handlers there? 
  // No, React doesn't like defining functions inside render during every render (perf).
  // But here we need closure over `levelsProgress`.
  // Better approach: Separate component `AccountsDetailContent` that takes `levelsProgress` as prop.
  
  return (
    <div className="w-full px-1 sm:px-2 space-y-4 lg:space-y-6 min-h-[calc(100vh-4rem)] relative flex flex-col">
       <ProgressProvider accounts={accounts}>
         {({ levelsProgress, purchaseProgress }) => (
            <AccountsDetailContent 
               accounts={accounts}
               levels={levels}
               purchaseEvents={purchaseEvents}
               games={games}
               selectedGameId={selectedGameId}
               setSelectedGameId={setSelectedGameId}
               mode={mode}
               setMode={setMode}
               layout={layout}
               setLayout={setLayout}
               colors={colors}
               theme={theme}
               t={t}
               columns={columns}
               levelsProgress={levelsProgress}
               purchaseProgress={purchaseProgress}
               showImportDialog={showImportDialog}
               setShowImportDialog={setShowImportDialog}
               showExportDialog={showExportDialog}
               setShowExportDialog={setShowExportDialog}
               exportType={exportType}
               setExportType={setExportType}
               handleCreateGameAsync={handleCreateGameAsync}
            />
         )}
       </ProgressProvider>
    </div>
  );
}

interface AccountsDetailContentProps {
  accounts: import('@grq/api-bindings').Account[];
  levels: import('@grq/api-bindings').Level[];
  purchaseEvents: import('@grq/api-bindings').PurchaseEvent[];
  games: import('@grq/api-bindings').Game[];
  selectedGameId?: number;
  setSelectedGameId: (id?: number) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  layout: Layout;
  setLayout: (layout: Layout) => void;
  colors: ColorSettings;
  theme: 'light' | 'dark';
  t: import('i18next').TFunction;
  columns: ColumnData[];
  levelsProgress: { [key: string]: import('@grq/api-bindings/types/progress.types').AccountLevelProgress };
  purchaseProgress: { [key: string]: import('@grq/api-bindings/types/progress.types').AccountPurchaseEventProgress };
  showImportDialog: boolean;
  setShowImportDialog: (show: boolean) => void;
  showExportDialog: boolean;
  setShowExportDialog: (show: boolean) => void;
  exportType: 'game' | 'account' | 'all';
  setExportType: (type: 'game' | 'account' | 'all') => void;
  handleCreateGameAsync: (name: string) => Promise<void>;
}

// Separate component to handle the logic that depends on Progress
function AccountsDetailContent({
    accounts, purchaseEvents, games, selectedGameId, setSelectedGameId,
    mode, setMode, layout, setLayout, colors, theme, t, columns, levelsProgress, purchaseProgress,
    showImportDialog, setShowImportDialog, showExportDialog, setShowExportDialog, exportType, setExportType,
    handleCreateGameAsync
}: AccountsDetailContentProps) {
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [tempProgress, setTempProgress] = useState<{
    levels: { [key: string]: boolean };
    purchases: { [key: string]: boolean };
  }>({
    levels: {},
    purchases: {},
  });
  const [tempPurchaseDates, setTempPurchaseDates] = useState<{ [key: number]: Date | null }>({});

  const handleEditToggle = () => {
    if (!isEditMode) {
      const levelProg: { [key: string]: boolean } = {};
      const purchaseProg: { [key: string]: boolean } = {};
      const purchaseDates: { [key: number]: Date | null } = {};

      // Init logic
      // We iterate the 'columns' or 'accounts' + 'events'.
      // Iterate existing progress to fill init state
      Object.keys(levelsProgress).forEach(key => {
        levelProg[key] = levelsProgress[key].is_completed;
      });
      
      Object.keys(purchaseProgress).forEach(key => {
        const prog = purchaseProgress[key];
        purchaseProg[key] = prog.is_completed;
        
        // key is `${accId}_${peId}`
        const [accIdStr, peIdStr] = key.split('_');
        const accId = parseInt(accIdStr);
        const peId = parseInt(peIdStr);
        const compositeId = accId * 100000 + peId;
        
        const account = accounts.find((a) => a.id === accId);
        if (account) {
             const start = parseDate(account.start_date);
             if (start) {
                  purchaseDates[compositeId] = addDays(start, prog.days_offset);
             }
        }
      });

      setTempProgress({
        levels: levelProg,
        purchases: purchaseProg,
      });
      setTempPurchaseDates(purchaseDates);
    }
    setIsEditMode(!isEditMode);
  };

  const handleProgressChange = (type: 'level' | 'purchase', id: number | string, completed: boolean) => {
    setTempProgress(prev => ({
      ...prev,
      [type === 'level' ? 'levels' : 'purchases']: {
        ...prev[type === 'level' ? 'levels' : 'purchases'],
        [id]: completed,
      },
    }));
  };

  const handlePurchaseDateChange = (compositeId: number, date: Date | null) => {
    setTempPurchaseDates(prev => ({
      ...prev,
      [compositeId]: date
    }));
  };

  const handleSaveProgress = async () => {
      // Save logic (same as previous)
      
      const updatePromises: Promise<unknown>[] = [];

      const purchaseKeys = new Set(Object.keys(tempProgress.purchases));
      Object.keys(tempPurchaseDates).forEach(k => {
          const compId = parseInt(k);
          const peId = compId % 100000;
          const accId = Math.floor(compId / 100000);
          purchaseKeys.add(`${accId}_${peId}`);
      });

      for (const key of Array.from(purchaseKeys)) {
        const [accIdStr, peIdStr] = key.split('_');
        const accId = parseInt(accIdStr);
        const peId = parseInt(peIdStr);
        const isCompleted = tempProgress.purchases[key] ?? false;
        
        const compositeId = accId * 100000 + peId;
        const selectedDate = tempPurchaseDates[compositeId];
        
        const account = accounts.find((a) => a.id === accId);
        if (!account) continue;
        
         const eventDef = purchaseEvents.find((e) => e.id === peId);
         const defaultOffset = typeof eventDef?.days_offset === 'number' ? eventDef.days_offset : (eventDef?.max_days_offset || 0);
         
         let daysOffset = defaultOffset;
        
         let calculatedTimeSpent = 0;

        if (selectedDate) {
          const start = parseDate(account.start_date);
          if (start) {
             const diff = selectedDate.getTime() - start.getTime();
             daysOffset = Math.round(diff / (1000 * 60 * 60 * 24));
             
              // Calculate time_spent based on surrounding levels (from columns)
              const numericLevels = columns
                 .filter((c) => c.kind === 'level' && typeof c.daysOffset === 'number')
                 .sort((a, b) => (Number(a.daysOffset) || 0) - (Number(b.daysOffset) || 0));

              if (numericLevels.length > 0) {
                 const sameDayLevels = numericLevels.filter((l) => (Number(l.daysOffset) || 0) === daysOffset);
                 const nextLevel = numericLevels.find((l) => (Number(l.daysOffset) || 0) > daysOffset);
                 
                 const levelsToAverage = [...sameDayLevels];
                 if (nextLevel) levelsToAverage.push(nextLevel);
                 
                 if (levelsToAverage.length > 0) {
                     const totalTimeSpent = levelsToAverage.reduce((sum: number, level) => sum + (level.timeSpent || 0), 0);
                     calculatedTimeSpent = Math.round(totalTimeSpent / levelsToAverage.length);
                 }
              }
             
             if (calculatedTimeSpent <= 0) {
                 // Fallback
                 const existingProgress = purchaseProgress[`${accId}_${peId}`];
                 if (existingProgress && existingProgress.time_spent > 0) {
                     calculatedTimeSpent = existingProgress.time_spent;
                 } else {
                     calculatedTimeSpent = 243;
                 }
             }
          }
        }
        
        const progressKey = `${accId}_${peId}`;
        const existing = purchaseProgress[progressKey];
        
        if (existing) {
             // If we calculated a new time (because date changed), use it. otherwise keep existing.
             const timeToUse = calculatedTimeSpent > 0 ? calculatedTimeSpent : existing.time_spent;
             
             updatePromises.push(TauriService.updatePurchaseEventProgress({
                account_id: accId,
                purchase_event_id: peId,
                is_completed: isCompleted,
                days_offset: daysOffset,
                time_spent: timeToUse
             }));
        } else {
             if (isCompleted || selectedDate) {
                 const timeToUse = calculatedTimeSpent > 0 ? calculatedTimeSpent : 243;
                 
                 updatePromises.push((async () => {
                     await TauriService.createPurchaseEventProgress({
                        account_id: accId,
                        purchase_event_id: peId,
                        days_offset: daysOffset,
                        time_spent: timeToUse
                     });
                     if (isCompleted) {
                        await TauriService.updatePurchaseEventProgress({
                             account_id: accId,
                             purchase_event_id: peId,
                             is_completed: true
                        });
                     }
                 })());
             }
        }
      }
      
      for (const key of Object.keys(tempProgress.levels)) {
         // Process all keys, even if unchecked, to ensure we can mark them incomplete
         
         const [accIdStr, lvlIdStr] = key.split('_');
         const accId = parseInt(accIdStr);
         let lvlId = parseInt(lvlIdStr);
         
         const isCompleted = tempProgress.levels[key];
         
         // Handle synthetic levels
         if (lvlIdStr.startsWith('synth')) {
            if (!isCompleted) continue; // If unchecking a synthetic level that doesn't exist, ignore
            
            // Find column definition
            const col = columns.find((c) => c.id === lvlIdStr);
            if (!col) continue;
            
            // Create real level
             // Find account to get game_id
            const account = accounts.find((a) => a.id === accId);
            if (!account) continue;

            const newLevel = {
              game_id: account.game_id,
              branch_id: account.branch_id!,
              level_name: col.name,
              event_token: `${col.token}_day${col.daysOffset}`,
              days_offset: col.daysOffset,
              time_spent: col.timeSpent as number,
              is_bonus: col.isBonus
            };
            
            try {
                // Try to find existing first? Or just add and expect backend to handle?
                // For safety, let's just add. If it duplicates, we might have issues, 
                // but usually we check. Let's do a quick check if possible or blindly add if strict strict.
                // Replicating AccountDetailPage logic strictly:
                const existingLevels = await TauriService.getGameLevels(account.game_id);
                const existingLevel = existingLevels.find((l) =>
                  l.days_offset === newLevel.days_offset &&
                  l.event_token === newLevel.event_token
                );
                
                if (existingLevel) {
                    lvlId = existingLevel.id;
                } else {
                    const createdLevelId = await TauriService.addLevel(newLevel);
                    lvlId = createdLevelId;
                }
            } catch (e) {
                console.error("Error ensuring level exists", e);
                continue;
            }
         }
         
         // Re-construct key with potentially new real ID? 
         // No, the existing progress map uses real IDs. 
         // If we started with synth key, we won't find existing progress by that key in the map.
         // We must check if 'real' progress exists.
         
         const realKey = `${accId}_${lvlId}`;
         const existing = levelsProgress[realKey]; // key in levelsProgress is "accId_lvlId"
         
         if (existing) {
            if (existing.is_completed !== isCompleted) {
                updatePromises.push(TauriService.updateLevelProgress({
                    account_id: accId,
                    level_id: lvlId,
                    is_completed: isCompleted
                }));
            }
         } else if (isCompleted) {
            updatePromises.push((async () => {
                await TauriService.createLevelProgress({ account_id: accId, level_id: lvlId });
                await TauriService.updateLevelProgress({ account_id: accId, level_id: lvlId, is_completed: true });
            })());
         }
      }

      await Promise.all(updatePromises);
      setIsEditMode(false);
      window.location.reload(); 
  };


  // Sort accounts by start date in ascending order
  const sortedAccounts = [...accounts].sort((a, b) => {
    const dateA = parseDate(a.start_date);
    const dateB = parseDate(b.start_date);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.getTime() - dateB.getTime();
  });

  const matrix = sortedAccounts.map((acc) => {
    const start = parseDate(acc.start_date);
    return columns.map((c) => {
      if (c.kind === 'level' && start) {
        return formatDateShort(addDays(start, Number(c.daysOffset || 0)));
      }
      if (c.kind === 'purchase' && start) {
        const key = `${acc.id}_${c.id}`;
        const progress = purchaseProgress[key];
        if (progress) {
          return formatDateShort(addDays(start, progress.days_offset));
        }
        if (c.daysOffset != null) {
          return formatDateShort(addDays(start, Number(c.daysOffset)));
        }
      }
      return '-';
    });
  });

    return (
      <div className="flex-1 flex flex-col h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <h2 className="text-xl md:text-2xl font-bold truncate">Accounts Detail</h2>

        <div className="flex items-center gap-2 self-end md:self-auto">
          {isEditMode ? (
            <>
              <Button variant="default" size="sm" onClick={handleSaveProgress} className="flex items-center gap-2 h-9">
                <Save className="h-4 w-4" /> {t('common.save', 'Save')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsEditMode(false)} className="flex items-center gap-2 h-9">
                <X className="h-4 w-4" /> {t('common.cancel', 'Cancel')}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={handleEditToggle} className="flex items-center gap-2 h-9">
                <Edit3 className="h-4 w-4" /> {t('common.edit', 'Edit')}
            </Button>
          )}

          {/* Desktop Secondary Actions */}
          <div className="hidden lg:flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportDialog(true)}
                className="flex items-center gap-2 h-9"
              >
                <Upload className="h-4 w-4" />
                {t('common.import', 'Import')}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-2 h-9">
                    <Download className="h-4 w-4" />
                    {t('common.export', 'Export')}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => { setExportType('game'); setShowExportDialog(true); }}>
                    {t('export.gameAccounts', 'Export Game Accounts')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setExportType('all'); setShowExportDialog(true); }}>
                    {t('export.allGames', 'Export All Games')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <LayoutToggle layout={layout} onLayoutChange={setLayout} />

              <div className="h-9">
                  <GameSelector selectedGameId={selectedGameId} onGameChange={setSelectedGameId} />
              </div>

              <div className="flex items-center gap-2 px-2 py-1 border rounded h-9">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="accounts-mode-desktop" checked={mode === 'event-only'} onChange={() => setMode('event-only')} className="w-3 h-3"/>
                  <span className="text-xs">{t('common.eventOnly')}</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="accounts-mode-desktop" checked={mode === 'all'} onChange={() => setMode('all')} className="w-3 h-3"/>
                  <span className="text-xs">{t('common.all')}</span>
                </label>
              </div>
          </div>

          {/* Mobile More Actions Popover */}
          <div className="lg:hidden">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-9 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 space-y-4" align="end">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase text-muted-foreground font-bold">{t('common.view')}</Label>
                  <div className="flex flex-col gap-2 p-2 border rounded bg-accent/20">
                    <LayoutToggle layout={layout} onLayoutChange={setLayout} />
                    <div className="flex flex-col gap-2 pt-2 border-t">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="accounts-mode-mobile" checked={mode === 'event-only'} onChange={() => setMode('event-only')} />
                        <span className="text-sm">{t('common.eventOnly')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="accounts-mode-mobile" checked={mode === 'all'} onChange={() => setMode('all')} />
                        <span className="text-sm">{t('common.all')}</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] uppercase text-muted-foreground font-bold">{t('common.filter')}</Label>
                  <GameSelector selectedGameId={selectedGameId} onGameChange={setSelectedGameId} />
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] uppercase text-muted-foreground font-bold">{t('common.data')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)} className="w-full text-xs">
                      <Upload className="h-3 w-3 mr-1" /> Import
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full text-xs">
                              <Download className="h-3 w-3 mr-1" /> Export
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => { setExportType('game'); setShowExportDialog(true); }}>
                            {t('export.gameAccounts', 'Export Game Accounts')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setExportType('all'); setShowExportDialog(true); }}>
                            {t('export.allGames', 'Export All Games')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <BackButton />
        </div>
      </div>

      <Card className="flex-1">
        <CardContent className="p-0 overflow-auto h-full">
             <AccountsDataTable
               accounts={sortedAccounts}
               columns={columns}
               matrix={matrix}
               layout={layout}
               levelsProgress={levelsProgress}
               purchaseProgress={purchaseProgress}
               isEditMode={isEditMode}
               tempProgress={tempProgress}
               onProgressChange={handleProgressChange}
               tempPurchaseDates={tempPurchaseDates}
               onPurchaseDateChange={handlePurchaseDateChange}
             />
             <ExportDialog
               open={showExportDialog}
               onOpenChange={setShowExportDialog}
               gameId={selectedGameId}
               exportType={exportType}
               layout={layout}
               colorSettings={colors}
               theme={theme}
               source="accounts-detail"
               mode={mode}
               data={columns}
               levelsProgress={levelsProgress}
               purchaseProgress={purchaseProgress}
             />
        </CardContent>
      </Card>
      
      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        gameId={selectedGameId}
      />
      
      {/* Footer / Tabs */}
      <ExcelTabBar
        games={games}
        activeGameId={selectedGameId}
        onSelectGame={setSelectedGameId}
        onCreateGame={handleCreateGameAsync}
      />
    </div>
  );
}

