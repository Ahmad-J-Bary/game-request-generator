// src/pages/progress/AccountsDetailPage.tsx

import { useMemo, useState, useEffect } from 'react';
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
import { Download, Upload, ChevronDown, Edit3, Save, X, MoreVertical, Search } from 'lucide-react';

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
import { Badge } from '@grq/ui/atoms/badge';

import type { PurchaseEvent, Account, GameBranch, Game } from '@grq/api-bindings';
import type { ColumnData } from '@grq/ui/organisms/tables/AccountsDataTable';
import type { ColorSettings } from '@grq/ui/contexts/SettingsContext';
import type { AccountLevelProgress, AccountPurchaseEventProgress } from '@grq/api-bindings/types/progress.types';
import type { TFunction } from 'i18next';

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
  const { games, fetchBranches } = useGames();
  const [branches, setBranches] = useState<GameBranch[]>([]);

  useEffect(() => {
    let active = true;
    if (selectedGameId) {
        fetchBranches(selectedGameId).then(data => {
            if (active) setBranches(data);
        }).catch(console.error);
    } else {
        // Use a microtask to avoid synchronous setState inside useEffect
        Promise.resolve().then(() => {
            if (active) setBranches([]);
        });
    }
    return () => { active = false; };
  }, [selectedGameId, fetchBranches]);

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

  return (
    <div className="w-full px-1 sm:px-2 space-y-4 lg:space-y-6 min-h-[calc(100vh-4rem)] relative flex flex-col">
       <ProgressProvider accounts={accounts}>
         {({ levelsProgress, purchaseProgress }) => (
            <AccountsDetailContent 
               accounts={accounts}
               branches={branches}
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
               levelsProgress={levelsProgress}
               purchaseProgress={purchaseProgress}
               showImportDialog={showImportDialog}
               setShowImportDialog={setShowImportDialog}
               showExportDialog={showExportDialog}
               setShowExportDialog={setShowExportDialog}
               exportType={exportType}
               setExportType={setExportType}
               onCreateGame={handleCreateGameAsync}
            />
         )}
       </ProgressProvider>
    </div>
  );
}

interface AccountsDetailContentProps {
  accounts: Account[];
  branches: GameBranch[];
  games: Game[];
  selectedGameId?: number;
  setSelectedGameId: (id?: number) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  layout: Layout;
  setLayout: (layout: Layout) => void;
  colors: ColorSettings;
  theme: 'light' | 'dark';
  t: TFunction;
  levelsProgress: Record<string, AccountLevelProgress>;
  purchaseProgress: Record<string, AccountPurchaseEventProgress>;
  showImportDialog: boolean;
  setShowImportDialog: (show: boolean) => void;
  showExportDialog: boolean;
  setShowExportDialog: (show: boolean) => void;
  exportType: 'game' | 'account' | 'all';
  setExportType: (type: 'game' | 'account' | 'all') => void;
  onCreateGame: (name: string) => Promise<void>;
}

function AccountsDetailContent({
    accounts, branches, games, selectedGameId, setSelectedGameId,
    mode, setMode, layout, setLayout, colors, theme, t, levelsProgress, purchaseProgress,
    showImportDialog, setShowImportDialog, showExportDialog, setShowExportDialog, exportType, setExportType,
    onCreateGame
}: AccountsDetailContentProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<number | undefined>();
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [tempProgress, setTempProgress] = useState<{
    levels: Record<string, boolean>;
    purchases: Record<string, boolean>;
  }>({
    levels: {},
    purchases: {},
  });
  const [tempPurchaseDates, setTempPurchaseDates] = useState<Record<number, Date | null>>({});

  const handleEditToggle = () => {
    if (!isEditMode) {
      const levelProg: Record<string, boolean> = {};
      const purchaseProg: Record<string, boolean> = {};
      const purchaseDates: Record<number, Date | null> = {};

      Object.keys(levelsProgress).forEach(key => {
        levelProg[key] = levelsProgress[key].is_completed;
      });
      
      Object.keys(purchaseProgress).forEach(key => {
        const prog = purchaseProgress[key];
        purchaseProg[key] = prog.is_completed;
        
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
        
        const existing = purchaseProgress[key];
        let daysOffset = 0;
        let calculatedTimeSpent = 0;

        if (selectedDate) {
          const start = parseDate(account.start_date);
          if (start) {
             daysOffset = Math.round((selectedDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
             calculatedTimeSpent = existing?.time_spent || 243;
          }
        } else {
            daysOffset = existing?.days_offset || 0;
            calculatedTimeSpent = existing?.time_spent || 243;
        }
        
        if (existing) {
             updatePromises.push(TauriService.updatePurchaseEventProgress({
                account_id: accId,
                purchase_event_id: peId,
                is_completed: isCompleted,
                days_offset: daysOffset,
                time_spent: calculatedTimeSpent,
                bypass_cooldown: true
             }));
        } else if (isCompleted || selectedDate) {
             updatePromises.push((async () => {
                 await TauriService.createPurchaseEventProgress({
                    account_id: accId,
                    purchase_event_id: peId,
                    days_offset: daysOffset,
                    time_spent: calculatedTimeSpent
                 });
                 if (isCompleted) {
                    await TauriService.updatePurchaseEventProgress({
                         account_id: accId,
                         purchase_event_id: peId,
                         is_completed: true,
                         bypass_cooldown: true
                    });
                 }
             })());
        }
      }
      
      for (const key of Object.keys(tempProgress.levels)) {
         const [accIdStr, lvlIdStr] = key.split('_');
         const accId = parseInt(accIdStr);
         const lvlId = parseInt(lvlIdStr);
         const isCompleted = tempProgress.levels[key];
         const existing = levelsProgress[key];
         
         if (existing) {
            if (existing.is_completed !== isCompleted) {
                updatePromises.push(TauriService.updateLevelProgress({
                    account_id: accId,
                    level_id: lvlId,
                    is_completed: isCompleted,
                    bypass_cooldown: true
                }));
            }
         } else if (isCompleted) {
            updatePromises.push((async () => {
                await TauriService.createLevelProgress({ account_id: accId, level_id: lvlId });
                await TauriService.updateLevelProgress({ 
                    account_id: accId, 
                    level_id: lvlId, 
                    is_completed: true,
                    bypass_cooldown: true
                });
            })());
         }
      }

      await Promise.all(updatePromises);
      setIsEditMode(false);
      window.location.reload(); 
  };

    return (
      <div className="flex-1 flex flex-col h-full bg-background/50">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 sticky top-0 bg-background/80 backdrop-blur-md z-30 p-2 rounded-lg border border-border/50">
        <h2 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent px-2">
            {t('nav.accountsDetail')}
        </h2>

        <div className="flex items-center gap-2 self-end md:self-auto px-2">
          {isEditMode ? (
            <>
              <Button variant="default" size="sm" onClick={handleSaveProgress} className="flex items-center gap-2 h-9 shadow-lg shadow-primary/20">
                <Save className="h-4 w-4" /> {t('common.save', 'Save')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsEditMode(false)} className="flex items-center gap-2 h-9">
                <X className="h-4 w-4" /> {t('common.cancel', 'Cancel')}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={handleEditToggle} className="flex items-center gap-2 h-9 group transition-all hover:border-primary/50">
                <Edit3 className="h-4 w-4 transition-transform group-hover:rotate-12" /> {t('common.edit', 'Edit')}
            </Button>
          )}

          <div className="hidden lg:flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)} className="flex items-center gap-2 h-9">
                <Upload className="h-4 w-4" /> {t('common.import', 'Import')}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-2 h-9">
                    <Download className="h-4 w-4" /> {t('common.export', 'Export')} <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => { setExportType('game'); setSelectedBranchId(undefined); setShowExportDialog(true); }}>
                    {t('export.gameAccounts', 'Export All Game Accounts')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setExportType('all'); setShowExportDialog(true); }}>
                    {t('export.allGames', 'Export All Games')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="h-8 w-px bg-border/50 mx-1" />
              <LayoutToggle layout={layout} onLayoutChange={setLayout} />
              <div className="h-9 min-w-[140px]"><GameSelector selectedGameId={selectedGameId} onGameChange={setSelectedGameId} /></div>

              <div className="flex items-center gap-1 p-1 border rounded-lg h-9 bg-accent/30 shadow-inner">
                <button 
                    onClick={() => setMode('event-only')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'event-only' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    {t('common.eventOnly')}
                </button>
                <button 
                    onClick={() => setMode('all')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'all' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    {t('common.all')}
                </button>
              </div>
          </div>

          <div className="lg:hidden">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-9 p-0 rounded-full">
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

                <div className="space-y-2 pt-2 border-t font-semibold">
                  <Label className="text-[10px] uppercase text-muted-foreground font-bold">{t('common.actions')}</Label>
                  <div className="grid grid-cols-1 gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)} className="flex items-center justify-start gap-2 h-9 w-full">
                      <Upload className="h-4 w-4" /> {t('common.import', 'Import')}
                    </Button>
                    
                    <Button variant="outline" size="sm" onClick={() => { setExportType('game'); setSelectedBranchId(undefined); setShowExportDialog(true); }} className="flex items-center justify-start gap-2 h-9 w-full">
                      <Download className="h-4 w-4" /> {t('export.gameAccounts', 'Export All Game Accounts')}
                    </Button>
                    
                    <Button variant="outline" size="sm" onClick={() => { setExportType('all'); setShowExportDialog(true); }} className="flex items-center justify-start gap-2 h-9 w-full">
                      <Download className="h-4 w-4" /> {t('export.allGames', 'Export All Games')}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <BackButton />
        </div>
      </div>

       <div className="flex-1 space-y-12 pb-24">
             {branches.length === 0 ? (
                 <Card className="border-dashed border-2 shadow-none"><CardContent className="flex items-center justify-center p-12 text-muted-foreground">
                        <div className="text-center space-y-2">
                            <div className="bg-muted w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Search className="h-6 w-6 opacity-20" />
                            </div>
                            <p className="font-medium">{t('branches.noBranches', 'No branches found for this game.')}</p>
                            <p className="text-xs">{t('branches.pleaseAddBranch', 'Please select a game or add a branch to see progress tables.')}</p>
                        </div>
                 </CardContent></Card>
             ) : (
                 branches.map(branch => (
                     <BranchSection 
                        key={branch.id}
                        branch={branch}
                        accounts={accounts.filter(a => a.branch_id === branch.id)}
                        levelsProgress={levelsProgress}
                        purchaseProgress={purchaseProgress}
                        isEditMode={isEditMode}
                        tempProgress={tempProgress}
                        onProgressChange={handleProgressChange}
                        tempPurchaseDates={tempPurchaseDates}
                        onPurchaseDateChange={handlePurchaseDateChange}
                        layout={layout}
                        mode={mode}
                        t={t}
                        onExport={() => {
                           setSelectedBranchId(branch.id);
                           setExportType('game');
                           setShowExportDialog(true);
                        }}
                     />
                 ))
             )}
       </div>
      
      <ImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} gameId={selectedGameId} />
      <ExportDialog
           open={showExportDialog} onOpenChange={setShowExportDialog}
           gameId={selectedGameId} branchId={selectedBranchId} exportType={exportType}
           layout={layout} colorSettings={colors} theme={theme}
           source="accounts-detail" mode={mode} 
           levelsProgress={levelsProgress} purchaseProgress={purchaseProgress}
      />
      
      <ExcelTabBar 
        games={games} 
        activeGameId={selectedGameId} 
        onSelectGame={setSelectedGameId} 
        onCreateGame={onCreateGame}
      />
    </div>
  );
}

interface BranchSectionProps {
    branch: GameBranch;
    accounts: Account[];
    levelsProgress: Record<string, AccountLevelProgress>;
    purchaseProgress: Record<string, AccountPurchaseEventProgress>;
    isEditMode: boolean;
    tempProgress: { levels: Record<string, boolean>; purchases: Record<string, boolean> };
    onProgressChange: (type: 'level' | 'purchase', id: number | string, completed: boolean) => void;
    tempPurchaseDates: Record<number, Date | null>;
    onPurchaseDateChange: (compositeId: number, date: Date | null) => void;
    layout: Layout;
    mode: Mode;
    t: TFunction;
    onExport: () => void;
}

function BranchSection({
    branch, accounts, levelsProgress, purchaseProgress, isEditMode,
    tempProgress, onProgressChange, tempPurchaseDates, onPurchaseDateChange,
    layout, mode, t, onExport
}: BranchSectionProps) {
    const { levels = [] } = useLevels(branch.id);
    const { events: purchaseEvents = [] } = usePurchaseEvents(branch.id);

    const columns = useMemo(() => {
        const levelCols = levels.map((l) => ({
            kind: 'level' as const,
            id: l.id,
            token: (l.event_token || '').split('_day')[0],
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
                const numericLevels = levelCols.filter(l => typeof l.daysOffset === 'number' && l.daysOffset !== null).sort((a, b) => (a.daysOffset as number) - (b.daysOffset as number));
                const sameDayLevels = numericLevels.filter(l => (l.daysOffset as number) === day);
                const nextLevel = numericLevels.find(l => (l.daysOffset as number) > day);
                const levelsToAverage = [...sameDayLevels];
                if (nextLevel) levelsToAverage.push(nextLevel);
                if (levelsToAverage.length > 0) {
                    const totalTimeSpent = levelsToAverage.reduce((sum, level) => sum + (level.timeSpent || 0), 0);
                    midpointTime = Math.round(totalTimeSpent / levelsToAverage.length);
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
            };
        });

        const allCols = [...levelCols, ...peCols];
        if (mode === 'event-only') {
            const lvls = allCols.filter((c) => c.kind === 'level' && c.name !== '-').sort((a,b) => {
                const aT = (a.timeSpent ?? 0) as number;
                const bT = (b.timeSpent ?? 0) as number;
                if (aT !== bT) return aT - bT;
                return (Number(a.daysOffset)||0) - (Number(b.daysOffset)||0);
            });
            const pur = allCols.filter((c) => c.kind === 'purchase').sort((a,b) => {
                const aT = (a.timeSpent ?? 0) as number;
                const bT = (b.timeSpent ?? 0) as number;
                if (aT !== bT) return aT - bT;
                return (Number(a.daysOffset)||0) - (Number(b.daysOffset)||0);
            });
            return [...lvls, ...pur] as ColumnData[];
        }

        const numeric = allCols.filter((c) => typeof c.daysOffset === 'number' && c.daysOffset !== null) as { kind: 'level'|'purchase'; daysOffset: number; id: number; name: string; timeSpent: number|null; isBonus: boolean; token: string; synthetic: boolean }[];
        numeric.sort((a, b) => {
            const aT = (a.timeSpent ?? 0) as number;
            const bT = (b.timeSpent ?? 0) as number;
            if (aT !== bT) return aT - bT;
            return (a.daysOffset - b.daysOffset) || (a.kind === 'level' ? -1 : 1);
        });
        
        // Synthetic logic re-integrated
        const levelEntries = numeric.filter(entry => entry.kind === 'level');
        const levelEntriesByDay: Record<number, typeof levelEntries[number][]> = {};
        levelEntries.forEach(entry => {
          if (!levelEntriesByDay[entry.daysOffset]) levelEntriesByDay[entry.daysOffset] = [];
          levelEntriesByDay[entry.daysOffset].push(entry);
        });

        const minDay = levelEntries.length > 0 ? Math.min(0, levelEntries[0].daysOffset) : 0;
        const maxDay = levelEntries.length > 0 ? levelEntries[levelEntries.length - 1].daysOffset : 0;
        const result: ColumnData[] = [];

        for (let day = minDay; day <= maxDay; day++) {
          if (levelEntriesByDay[day]) {
            result.push(...levelEntriesByDay[day] as ColumnData[]);
          } else {
             // Basic dummy synthetic level for display
             result.push({
                kind: 'level' as const,
                id: `synth-${day}`,
                token: 'synth',
                name: '-',
                daysOffset: day,
                timeSpent: 0,
                isBonus: false,
                synthetic: true
             } as ColumnData);
          }
        }
        
        const purchaseEntries = numeric.filter(entry => entry.kind === 'purchase');
        result.push(...purchaseEntries as ColumnData[]);

        return result;
    }, [levels, purchaseEvents, mode, t]);

    const sortedAccounts = useMemo(() => {
        return [...accounts].sort((a, b) => {
            const dateA = parseDate(a.start_date);
            const dateB = parseDate(b.start_date);
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            return dateA.getTime() - dateB.getTime();
        });
    }, [accounts]);

    const matrix = useMemo(() => {
        return sortedAccounts.map((acc) => {
            const start = parseDate(acc.start_date);
            return columns.map((c) => {
                if (c.kind === 'level' && start) return formatDateShort(addDays(start, Number(c.daysOffset || 0)));
                if (c.kind === 'purchase' && start) {
                    const key = `${acc.id}_${c.id}`;
                    const progress = purchaseProgress[key];
                    if (progress) return formatDateShort(addDays(start, progress.days_offset));
                    if (c.daysOffset != null) return formatDateShort(addDays(start, Number(c.daysOffset)));
                }
                return '-';
            });
        });
    }, [sortedAccounts, columns, purchaseProgress]);

    if (accounts.length === 0) return null;

    return (
        <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3 px-4 py-2 bg-accent/20 rounded-t-xl border-x border-t border-border/50">
                <div className="h-6 w-1 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                <h3 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2 flex-1">
                    {branch.name} 
                    <Badge variant="secondary" className="font-mono text-[10px] px-2 py-0">
                        {accounts.length} {t('common.accounts', 'Accounts')}
                    </Badge>
                </h3>
                <Button variant="ghost" size="sm" onClick={onExport} className="h-8 px-2 text-muted-foreground hover:text-primary">
                    <Download className="h-4 w-4 mr-1" /> {t('common.export', 'Export')}
                </Button>
            </div>
            <Card className="overflow-hidden border-border/50 shadow-2xl shadow-black/5 bg-background/40 backdrop-blur-sm rounded-t-none">
                <CardContent className="p-0 overflow-auto max-h-[600px] custom-scrollbar">
                    <AccountsDataTable
                        accounts={sortedAccounts}
                        columns={columns}
                        matrix={matrix}
                        layout={layout}
                        levelsProgress={levelsProgress}
                        purchaseProgress={purchaseProgress}
                        isEditMode={isEditMode}
                        tempProgress={tempProgress}
                        onProgressChange={onProgressChange}
                        tempPurchaseDates={tempPurchaseDates}
                        onPurchaseDateChange={onPurchaseDateChange}
                    />
                </CardContent>
            </Card>
        </section>
    );
}
