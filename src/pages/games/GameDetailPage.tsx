// src/pages/games/GameDetailPage.tsx

import { useMemo, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../components/ui/card';
import { LayoutToggle, Layout } from '../../components/molecules/LayoutToggle';
import { BackButton } from '../../components/molecules/BackButton';
import { GameDataTable } from '../../components/tables/GameDataTable';
import { ImportDialog } from '../../components/molecules/ImportDialog';
import { ExportDialog } from '../../components/molecules/ExportDialog';
import { Button } from '../../components/ui/button';
import { Download, Upload, Plus, Edit3, Save, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

import { useGames } from '../../hooks/useGames';
import { useLevels } from '../../hooks/useLevels';
import { usePurchaseEvents } from '../../hooks/usePurchaseEvents';
import { useSettings } from '../../contexts/SettingsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { TauriService } from '../../services/tauri.service';
import { Level, PurchaseEvent } from '../../types';

type Mode = 'all' | 'event-only';

export default function GameDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const gameId = id ? parseInt(id, 10) : undefined;
  const { colors } = useSettings();
  const { theme } = useTheme();

  const { games } = useGames();
  const { levels = [] } = useLevels(gameId);
  const { events: purchaseEvents = [] } = usePurchaseEvents(gameId);

  const [layout, setLayout] = useState<Layout>('vertical');
  const [mode, setMode] = useState<Mode>('event-only');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  // Game Creation State
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  
  // Edit State
  const [editedLevels, setEditedLevels] = useState<Level[]>([]);
  const [editedPurchaseEvents, setEditedPurchaseEvents] = useState<PurchaseEvent[]>([]);

  const handleCreateGame = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newGameName.trim()) return;

    try {
        const newId = await TauriService.addGame({ name: newGameName });
        if (newId) {
            setNewGameName('');
            setIsCreatingGame(false);
            window.dispatchEvent(new CustomEvent('games-updated', { detail: { id: newId } }));
            navigate(`/games/${newId}`);
        }
    } catch (error) {
        console.error('Failed to create game:', error);
    }
  };

  useEffect(() => {
    setLayout('vertical');
    setMode('event-only');
  }, [gameId]);

  // Initialize edited data when entering edit mode
  useEffect(() => {
    if (isEditMode) {
      setEditedLevels([...levels]);
      setEditedPurchaseEvents([...purchaseEvents]);
    }
  }, [isEditMode, levels, purchaseEvents]);

  const handleEditToggle = () => {
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

  const handleUpdateLevel = (levelId: number, field: string, value: any) => {
    setEditedLevels((prev: Level[]) => prev.map((level: Level) =>
      level.id === levelId ? { ...level, [field]: value } : level
    ));
  };

  const handleUpdatePurchaseEvent = (eventId: number, field: string, value: any) => {
    setEditedPurchaseEvents((prev: PurchaseEvent[]) => prev.map((event: PurchaseEvent) =>
      event.id === eventId ? { ...event, [field]: value } : event
    ));
  };

  const game = games.find(g => String(g.id) === String(id));

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
        maxDaysOffset: p.max_days_offset != null ? p.max_days_offset : null,
        isRestricted: !!p.is_restricted,
        timeSpent: midpointTime,
        synthetic: false,
      };
    });

    return [...levelCols, ...purchaseCols] as const;
  }, [currentLevels, currentPurchaseEvents, t]);


  const columns = useMemo(() => {
    const allCols = [...baseColumns];
    const numeric = allCols.filter((c: any) => typeof c.daysOffset === 'number' && c.daysOffset !== null);
    numeric.sort((a: any, b: any) => {
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

    // Group entries by daysOffset to handle multiple entries per day
    const entriesByDay: { [day: number]: any[] } = {};
    numeric.forEach(entry => {
      const day = entry.daysOffset as number;
      if (!entriesByDay[day]) {
        entriesByDay[day] = [];
      }
      entriesByDay[day].push(entry);
    });

    let minDay: number = numeric.length > 0 ? (numeric[0].daysOffset as number) : 0;
    let maxDay: number = numeric.length > 0 ? (numeric[numeric.length - 1].daysOffset as number) : 0;

    if (numeric.length > 0 && minDay > 0) {
      minDay = 0;
    }

    const result: any[] = [];

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
            const increment = nextRealLevel.timeSpent / (firstRealDay + 1);
            synthesizedTime = Math.round((day + 1) * increment);
            token = nextRealLevel.token;
          } else {
            let prevRealLevel = null;
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

    const numericIds = new Set(numeric.map((c: any) => c.id));
    const nonNumeric = baseColumns.filter((c: any) => !numericIds.has(c.id));
    return [...result, ...nonNumeric];
  }, [baseColumns, mode]);

  return (
    <div className="container mx-auto p-6 space-y-6 min-h-[calc(100vh-4rem)] relative flex flex-col">
      <div className="flex-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {game ? game.name : t('games.detailTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('games.detailSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
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

          {!isEditMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEditToggle}
              className="flex items-center gap-2"
            >
              <Edit3 className="h-4 w-4" />
              {t('common.edit', 'Edit')}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveChanges}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {t('common.save', 'Save')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEdit}
                className="flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                {t('common.cancel', 'Cancel')}
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 px-2 py-1 border rounded">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="game-detail-mode"
                checked={mode === 'event-only'}
                onChange={() => setMode('event-only')}
              />
              <span className="text-sm">{t('common.eventOnly')}</span>
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="game-detail-mode"
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
          <GameDataTable
            columns={columns}
            layout={layout}
            isEditMode={isEditMode}
            onDeleteLevel={handleDeleteLevel}
            onDeletePurchaseEvent={handleDeletePurchaseEvent}
            onUpdateLevel={handleUpdateLevel}
            onUpdatePurchaseEvent={handleUpdatePurchaseEvent}
          />
        </CardContent>
      </Card>

      {!isEditMode && (
        <div className="flex flex-wrap gap-4 mt-6">
          <Button
            onClick={() => navigate('/levels', { state: { selectedGameId: gameId, createMode: true } })}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {t('games.quickActions.addLevel')}
          </Button>

          <Button
            onClick={() => navigate('/purchase-events', { state: { selectedGameId: gameId, createMode: true } })}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {t('games.quickActions.addPurchaseEvent')}
          </Button>

          <Button
            onClick={() => navigate(`/accounts/new?gameId=${gameId}`)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {t('games.quickActions.addAccount')}
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
      <div className="sticky bottom-0 w-[calc(100%+3rem)] -ml-6 -mb-6 bg-gray-200 border-t border-gray-300 h-10 flex items-end px-2 z-40 overflow-x-auto mt-auto">
        {games.map((g) => {
          const isActive = g.id === gameId;
          return (
            <div
              key={g.id}
              onClick={() => navigate(`/games/${g.id}`)}
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



