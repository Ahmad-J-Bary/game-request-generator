// src/pages/games/GameDetailPage.tsx

import { useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Card, CardContent } from "@grq/ui/atoms/card";
import { GameDataTable } from "@grq/ui/organisms/tables/GameDataTable";
import { ImportDialog } from "@grq/ui/molecules/ImportDialog";
import { ExportDialog } from "@grq/ui/molecules/ExportDialog";
import type { ColumnData } from "@grq/ui/organisms/tables/AccountDataTable";
import { ExcelTabBar } from "@grq/ui/organisms/ExcelTabBar";
import { Button } from "@grq/ui/atoms/button";
import { Label } from "@grq/ui/atoms/label";
import { PageHeader } from "@grq/ui/molecules/PageHeader";
import { ActionToolbar } from "@grq/ui/molecules/ActionToolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@grq/ui/atoms/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@grq/ui/atoms/alert-dialog";
import { Settings, Trash2, Plus, Download, ChevronDown, FileText } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grq/ui/atoms/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@grq/ui/atoms/dialog";
import { Input } from "@grq/ui/atoms/input";

import { useGames } from "@grq/core/hooks/useGames";
import { useLevels } from "@grq/core/hooks/useLevels";
import { usePurchaseEvents } from "@grq/core/hooks/usePurchaseEvents";
import { useSettings } from "@grq/ui/contexts/SettingsContext";
import { useTheme } from "@grq/ui/contexts/ThemeContext";
import { TauriService } from "@grq/core/services/tauri.service";
import { Level, PurchaseEvent, GameBranch } from "@grq/api-bindings";
import { useEffect } from "react";
import {
  getRealTimelineLevels,
  getSyntheticSessionTimeSpent,
  expandTimelineWithSessionDays,
} from "@grq/core/utils/timeline-time.utils";

type Mode = "all" | "event-only";

export default function GameDetailPage({
  gameId: propGameId,
}: {
  gameId?: number;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: urlId } = useParams<{ id?: string }>();
  const gameId = propGameId || (urlId ? parseInt(urlId, 10) : undefined);
  const { colors } = useSettings();
  const { theme } = useTheme();

  const { games, deleteGame, fetchBranches, addBranch, deleteBranch } =
    useGames();

  const [branches, setBranches] = useState<GameBranch[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showManageBranches, setShowManageBranches] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
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
      if (
        gameId &&
        (detail?.gameId === undefined || detail?.gameId === gameId)
      ) {
        fetchBranches(gameId).then(setBranches);
      }
    };
    window.addEventListener("branches-updated", handler);
    return () => window.removeEventListener("branches-updated", handler);
  }, [gameId, fetchBranches]);

  const [mode, setMode] = useState<Mode>("event-only");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportType, setExportType] = useState<"game" | "all">("game");
  const [exportSource, setExportSource] = useState<"game-detail" | "accounts-detail" | "game-detail-all">("game-detail");
  const [isEditMode, setIsEditMode] = useState(false);

  // Edit State
  const [editedLevels, setEditedLevels] = useState<Level[]>([]);
  const [editedPurchaseEvents, setEditedPurchaseEvents] = useState<
    PurchaseEvent[]
  >([]);

  // Original data for comparison during save
  const [originalLevels, setOriginalLevels] = useState<Level[]>([]);
  const [originalPurchaseEvents, setOriginalPurchaseEvents] = useState<
    PurchaseEvent[]
  >([]);

  const [prevGameId, setPrevGameId] = useState(gameId);
  if (gameId !== prevGameId) {
    setPrevGameId(gameId);
    setIsEditMode(false);
    setEditedLevels([]);
    setEditedPurchaseEvents([]);
  }

  // Game Creation State
  const handleCreateGameAsync = async (name: string) => {
    try {
      const newId = await TauriService.addGame({ name });
      if (newId) {
        window.dispatchEvent(
          new CustomEvent("games-updated", { detail: { id: newId } }),
        );
        navigate(`/games/${newId}`);
      }
    } catch (error) {
      console.error("Failed to create game:", error);
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

  const sanitizeBranchData = useCallback(async (branchId: number) => {
    const [branchLevels, branchPurchaseEvents] = await Promise.all([
      TauriService.getGameLevels(branchId),
      TauriService.getGamePurchaseEvents(branchId),
    ]);

    const purchaseTokenSet = new Set(
      branchPurchaseEvents
        .map((p) => (p.event_token || "").split("_day")[0].trim())
        .filter(Boolean),
    );

    // Permanently remove session-only levels ("-") that share purchase tokens
    const conflictingSessionLevels = branchLevels.filter((l) => {
      const token = (l.event_token || "").split("_day")[0].trim();
      return l.level_name === "-" && purchaseTokenSet.has(token);
    });

    for (const lvl of conflictingSessionLevels) {
      await TauriService.deleteLevel(lvl.id);
    }

    return {
      levels: branchLevels.filter(
        (l) => !conflictingSessionLevels.some((x) => x.id === l.id),
      ),
      purchaseEvents: branchPurchaseEvents,
    };
  }, []);

  const handleSaveChanges = async () => {
    try {
      // Save level changes
      for (const editedLevel of editedLevels) {
        const originalLevel = originalLevels.find(
          (l) => l.id === editedLevel.id,
        );
        if (originalLevel) {
          // Check if level was modified
          if (
            originalLevel.level_name !== editedLevel.level_name ||
            originalLevel.event_token !== editedLevel.event_token ||
            originalLevel.days_offset !== editedLevel.days_offset ||
            originalLevel.time_spent !== editedLevel.time_spent ||
            originalLevel.is_bonus !== editedLevel.is_bonus
          ) {
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
        const originalEvent = originalPurchaseEvents.find(
          (e) => e.id === editedEvent.id,
        );
        if (originalEvent) {
          // Check if purchase event was modified
          if (
            originalEvent.event_token !== editedEvent.event_token ||
            originalEvent.is_restricted !== editedEvent.is_restricted ||
            originalEvent.max_days_offset !== editedEvent.max_days_offset ||
            originalEvent.days_offset !== editedEvent.days_offset
          ) {
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

      // Re-sanitize all branches after edits are saved
      for (const branch of branches) {
        await sanitizeBranchData(branch.id);
      }

      // ── Sync frozen accountCompletionRecords in localStorage ──────────────
      // When a level or purchase event is edited, the completion records that
      // were frozen at task-completion time (timeSpent, eventToken) must be
      // updated so the cooldown timer uses the correct new values.
      try {
        const savedCompletions = localStorage.getItem(
          "accountCompletionRecords",
        );
        if (savedCompletions) {
          const records = JSON.parse(savedCompletions) as Record<
            string,
            {
              accountId: number;
              timeSpent: number;
              completionTime: number;
              levelId?: number;
              eventToken?: string;
            }
          >;

          let changed = false;

          // Update level-related completion records
          for (const editedLevel of editedLevels) {
            const originalLevel = originalLevels.find(
              (l) => l.id === editedLevel.id,
            );
            if (!originalLevel) continue;
            const timeSpentChanged =
              originalLevel.time_spent !== editedLevel.time_spent;
            const tokenChanged =
              originalLevel.event_token !== editedLevel.event_token;
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
            const originalEvent = originalPurchaseEvents.find(
              (e) => e.id === editedEvent.id,
            );
            if (!originalEvent) continue;
            const tokenChanged =
              originalEvent.event_token !== editedEvent.event_token;
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
            localStorage.setItem(
              "accountCompletionRecords",
              JSON.stringify(records),
            );
          }
        }
      } catch (lsError) {
        console.warn(
          "Failed to sync accountCompletionRecords in localStorage:",
          lsError,
        );
      }
      // ─────────────────────────────────────────────────────────────────────

      setIsEditMode(false);
      // Refresh data by reloading the page
      window.location.reload();
    } catch (error) {
      console.error("Error saving changes:", error);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
  };

  const handleDeleteLevel = async (levelId: number) => {
    try {
      await TauriService.deleteLevel(levelId);
      setEditedLevels((prev: Level[]) =>
        prev.filter((l: Level) => l.id !== levelId),
      );
    } catch (error) {
      console.error("Error deleting level:", error);
    }
  };

  const handleDeletePurchaseEvent = async (eventId: number) => {
    try {
      await TauriService.deletePurchaseEvent(eventId);
      setEditedPurchaseEvents((prev: PurchaseEvent[]) =>
        prev.filter((e: PurchaseEvent) => e.id !== eventId),
      );
    } catch (error) {
      console.error("Error deleting purchase event:", error);
    }
  };

  const handleUpdateLevel = (
    levelId: number,
    field: keyof Level,
    value: Level[keyof Level],
  ) => {
    setEditedLevels((prev: Level[]) =>
      prev.map((level: Level) =>
        level.id === levelId ? { ...level, [field]: value } : level,
      ),
    );
  };

  const handleUpdatePurchaseEvent = (
    eventId: number,
    field: keyof PurchaseEvent,
    value: PurchaseEvent[keyof PurchaseEvent],
  ) => {
    setEditedPurchaseEvents((prev: PurchaseEvent[]) =>
      prev.map((event: PurchaseEvent) =>
        event.id === eventId ? { ...event, [field]: value } : event,
      ),
    );
  };

  const game = games.find((g) => String(g.id) === String(gameId));

  // --- Multi-Branch Export Data Aggregation ---
  // We need to fetch all levels/events for ALL branches to build the export data
  const [allBranchData, setAllBranchData] = useState<
    Array<{ branchName: string; columns: ColumnData[] }>
  >([]);
  const [allGamesExportData, setAllGamesExportData] = useState<
    Array<{ gameId: number; gameName: string; branches: Array<{ branchName: string; columns: ColumnData[] }> }>
  >([]);

  const prepareExportData = async () => {
    if (!gameId || branches.length === 0) return;
    try {
      const exportData: Array<{ branchName: string; columns: ColumnData[] }> =
        [];

      for (const branch of branches) {
        const [lvls, evts] = await Promise.all([
          TauriService.getGameLevels(branch.id),
          TauriService.getGamePurchaseEvents(branch.id),
        ]);

        // Use the same column building logic as GameBranchSection (simplified but consistent)
        const levelCols = lvls.map((l) => ({
          kind: "level" as const,
          id: l.id,
          token: l.event_token.split("_day")[0],
          name: l.level_name,
          daysOffset: l.days_offset,
          timeSpent: l.time_spent,
          isBonus: !!l.is_bonus,
          synthetic: l.level_name === "-",
        }));

        const purchaseCols = evts.map((p) => {
          const base =
            p.days_offset !== null && p.days_offset !== undefined
              ? String(p.days_offset)
              : "-";
          let daysOffsetValue = base;
          if (p.is_restricted && p.max_days_offset != null) {
            daysOffsetValue = `${base} (${t("purchaseEvents.lessThan")} ${p.max_days_offset})`;
          }

          return {
            kind: "purchase" as const,
            id: p.id,
            token: p.event_token,
            name: "$$$",
            daysOffset: daysOffsetValue,
            maxDaysOffset:
              p.max_days_offset != null ? String(p.max_days_offset) : null,
            isRestricted: !!p.is_restricted,
            timeSpent: null,
            synthetic: false,
          };
        });

        // Combine and filter based on mode
        let columns = [...levelCols, ...purchaseCols] as ColumnData[];

        if (mode === "event-only") {
          // Filter out synthetic items (Session)
          columns = columns.filter((c) => !c.synthetic);
        }

        // Sort: Always put levels before purchase events, then by timeSpent/daysOffset
        columns.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "level" ? -1 : 1;
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
      console.error("Failed to prepare export data:", err);
    }
  };
  // --------------------------------------------

  const currentGameName = game?.name || t("games.detailTitle");

  const handleExportThisGame = async () => {
    setExportType("game");
    setExportSource("game-detail");
    await prepareExportData();
  };

  const handleExportAllGames = async () => {
    const allData: Array<{ gameId: number; gameName: string; branches: Array<{ branchName: string; columns: ColumnData[] }> }> = [];
    for (const g of games) {
      if (!g.id) continue;
      const gBranches = await fetchBranches(g.id);
      if (gBranches.length === 0) continue;
      const branchData: Array<{ branchName: string; columns: ColumnData[] }> = [];
      for (const branch of gBranches) {
        const [lvls, evts] = await Promise.all([
          TauriService.getGameLevels(branch.id),
          TauriService.getGamePurchaseEvents(branch.id),
        ]);
        const levelCols = lvls.map((l) => ({
          kind: "level" as const,
          id: l.id,
          token: l.event_token.split("_day")[0],
          name: l.level_name,
          daysOffset: l.days_offset,
          timeSpent: l.time_spent,
          isBonus: !!l.is_bonus,
          synthetic: l.level_name === "-",
        }));
        const purchaseCols = evts.map((p) => {
          const base = p.days_offset !== null && p.days_offset !== undefined ? String(p.days_offset) : "-";
          let daysOffsetValue = base;
          if (p.is_restricted && p.max_days_offset != null) {
            daysOffsetValue = `${base} (${t("purchaseEvents.lessThan")} ${p.max_days_offset})`;
          }
          return {
            kind: "purchase" as const,
            id: p.id,
            token: p.event_token,
            name: "$$$",
            daysOffset: daysOffsetValue,
            maxDaysOffset: p.max_days_offset != null ? String(p.max_days_offset) : null,
            isRestricted: !!p.is_restricted,
            timeSpent: null,
            synthetic: false,
          };
        });
        let columns = [...levelCols, ...purchaseCols] as ColumnData[];
        if (mode === "event-only") {
          columns = columns.filter((c) => !c.synthetic);
        }
        columns.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "level" ? -1 : 1;
          const aT = (a.timeSpent as number) ?? 0;
          const bT = (b.timeSpent as number) ?? 0;
          if (aT !== bT) return aT - bT;
          return (a.daysOffset ?? 0) - (b.daysOffset ?? 0);
        });
        branchData.push({ branchName: branch.name, columns });
      }
      allData.push({ gameId: g.id, gameName: g.name, branches: branchData });
    }
    setAllGamesExportData(allData);
    setExportType("all");
    setExportSource("game-detail-all");
    setShowExportDialog(true);
  };

  const handleDeleteGame = () => {
    if (!gameId || !game) return;
    setShowDeleteDialog(true);
  };

  const confirmDeleteGame = async () => {
    if (!gameId) return;
    const success = await deleteGame(gameId);
    if (success) {
      navigate("/games-table");
    }
    setShowDeleteDialog(false);
  };

  useEffect(() => {
    if (!gameId || branches.length === 0) return;

    let cancelled = false;

    const runSanitization = async () => {
      try {
        for (const branch of branches) {
          if (cancelled) return;
          await sanitizeBranchData(branch.id);
        }

        if (!cancelled) {
          window.dispatchEvent(new CustomEvent("levels-updated"));
        }
      } catch (error) {
        console.error("Failed to auto-sanitize branch levels:", error);
      }
    };

    runSanitization();

    return () => {
      cancelled = true;
    };
  }, [gameId, branches, sanitizeBranchData]);

  const handleCreateBranch = async () => {
    if (!gameId || !newBranchName) return;
    setIsCreatingBranch(true);
    try {
      const id = await addBranch({
        game_id: gameId,
        name: newBranchName,
        copy_from_branch_id: copyFromBranchId || undefined,
      });
      if (id) {
        setNewBranchName("");
        setCopyFromBranchId(null);
      }
    } finally {
      setIsCreatingBranch(false);
    }
  };

  const exportDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2 h-9 shrink-0"
          title={t("common.export")}
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">{t("common.export")}</span>
          <ChevronDown className="h-4 w-4 hidden sm:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[200px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">
          <FileText className="h-3.5 w-3.5 inline mr-1.5" />
          {t("export.toExcel")}
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={handleExportAllGames}>
          {t("export.allGames")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportThisGame}>
          {t("export.thisGame")} ({currentGameName})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="w-full px-1 sm:px-2 space-y-4 lg:space-y-6 min-h-[calc(100vh-4rem)] relative flex flex-col">
      <div className="flex-1">
        <PageHeader
          title={game ? game.name : t("games.detailTitle")}
          subtitle={t("games.detailSubtitle")}
          titleExtra={
            branches.length > 0 && (
              <div className="flex items-center gap-2 bg-accent/30 p-1 rounded-md border border-border/50">
                <span className="text-sm font-medium px-2 text-muted-foreground">
                  {t("branches.count", { count: branches.length })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowManageBranches(true)}
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          }
        >
          <ActionToolbar
            mode={mode}
            onModeChange={setMode}
            isEditMode={isEditMode}
            onEditToggle={handleEditToggle}
            onSave={handleSaveChanges}
            onCancel={handleCancelEdit}
            onImport={() => setShowImportDialog(true)}
            onExport={handleExportThisGame}
            exportDropdown={exportDropdown}
            backTo="/games-table"
          />
        </PageHeader>

        <div className="flex flex-col gap-12 mt-6 pb-24">
          {branches.map((branch) => (
            <GameBranchSection
              key={branch.id}
              gameId={gameId!}
              branch={branch}
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

        {gameId && game && !isEditMode && (
          <div className="flex flex-wrap gap-4 mt-6">
            <Button
              onClick={() =>
                navigate(`/accounts/new?gameId=${gameId}`, {
                  state: { from: location.pathname },
                })
              }
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {t("games.quickActions.addAccount", "Add Account")}
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
          exportType={exportType}
          colorSettings={colors}
          theme={theme}
          source={exportSource}
          data={exportSource === "game-detail" ? allBranchData : undefined}
          allGamesExportData={exportSource === "game-detail-all" ? allGamesExportData : undefined}
          mode={mode}
        />
      </div>

      {/* Manage Branches Dialog */}
      <Dialog open={showManageBranches} onOpenChange={setShowManageBranches}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("branches.manageTitle")}</DialogTitle>
            <DialogDescription>
              {t("branches.manageDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("branches.existingBranches")}</Label>
              <div className="space-y-2 max-h-[200px] overflow-auto pr-2">
                {branches.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-2 rounded-md border bg-accent/10"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{b.name}</span>
                      {b.is_default && (
                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase">
                          {t("common.default")}
                        </span>
                      )}
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
              <Label>{t("branches.createNew")}</Label>
              <div className="flex flex-col gap-3">
                <Input
                  placeholder={t("branches.namePlaceholder")}
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                />

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t("branches.copyFrom")}
                  </Label>
                  <Select
                    value={copyFromBranchId?.toString() || "none"}
                    onValueChange={(val) =>
                      setCopyFromBranchId(
                        val === "none" ? null : parseInt(val, 10),
                      )
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("common.none")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("common.none")}</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id.toString()}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full gap-2"
                  disabled={!newBranchName || isCreatingBranch}
                  onClick={handleCreateBranch}
                >
                  {isCreatingBranch ? (
                    <span className="animate-spin mr-2">...</span>
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {t("branches.createAction")}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowManageBranches(false)}
            >
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Game Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("games.deleteTitle", "Delete Game")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("games.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteGame} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
  mode: Mode;
  isEditMode: boolean;
  editedLevels: Level[];
  editedPurchaseEvents: PurchaseEvent[];
  onDeleteLevel: (id: number) => void;
  onDeletePurchaseEvent: (id: number) => void;
  onUpdateLevel: (
    id: number,
    field: keyof Level,
    value: string | number | boolean,
  ) => void;
  onUpdatePurchaseEvent: (
    id: number,
    field: keyof PurchaseEvent,
    value: string | number | boolean | null,
  ) => void;
  t: TFunction;
}

function GameBranchSection({
  gameId,
  branch,
  mode,
  isEditMode,
  editedLevels,
  editedPurchaseEvents,
  onDeleteLevel,
  onDeletePurchaseEvent,
  onUpdateLevel,
  onUpdatePurchaseEvent,
  t,
}: GameBranchSectionProps) {
  const { levels = [] } = useLevels(branch.id);
  const { events: purchaseEvents = [] } = usePurchaseEvents(branch.id);

  const currentLevels = isEditMode
    ? editedLevels.filter((l) => l.branch_id === branch.id)
    : levels;
  const currentPurchaseEvents = isEditMode
    ? editedPurchaseEvents.filter((e) => e.branch_id === branch.id)
    : purchaseEvents;

  const baseColumns = useMemo(() => {
    const purchaseTokenSet = new Set(
      currentPurchaseEvents
        .map((p) => (p.event_token || "").split("_day")[0].trim())
        .filter(Boolean),
    );

    // Hard sanitize in table view: never show session-only levels sharing purchase tokens
    const sanitizedLevels = currentLevels.filter((l) => {
      const token = (l.event_token || "").split("_day")[0].trim();
      return !(l.level_name === "-" && purchaseTokenSet.has(token));
    });

    const levelCols = sanitizedLevels.map((l) => ({
      kind: "level" as const,
      id: l.id,
      token: l.event_token.split("_day")[0],
      name: l.level_name,
      daysOffset: typeof l.days_offset === "number" ? l.days_offset : null,
      timeSpent: typeof l.time_spent === "number" ? l.time_spent : null,
      isBonus: !!l.is_bonus,
      synthetic: l.level_name === "-",
    }));

    const realTimelineLevels = getRealTimelineLevels(
      levelCols.map((l) => ({
        daysOffset: Number(l.daysOffset ?? 0),
        timeSpent: Number(l.timeSpent ?? 0),
        levelName: l.name,
        token: l.token,
        synthetic: l.synthetic,
      })),
    );

    const purchaseCols = currentPurchaseEvents.map((p) => {
      const day = p.days_offset;
      let midpointTime: number | null = null;
      if (day != null) {
        const expandedTimelineLevels =
          expandTimelineWithSessionDays(realTimelineLevels);

        const sameDayLevels = expandedTimelineLevels.filter(
          (l) => l.daysOffset === day,
        );
        const nextLevel = expandedTimelineLevels.find(
          (l) => l.daysOffset > day,
        );
        const levelsToAverage = [...sameDayLevels];
        if (nextLevel) levelsToAverage.push(nextLevel);

        if (levelsToAverage.length > 0) {
          const totalTimeSpent = levelsToAverage.reduce(
            (sum, level) => sum + (level.timeSpent || 0),
            0,
          );
          midpointTime = Math.round(totalTimeSpent / levelsToAverage.length);
        }
      }
      return {
        kind: "purchase" as const,
        id: p.id,
        token: p.event_token,
        name: "$$$",
        daysOffset: day != null ? day : null,
        maxDaysOffset:
          p.max_days_offset != null ? String(p.max_days_offset) : null,
        isRestricted: !!p.is_restricted,
        timeSpent: midpointTime,
        synthetic: false,
      };
    });

    return [...levelCols, ...purchaseCols] as ColumnData[];
  }, [currentLevels, currentPurchaseEvents]);

  const columns = useMemo(() => {
    const allCols = [...baseColumns];
    const numeric = allCols.filter(
      (c) => c.daysOffset !== null,
    ) as (ColumnData & { daysOffset: number })[];

    numeric.sort((a, b) => {
      const aTime = (a.timeSpent as number) ?? 0;
      const bTime = (b.timeSpent as number) ?? 0;
      if (aTime !== bTime) return aTime - bTime;
      if (a.daysOffset !== b.daysOffset) return a.daysOffset - b.daysOffset;
      if (a.kind !== b.kind) return a.kind === "level" ? -1 : 1;
      return String(a.id).localeCompare(String(b.id));
    });

    if (mode === "event-only") {
      const lvls = allCols.filter((c) => c.kind === "level" && c.name !== "-");
      const purchases = allCols.filter((c) => c.kind === "purchase");

      lvls.sort((a, b) => {
        const aT = a.timeSpent ?? 0;
        const bT = b.timeSpent ?? 0;
        if (aT !== bT) return aT - bT;
        return (a.daysOffset ?? 0) - (b.daysOffset ?? 0);
      });

      purchases.sort((a, b) => {
        const aT = a.timeSpent ?? 0;
        const bT = b.timeSpent ?? 0;
        if (aT !== bT) return aT - bT;
        if (a.daysOffset === b.daysOffset) return 0;
        if (a.daysOffset == null) return 1;
        if (b.daysOffset == null) return -1;
        return a.daysOffset - b.daysOffset;
      });

      return [...lvls, ...purchases];
    }

    const entriesByDay: Record<number, ColumnData[]> = {};
    numeric.forEach((e) => {
      if (!entriesByDay[e.daysOffset]) entriesByDay[e.daysOffset] = [];
      entriesByDay[e.daysOffset].push(e);
    });

    // Filter out redundant '-' levels in the UI if a real level exists for the same day
    Object.keys(entriesByDay).forEach((dayKey) => {
      const day = parseInt(dayKey, 10);
      const levels = entriesByDay[day];
      const hasRealLevel = levels.some(
        (l) => l.kind === "level" && !l.synthetic,
      );
      if (hasRealLevel) {
        entriesByDay[day] = levels.filter(
          (l) => !(l.kind === "level" && l.synthetic),
        );
      }
    });

    const minDay = numeric.length > 0 ? Math.min(0, numeric[0].daysOffset) : 0;
    const maxDay =
      numeric.length > 0 ? numeric[numeric.length - 1].daysOffset : 0;
    const result: ColumnData[] = [];

    for (let day = minDay; day <= maxDay; day++) {
      if (entriesByDay[day]) {
        result.push(...entriesByDay[day]);
      } else {
        let nextReal: ColumnData | null = null;
        for (let d = day + 1; d <= maxDay; d++) {
          if (entriesByDay[d]) {
            const nonSynth = entriesByDay[d].filter(
              (en) => en.kind === "level" && !en.synthetic,
            );
            if (nonSynth.length > 0) {
              nextReal = nonSynth[0];
              break;
            }
          }
        }
        if (nextReal) {
          const realTimelineLevels = getRealTimelineLevels(
            numeric
              .filter((en) => en.kind === "level")
              .map((en) => ({
                daysOffset: en.daysOffset,
                timeSpent: Number(en.timeSpent ?? 0),
                levelName: en.name,
                token: en.token,
                synthetic: !!en.synthetic,
              })),
          );
          const synthTime = getSyntheticSessionTimeSpent(
            nextReal.token,
            day,
            realTimelineLevels,
            0,
          );
          result.push({
            kind: "level",
            id: `synth-${nextReal.token}-${day}`,
            token: nextReal.token,
            name: "-",
            daysOffset: day,
            timeSpent: synthTime,
            isBonus: false,
            synthetic: true,
          });
        }
      }
    }
    const numericIds = new Set(numeric.map((c) => c.id));
    const nonNumeric = allCols.filter((c) => !numericIds.has(c.id));

    // Final hard filter in computed columns as well
    const purchaseTokenSet = new Set(
      allCols
        .filter((c) => c.kind === "purchase")
        .map((c) => (c.token || "").trim())
        .filter(Boolean),
    );

    const filteredResult = [...result, ...nonNumeric].filter((c) => {
      if (c.kind !== "level") return true;
      if (!c.synthetic) return true;
      return !purchaseTokenSet.has((c.token || "").trim());
    }) as ColumnData[];

    return filteredResult;
  }, [baseColumns, mode]);

  const handleAddLevel = async (data: {
    level_name: string;
    event_token: string;
    days_offset: number;
    time_spent: number;
    is_bonus: boolean;
  }) => {
    await TauriService.addLevel({
      game_id: gameId,
      branch_id: branch.id,
      ...data,
    });
    window.dispatchEvent(
      new CustomEvent("levels-updated", { detail: { branchId: branch.id } }),
    );
  };

  const handleAddPurchaseEvent = async (data: {
    event_token: string;
    days_offset: number;
    max_days_offset: number | null;
    is_restricted: boolean;
  }) => {
    await TauriService.addPurchaseEvent({
      game_id: gameId,
      branch_id: branch.id,
      ...data,
    });
    window.dispatchEvent(
      new CustomEvent("purchase-events-updated", {
        detail: { branchId: branch.id },
      }),
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-4 py-2 bg-accent/20 rounded-t-lg border-x border-t ltr:text-left rtl:text-right">
        <div className="h-4 w-1 rounded-full bg-primary" />
        <h3 className="text-lg font-bold">
          {branch.name}{" "}
          {branch.is_default && (
            <span className="ltr:ml-2 rtl:mr-2 text-[10px] opacity-70 uppercase tracking-widest bg-primary/20 px-2 py-0.5 rounded">
              {t("common.default")}
            </span>
          )}
        </h3>
      </div>
      <Card className="rounded-t-none">
        <CardContent className="p-0 overflow-auto">
          <GameDataTable
            columns={columns}
            isEditMode={isEditMode}
            onDeleteLevel={onDeleteLevel}
            onDeletePurchaseEvent={onDeletePurchaseEvent}
            onUpdateLevel={onUpdateLevel}
            onUpdatePurchaseEvent={onUpdatePurchaseEvent}
            onAddLevel={handleAddLevel}
            onAddPurchaseEvent={handleAddPurchaseEvent}
          />
        </CardContent>
      </Card>
    </section>
  );
}
