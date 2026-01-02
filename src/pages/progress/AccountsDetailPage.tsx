// src/pages/progress/AccountsDetailPage.tsx

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../components/ui/card';
import { LayoutToggle, Layout } from '../../components/molecules/LayoutToggle';
import { GameSelector } from '../../components/molecules/GameSelector';
import { BackButton } from '../../components/molecules/BackButton';
import { AccountsDataTable } from '../../components/tables/AccountsDataTable';
import { ImportDialog } from '../../components/molecules/ImportDialog';
import { ExportDialog } from '../../components/molecules/ExportDialog';
import { Button } from '../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { Download, Upload, ChevronDown } from 'lucide-react';

import { useAccounts } from '../../hooks/useAccounts';
import { useLevels } from '../../hooks/useLevels';
import { usePurchaseEvents } from '../../hooks/usePurchaseEvents';
import { ProgressProvider } from '../../components/progress/ProgressProvider';
import { useSettings } from '../../contexts/SettingsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useGames } from '../../hooks/useGames';
import { TauriService } from '../../services/tauri.service';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Plus } from 'lucide-react';

import type { PurchaseEvent } from '../../types';

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
  
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [newGameName, setNewGameName] = useState('');

  const handleCreateGame = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newGameName.trim()) return;

    try {
        const newId = await TauriService.addGame({ name: newGameName });
        if (newId) {
            setNewGameName('');
            setIsCreatingGame(false);
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
          // Find all levels on the same day as the purchase event
          const sameDayLevels = numericLevels.filter(l => (l.daysOffset as number) === day);
          // Find the next level after the purchase event day
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
        isRestricted: (p as any).is_restricted ?? false,
        daysOffset: day != null ? day : null,
        timeSpent: midpointTime,
        maxDaysOffset: p.max_days_offset != null ? `${t('purchaseEvents.lessThan')} ${p.max_days_offset}` : '-',
      };
    });

    const allCols = [...levelCols, ...peCols];
    const numeric = allCols.filter((c: any) => typeof c.daysOffset === 'number' && c.daysOffset !== null) as Array<any & { daysOffset: number }>;
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
      const levels = allCols.filter((c: any) => c.kind === 'level' && c.name !== '-');
      const purchases = allCols.filter((c: any) => c.kind === 'purchase');

      levels.sort((a: any, b: any) => (a.daysOffset || 0) - (b.daysOffset || 0));
      purchases.sort((a: any, b: any) => {
        if (a.daysOffset === b.daysOffset) return 0;
        if (a.daysOffset == null) return 1;
        if (b.daysOffset == null) return -1;
        return a.daysOffset - b.daysOffset;
      });

      return [...levels, ...purchases];
    }

    // Separate levels and purchase events
    const levelEntries = numeric.filter(entry => entry.kind === 'level');
    const purchaseEntries = numeric.filter(entry => entry.kind === 'purchase');

    // Group level entries by daysOffset to handle multiple entries per day
    const levelEntriesByDay: { [day: number]: any[] } = {};
    levelEntries.forEach(entry => {
      if (!levelEntriesByDay[entry.daysOffset]) {
        levelEntriesByDay[entry.daysOffset] = [];
      }
      levelEntriesByDay[entry.daysOffset].push(entry);
    });

    let minDay = levelEntries.length > 0 ? levelEntries[0].daysOffset : 0;
    let maxDay = levelEntries.length > 0 ? levelEntries[levelEntries.length - 1].daysOffset : 0;

    if (levelEntries.length > 0 && minDay > 0) {
      minDay = 0;
    }

    const result: any[] = [];

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

    const numericIds = new Set(numeric.map((c: any) => c.id));
    const nonNumeric = allCols.filter((c: any) => !numericIds.has(c.id));
    return [...result, ...nonNumeric];
  }, [levels, purchaseEvents, mode]);



  return (
    <div className="p-6 space-y-4 min-h-[calc(100vh-4rem)] relative flex flex-col">
      <div className="flex-1">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Accounts Detail</h2>

        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            {t('common.import', 'Import')}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                {t('common.export', 'Export')}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => {
                  setExportType('game');
                  setShowExportDialog(true);
                }}
              >
                {t('export.gameAccounts', 'Export Game Accounts')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setExportType('all');
                  setShowExportDialog(true);
                }}
              >
                {t('export.allGames', 'Export All Games')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <LayoutToggle layout={layout} onLayoutChange={setLayout} />

          <GameSelector selectedGameId={selectedGameId} onGameChange={setSelectedGameId} />

          <div className="flex items-center gap-2 px-2 py-1 border rounded">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="accounts-mode"
                checked={mode === 'event-only'}
                onChange={() => setMode('event-only')}
              />
              <span className="text-sm">{t('common.eventOnly')}</span>
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="accounts-mode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
              />
              <span className="text-sm">{t('common.all')}</span>
            </label>
          </div>

          <BackButton />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-auto">
          <ProgressProvider accounts={accounts}>
            {({ levelsProgress, purchaseProgress }) => {
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
                <>
                  <AccountsDataTable
                    accounts={sortedAccounts}
                    columns={columns}
                    matrix={matrix}
                    layout={layout}
                    levelsProgress={levelsProgress}
                    purchaseProgress={purchaseProgress}
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
                    data={columns}
                    levelsProgress={levelsProgress}
                    purchaseProgress={purchaseProgress}
                  />
                </>
              );
            }}
          </ProgressProvider>
        </CardContent>
      </Card>

      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        gameId={selectedGameId}
      />
      </div>

      {/* Excel-like Game Tabs Navigation */}
      <div className="sticky bottom-0 w-[calc(100%+3rem)] -ml-6 -mb-6 bg-gray-200 border-t border-gray-300 h-10 flex items-end px-2 z-40 overflow-x-auto mt-auto">
        {games.map((g) => {
          const isActive = g.id === selectedGameId;
          return (
            <div
              key={g.id}
              onClick={() => setSelectedGameId(g.id)}
              className={`
                flex items-center gap-2 px-4 py-1.5 min-w-[120px] max-w-[200px] text-sm cursor-pointer select-none border-r border-gray-300 transition-colors
                ${isActive 
                  ? 'bg-white font-bold text-green-700 border-t-2 border-t-green-600 rounded-t-sm shadow-[0_-2px_4px_rgba(0,0,0,0.05)] h-[34px] relative top-[1px]' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-50 h-[30px] mb-[1px]'
                }
              `}
              title={g.name}
            >
              <span className="truncate">{g.name}</span>
            </div>
          );
        })}
        
        {/* Add New Game Popover */}
        <Popover open={isCreatingGame} onOpenChange={setIsCreatingGame}>
          <PopoverTrigger asChild>
            <div 
                className="flex items-center justify-center w-8 h-[30px] mb-[1px] bg-gray-300 hover:bg-gray-400 text-gray-600 cursor-pointer rounded-tr-sm ml-1"
                title={t('games.addGame', 'Add New Game')}
            >
                <Plus className="h-4 w-4" />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4 mb-2" side="top" align="start">
            <form onSubmit={handleCreateGame} className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">{t('games.newGame', 'New Game')}</h4>
                <p className="text-sm text-muted-foreground">
                  {t('games.enterName', 'Enter the name for the new game sheet.')}
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name" className="sr-only">Name</Label>
                <Input
                  id="name"
                  placeholder="Game Name"
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  autoFocus
                />
              </div>
              <Button type="submit" size="sm" className="w-full">
                {t('common.create', 'Create')}
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

