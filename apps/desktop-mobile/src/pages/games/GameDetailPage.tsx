// src/pages/games/GameDetailPage.tsx

import { useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, CardContent } from '@grq/ui/atoms/card';
import { LayoutToggle, Layout } from '@grq/ui/molecules/LayoutToggle';
import { BackButton } from '@grq/ui/molecules/BackButton';
import { GameDataTable } from '@grq/ui/organisms/tables/GameDataTable';
import { ImportDialog } from '@grq/ui/molecules/ImportDialog';
import { ExportDialog } from '@grq/ui/molecules/ExportDialog';
import type { ColumnData } from '@grq/ui/organisms/tables/AccountDataTable';
import { ExcelTabBar } from '@grq/ui/organisms/ExcelTabBar';
import { Button } from '@grq/ui/atoms/button';
import { Label } from '@grq/ui/atoms/label';
import { Settings, Trash2, Upload, Download, Edit3, Save, X, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@grq/ui/atoms/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@grq/ui/atoms/dialog';
import { Input } from '@grq/ui/atoms/input';
import { Popover, PopoverContent, PopoverTrigger } from '@grq/ui/atoms/popover';


import { useGames } from '@grq/core/hooks/useGames';
import { useLevels } from '@grq/core/hooks/useLevels';
import { usePurchaseEvents } from '@grq/core/hooks/usePurchaseEvents';
import { useSettings } from '@grq/ui/contexts/SettingsContext';
import { useTheme } from '@grq/ui/contexts/ThemeContext';
import { TauriService } from '@grq/core/services/tauri.service';
import { Level, PurchaseEvent, GameBranch } from '@grq/api-bindings';
import { useEffect } from 'react';

type Mode = 'all' | 'event-only';

export default function GameDetailPage({ gameId: propGameId, forcedLayout }: { gameId?: number; forcedLayout?: Layout }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: urlId } = useParams<{ id?: string }>();
  const gameId = propGameId || (urlId ? parseInt(urlId, 10) : undefined);
  const { colors } = useSettings();
  const { theme } = useTheme();

  const { games, deleteGame, fetchBranches, addBranch, deleteBranch } = useGames();
  
  const [branches, setBranches] = useState<GameBranch[]>([]);
  const [showManageBranches, setShowManageBranches] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [copyFromBranchId, setCopyFromBranchId] = useState<number | null>(null);

  // Fetch branches when game changed
  useEffect(() => {
    if (gameId) {
      const loadBranches = async () => {
        const data = await fetchBranches(gameId);
        setBranches(data);
      };
      loadBranches();
    }
  }, [gameId, fetchBranches]);

  // Listen for branch updates
  useEffect(() => {
    const handler = (e: Event) => {
        const detail = (e as CustomEvent)?.detail;
        if (gameId && (detail?.gameId === undefined || detail?.gameId === gameId)) {
            fetchBranches(gameId).then(setBranches);
        }
    };
    window.addEventListener('branches-updated', handler);
    return () => window.removeEventListener('branches-updated', handler);
  }, [gameId, fetchBranches]);

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

  // Original data for comparison during save
  const [originalLevels, setOriginalLevels] = useState<Level[]>([]);
  const [originalPurchaseEvents, setOriginalPurchaseEvents] = useState<PurchaseEvent[]>([]);

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

  const handleEditToggle = async () => {
    if (!isEditMode) {
      // Fetch all levels and events for all branches to initialize edit state
      const allLevels: Level[] = [];
      const allEvents: PurchaseEvent[] = [];
      
      for (const branch of branches) {
          const lvls = await TauriService.getGameLevels(branch.id);
          const evts = await TauriService.getGamePurchaseEvents(branch.id);
          allLevels.push(...lvls);
          allEvents.push(...evts);
      }
      
      setOriginalLevels(allLevels);
      setOriginalPurchaseEvents(allEvents);
      setEditedLevels([...allLevels]);
      setEditedPurchaseEvents([...allEvents]);
    }
    setIsEditMode(!isEditMode);
  };

  const handleSaveChanges = async () => {
    try {
      // Save level changes
      for (const editedLevel of editedLevels) {
        const originalLevel = originalLevels.find(l => l.id === editedLevel.id);
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
        const originalEvent = originalPurchaseEvents.find(e => e.id === editedEvent.id);
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
            const originalLevel = originalLevels.find(l => l.id === editedLevel.id);
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
            const originalEvent = originalPurchaseEvents.find(e => e.id === editedEvent.id);
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

  const game = games.find(g => String(g.id) === String(gameId));

  // --- Multi-Branch Export Data Aggregation ---
  // We need to fetch all levels/events for ALL branches to build the export data
  const [allBranchData, setAllBranchData] = useState<Array<{ branchName: string; columns: ColumnData[] }>>([]);
  const [isPreparingExport, setIsPreparingExport] = useState(false);

  const prepareExportData = async () => {
    if (!gameId || branches.length === 0) return;
    setIsPreparingExport(true);
    try {
      const exportData: Array<{ branchName: string; columns: ColumnData[] }> = [];
      
      for (const branch of branches) {
        const [lvls, evts] = await Promise.all([
          TauriService.getGameLevels(branch.id),
          TauriService.getGamePurchaseEvents(branch.id)
        ]);
        
        // Use the same column building logic as GameBranchSection (simplified but consistent)
        const levelCols = lvls.map(l => ({
          kind: 'level' as const, id: l.id, token: l.event_token.split('_day')[0], name: l.level_name,
          daysOffset: l.days_offset, timeSpent: l.time_spent, isBonus: !!l.is_bonus, synthetic: l.level_name === '-'
        }));

        const purchaseCols = evts.map(p => {
          const base = p.days_offset !== null && p.days_offset !== undefined ? String(p.days_offset) : '-';
          let daysOffsetValue = base;
          if (p.is_restricted && p.max_days_offset != null) {
              daysOffsetValue = `${base} (${t('purchaseEvents.lessThan')} ${p.max_days_offset})`;
          }

          return {
            kind: 'purchase' as const, 
            id: p.id, 
            token: p.event_token, 
            name: '$$$',
            daysOffset: daysOffsetValue, 
            maxDaysOffset: p.max_days_offset != null ? String(p.max_days_offset) : null,
            isRestricted: !!p.is_restricted, 
            timeSpent: null, 
            synthetic: false
          };
        });

        // Combine and filter based on mode
        let columns = [...levelCols, ...purchaseCols] as ColumnData[];
        
        if (mode === 'event-only') {
            // Filter out synthetic items (Session)
            columns = columns.filter(c => !c.synthetic);
        }

        // Sort: Always put levels before purchase events, then by timeSpent/daysOffset
        columns.sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'level' ? -1 : 1;
            const aT = (a.timeSpent as number) ?? 0;
            const bT = (b.timeSpent as number) ?? 0;
            if (aT !== bT) return aT - bT;
            return (a.daysOffset ?? 0) - (b.daysOffset ?? 0);
        });

        exportData.push({ branchName: branch.name, columns });
      }
      
      setAllBranchData(exportData);
      setShowExportDialog(true);
    } catch (err) {
      console.error('Failed to prepare export data:', err);
    } finally {
      setIsPreparingExport(false);
    }
  };
  // --------------------------------------------

  const handleDeleteGame = async () => {
    if (!gameId || !game) return;
    if (window.confirm(t('games.deleteConfirm'))) {
      const success = await deleteGame(gameId);
      if (success) {
        navigate('/games-table');
      }
    }
  };

  const handleCreateBranch = async () => {
    if (!gameId || !newBranchName) return;
    setIsCreatingBranch(true);
    try {
        const id = await addBranch({
            game_id: gameId,
            name: newBranchName,
            copy_from_branch_id: copyFromBranchId || undefined
        });
        if (id) {
            setNewBranchName('');
            setCopyFromBranchId(null);
        }
    } finally {
        setIsCreatingBranch(false);
    }
  };


  return (
    <div className="w-full px-1 sm:px-2 space-y-4 lg:space-y-6 min-h-[calc(100vh-4rem)] relative flex flex-col">
      <div className="flex-1">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold truncate">
                {game ? game.name : t('games.detailTitle')}
            </h1>
            
            {branches.length > 0 && (
                <div className="flex items-center gap-2 bg-accent/30 p-1 rounded-md border border-border/50">
                    <span className="text-sm font-medium px-2 text-muted-foreground">{branches.length} Branches</span>
                    
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7"
                        onClick={() => setShowManageBranches(true)}
                    >
                        <Settings className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}
          </div>
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
                onClick={prepareExportData}
                disabled={isPreparingExport}
                className="flex items-center gap-2"
            >
                {isPreparingExport ? <span className="animate-spin mr-2">...</span> : <Download className="h-4 w-4" />}
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
                      onClick={prepareExportData}
                      disabled={isPreparingExport}
                      className="justify-start gap-2 h-9 text-xs px-2"
                    >
                      {isPreparingExport ? <span className="animate-spin mr-2">...</span> : <Download className="h-3.5 w-3.5" />}
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

      <div className="flex flex-col gap-12 mt-6 pb-24">
        {branches.map(branch => (
            <GameBranchSection 
                key={branch.id}
                gameId={gameId!}
                branch={branch}
                layout={layout}
                mode={mode}
                isEditMode={isEditMode}
                editedLevels={editedLevels}
                editedPurchaseEvents={editedPurchaseEvents}
                onDeleteLevel={handleDeleteLevel}
                onDeletePurchaseEvent={handleDeletePurchaseEvent}
                onUpdateLevel={handleUpdateLevel}
                onUpdatePurchaseEvent={handleUpdatePurchaseEvent}
                t={t}
            />
        ))}
      </div>

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
        data={allBranchData}
      />
      </div>

      {/* Manage Branches Dialog */}
      <Dialog open={showManageBranches} onOpenChange={setShowManageBranches}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{t('branches.manageTitle', 'Manage Branches')}</DialogTitle>
                <DialogDescription>
                    {t('branches.manageDescription', 'Create, delete or duplicate branches for your game levels and events.')}
                </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>{t('branches.existingBranches', 'Existing Branches')}</Label>
                    <div className="space-y-2 max-h-[200px] overflow-auto pr-2">
                        {branches.map(b => (
                            <div key={b.id} className="flex items-center justify-between p-2 rounded-md border bg-accent/10">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{b.name}</span>
                                    {b.is_default && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase">{t('common.default')}</span>}
                                </div>
                                <div className="flex items-center gap-1">
                                    {!b.is_default && (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-7 w-7 text-destructive"
                                            onClick={() => deleteBranch(b.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className="h-px bg-border my-2" />
                
                <div className="space-y-3">
                    <Label>{t('branches.createNew', 'Create New Branch')}</Label>
                    <div className="flex flex-col gap-3">
                        <Input 
                            placeholder={t('branches.namePlaceholder', 'Branch Name')}
                            value={newBranchName}
                            onChange={(e) => setNewBranchName(e.target.value)}
                        />
                        
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">{t('branches.copyFrom', 'Copy levels from (Optional)')}</Label>
                            <Select 
                                value={copyFromBranchId?.toString() || 'none'} 
                                onValueChange={(val) => setCopyFromBranchId(val === 'none' ? null : parseInt(val, 10))}
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder={t('common.none', 'None')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t('common.none', 'None')}</SelectItem>
                                    {branches.map(b => (
                                        <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <Button 
                            className="w-full gap-2" 
                            disabled={!newBranchName || isCreatingBranch}
                            onClick={handleCreateBranch}
                        >
                            {isCreatingBranch ? <span className="animate-spin mr-2">...</span> : <Plus className="h-4 w-4" />}
                            {t('branches.createAction', 'Create Branch')}
                        </Button>
                    </div>
                </div>
            </div>
            
            <DialogFooter>
                <Button variant="outline" onClick={() => setShowManageBranches(false)}>{t('common.close')}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

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

interface GameBranchSectionProps {
    gameId: number;
    branch: GameBranch;
    layout: Layout;
    mode: Mode;
    isEditMode: boolean;
    editedLevels: Level[];
    editedPurchaseEvents: PurchaseEvent[];
    onDeleteLevel: (id: number) => void;
    onDeletePurchaseEvent: (id: number) => void;
    onUpdateLevel: (id: number, field: keyof Level, value: string | number | boolean) => void;
    onUpdatePurchaseEvent: (id: number, field: keyof PurchaseEvent, value: string | number | boolean | null) => void;
    t: TFunction;
}

function GameBranchSection({
    gameId, branch, layout, mode, isEditMode,
    editedLevels, editedPurchaseEvents,
    onDeleteLevel, onDeletePurchaseEvent, onUpdateLevel, onUpdatePurchaseEvent,
    t
}: GameBranchSectionProps) {
    const { levels = [] } = useLevels(branch.id);
    const { events: purchaseEvents = [] } = usePurchaseEvents(branch.id);

    const currentLevels = isEditMode ? editedLevels.filter(l => l.branch_id === branch.id) : levels;
    const currentPurchaseEvents = isEditMode ? editedPurchaseEvents.filter(e => e.branch_id === branch.id) : purchaseEvents;

    const baseColumns = useMemo(() => {
        const levelCols = currentLevels.map(l => ({
            kind: 'level' as const,
            id: l.id,
            token: l.event_token.split('_day')[0],
            name: l.level_name,
            daysOffset: typeof l.days_offset === 'number' ? l.days_offset : null,
            timeSpent: typeof l.time_spent === 'number' ? l.time_spent : null,
            isBonus: !!l.is_bonus,
            synthetic: l.level_name === '-',
        }));

        const purchaseCols = currentPurchaseEvents.map(p => {
            const day = p.days_offset;
            let midpointTime: number | null = null;
            if (day != null) {
                const numericLevels = levelCols.filter(l => l.daysOffset !== null).sort((a, b) => (a.daysOffset as number) - (b.daysOffset as number));
                if (numericLevels.length > 0) {
                    const sameDayLevels = numericLevels.filter(l => (l.daysOffset as number) === day);
                    const nextLevel = numericLevels.find(l => (l.daysOffset as number) > day);
                    const levelsToAverage = [...sameDayLevels];
                    if (nextLevel) levelsToAverage.push(nextLevel);
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
        });

        return [...levelCols, ...purchaseCols] as ColumnData[];
    }, [currentLevels, currentPurchaseEvents]);

    const columns = useMemo(() => {
        const allCols = [...baseColumns];
        const numeric = allCols.filter(c => c.daysOffset !== null) as (ColumnData & { daysOffset: number })[];
        
        numeric.sort((a, b) => {
            const aTime = (a.timeSpent as number) ?? 0;
            const bTime = (b.timeSpent as number) ?? 0;
            if (aTime !== bTime) return aTime - bTime;
            if (a.daysOffset !== b.daysOffset) return a.daysOffset - b.daysOffset;
            if (a.kind !== b.kind) return a.kind === 'level' ? -1 : 1;
            return String(a.id).localeCompare(String(b.id));
        });

        if (mode === 'event-only') {
            const lvls = allCols.filter(c => c.kind === 'level' && c.name !== '-');
            const purchases = allCols.filter(c => c.kind === 'purchase');
            
            lvls.sort((a, b) => {
                const aT = (a.timeSpent ?? 0);
                const bT = (b.timeSpent ?? 0);
                if (aT !== bT) return aT - bT;
                return (a.daysOffset ?? 0) - (b.daysOffset ?? 0);
            });
            
            purchases.sort((a, b) => {
                const aT = (a.timeSpent ?? 0);
                const bT = (b.timeSpent ?? 0);
                if (aT !== bT) return aT - bT;
                if (a.daysOffset === b.daysOffset) return 0;
                if (a.daysOffset == null) return 1;
                if (b.daysOffset == null) return -1;
                return a.daysOffset - b.daysOffset;
            });
            
            return [...lvls, ...purchases];
        }

        const entriesByDay: Record<number, ColumnData[]> = {};
        numeric.forEach(e => {
            if (!entriesByDay[e.daysOffset]) entriesByDay[e.daysOffset] = [];
            entriesByDay[e.daysOffset].push(e);
        });

        const minDay = numeric.length > 0 ? Math.min(0, numeric[0].daysOffset) : 0;
        const maxDay = numeric.length > 0 ? numeric[numeric.length - 1].daysOffset : 0;
        const result: ColumnData[] = [];

        for (let day = minDay; day <= maxDay; day++) {
            if (entriesByDay[day]) {
                result.push(...entriesByDay[day]);
            } else {
                let nextReal: ColumnData | null = null;
                for (let d = day + 1; d <= maxDay; d++) {
                    if (entriesByDay[d]) {
                        const nonSynth = entriesByDay[d].filter(en => en.kind === 'level' && !en.synthetic);
                        if (nonSynth.length > 0) { nextReal = nonSynth[0]; break; }
                    }
                }
                if (nextReal) {
                    const realDays = numeric.filter(en => en.kind === 'level' && !en.synthetic).map(en => en.daysOffset);
                    const firstRealDay = Math.min(...realDays);
                    let synthTime = 0;
                    if (day < firstRealDay) {
                        synthTime = Math.round((day + 1) * ((nextReal.timeSpent || 0) / (firstRealDay + 1)));
                    } else {
                        let prevReal: ColumnData | null = null;
                        for (let d = day - 1; d >= minDay; d--) {
                            if (entriesByDay[d]) {
                                const nonSynth = entriesByDay[d].filter(en => en.kind === 'level' && !en.synthetic);
                                if (nonSynth.length > 0) { prevReal = nonSynth[nonSynth.length - 1]; break; }
                            }
                        }
                        if (prevReal) {
                            const ratio = (day - prevReal.daysOffset) / (nextReal.daysOffset - prevReal.daysOffset);
                            synthTime = Math.round((prevReal.timeSpent || 0) + ratio * ((nextReal.timeSpent || 0) - (prevReal.timeSpent || 0)));
                        } else {
                            synthTime = Math.round((nextReal.timeSpent || 0) / 2);
                        }
                    }
                    result.push({ kind: 'level', id: `synth-${nextReal.token}-${day}`, token: nextReal.token, name: '-', daysOffset: day, timeSpent: synthTime, isBonus: false, synthetic: true });
                }
            }
        }
        const numericIds = new Set(numeric.map(c => c.id));
        const nonNumeric = allCols.filter(c => !numericIds.has(c.id));
        return [...result, ...nonNumeric] as ColumnData[];
    }, [baseColumns, mode]);

    const handleAddLevel = async (data: { level_name: string; event_token: string; days_offset: number; time_spent: number; is_bonus: boolean }) => {
        await TauriService.addLevel({ game_id: gameId, branch_id: branch.id, ...data });
        window.dispatchEvent(new CustomEvent('levels-updated', { detail: { branchId: branch.id } }));
    };

    const handleAddPurchaseEvent = async (data: { event_token: string; days_offset: number; max_days_offset: number | null; is_restricted: boolean }) => {
        await TauriService.addPurchaseEvent({ game_id: gameId, branch_id: branch.id, ...data });
        window.dispatchEvent(new CustomEvent('purchase-events-updated', { detail: { branchId: branch.id } }));
    };

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-accent/20 rounded-t-lg border-x border-t">
                <div className="h-4 w-1 rounded-full bg-primary" />
                <h3 className="text-lg font-bold">{branch.name} {branch.is_default && <span className="ml-2 text-[10px] opacity-70 uppercase tracking-widest bg-primary/20 px-2 py-0.5 rounded">{t('common.default', { defaultValue: 'Default' })}</span>}</h3>
            </div>
            <Card className="rounded-t-none">
                <CardContent className="p-0 overflow-auto">
                    <GameDataTable
                        columns={columns} layout={layout} isEditMode={isEditMode}
                        onDeleteLevel={onDeleteLevel} onDeletePurchaseEvent={onDeletePurchaseEvent}
                        onUpdateLevel={onUpdateLevel} onUpdatePurchaseEvent={onUpdatePurchaseEvent}
                        onAddLevel={handleAddLevel} onAddPurchaseEvent={handleAddPurchaseEvent}
                    />
                </CardContent>
            </Card>
        </section>
    );
}



