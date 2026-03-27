// src/pages/games/GameDetailPage.tsx

import { useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@grq/ui/atoms/card';
import { LayoutToggle, Layout } from '@grq/ui/molecules/LayoutToggle';
import { BackButton } from '@grq/ui/molecules/BackButton';
import { GameDataTable } from '@grq/ui/organisms/tables/GameDataTable';
import { ImportDialog } from '@grq/ui/molecules/ImportDialog';
import { ExportDialog } from '@grq/ui/molecules/ExportDialog';
import type { ColumnData } from '@grq/ui/organisms/tables/AccountDataTable';
import { ExcelTabBar } from '@grq/ui/organisms/ExcelTabBar';
import { Button } from '@grq/ui/atoms/button';
import { Download, Upload, Edit3, Save, X, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@grq/ui/atoms/popover';
import { Label } from '@grq/ui/atoms/label';


import { useGames } from '@grq/core/hooks/useGames';
import { useLevels } from '@grq/core/hooks/useLevels';
import { usePurchaseEvents } from '@grq/core/hooks/usePurchaseEvents';
import { useSettings } from '@grq/ui/contexts/SettingsContext';
import { useTheme } from '@grq/ui/contexts/ThemeContext';
import { TauriService } from '@grq/core/services/tauri.service';
import { Level, PurchaseEvent } from '@grq/api-bindings';

type Mode = 'all' | 'event-only';

export default function GameDetailPage({ gameId: propGameId, forcedLayout }: { gameId?: number; forcedLayout?: Layout }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: urlId } = useParams<{ id?: string }>();
  const gameId = propGameId || (urlId ? parseInt(urlId, 10) : undefined);
  const { colors } = useSettings();
  const { theme } = useTheme();

  const { games, deleteGame } = useGames();
  const { levels = [] } = useLevels(gameId);
  const { events: purchaseEvents = [] } = usePurchaseEvents(gameId);

  // Parse layout from query params if present
  const queryParams = new URLSearchParams(location.search);
  const forceLayout = queryParams.get('layout') as Layout | null;

  const [layout, setLayout] = useState<Layout>(forcedLayout || forceLayout || 'vertical');
  const [prevForceLayout, setPrevForceLayout] = useState(forceLayout);
  const [prevForcedLayoutProp, setPrevForcedLayoutProp] = useState(forcedLayout);

  if (forceLayout !== prevForceLayout || forcedLayout !== prevForcedLayoutProp) {
    setPrevForceLayout(forceLayout);
    setPrevForcedLayoutProp(forcedLayout);
    const newLayout = forcedLayout || forceLayout;
    if (newLayout) {
      setLayout(newLayout);
    }
  }

  const [mode, setMode] = useState<Mode>('event-only');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Edit State
  const [editedLevels, setEditedLevels] = useState<Level[]>([]);
  const [editedPurchaseEvents, setEditedPurchaseEvents] = useState<PurchaseEvent[]>([]);

  const [prevGameId, setPrevGameId] = useState(gameId);
  if (gameId !== prevGameId) {
    setPrevGameId(gameId);
    setIsEditMode(false);
    setEditedLevels([]);
    setEditedPurchaseEvents([]);
  };

  // Game Creation State
  const handleCreateGameAsync = async (name: string) => {
    try {
        const newId = await TauriService.addGame({ name });
        if (newId) {
            window.dispatchEvent(new CustomEvent('games-updated', { detail: { id: newId } }));
            navigate(`/games/${newId}`);
        }
    } catch (error) {
        console.error('Failed to create game:', error);
    }
  };

  // Init logic moved to handleEditToggle to avoid cascading renders

  const handleEditToggle = () => {
    if (!isEditMode) {
      setEditedLevels([...levels]);
      setEditedPurchaseEvents([...purchaseEvents]);
    }
    setIsEditMode(!isEditMode);
  };

  const handleSaveChanges = async () => {
    try {
      // Save level changes
      for (const editedLevel of editedLevels) {
        const originalLevel = levels.find(l => l.id === editedLevel.id);
        if (originalLevel) {
          // Check if level was modified
          if (originalLevel.level_name !== editedLevel.level_name ||
            originalLevel.event_token !== editedLevel.event_token ||
            originalLevel.days_offset !== editedLevel.days_offset ||
            originalLevel.time_spent !== editedLevel.time_spent ||
            originalLevel.is_bonus !== editedLevel.is_bonus) {
            await TauriService.updateLevel({
              id: editedLevel.id,
              level_name: editedLevel.level_name,
              event_token: editedLevel.event_token,
              days_offset: editedLevel.days_offset,
              time_spent: editedLevel.time_spent,
              is_bonus: editedLevel.is_bonus,
            });
          }
        }
      }

      // Save purchase event changes
      for (const editedEvent of editedPurchaseEvents) {
        const originalEvent = purchaseEvents.find(e => e.id === editedEvent.id);
        if (originalEvent) {
          // Check if purchase event was modified
          if (originalEvent.event_token !== editedEvent.event_token ||
            originalEvent.is_restricted !== editedEvent.is_restricted ||
            originalEvent.max_days_offset !== editedEvent.max_days_offset ||
            originalEvent.days_offset !== editedEvent.days_offset) {
            await TauriService.updatePurchaseEvent({
              id: editedEvent.id,
              event_token: editedEvent.event_token,
              is_restricted: editedEvent.is_restricted,
              max_days_offset: editedEvent.max_days_offset,
              days_offset: editedEvent.days_offset,
            });
          }
        }
      }

      // ── Sync frozen accountCompletionRecords in localStorage ──────────────
      // When a level or purchase event is edited, the completion records that
      // were frozen at task-completion time (timeSpent, eventToken) must be
      // updated so the cooldown timer uses the correct new values.
      try {
        const savedCompletions = localStorage.getItem('accountCompletionRecords');
        if (savedCompletions) {
          const records = JSON.parse(savedCompletions) as Record<string, {
            accountId: number;
            timeSpent: number;
            completionTime: number;
            levelId?: number;
            eventToken?: string;
          }>;

          let changed = false;

          // Update level-related completion records
          for (const editedLevel of editedLevels) {
            const originalLevel = levels.find(l => l.id === editedLevel.id);
            if (!originalLevel) continue;
            const timeSpentChanged = originalLevel.time_spent !== editedLevel.time_spent;
            const tokenChanged = originalLevel.event_token !== editedLevel.event_token;
            if (!timeSpentChanged && !tokenChanged) continue;

            for (const key of Object.keys(records)) {
              const rec = records[key];
              if (rec.levelId === editedLevel.id) {
                if (timeSpentChanged) rec.timeSpent = editedLevel.time_spent;
                if (tokenChanged) rec.eventToken = editedLevel.event_token;
                changed = true;
              }
            }
          }

          // Update purchase-event-related completion records
          for (const editedEvent of editedPurchaseEvents) {
            const originalEvent = purchaseEvents.find(e => e.id === editedEvent.id);
            if (!originalEvent) continue;
            const tokenChanged = originalEvent.event_token !== editedEvent.event_token;
            if (!tokenChanged) continue;

            for (const key of Object.keys(records)) {
              const rec = records[key];
              if (rec.eventToken === originalEvent.event_token) {
                rec.eventToken = editedEvent.event_token;
                changed = true;
              }
            }
          }

          if (changed) {
            localStorage.setItem('accountCompletionRecords', JSON.stringify(records));
          }
        }
      } catch (lsError) {
        console.warn('Failed to sync accountCompletionRecords in localStorage:', lsError);
      }
      // ─────────────────────────────────────────────────────────────────────

      setIsEditMode(false);
      // Refresh data by reloading the page
      window.location.reload();
    } catch (error) {
      console.error('Error saving changes:', error);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
  };

  const handleDeleteLevel = async (levelId: number) => {
    try {
      await TauriService.deleteLevel(levelId);
      setEditedLevels((prev: Level[]) => prev.filter((l: Level) => l.id !== levelId));
    } catch (error) {
      console.error('Error deleting level:', error);
    }
  };

  const handleDeletePurchaseEvent = async (eventId: number) => {
    try {
      await TauriService.deletePurchaseEvent(eventId);
      setEditedPurchaseEvents((prev: PurchaseEvent[]) => prev.filter((e: PurchaseEvent) => e.id !== eventId));
    } catch (error) {
      console.error('Error deleting purchase event:', error);
    }
  };

  const handleUpdateLevel = (levelId: number, field: keyof Level, value: Level[keyof Level]) => {
    setEditedLevels((prev: Level[]) => prev.map((level: Level) =>
      level.id === levelId ? { ...level, [field]: value } : level
    ));
  };

  const handleUpdatePurchaseEvent = (eventId: number, field: keyof PurchaseEvent, value: PurchaseEvent[keyof PurchaseEvent]) => {
    setEditedPurchaseEvents((prev: PurchaseEvent[]) => prev.map((event: PurchaseEvent) =>
      event.id === eventId ? { ...event, [field]: value } : event
    ));
  };

  const handleDeleteGame = async () => {
    if (!gameId || !game) return;
    if (window.confirm(t('games.deleteConfirm'))) {
      const success = await deleteGame(gameId);
      if (success) {
        navigate('/games-table');
      }
    }
  };

  const handleAddLevel = async (data: { level_name: string; event_token: string; days_offset: number; time_spent: number; is_bonus: boolean }) => {
    if (!gameId) return;
    try {
      await TauriService.addLevel({
        game_id: gameId,
        ...data
      });
      window.location.reload();
    } catch (error) {
      console.error('Error adding level:', error);
    }
  };

  const handleAddPurchaseEvent = async (data: { event_token: string; days_offset: number; max_days_offset: number | null; is_restricted: boolean }) => {
    if (!gameId) return;
    try {
      await TauriService.addPurchaseEvent({
        game_id: gameId,
        ...data
      });
      window.location.reload();
    } catch (error) {
      console.error('Error adding purchase event:', error);
    }
  };

  const game = games.find(g => String(g.id) === String(gameId));

  const currentLevels = isEditMode ? editedLevels : levels;
  const currentPurchaseEvents = isEditMode ? editedPurchaseEvents : purchaseEvents;

  const baseColumns = useMemo(() => {
    const levelCols = currentLevels.map(l => ({
      kind: 'level' as const,
      id: l.id,
      token: l.event_token.split('_day')[0],
      name: l.level_name,
      daysOffsetRaw: l.days_offset,
      daysOffset: typeof l.days_offset === 'number' ? l.days_offset : null,
      timeSpentRaw: l.time_spent,
      timeSpent: typeof l.time_spent === 'number' ? l.time_spent : null,
      isBonus: !!l.is_bonus,
      synthetic: l.level_name === '-',
    }));

    const purchaseCols = currentPurchaseEvents.map(p => {
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
        daysOffset: day != null ? day : null,
        maxDaysOffset: p.max_days_offset != null ? String(p.max_days_offset) : null,
        isRestricted: !!p.is_restricted,
        timeSpent: midpointTime,
        synthetic: false,
      };
    }) as ColumnData[];

    return [...levelCols, ...purchaseCols] as const;
  }, [currentLevels, currentPurchaseEvents]);


  const columns = useMemo(() => {
    const allCols = [...baseColumns];
    const numeric = allCols.filter((c) => typeof c.daysOffset === 'number' && c.daysOffset !== null) as ((typeof allCols)[number] & { daysOffset: number })[];
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

      levels.sort((a, b) => (a.daysOffset ?? 0) - (b.daysOffset ?? 0));
      purchases.sort((a, b) => {
        if (a.daysOffset === b.daysOffset) return 0;
        if (a.daysOffset == null) return 1;
        if (b.daysOffset == null) return -1;
        return a.daysOffset - b.daysOffset;
      });

      return [...levels, ...purchases];
    }

    // Group entries by daysOffset to handle multiple entries per day
    const entriesByDay: { [day: number]: (typeof numeric)[number][] } = {};
    numeric.forEach(entry => {
      const day = entry.daysOffset;
      if (!entriesByDay[day]) {
        entriesByDay[day] = [];
      }
      entriesByDay[day].push(entry);
    });

    let minDay: number = numeric.length > 0 ? numeric[0].daysOffset : 0;
    const maxDay: number = numeric.length > 0 ? numeric[numeric.length - 1].daysOffset : 0;

    if (numeric.length > 0 && minDay > 0) {
      minDay = 0;
    }

    type SynthEntry = { kind: 'level'; id: string | number; token: string; name: string; daysOffset: number; timeSpent: number | null; isBonus: boolean; synthetic: boolean };
    const result: (typeof numeric[number] | SynthEntry)[] = [];

    for (let day = minDay; day <= maxDay; day++) {
      if (entriesByDay[day]) {
        result.push(...entriesByDay[day]);
      } else {
        // Find the next real level after this day
        let nextRealLevel = null;
        for (let d = day + 1; d <= maxDay; d++) {
          if (entriesByDay[d]) {
            const nonSyntheticLevels = entriesByDay[d].filter(entry => entry.kind === 'level' && !entry.synthetic);
            if (nonSyntheticLevels.length > 0) {
              nextRealLevel = nonSyntheticLevels[0];
              break;
            }
          }
        }

        let synthesizedTime: number | null = null;
        let token = '';

        if (nextRealLevel) {
          const realLevelDays = numeric
            .filter(entry => entry.kind === 'level' && !entry.synthetic)
            .map(entry => entry.daysOffset as number);

          const firstRealDay = Math.min(...realLevelDays);
          const isBeforeFirstReal = day < firstRealDay;

          if (isBeforeFirstReal) {
            const increment = (nextRealLevel.timeSpent || 0) / (firstRealDay + 1);
            synthesizedTime = Math.round((day + 1) * increment);
            token = nextRealLevel.token;
          } else {
            let prevRealLevel: typeof numeric[number] | null = null;
            for (let d = day - 1; d >= minDay; d--) {
              if (entriesByDay[d]) {
                const nonSyntheticLevels = entriesByDay[d].filter(entry => entry.kind === 'level' && !entry.synthetic);
                if (nonSyntheticLevels.length > 0) {
                  prevRealLevel = nonSyntheticLevels[nonSyntheticLevels.length - 1];
                  break;
                }
              }
            }

            if (prevRealLevel) {
              const ratio = (day - prevRealLevel.daysOffset) / (nextRealLevel.daysOffset - prevRealLevel.daysOffset);
              synthesizedTime = Math.round((prevRealLevel.timeSpent || 0) + ratio * ((nextRealLevel.timeSpent || 0) - (prevRealLevel.timeSpent || 0)));
              token = nextRealLevel.token;
            } else {
              synthesizedTime = Math.round((nextRealLevel.timeSpent || 0) / 2);
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

    const numericIds = new Set(numeric.map((c) => c.id));
    const nonNumeric = (allCols as Array<typeof allCols[number]>).filter((c) => !numericIds.has(c.id));
    return [...result, ...nonNumeric];
  }, [baseColumns, mode]);

  return (
    <div className="w-full px-1 sm:px-2 space-y-4 lg:space-y-6 min-h-[calc(100vh-4rem)] relative flex flex-col">
      <div className="flex-1">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold truncate">
            {game ? game.name : t('games.detailTitle')}
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            {t('games.detailSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2 md:gap-3 self-end lg:self-auto">
          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-3">
            <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportDialog(true)}
                className="flex items-center gap-2"
            >
                <Upload className="h-4 w-4" />
                {t('common.import', 'Import')}
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExportDialog(true)}
                className="flex items-center gap-2"
            >
                <Download className="h-4 w-4" />
                {t('common.export', 'Export')}
            </Button>

            <LayoutToggle layout={layout} onLayoutChange={setLayout} />

            <div className="flex items-center gap-2 px-2 py-1 border rounded h-9">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="game-detail-mode-desktop"
                  checked={mode === 'event-only'}
                  onChange={() => setMode('event-only')}
                  className="w-3 h-3"
                />
                <span className="text-xs">{t('common.eventOnly')}</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="game-detail-mode-desktop"
                  checked={mode === 'all'}
                  onChange={() => setMode('all')}
                  className="w-3 h-3"
                />
                <span className="text-xs">{t('common.all')}</span>
              </label>
            </div>
          </div>

          {/* Mobile More Actions Popover */}
          <div className="lg:hidden">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-9 p-0">
                  <div className="flex flex-col gap-0.5 items-center">
                    <div className="w-1 h-1 bg-current rounded-full" />
                    <div className="w-1 h-1 bg-current rounded-full" />
                    <div className="w-1 h-1 bg-current rounded-full" />
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3 space-y-4" align="end">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase text-muted-foreground font-bold">{t('common.view', 'View Options')}</Label>
                  <div className="flex flex-col gap-2">
                    <LayoutToggle layout={layout} onLayoutChange={setLayout} />
                    <div className="flex flex-col gap-2 p-2 border rounded bg-accent/20">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="game-detail-mode-mobile"
                          checked={mode === 'event-only'}
                          onChange={() => setMode('event-only')}
                        />
                        <span className="text-sm">{t('common.eventOnly')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="game-detail-mode-mobile"
                          checked={mode === 'all'}
                          onChange={() => setMode('all')}
                        />
                        <span className="text-sm">{t('common.all')}</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-[10px] uppercase text-muted-foreground font-bold">{t('common.actions', 'Actions')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowImportDialog(true)}
                      className="justify-start gap-2 h-9 text-xs px-2"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {t('common.import')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowExportDialog(true)}
                      className="justify-start gap-2 h-9 text-xs px-2"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t('common.export')}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="h-9 w-[1px] bg-border mx-1" />

          {!isEditMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditToggle}
                className="flex items-center gap-2 h-9"
              >
                <Edit3 className="h-4 w-4" />
                <span className="hidden xs:inline">{t('common.edit', 'Edit')}</span>
              </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveChanges}
                className="flex items-center gap-2 h-9 bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20"
              >
                <Save className="h-4 w-4" />
                <span className="hidden xs:inline">{t('common.save', 'Save')}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEdit}
                className="flex items-center gap-2 h-9"
              >
                <X className="h-4 w-4" />
                <span className="hidden xs:inline">{t('common.cancel', 'Cancel')}</span>
              </Button>
            </div>
          )}

          <BackButton />
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-auto">
          <GameDataTable
            columns={columns}
            layout={layout}
            isEditMode={isEditMode}
            onDeleteLevel={handleDeleteLevel}
            onDeletePurchaseEvent={handleDeletePurchaseEvent}
            onUpdateLevel={handleUpdateLevel}
            onUpdatePurchaseEvent={handleUpdatePurchaseEvent}
            onAddLevel={handleAddLevel}
            onAddPurchaseEvent={handleAddPurchaseEvent}
          />
        </CardContent>
      </Card>

      {!isEditMode && (
        <div className="flex flex-wrap gap-4 mt-6">
          <Button
            onClick={() => navigate(`/accounts/new?gameId=${gameId}`)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {t('games.quickActions.addAccount', 'Add Account')}
          </Button>
        </div>
      )}

      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        gameId={gameId}
      />

      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        gameId={gameId}
        exportType="game"
        layout={layout}
        colorSettings={colors}
        theme={theme}
        source="game-detail"
        data={columns}
      />
      </div>

      {/* Excel-like Game Tabs Navigation */}
      <ExcelTabBar
        games={games}
        activeGameId={gameId}
        onSelectGame={(id) => navigate(`/games/${id}`)}
        onCreateGame={handleCreateGameAsync}
        onDeleteGame={handleDeleteGame}
        isEditMode={isEditMode}
      />
    </div>
  );
}



