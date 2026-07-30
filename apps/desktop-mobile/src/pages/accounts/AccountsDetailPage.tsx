// src/pages/progress/AccountsDetailPage.tsx

import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { Card, CardContent } from "@grq/ui/atoms/card";
import { AccountsDataTable } from "@grq/ui/organisms/tables/AccountsDataTable";
import { ImportDialog } from "@grq/ui/molecules/ImportDialog";
import { ExportDialog } from "@grq/ui/molecules/ExportDialog";
import { exportRequestTemplates } from "@grq/core/services/export-templates.service";
import { NotificationService } from "@grq/core/utils/notifications";
import { BranchTransferDialog } from "@grq/ui/organisms/BranchTransferDialog";
import { BranchBulkTransferDialog } from "@grq/ui/organisms/BranchBulkTransferDialog";
import { Button } from "@grq/ui/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@grq/ui/atoms/dropdown-menu";
import { PageHeader } from "@grq/ui/molecules/PageHeader";
import { ActionToolbar } from "@grq/ui/molecules/ActionToolbar";
import {
  Download,
  ChevronDown,
  Edit3,
  Search,
  GitBranch,
  FileText,
} from "lucide-react";

import { useAccounts } from "@grq/core/hooks/useAccounts";
import { useLevels } from "@grq/core/hooks/useLevels";
import { usePurchaseEvents } from "@grq/core/hooks/usePurchaseEvents";
import { ProgressProvider } from "@grq/ui/organisms/progress/ProgressProvider";
import { useSettings } from "@grq/ui/contexts/SettingsContext";
import { useTheme } from "@grq/ui/contexts/ThemeContext";
import { useGames } from "@grq/core/hooks/useGames";
import { TauriService } from "@grq/core/services/tauri.service";
import { recordTaskCompletion, computeTaskDuration } from "@grq/core/utils/taskCompletion";
import { ExcelTabBar } from "@grq/ui/organisms/ExcelTabBar";
import { Badge } from "@grq/ui/atoms/badge";
import {
  getRealTimelineLevels,
  getSyntheticSessionTimeSpent,
  expandTimelineWithSessionDays,
} from "@grq/core/utils/timeline-time.utils";

import type {
  PurchaseEvent,
  Account,
  GameBranch,
  Game,
} from "@grq/api-bindings";
import type {
  TimelineColumnData as ColumnData,
  TimelineCell,
} from "@grq/ui/organisms/tables/AccountsDataTable";
import type { ColorSettings } from "@grq/ui/contexts/SettingsContext";
import type {
  AccountLevelProgress,
  AccountPurchaseEventProgress,
  BulkLevelProgressUpdate,
  BulkPurchaseEventProgressUpdate,
} from "@grq/api-bindings/types/progress.types";
import type { TFunction } from "i18next";

type Mode = "all" | "event-only";

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
  if (!date) return "-";
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${date.getDate()}-${months[date.getMonth()]}`;
}

function parseProgressKey(
  key: string,
): { accountId: number; rawId: string } | null {
  const separatorIndex = key.indexOf("_");
  if (separatorIndex <= 0) return null;

  const accountId = Number.parseInt(key.slice(0, separatorIndex), 10);
  const rawId = key.slice(separatorIndex + 1);

  if (!Number.isFinite(accountId) || !rawId) return null;

  return { accountId, rawId };
}

function parseSyntheticLevelId(
  rawId: string,
): { token: string; day: number } | null {
  const match = rawId.match(/^synth-(.+)-(-?\d+)$/);
  if (!match) return null;

  const day = Number.parseInt(match[2], 10);
  if (!Number.isFinite(day)) return null;

  return { token: match[1], day };
}

export default function AccountsDetailPage() {
  const { t } = useTranslation();
  const { colors } = useSettings();
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read gameId from URL query params
  const urlGameId = searchParams.get("gameId");
  const [selectedGameId, setSelectedGameIdState] = useState<number | undefined>(
    urlGameId ? parseInt(urlGameId, 10) : undefined,
  );

  // Update URL when game is selected
  const setSelectedGameId = (gameId?: number) => {
    setSelectedGameIdState(gameId);
    if (gameId) {
      setSearchParams({ gameId: gameId.toString() });
    } else {
      setSearchParams({});
    }
  };

  const [mode, setMode] = useState<Mode>("event-only");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportType, setExportType] = useState<"game" | "account" | "all">(
    "game",
  );

  const { accounts = [], deleteAccount, refreshAccounts } = useAccounts(selectedGameId);
  const { games, fetchBranches } = useGames();
  const [branches, setBranches] = useState<GameBranch[]>([]);

  useEffect(() => {
    let active = true;
    if (selectedGameId) {
      fetchBranches(selectedGameId)
        .then((data) => {
          if (active) setBranches(data);
        })
        .catch(console.error);
    } else {
      // Use a microtask to avoid synchronous setState inside useEffect
      Promise.resolve().then(() => {
        if (active) setBranches([]);
      });
    }
    return () => {
      active = false;
    };
  }, [selectedGameId, fetchBranches]);

  const handleCreateGameAsync = async (name: string) => {
    try {
      const newId = await TauriService.addGame({ name });
      if (newId) {
        window.dispatchEvent(
          new CustomEvent("games-updated", { detail: { id: newId } }),
        );
        setSelectedGameId(newId);
      }
    } catch (error) {
      console.error("Failed to create game:", error);
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
            deleteAccount={deleteAccount}
            refreshAccounts={refreshAccounts}
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
  colors: ColorSettings;
  theme: "light" | "dark";
  t: TFunction;
  levelsProgress: Record<string, AccountLevelProgress>;
  purchaseProgress: Record<string, AccountPurchaseEventProgress>;
  showImportDialog: boolean;
  setShowImportDialog: (show: boolean) => void;
  showExportDialog: boolean;
  setShowExportDialog: (show: boolean) => void;
  exportType: "game" | "account" | "all";
  setExportType: (type: "game" | "account" | "all") => void;
  onCreateGame: (name: string) => Promise<void>;
  deleteAccount: (id: number) => Promise<boolean>;
  refreshAccounts: () => Promise<void>;
}

function AccountsDetailContent({
  accounts,
  branches,
  games,
  selectedGameId,
  setSelectedGameId,
  mode,
  setMode,
  colors,
  theme,
  t,
  levelsProgress,
  purchaseProgress,
  showImportDialog,
  setShowImportDialog,
  showExportDialog,
  setShowExportDialog,
  exportType,
  setExportType,
  onCreateGame,
  deleteAccount,
  refreshAccounts,
}: AccountsDetailContentProps) {
  useEffect(() => {
    if (games.length > 0 && !selectedGameId) {
      setSelectedGameId(games[0].id);
    }
  }, [games, selectedGameId, setSelectedGameId]);

  const [selectedBranchId, setSelectedBranchId] = useState<
    number | undefined
  >();

  const [isEditMode, setIsEditMode] = useState(false);
  const [rangeFillMode, setRangeFillMode] = useState(false);
  const [tempProgress, setTempProgress] = useState<{
    levels: Record<string, boolean>;
    purchases: Record<string, boolean>;
  }>({
    levels: {},
    purchases: {},
  });
  const [tempPurchaseDates, setTempPurchaseDates] = useState<
    Record<number, Date | null>
  >({});

  const currentGameName =
    games.find((g) => g.id === selectedGameId)?.name || "";

  const handleExportTemplates = async (gameId?: number) => {
    const result = await exportRequestTemplates(gameId);
    if (result.success) {
      NotificationService.success(
        t("export.templatesExportSuccess", "Exported {{count}} template files", {
          count: result.count ?? 0,
        }),
      );
    } else {
      NotificationService.error(t("export.templatesExportFailed", "Failed to export request templates"));
    }
  };

  const ensureSyntheticLevel = async (
    account: Account,
    rawId: string,
  ): Promise<number | null> => {
    const syntheticMeta = parseSyntheticLevelId(rawId);
    if (!syntheticMeta || !account.branch_id) return null;

    const branchLevels = await TauriService.getGameLevels(account.branch_id);
    const eventToken = `${syntheticMeta.token}_day${syntheticMeta.day}`;
    const existingLevel = branchLevels.find(
      (level) =>
        level.days_offset === syntheticMeta.day &&
        (level.level_name !== "-" || level.event_token === eventToken),
    );

    if (existingLevel) {
      return existingLevel.id;
    }

    const sharedRealLevels = getRealTimelineLevels(
      branchLevels.map((l) => ({
        daysOffset: l.days_offset,
        timeSpent: l.time_spent || 0,
        levelName: l.level_name,
        token: (l.event_token || "").split("_day")[0],
        synthetic: false,
      })),
    );

    const synthesizedTime = getSyntheticSessionTimeSpent(
      syntheticMeta.token,
      syntheticMeta.day,
      sharedRealLevels,
      0,
    );

    return TauriService.addLevel({
      game_id: account.game_id,
      branch_id: account.branch_id,
      level_name: "-",
      event_token: eventToken,
      days_offset: syntheticMeta.day,
      time_spent: synthesizedTime,
      is_bonus: false,
    });
  };

  const handleEditToggle = () => {
    if (!isEditMode) {
      const levelProg: Record<string, boolean> = {};
      const purchaseProg: Record<string, boolean> = {};
      const purchaseDates: Record<number, Date | null> = {};

      Object.keys(levelsProgress).forEach((key) => {
        levelProg[key] = levelsProgress[key].is_completed;
      });

      Object.keys(purchaseProgress).forEach((key) => {
        const prog = purchaseProgress[key];
        purchaseProg[key] = prog.is_completed;

        const [accIdStr, peIdStr] = key.split("_");
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
    } else {
      setRangeFillMode(false);
    }
    setIsEditMode(!isEditMode);
  };

  const handleProgressChange = (
    type: "level" | "purchase",
    id: number | string,
    completed: boolean,
    options?: { rangeFromStart?: boolean; rangeId?: number | string },
    context?: {
      columns: ColumnData[];
      rangeFillMode?: boolean;
      hiddenSessionLevelIds?: number[];
    },
  ) => {
    if (!options?.rangeFromStart && !context?.rangeFillMode) {
      setTempProgress((prev) => ({
        ...prev,
        [type === "level" ? "levels" : "purchases"]: {
          ...prev[type === "level" ? "levels" : "purchases"],
          [id]: completed,
        },
      }));
      return;
    }

    if (!context?.columns?.length) {
      setTempProgress((prev) => ({
        ...prev,
        [type === "level" ? "levels" : "purchases"]: {
          ...prev[type === "level" ? "levels" : "purchases"],
          [id]: completed,
        },
      }));
      return;
    }

    const parsedCellKey = parseProgressKey(String(id));
    if (!parsedCellKey) {
      setTempProgress((prev) => ({
        ...prev,
        [type === "level" ? "levels" : "purchases"]: {
          ...prev[type === "level" ? "levels" : "purchases"],
          [id]: completed,
        },
      }));
      return;
    }

    const targetAccountId = parsedCellKey.accountId;
    const targetBaseId = String(options.rangeId ?? parsedCellKey.rawId);
    const targetColumns = context.columns;

    const targetIdx = targetColumns.findIndex((col) => {
      if (col.kind === "split") {
        return (
          String(col.session.id) === targetBaseId ||
          String(col.event?.id) === targetBaseId
        );
      }
      return String(col.id) === targetBaseId;
    });

    if (targetIdx < 0) {
      setTempProgress((prev) => ({
        ...prev,
        [type === "level" ? "levels" : "purchases"]: {
          ...prev[type === "level" ? "levels" : "purchases"],
          [id]: completed,
        },
      }));
      return;
    }

    const newLevels: Record<string, boolean> = {};
    const newPurchases: Record<string, boolean> = {};

    for (let i = 0; i <= targetIdx; i++) {
      const col = targetColumns[i];

      if (col.kind === "split") {
        newLevels[`${targetAccountId}_${String(col.session.id)}`] = completed;
        if (col.event) {
          if (col.event.kind === "level") {
            newLevels[`${targetAccountId}_${String(col.event.id)}`] = completed;
          } else {
            newPurchases[`${targetAccountId}_${String(col.event.id)}`] =
              completed;
          }
        }
        continue;
      }

      if (col.kind === "level") {
        newLevels[`${targetAccountId}_${String(col.id)}`] = completed;
      } else {
        newPurchases[`${targetAccountId}_${String(col.id)}`] = completed;
      }
    }

    // Include hidden "session-only" levels (level_name === "-") up to the selected day
    // so range fill also marks non-visible session requests.
    const targetDayFromColumn = (() => {
      const c = targetColumns[targetIdx];
      if (c.kind === "split") return Number(c.session.daysOffset ?? 0);
      return Number(c.daysOffset ?? 0);
    })();

    if (Number.isFinite(targetDayFromColumn)) {
      const hiddenSessionLevelIds = context.hiddenSessionLevelIds ?? [];
      hiddenSessionLevelIds.forEach((levelId) => {
        newLevels[`${targetAccountId}_${String(levelId)}`] = completed;
      });
    }

    setTempProgress((prev) => ({
      levels: {
        ...prev.levels,
        ...newLevels,
      },
      purchases: {
        ...prev.purchases,
        ...newPurchases,
      },
    }));
  };

  const handlePurchaseDateChange = (compositeId: number, date: Date | null) => {
    setTempPurchaseDates((prev) => ({
      ...prev,
      [compositeId]: date,
    }));
  };

  const handleSaveProgress = async () => {
    const levelUpdates: BulkLevelProgressUpdate[] = [];
    const purchaseUpdates: BulkPurchaseEventProgressUpdate[] = [];

    const purchaseKeys = new Set(Object.keys(tempProgress.purchases));
    Object.keys(tempPurchaseDates).forEach((k) => {
      const compId = parseInt(k);
      const peId = compId % 100000;
      const accId = Math.floor(compId / 100000);
      purchaseKeys.add(`${accId}_${peId}`);
    });

    // Cache branch levels to avoid redundant API calls across multiple accounts
    const branchLevelsCache = new Map<
      number,
      Awaited<ReturnType<typeof TauriService.getGameLevels>>
    >();
    const branchPurchaseEventsCache = new Map<
      number,
      Awaited<ReturnType<typeof TauriService.getGamePurchaseEvents>>
    >();

    for (const key of Array.from(purchaseKeys)) {
      const [accIdStr, peIdStr] = key.split("_");
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
          daysOffset = Math.round(
            (selectedDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
          );
        }
      } else {
        daysOffset = existing?.days_offset || 0;
      }

      // Calculate time_spent: average of same-day real levels + next real level.
      // Mirrors display table (peCols) and backend (get_daily_requests) logic.
      // Synthetic session levels (level_name="-") are excluded to prevent inflated averages.
      if (existing?.time_spent && !selectedDate) {
        // Preserve stored value when no date change is made
        calculatedTimeSpent = existing.time_spent;
      } else if (account.branch_id != null) {
        try {
          // Fetch from cache or API (same pattern as ensureSyntheticLevel)
          if (!branchLevelsCache.has(account.branch_id)) {
            const lvls = await TauriService.getGameLevels(account.branch_id);
            branchLevelsCache.set(account.branch_id, lvls);
          }
          const branchLevels = branchLevelsCache.get(account.branch_id)!;
          const realLevels = getRealTimelineLevels(
            branchLevels.map((l) => ({
              daysOffset: Number(l.days_offset),
              timeSpent: Number(l.time_spent || 0),
              levelName: l.level_name,
              token: (l.event_token || "").split("_day")[0],
              synthetic: l.level_name === "-",
            })),
          );

          const expandedLevels = expandTimelineWithSessionDays(realLevels);
          const sameDayLevels = expandedLevels.filter(
            (l) => l.daysOffset === daysOffset,
          );
          const nextLevel = expandedLevels.find(
            (l) => l.daysOffset > daysOffset,
          );
          const levelsToAverage = [...sameDayLevels];
          if (nextLevel) levelsToAverage.push(nextLevel);

          if (levelsToAverage.length > 0) {
            const totalTimeSpent = levelsToAverage.reduce(
              (sum, level) => sum + (level.timeSpent || 0),
              0,
            );
            calculatedTimeSpent = Math.round(
              totalTimeSpent / levelsToAverage.length,
            );
          } else {
            calculatedTimeSpent = existing?.time_spent || 243;
          }
        } catch {
          calculatedTimeSpent = existing?.time_spent || 243;
        }
      } else {
        calculatedTimeSpent = existing?.time_spent || 243;
      }

      // Always ensure a valid time_spent (generate randomly if still 0)
      if (calculatedTimeSpent <= 0) {
        calculatedTimeSpent = computeTaskDuration(1000);
      }

      if (existing) {
        purchaseUpdates.push({
          account_id: accId,
          purchase_event_id: peId,
          is_completed: isCompleted,
          days_offset: daysOffset,
          time_spent: calculatedTimeSpent,
          bypass_cooldown: true,
        });
      } else if (isCompleted || selectedDate) {
        purchaseUpdates.push({
          account_id: accId,
          purchase_event_id: peId,
          is_completed: isCompleted,
          days_offset: daysOffset,
          time_spent: calculatedTimeSpent,
          bypass_cooldown: true,
        });
      }
    }

    for (const key of Object.keys(tempProgress.levels)) {
      const parsedKey = parseProgressKey(key);
      if (!parsedKey) continue;

      const accId = parsedKey.accountId;
      const account = accounts.find((a) => a.id === accId);
      if (!account) continue;

      let lvlId: number | null = Number.parseInt(parsedKey.rawId, 10);
      if (!Number.isFinite(lvlId)) {
        lvlId = await ensureSyntheticLevel(account, parsedKey.rawId);
        if (lvlId && account.branch_id != null) {
          const freshLevels = await TauriService.getGameLevels(account.branch_id);
          branchLevelsCache.set(account.branch_id, freshLevels);
        }
      }

      if (!lvlId || !Number.isFinite(lvlId)) continue;
      const isCompleted = tempProgress.levels[key];
      const existing = levelsProgress[key];

      // Look up the level definition to get base time_spent
      let levelTimeSpentMs = 0;
      if (account.branch_id != null) {
        try {
          if (!branchLevelsCache.has(account.branch_id)) {
            const lvls = await TauriService.getGameLevels(account.branch_id);
            branchLevelsCache.set(account.branch_id, lvls);
          }
          const branchLevels = branchLevelsCache.get(account.branch_id)!;
          const levelDef = branchLevels.find((l) => l.id === lvlId);
          const baseSeconds = levelDef?.time_spent || 1000;
          levelTimeSpentMs = computeTaskDuration(baseSeconds);
        } catch {
          levelTimeSpentMs = computeTaskDuration(1000);
        }
      } else {
        levelTimeSpentMs = computeTaskDuration(1000);
      }

      if (existing) {
        if (existing.is_completed !== isCompleted) {
          levelUpdates.push({
            account_id: accId,
            level_id: lvlId,
            is_completed: isCompleted,
            time_spent: levelTimeSpentMs,
            bypass_cooldown: true,
          });
        }
      } else if (isCompleted) {
        levelUpdates.push({
          account_id: accId,
          level_id: lvlId,
          is_completed: true,
          time_spent: levelTimeSpentMs,
          bypass_cooldown: true,
        });
      }
    }

    if (levelUpdates.length > 0 || purchaseUpdates.length > 0) {
      await TauriService.saveBulkProgressUpdates({
        level_updates: levelUpdates,
        purchase_updates: purchaseUpdates,
      });

      // --- Save History for newly completed entries ---
      // Build a cache of game names
      const gameNameCache = new Map<number, string>();
      for (const account of accounts) {
        if (!gameNameCache.has(account.game_id)) {
          try {
            const game = await TauriService.getGameById(account.game_id);
            gameNameCache.set(account.game_id, game?.name || 'Unknown');
          } catch {
            gameNameCache.set(account.game_id, 'Unknown');
          }
        }
      }

      // --- History for level completions with session/event dedup ---
      // First pass: collect base tokens for event-type completions per account
      const accountBaseTokens = new Map<number, Set<string>>();
      for (const lu of levelUpdates) {
        if (!lu.is_completed) continue;
        const existingEntry = levelsProgress[`${lu.account_id}_${lu.level_id}`];
        if (existingEntry?.is_completed) continue;

        const account = accounts.find((a) => a.id === lu.account_id);
        if (!account) continue;

        let levelDef: { event_token?: string; level_name?: string } | undefined;
        if (account.branch_id != null && branchLevelsCache.has(account.branch_id)) {
          levelDef = branchLevelsCache.get(account.branch_id)!.find((l) => l.id === lu.level_id);
        }

        const isSession = (levelDef?.level_name || '') === '-';
        if (!isSession) {
          const baseToken = (levelDef?.event_token || '').split('_day')[0];
          if (baseToken) {
            if (!accountBaseTokens.has(lu.account_id)) {
              accountBaseTokens.set(lu.account_id, new Set());
            }
            accountBaseTokens.get(lu.account_id)!.add(baseToken);
          }
        }
      }

      // Second pass: save history, skipping sessions with matching events
      for (const lu of levelUpdates) {
        if (!lu.is_completed) continue;
        const existingEntry = levelsProgress[`${lu.account_id}_${lu.level_id}`];
        if (existingEntry?.is_completed) continue;

        const account = accounts.find((a) => a.id === lu.account_id);
        if (!account) continue;

        let levelDef: { event_token?: string; level_name?: string } | undefined;
        if (account.branch_id != null && branchLevelsCache.has(account.branch_id)) {
          levelDef = branchLevelsCache.get(account.branch_id)!.find((l) => l.id === lu.level_id);
        }

        const levelName = levelDef?.level_name || '';
        const isSession = levelName === '-';
        const eventToken = levelDef?.event_token || '';

        // Skip session history if a corresponding event with the same base token exists
        if (isSession) {
          const sessionBaseToken = eventToken.split('_day')[0];
          if (sessionBaseToken && accountBaseTokens.get(lu.account_id)?.has(sessionBaseToken)) {
            continue;
          }
        }

        try {
          await recordTaskCompletion({
            accountId: lu.account_id,
            accountName: account.name,
            gameId: account.game_id,
            gameName: gameNameCache.get(account.game_id) || 'Unknown',
            eventToken,
            durationMs: lu.time_spent || computeTaskDuration(1000),
            levelId: lu.level_id,
            levelName: levelName,
            requestType: isSession ? 'Session Only' : 'Level Event',
            isPurchase: false,
          });
        } catch (e) {
          console.error('[AccountsDetailPage] Failed to save level history:', e);
        }
      }

      // History for purchase completions
      for (const pu of purchaseUpdates) {
        if (!pu.is_completed) continue;
        const existingEntry = purchaseProgress[`${pu.account_id}_${pu.purchase_event_id}`];
        // Only record history for NEW completions
        if (existingEntry?.is_completed) continue;

        const account = accounts.find((a) => a.id === pu.account_id);
        if (!account) continue;

        let purchaseEventToken = '';
        if (account.branch_id != null) {
          try {
            if (!branchPurchaseEventsCache.has(account.branch_id)) {
              const pes = await TauriService.getGamePurchaseEvents(account.branch_id);
              branchPurchaseEventsCache.set(account.branch_id, pes);
            }
            const peDef = branchPurchaseEventsCache.get(account.branch_id)!.find(
              (pe) => pe.id === pu.purchase_event_id,
            );
            purchaseEventToken = peDef?.event_token || '';
          } catch { /* ignore */ }
        }

        try {
          await recordTaskCompletion({
            accountId: pu.account_id,
            accountName: account.name,
            gameId: account.game_id,
            gameName: gameNameCache.get(account.game_id) || 'Unknown',
            eventToken: purchaseEventToken,
            durationMs: pu.time_spent || computeTaskDuration(1000),
            requestType: 'Purchase Event',
            isPurchase: true,
          });
        } catch (e) {
          console.error('[AccountsDetailPage] Failed to save purchase history:', e);
        }
      }
    }

    setIsEditMode(false);
    setRangeFillMode(false);
    window.dispatchEvent(
      new CustomEvent("progress-updated", {
        detail: { accountId: accounts.map((a) => a.id) },
      }),
    );
    window.dispatchEvent(new CustomEvent("daily-task-completed"));
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
        <DropdownMenuItem
          onClick={() => {
            setExportType("all");
            setShowExportDialog(true);
          }}
        >
          {t("export.allGames")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setExportType("game");
            setSelectedBranchId(undefined);
            setShowExportDialog(true);
          }}
        >
          {t("export.thisGame")} ({currentGameName})
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">
          <FileText className="h-3.5 w-3.5 inline mr-1.5" />
          {t("export.requestTemplates")}
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handleExportTemplates()}>
          {t("export.allGames")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => selectedGameId && handleExportTemplates(selectedGameId)}
          disabled={!selectedGameId}
        >
          {t("export.thisGame")} ({currentGameName})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const rangeFillButton = (
    <Button
      type="button"
      variant={rangeFillMode ? "default" : "outline"}
      size="sm"
      onClick={() => setRangeFillMode((prev) => !prev)}
      className={`h-9 shrink-0 transition-all ${
        rangeFillMode
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
          : "text-muted-foreground hover:text-foreground"
      }`}
      title={t("accounts.rangeFillHint")}
    >
      <Edit3 className="h-4 w-4 mr-1" />
      <span className="hidden xs:inline">
        {rangeFillMode ? t("accounts.rangeFillOn") : t("accounts.rangeFillOff")}
      </span>
    </Button>
  );

  const mobilePopoverExtra = isEditMode ? (
    <div className="space-y-2 pt-2 border-t">
      <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">
        {t("common.edit")}
      </p>
      {rangeFillButton}
      <p className="text-[11px] text-muted-foreground px-1">
        {t("accounts.rangeFillHint")}
      </p>
    </div>
  ) : undefined;

  return (
    <div className="flex-1 flex flex-col h-full bg-background/50">
      <PageHeader title={t("nav.accountsDetail")}>
        <ActionToolbar
          mode={mode}
          onModeChange={setMode}
          isEditMode={isEditMode}
          onEditToggle={handleEditToggle}
          onSave={handleSaveProgress}
          onCancel={() => {
            setRangeFillMode(false);
            setIsEditMode(false);
          }}
          onImport={() => setShowImportDialog(true)}
          onExport={() => {}}
          exportDropdown={exportDropdown}
          editModeExtra={rangeFillButton}
          mobilePopoverExtra={mobilePopoverExtra}
        />
      </PageHeader>

      <div className="flex-1 space-y-12 pb-24">
        {branches.length === 0 ? (
          <Card className="border-dashed border-2 shadow-none">
            <CardContent className="flex items-center justify-center p-12 text-muted-foreground">
              <div className="text-center space-y-2">
                <div className="bg-muted w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="h-6 w-6 opacity-20" />
                </div>
                <p className="font-medium">
                  {t("branches.noBranches", "No branches found for this game.")}
                </p>
                <p className="text-xs">
                  {t(
                    "branches.pleaseAddBranch",
                    "Please select a game or add a branch to see progress tables.",
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          branches.map((branch) => (
            <BranchSection
              key={branch.id}
              branch={branch}
              accounts={accounts.filter((a) => a.branch_id === branch.id)}
              levelsProgress={levelsProgress}
              purchaseProgress={purchaseProgress}
              isEditMode={isEditMode}
              tempProgress={tempProgress}
              onProgressChange={handleProgressChange}
              tempPurchaseDates={tempPurchaseDates}
              onPurchaseDateChange={handlePurchaseDateChange}
              mode={mode}
              t={t}
              onExport={() => {
                setSelectedBranchId(branch.id);
                setExportType("game");
                setShowExportDialog(true);
              }}
              rangeFillMode={rangeFillMode}
              selectedGameId={selectedGameId}
              deleteAccount={deleteAccount}
              refreshAccounts={refreshAccounts}
              branches={branches}
            />
          ))
        )}
      </div>

      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        gameId={selectedGameId}
      />
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        gameId={selectedGameId}
        branchId={selectedBranchId}
        exportType={exportType}
        colorSettings={colors}
        theme={theme}
        source="accounts-detail"
        mode={mode}
        levelsProgress={levelsProgress}
        purchaseProgress={purchaseProgress}
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
  tempProgress: {
    levels: Record<string, boolean>;
    purchases: Record<string, boolean>;
  };
  onProgressChange: (
    type: "level" | "purchase",
    id: number | string,
    completed: boolean,
    options?: { rangeFromStart?: boolean; rangeId?: number | string },
    context?: {
      columns: ColumnData[];
      rangeFillMode?: boolean;
      hiddenSessionLevelIds?: number[];
    },
  ) => void;
  tempPurchaseDates: Record<number, Date | null>;
  onPurchaseDateChange: (compositeId: number, date: Date | null) => void;
  mode: Mode;
  t: TFunction;
  onExport: () => void;
  rangeFillMode: boolean;
  selectedGameId?: number;
  deleteAccount: (id: number) => Promise<boolean>;
  refreshAccounts: () => Promise<void>;
  branches: GameBranch[];
}

function BranchSection({
  branch,
  accounts,
  levelsProgress,
  purchaseProgress,
  isEditMode,
  tempProgress,
  onProgressChange,
  tempPurchaseDates,
  onPurchaseDateChange,
  mode,
  t,
  onExport,
  rangeFillMode,
  selectedGameId,
  deleteAccount,
  refreshAccounts,
  branches,
}: BranchSectionProps) {
  const navigate = useNavigate();
  const { levels = [] } = useLevels(branch.id);
  const { events: purchaseEvents = [] } = usePurchaseEvents(branch.id);

  const handleAccountClick = (account: Account) => {
    navigate(`/accounts/${account.id}`, { state: { account, selectedGameId } });
  };

  const handleAccountEdit = (account: Account) => {
    navigate(`/accounts/edit/${account.id}`, {
      state: { account, selectedGameId },
    });
  };

  const [transferTarget, setTransferTarget] = useState<Account | null>(null);
  const [showBulkTransfer, setShowBulkTransfer] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);

  const handleAccountTransfer = (account: Account) => {
    setTransferTarget(account);
  };

  const confirmDeleteAccount = (account: Account) => {
    setDeletingAccount(account);
    setShowDeleteDialog(true);
  };

  const doDeleteAccount = async () => {
    if (!deletingAccount) return;
    await deleteAccount(deletingAccount.id);
    setShowDeleteDialog(false);
    setDeletingAccount(null);
  };

  const columns = useMemo(() => {
    const buildSessionKey = (token: string, day: number) => `${token}::${day}`;
    const levelCols = levels.map((l) => ({
      kind: "level" as const,
      id: l.id,
      token: (l.event_token || "").split("_day")[0],
      name: l.level_name,
      daysOffset: l.days_offset,
      timeSpent: l.time_spent,
      isBonus: l.is_bonus,
      synthetic: l.level_name === "-",
    }));

    const peCols = purchaseEvents.map((p: PurchaseEvent) => {
      const day = p.days_offset;
      let midpointTime: number | null = null;
      if (day != null) {
        const realLevels = getRealTimelineLevels(
          levelCols.map((l) => ({
            daysOffset: Number(l.daysOffset),
            timeSpent: Number(l.timeSpent || 0),
            levelName: l.name,
            token: l.token,
            synthetic: l.synthetic,
          })),
        );
        if (realLevels.length > 0) {
          const expandedLevels = expandTimelineWithSessionDays(realLevels);
          const sameDayLevels = expandedLevels.filter(
            (l) => l.daysOffset === day,
          );
          const nextLevel = expandedLevels.find((l) => l.daysOffset > day);
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
      }
      return {
        kind: "purchase" as const,
        id: p.id,
        token: p.event_token,
        name: p.level_name || "$$$",
        isRestricted: p.is_restricted ?? false,
        daysOffset: day != null ? day : null,
        timeSpent: midpointTime,
        maxDaysOffset:
          p.max_days_offset != null
            ? `${t("purchaseEvents.lessThan")} ${p.max_days_offset}`
            : "-",
      };
    });

    const numericLevels = levelCols.filter(
      (c) => typeof c.daysOffset === "number",
    ) as Extract<ColumnData, { kind: "level" }>[];

    const sessionByDay = new Map<
      number,
      Extract<ColumnData, { kind: "level" }>
    >();
    const sessionByKey = new Map<
      string,
      Extract<ColumnData, { kind: "level" }>
    >();
    numericLevels
      .filter((l) => l.name === "-")
      .forEach((l) => {
        const d = Number(l.daysOffset);
        if (!sessionByDay.has(d)) sessionByDay.set(d, l);
        sessionByKey.set(buildSessionKey(l.token, d), l);
      });

    const realLevelsByDay = new Map<
      number,
      Extract<ColumnData, { kind: "level" }>[]
    >();
    numericLevels
      .filter((l) => l.name !== "-")
      .forEach((l) => {
        const d = Number(l.daysOffset);
        const list = realLevelsByDay.get(d) ?? [];
        list.push(l);
        realLevelsByDay.set(d, list);
      });

    const getSessionForKey = (token: string, day: number) => {
      const existing = sessionByKey.get(buildSessionKey(token, day));
      if (existing) return existing;
      const sharedRealLevels = getRealTimelineLevels(
        numericLevels
          .filter((l) => l.name !== "-")
          .map((l) => ({
            daysOffset: Number(l.daysOffset),
            timeSpent: Number(l.timeSpent || 0),
            levelName: l.name,
            token: l.token,
            synthetic: l.synthetic,
          })),
      );

      const synthesizedTime = getSyntheticSessionTimeSpent(
        token,
        day,
        sharedRealLevels,
        0,
      );

      return {
        kind: "level" as const,
        id: `synth-${token}-${day}`,
        token,
        name: "-",
        daysOffset: day,
        timeSpent: synthesizedTime,
        isBonus: false,
        synthetic: true,
      } as Extract<ColumnData, { kind: "level" }>;
    };

    const getStandaloneSessionForDay = (day: number) => {
      const existing = sessionByDay.get(day);
      if (existing) return existing;
      const fallbackLevel = numericLevels.find(
        (l) => l.name !== "-" && Number(l.daysOffset) >= day,
      );
      return fallbackLevel ? getSessionForKey(fallbackLevel.token, day) : null;
    };

    const makeSplit = (
      day: number,
      session: Extract<ColumnData, { kind: "level" }>,
      event: Extract<ColumnData, { kind: "level" | "purchase" }>,
    ): ColumnData => ({
      kind: "split",
      id: `split-${day}-${event.kind}-${String(event.id)}`,
      token: event.token ?? session.token,
      name: event.name ?? session.name,
      daysOffset: session.daysOffset,
      timeSpent: session.timeSpent,
      isBonus: session.isBonus,
      synthetic: session.synthetic,
      isRestricted: event.isRestricted,
      maxDaysOffset: event.maxDaysOffset,
      session,
      event,
    });

    const timelineColumns: ColumnData[] = [];

    if (mode === "all") {
      const levelDays = numericLevels
        .filter((l) => l.name !== "-")
        .sort((a, b) => Number(a.daysOffset) - Number(b.daysOffset));

      const minDay =
        levelDays.length > 0 ? Math.min(0, Number(levelDays[0].daysOffset)) : 0;
      const maxDay =
        levelDays.length > 0
          ? Number(levelDays[levelDays.length - 1].daysOffset)
          : 0;

      for (let day = minDay; day <= maxDay; day++) {
        const dayLevels = realLevelsByDay.get(day) ?? [];

        if (dayLevels.length > 0) {
          dayLevels.forEach((l) => {
            const session = getSessionForKey(l.token, day);
            timelineColumns.push(makeSplit(day, session, l));
          });
        } else {
          const session = getStandaloneSessionForDay(day);
          if (session) timelineColumns.push(session);
        }
      }
    } else {
      const levelEvents = levelCols.filter(
        (c) => c.kind === "level" && c.name !== "-",
      ) as Extract<ColumnData, { kind: "level" }>[];
      levelEvents.forEach((l) => {
        if (typeof l.daysOffset === "number") {
          const day = Number(l.daysOffset);
          const session = getSessionForKey(l.token, day);
          timelineColumns.push(makeSplit(day, session, l));
          return;
        }
        timelineColumns.push(l);
      });
    }

    const purchaseColumnsAtEnd: ColumnData[] = [];
    peCols.forEach((p) => {
      if (typeof p.daysOffset === "number") {
        const day = Number(p.daysOffset);
        const session = getSessionForKey(p.token, day);
        purchaseColumnsAtEnd.push(makeSplit(day, session, p));
        return;
      }
      purchaseColumnsAtEnd.push(p);
    });

    const nonNumericLevels = levelCols.filter(
      (c) => typeof c.daysOffset !== "number",
    ) as ColumnData[];
    const nonNumericLevelSet = new Set(nonNumericLevels.map((l) => l.id));
    const timelineWithoutNonNumericDupes = timelineColumns.filter(
      (c) => !(c.kind === "level" && nonNumericLevelSet.has(c.id)),
    );

    return [
      ...timelineWithoutNonNumericDupes,
      ...nonNumericLevels,
      ...purchaseColumnsAtEnd,
    ];
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
        if (!start) return "-";

        if (c.kind === "split") {
          const sessionDate = formatDateShort(
            addDays(start, Number(c.session.daysOffset || 0)),
          );
          if (!c.event) return sessionDate;

          if (c.event.kind === "purchase") {
            const key = `${acc.id}_${c.event.id}`;
            const progress = purchaseProgress[key];
            const eventDate = progress
              ? formatDateShort(addDays(start, progress.days_offset))
              : c.event.daysOffset != null
                ? formatDateShort(addDays(start, Number(c.event.daysOffset)))
                : "-";
            return { session: sessionDate, event: eventDate } as TimelineCell;
          }

          const eventDate = formatDateShort(
            addDays(start, Number(c.event.daysOffset || 0)),
          );
          return { session: sessionDate, event: eventDate } as TimelineCell;
        }

        if (c.kind === "level")
          return formatDateShort(addDays(start, Number(c.daysOffset || 0)));

        const key = `${acc.id}_${c.id}`;
        const progress = purchaseProgress[key];
        if (progress)
          return formatDateShort(addDays(start, progress.days_offset));
        if (c.daysOffset != null)
          return formatDateShort(addDays(start, Number(c.daysOffset)));
        return "-";
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
          <Badge
            variant="secondary"
            className="font-mono text-[10px] px-2 py-0"
          >
            {accounts.length} {t("common.accounts")}
          </Badge>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onExport}
          className="h-8 px-2 text-muted-foreground hover:text-primary"
        >
          <Download className="h-4 w-4 mr-1" /> {t("common.export", "Export")}
        </Button>
        {branches.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowBulkTransfer(true)}
            className="h-8 px-2 text-muted-foreground hover:text-primary"
          >
            <GitBranch className="h-4 w-4 mr-1" /> {t("accounts.bulkTransfer.title")}
          </Button>
        )}
      </div>
      <Card className="overflow-hidden border-border/50 shadow-2xl shadow-black/5 bg-background/40 backdrop-blur-sm rounded-t-none">
        <CardContent className="p-0 overflow-auto max-h-[600px] custom-scrollbar">
          <AccountsDataTable
            accounts={sortedAccounts}
            columns={columns}
            matrix={matrix}
            levelsProgress={levelsProgress}
            purchaseProgress={purchaseProgress}
            isEditMode={isEditMode}
            tempProgress={tempProgress}
            onProgressChange={(type, id, completed, options) =>
              onProgressChange(type, id, completed, options, {
                columns,
                rangeFillMode,
                hiddenSessionLevelIds: levels
                  .filter(
                    (l) =>
                      l.level_name === "-" &&
                      Number.isFinite(Number(l.days_offset)),
                  )
                  .map((l) => l.id),
              })
            }
            tempPurchaseDates={tempPurchaseDates}
            onPurchaseDateChange={onPurchaseDateChange}
            onAccountClick={handleAccountClick}
            onAccountEdit={handleAccountEdit}
            onAccountTransfer={handleAccountTransfer}
            onAccountDelete={confirmDeleteAccount}
            onAddAccount={() => navigate(`/accounts/new?gameId=${selectedGameId}&branchId=${branch.id}`)}
          />
        </CardContent>
      </Card>

      {transferTarget && (
        <BranchTransferDialog
          open={!!transferTarget}
          onOpenChange={(open) => { if (!open) setTransferTarget(null); }}
          accountId={transferTarget.id}
          accountName={transferTarget.name}
          currentBranchId={transferTarget.branch_id ?? null}
          currentBranchName={transferTarget.branch_name ?? null}
          gameId={transferTarget.game_id}
          onTransferComplete={() => {
            setTransferTarget(null);
            refreshAccounts();
          }}
          onCancel={() => setTransferTarget(null)}
        />
      )}

      <BranchBulkTransferDialog
        open={showBulkTransfer}
        onOpenChange={setShowBulkTransfer}
        accounts={accounts}
        branches={branches}
        onTransferComplete={() => {
          setShowBulkTransfer(false);
          refreshAccounts();
        }}
        onCancel={() => setShowBulkTransfer(false)}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('accounts.deleteAccount')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('accounts.deleteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDeleteDialog(false); setDeletingAccount(null); }}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
