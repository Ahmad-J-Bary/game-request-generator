// src/pages/accounts/AccountDetailPage.tsx

import { useMemo, useState, useEffect } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@grq/ui/atoms/card";
import { Badge } from "@grq/ui/atoms/badge";
import { cn } from "@grq/ui/lib/utils";
import {
  Download,
  Upload,
  Edit3,
  Save,
  X,
  CheckSquare,
  ArrowLeft,
  ArrowRight,
  MoreVertical,
  User,
  GitBranch,
} from "lucide-react";
import type {
  TimelineColumnData as ColumnData,
  ColumnData as ExportColumnData,
} from "@grq/ui/organisms/tables/AccountDataTable";
import { BackButton } from "@grq/ui/molecules/BackButton";
import { ImportDialog } from "@grq/ui/molecules/ImportDialog";
import { ExportDialog } from "@grq/ui/molecules/ExportDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@grq/ui/atoms/popover";
import { Label } from "@grq/ui/atoms/label";
import { Button } from "@grq/ui/atoms/button";
import { BranchTransferDialog } from "@grq/ui/organisms/BranchTransferDialog";
import { Level, Account } from "@grq/api-bindings";
import { useAccounts } from "@grq/core/hooks/useAccounts";
import { useLevels } from "@grq/core/hooks/useLevels";
import { usePurchaseEvents } from "@grq/core/hooks/usePurchaseEvents";
import { useProgress } from "@grq/core/hooks/useProgress";
import { TauriService } from "@grq/core/services/tauri.service";
import { recordTaskCompletion, generateRandomTimeSpentMs } from "@grq/core/utils/taskCompletion";
import { useSettings } from "@grq/ui/contexts/SettingsContext";
import { useTheme } from "@grq/ui/contexts/ThemeContext";
import { AccountDataTable } from "@grq/ui/organisms/tables/AccountDataTable";
import type { TimelineCell } from "@grq/ui/organisms/tables/AccountDataTable";
import {
  getRealTimelineLevels,
  getSyntheticSessionTimeSpent,
  expandTimelineWithSessionDays,
} from "@grq/core/utils/timeline-time.utils";

type Mode = "all" | "event-only";

function parseDateFlexible(input: string): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (!Number.isNaN(d.getTime())) return d;
  const m = input.trim().match(/^(\d{1,2})-([A-Za-z]{3,})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const monStr = m[2].toLowerCase();
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const monthIndex = months.indexOf(monStr);
    if (monthIndex >= 0) {
      const now = new Date();
      const year = now.getFullYear();
      return new Date(year, monthIndex, day);
    }
  }
  const parts = input.split("/");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function formatDateShort(date: Date | null): string {
  if (!date) return "-";
  const day = date.getDate();
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
  const mon = months[date.getMonth()];
  return `${day}-${mon}`;
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

export default function AccountDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { colors } = useSettings();
  const { theme } = useTheme();

  const state =
    (location.state as {
      account?: Account;
      levels?: Level[];
      selectedGameId?: number;
    }) || {};
  const stateAccount: Account | undefined = state.account;
  const selectedGameId = state.selectedGameId;

  const [fetchedAccount, setFetchedAccount] = useState<Account | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [gameName, setGameName] = useState('');

  useEffect(() => {
    if (!stateAccount && id) {
      TauriService.getAccountById(parseInt(id, 10))
        .then(setFetchedAccount)
        .catch(console.error);
    }
  }, [id, stateAccount, refreshKey]);

  useEffect(() => {
    const handler = () => {
      if (id) {
        TauriService.getAccountById(parseInt(id, 10))
          .then(setFetchedAccount)
          .catch(console.error);
        setRefreshKey(k => k + 1);
      }
    };
    window.addEventListener('data-changed', handler);
    return () => window.removeEventListener('data-changed', handler);
  }, [id]);

  const account = stateAccount ?? fetchedAccount;
  const branchId = account?.branch_id ?? undefined;

  useEffect(() => {
    if (account?.game_id) {
      TauriService.getGameById(account.game_id).then(g => {
        if (g?.name) setGameName(g.name);
      }).catch(console.error);
    }
  }, [account?.game_id]);

  const { accounts } = useAccounts(account?.game_id);

  const { levels: fetchedLevels = [] } = useLevels(branchId);
  const { events: purchaseEvents = [] } = usePurchaseEvents(branchId);

  const { prevAccount, nextAccount } = useMemo(() => {
    if (!account || !accounts) return { prevAccount: null, nextAccount: null };

    const gameAccounts = accounts.filter((a) => a.game_id === account.game_id);
    const sortedAccounts = [...gameAccounts].sort((a, b) => {
      try {
        const dateA = new Date(`${a.start_date}T${a.start_time}`);
        const dateB = new Date(`${b.start_date}T${b.start_time}`);
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          if (a.start_date !== b.start_date)
            return a.start_date.localeCompare(b.start_date);
          return a.start_time.localeCompare(b.start_time);
        }
        return dateA.getTime() - dateB.getTime();
      } catch (e) {
        return 0;
      }
    });

    const currentIndex = sortedAccounts.findIndex((a) => a.id === account.id);
    if (currentIndex === -1) return { prevAccount: null, nextAccount: null };

    return {
      prevAccount: currentIndex > 0 ? sortedAccounts[currentIndex - 1] : null,
      nextAccount:
        currentIndex < sortedAccounts.length - 1
          ? sortedAccounts[currentIndex + 1]
          : null,
    };
  }, [account, accounts]);

  const accountId = parseInt(id || "0", 10);
  const { levelsProgress, purchaseProgress } = useProgress(accountId);

  // Use fetched levels directly to ensure branch isolation.
  const levels = fetchedLevels;

  const [mode, setMode] = useState<Mode>("event-only");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showBranchTransferDialog, setShowBranchTransferDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [rangeFillMode, setRangeFillMode] = useState(false);
  const [completeAllChecked, setCompleteAllChecked] = useState(false);
  const [tempProgress, setTempProgress] = useState<{
    levels: { [key: number | string]: boolean };
    purchases: { [key: number]: boolean };
  }>({
    levels: {},
    purchases: {},
  });
  const [tempPurchaseDates, setTempPurchaseDates] = useState<{
    [key: number]: Date | null;
  }>({});

  const handleEditToggle = () => {
    if (!isEditMode) {
      const levelProg: { [key: number | string]: boolean } = {};
      const purchaseProg: { [key: number]: boolean } = {};

      levelsProgress.forEach((p) => {
        levelProg[p.level_id] = p.is_completed;
      });

      purchaseProgress.forEach((p) => {
        purchaseProg[p.purchase_event_id] = p.is_completed;
      });
      setTempProgress({
        levels: levelProg,
        purchases: purchaseProg,
      });
    }
    if (isEditMode) {
      setRangeFillMode(false);
      setCompleteAllChecked(false);
    }
    setIsEditMode(!isEditMode);
  };

  const handleProgressChange = (
    type: "level" | "purchase",
    id: number | string,
    completed: boolean,
    options?: { rangeFromStart?: boolean; rangeId?: number | string },
  ) => {
    // Normal single-toggle behavior
    if (!options?.rangeFromStart) {
      setTempProgress((prev) => ({
        ...prev,
        [type === "level" ? "levels" : "purchases"]: {
          ...prev[type === "level" ? "levels" : "purchases"],
          [id]: completed,
        },
      }));
      return;
    }

    // Range-from-start behavior:
    // mark all previous columns (from start up to clicked cell) as same completed state
    const targetId = options?.rangeId ?? id;
    const targetIdx = columns.findIndex((col) => {
      if (col.kind === "split") {
        return col.session.id === targetId || col.event?.id === targetId;
      }
      return col.id === targetId;
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

    const newLevels: { [key: number | string]: boolean } = {};
    const newPurchases: { [key: number]: boolean } = {};

    // First, apply visible timeline range
    for (let i = 0; i <= targetIdx; i++) {
      const col = columns[i];

      if (col.kind === "split") {
        newLevels[col.session.id] = completed;
        if (col.event) {
          if (col.event.kind === "level") {
            newLevels[col.event.id] = completed;
          } else {
            newPurchases[col.event.id as number] = completed;
          }
        }
        continue;
      }

      if (col.kind === "level") {
        newLevels[col.id] = completed;
      } else {
        newPurchases[col.id as number] = completed;
      }
    }

    // Then, include hidden session-only levels up to the same day
    // so range fill also affects "session only" requests not currently visible.
    const targetDayFromColumn = (() => {
      const c = columns[targetIdx];
      if (c.kind === "split") return Number(c.session.daysOffset ?? 0);
      return Number(c.daysOffset ?? 0);
    })();

    if (Number.isFinite(targetDayFromColumn)) {
      levels
        .filter(
          (l) =>
            l.level_name === "-" &&
            Number.isFinite(Number(l.days_offset)) &&
            Number(l.days_offset) <= targetDayFromColumn,
        )
        .forEach((lvl) => {
          newLevels[lvl.id] = completed;
        });
    }

    // Preserve values outside selected range
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

  const handlePurchaseDateChange = (purchaseId: number, date: Date | null) => {
    setTempPurchaseDates((prev) => ({ ...prev, [purchaseId]: date }));
  };

  const handleCompleteAllChange = (checked: boolean) => {
    setCompleteAllChecked(checked);
    if (checked) {
      const newTempProgress = {
        levels: {} as { [key: number | string]: boolean },
        purchases: {} as { [key: number]: boolean },
      };

      // Ensure "session-only" columns are also completed
      // (session levels '-' that can be hidden from the current columns mode)
      const sessionOnlyLevels = levels.filter((l) => l.level_name === "-");
      sessionOnlyLevels.forEach((lvl) => {
        newTempProgress.levels[lvl.id] = true;
      });

      columns.forEach((col) => {
        if (col.kind === "split") {
          newTempProgress.levels[col.session.id] = true;
          if (col.event) {
            if (col.event.kind === "level")
              newTempProgress.levels[col.event.id] = true;
            else newTempProgress.purchases[col.event.id as number] = true;
          }
          return;
        }

        if (col.kind === "level") newTempProgress.levels[col.id] = true;
        else if (col.kind === "purchase")
          newTempProgress.purchases[col.id as number] = true;
      });
      setTempProgress(newTempProgress);
    } else {
      setTempProgress({ levels: {}, purchases: {} });
    }
  };

  const handleSaveProgress = async () => {

    // Phase 1: Update progress only (errors caught individually)
    try {
      // Separate session levels from event levels; process sessions first so
      // events overwrite them in history (one-row-per-account via INSERT OR REPLACE)
      const sessionLevelEntries: [string, boolean][] = [];
      const eventLevelEntries: [string, boolean][] = [];

      for (const [levelId, isCompleted] of Object.entries(tempProgress.levels)) {
        const numericId = parseInt(levelId, 10);
        const lDef = isNaN(numericId) ? undefined : levels.find(l => l.id === numericId);
        const isSession = levelId.startsWith('synth-') || lDef?.level_name === '-';
        if (isSession) sessionLevelEntries.push([levelId, isCompleted]);
        else eventLevelEntries.push([levelId, isCompleted]);
      }

      for (const [levelId, isCompleted] of [...sessionLevelEntries, ...eventLevelEntries]) {
        let actualLevelId = levelId;
        let syntheticMeta: { token: string; day: number } | null = null;
        if (levelId.startsWith("synth-")) {
          const syntheticLevel =
            columns.find((col) => col.kind === "level" && col.id === levelId) ||
            columns
              .filter(
                (
                  col,
                ): col is Extract<
                  (typeof columns)[number],
                  { kind: "split" }
                > => col.kind === "split",
              )
              .map((col) => col.session)
              .find((session) => session.id === levelId);

          if (syntheticLevel) {
            syntheticMeta = parseSyntheticLevelId(levelId);
            if (!syntheticMeta) continue;

            const newLevel = {
              branch_id: account!.branch_id!,
              level_name: syntheticLevel.name,
              event_token: `${syntheticMeta.token}_day${syntheticMeta.day}`,
              days_offset: syntheticMeta.day,
              time_spent: syntheticLevel.timeSpent || 0,
              is_bonus:
                syntheticLevel.kind === "level"
                  ? syntheticLevel.isBonus
                  : false,
            };
            const existingLevels = await TauriService.getGameLevels(
              account!.branch_id!,
            );
            const existingLevel = existingLevels.find(
              (l) =>
                l.days_offset === newLevel.days_offset &&
                (l.level_name !== "-" ||
                  l.event_token === newLevel.event_token),
            );
            if (existingLevel) actualLevelId = existingLevel.id.toString();
            else {
              const createdLevelId = await TauriService.addLevel({
                ...newLevel,
                game_id: account!.game_id,
              });
              actualLevelId = createdLevelId.toString();
            }
          } else continue;
        }

        const levelIdNum = parseInt(actualLevelId, 10);
        const existingProgress = levelsProgress.find(
          (p) => p.level_id === levelIdNum,
        );
        let levelDef = levels.find((l) => l.id === levelIdNum);
        if (!levelDef && syntheticMeta) {
          levelDef = {
            id: levelIdNum,
            game_id: account!.game_id,
            branch_id: account!.branch_id,
            event_token: `${syntheticMeta.token}_day${syntheticMeta.day}`,
            level_name: "-",
            days_offset: syntheticMeta.day,
            time_spent: 1000,
            is_bonus: false,
          };
        }

        // Update progress (individual try/catch so failures don't block history)
        try {
          // Always generate time_spent so Dur.(ms) is never missing in History
          const baseSecondsForLevel = levelDef?.time_spent || 1000;
          const levelTimeSpentMs = generateRandomTimeSpentMs(baseSecondsForLevel);

          if (existingProgress) {
            await TauriService.updateLevelProgress({
              account_id: accountId,
              level_id: levelIdNum,
              is_completed: isCompleted,
              time_spent: levelTimeSpentMs,
              bypass_cooldown: true,
            });
          } else {
            await TauriService.createLevelProgress({
              account_id: accountId,
              level_id: levelIdNum,
            });
            if (isCompleted)
              await TauriService.updateLevelProgress({
                account_id: accountId,
                level_id: levelIdNum,
                is_completed: true,
                time_spent: levelTimeSpentMs,
                bypass_cooldown: true,
              });
          }
          // Save history for new completions only
          if (isCompleted && existingProgress?.is_completed !== true) {
            // Compute fallback eventToken for synthetic levels when levelDef is missing
            const computedEventToken =
              levelDef?.event_token ||
              (syntheticMeta ? `${syntheticMeta.token}_day${syntheticMeta.day}` : '');
            const isSession = levelDef?.level_name === '-' || levelId.startsWith('synth-');

            // For session levels: skip history if a corresponding event level at the same
            // day with the same base token is also being completed (only one row per event)
            if (isSession) {
              const sessionDay = levelDef?.days_offset ?? syntheticMeta?.day;
              const sessionBaseToken = syntheticMeta?.token || computedEventToken.split('_day')[0];
              const hasCorrespondingEvent = eventLevelEntries.some(([eId]) => {
                const eNum = parseInt(eId, 10);
                const eDef = levels.find(l => l.id === eNum);
                return eDef && tempProgress.levels[eId] &&
                  eDef.event_token.split('_day')[0] === sessionBaseToken &&
                  eDef.days_offset === sessionDay;
              });
              if (hasCorrespondingEvent) continue; // Event will save history — skip session
            }

            await recordTaskCompletion({
              accountId,
              accountName: account!.name,
              gameId: account!.game_id,
              gameName: gameName || 'Unknown',
              eventToken: computedEventToken,
              durationMs: levelTimeSpentMs,
              levelId: levelIdNum,
              levelName: levelDef?.level_name,
              requestType: isSession ? 'Session Only' : 'Level Event',
              isPurchase: false,
            });
          }
        } catch (e) {
          console.error("Failed to update level progress:", e);
        }
      }

      const purchaseKeys = new Set(Object.keys(tempProgress.purchases));
      Object.keys(tempPurchaseDates).forEach((k) => purchaseKeys.add(k));

      for (const purchaseIdStr of Array.from(purchaseKeys)) {
        const purchaseIdNum = parseInt(purchaseIdStr, 10);
        const isCompleted = tempProgress.purchases[purchaseIdNum] ?? false;
        const selectedDate = tempPurchaseDates[purchaseIdNum];

        const eventDef = purchaseEvents.find((e) => e.id === purchaseIdNum);
        let daysOffset =
          typeof eventDef?.days_offset === "number"
            ? eventDef.days_offset
            : eventDef?.max_days_offset || 0;
        let calculatedTimeSpent = 0;

        if (selectedDate) {
          const startDateObj =
            parseDateFlexible(account?.start_date ?? "") || new Date();
          daysOffset = Math.round(
            (selectedDate.getTime() - startDateObj.getTime()) /
              (1000 * 60 * 60 * 24),
          );

          const realLevels = getRealTimelineLevels(
            levels.map((l) => ({
              daysOffset: Number(l.days_offset),
              timeSpent: Number(l.time_spent || 0),
              levelName: l.level_name,
              token: (l.event_token || "").split("_day")[0],
              synthetic: l.level_name === "-",
            })),
          );

          const expandedLevels = expandTimelineWithSessionDays(realLevels);

          if (expandedLevels.length > 0) {
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
            }
          }
        } else {
          // No date selected — use existing stored time_spent if available
          const existingPurchaseProgForTime = purchaseProgress.find(
            (p) => p.purchase_event_id === purchaseIdNum,
          );
          calculatedTimeSpent = existingPurchaseProgForTime?.time_spent || 0;
        }

        // Always ensure a valid time_spent value (generate randomly if still 0)
        if (calculatedTimeSpent <= 0) {
          calculatedTimeSpent = generateRandomTimeSpentMs(1000);
        }

        const existingPurchaseProg = purchaseProgress.find(
          (p) => p.purchase_event_id === purchaseIdNum,
        );

        // Update progress (individual try/catch)
        try {
          if (existingPurchaseProg) {
            await TauriService.updatePurchaseEventProgress({
              account_id: accountId,
              purchase_event_id: purchaseIdNum,
              is_completed: isCompleted,
              days_offset: daysOffset,
              time_spent: calculatedTimeSpent,
              bypass_cooldown: true,
            });
          } else {
            await TauriService.createPurchaseEventProgress({
              account_id: accountId,
              purchase_event_id: purchaseIdNum,
              days_offset: daysOffset,
              time_spent: calculatedTimeSpent,
            });
            if (isCompleted)
              await TauriService.updatePurchaseEventProgress({
                account_id: accountId,
                purchase_event_id: purchaseIdNum,
                is_completed: true,
                days_offset: daysOffset,
                time_spent: calculatedTimeSpent,
                bypass_cooldown: true,
              });
          }
          // Save history for new completions only
          if (isCompleted && existingPurchaseProg?.is_completed !== true) {
            await recordTaskCompletion({
              accountId,
              accountName: account!.name,
              gameId: account!.game_id,
              gameName: gameName || 'Unknown',
              eventToken: eventDef?.event_token || '',
              durationMs: calculatedTimeSpent,
              requestType: 'Purchase Event',
              isPurchase: true,
            });
          }
        } catch (e) {
          console.error("Failed to update purchase progress:", e);
        }
      }
    } catch (error) {
      console.error("Error during progress tracking:", error);
    }

    // Phase 3: Always exit edit mode and dispatch events
    setIsEditMode(false);
    setRangeFillMode(false);
    setCompleteAllChecked(false);
    window.dispatchEvent(
      new CustomEvent("progress-updated", { detail: { accountId } }),
    );
    window.dispatchEvent(new CustomEvent("data-changed"));
    window.dispatchEvent(new CustomEvent("daily-task-completed"));
  };

  const handleCancelEdit = () => {
    setRangeFillMode(false);
    setCompleteAllChecked(false);
    setIsEditMode(false);
  };

  const columns: ColumnData[] = (() => {
    const buildSessionKey = (token: string, day: number) => `${token}::${day}`;
    const levelCols = levels.map((l) => ({
      kind: "level" as const,
      id: l.id as number | string,
      token: (l.event_token || "").split("_day")[0],
      name: l.level_name,
      daysOffset: l.days_offset,
      timeSpent: l.time_spent,
      isBonus: l.is_bonus,
      synthetic: l.level_name === "-",
    }));

    const purchaseCols = purchaseEvents.map((p) => {
      const progress = purchaseProgress.find(
        (pp) => pp.purchase_event_id === p.id,
      );
      const day = progress ? progress.days_offset : p.days_offset;
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

        const expandedLevels = expandTimelineWithSessionDays(realLevels);

        if (expandedLevels.length > 0) {
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

      let displayDaysOffset = day != null ? String(day) : "-";
      if (p.is_restricted && p.max_days_offset != null) {
        displayDaysOffset = `${displayDaysOffset} (${t("purchaseEvents.lessThan")} ${p.max_days_offset})`;
      }

      return {
        kind: "purchase" as const,
        id: p.id,
        token: p.event_token,
        name: p.level_name || "$$$",
        daysOffset: day,
        displayDaysOffset,
        maxDaysOffset:
          p.max_days_offset != null ? String(p.max_days_offset) : null,
        isRestricted: !!p.is_restricted,
        timeSpent: midpointTime,
        synthetic: false,
      };
    });

    const numericLevels = levelCols.filter(
      (c) => typeof c.daysOffset === "number",
    ) as Extract<ColumnData, { kind: "level" }>[];

    const sessionLevelsByDay = new Map<
      number,
      Extract<ColumnData, { kind: "level" }>
    >();
    const sessionLevelsByKey = new Map<
      string,
      Extract<ColumnData, { kind: "level" }>
    >();
    numericLevels
      .filter((l) => l.name === "-")
      .forEach((l) => {
        const d = Number(l.daysOffset);
        if (!sessionLevelsByDay.has(d)) sessionLevelsByDay.set(d, l);
        sessionLevelsByKey.set(buildSessionKey(l.token, d), l);
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

    const sortedRealLevels = [
      ...numericLevels.filter(
        (l) => l.name !== "-" && typeof l.daysOffset === "number",
      ),
    ].sort((a, b) => Number(a.daysOffset) - Number(b.daysOffset));

    const getSynthSessionForKey = (token: string, day: number) => {
      const existing = sessionLevelsByKey.get(buildSessionKey(token, day));
      if (existing) return existing;

      const sharedRealLevels = getRealTimelineLevels(
        sortedRealLevels.map((l) => ({
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
      };
    };

    const getStandaloneSessionForDay = (day: number) => {
      const existing = sessionLevelsByDay.get(day);
      if (existing) return existing;
      const nextMatch = sortedRealLevels.find(
        (l) => Number(l.daysOffset) >= day,
      );
      if (!nextMatch) return null;
      return getSynthSessionForKey(nextMatch.token, day);
    };

    const minDay =
      sortedRealLevels.length > 0
        ? Math.min(0, Number(sortedRealLevels[0].daysOffset))
        : 0;
    const maxDay =
      sortedRealLevels.length > 0
        ? Number(sortedRealLevels[sortedRealLevels.length - 1].daysOffset)
        : 0;

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
      session,
      event,
    });

    const timelineColumns: ColumnData[] = [];

    if (mode === "all") {
      for (let day = minDay; day <= maxDay; day++) {
        const dayLevels = realLevelsByDay.get(day) ?? [];
        if (dayLevels.length > 0) {
          dayLevels.forEach((l) => {
            const session = getSynthSessionForKey(l.token, day);
            if (session) timelineColumns.push(makeSplit(day, session, l));
            else timelineColumns.push(l);
          });
        } else {
          const session = getStandaloneSessionForDay(day);
          if (session) timelineColumns.push(session);
        }
      }
    } else {
      const levelEvents = levelCols.filter(
        (l) => l.kind === "level" && l.name !== "-",
      ) as Extract<ColumnData, { kind: "level" }>[];
      levelEvents.forEach((l) => {
        if (typeof l.daysOffset === "number") {
          const session = getSynthSessionForKey(l.token, Number(l.daysOffset));
          if (session) {
            timelineColumns.push(makeSplit(Number(l.daysOffset), session, l));
            return;
          }
        }
        timelineColumns.push(l);
      });
    }

    const purchaseColumnsAtEnd: ColumnData[] = [];
    purchaseCols.forEach((p) => {
      if (typeof p.daysOffset === "number") {
        const session = getSynthSessionForKey(p.token, Number(p.daysOffset));
        if (session) {
          purchaseColumnsAtEnd.push(
            makeSplit(Number(p.daysOffset), session, p),
          );
          return;
        }
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
  })();

  const computedLevelDates = useMemo(() => {
    const startDateObj =
      parseDateFlexible(account?.start_date ?? "") || new Date();
    return columns.map((col): TimelineCell => {
      if (col.kind === "split") {
        const sessionDate = formatDateShort(
          addDays(startDateObj, Number(col.session.daysOffset || 0)),
        );
        if (!col.event) return sessionDate;

        if (
          col.event.kind === "purchase" &&
          isEditMode &&
          tempPurchaseDates[col.event.id as number]
        ) {
          const tempDate = tempPurchaseDates[col.event.id as number];
          return {
            session: sessionDate,
            event: tempDate ? formatDateShort(tempDate) : "-",
          };
        }

        const eventDate = formatDateShort(
          addDays(startDateObj, Number(col.event.daysOffset || 0)),
        );
        return { session: sessionDate, event: eventDate };
      }

      if (
        col.kind === "purchase" &&
        isEditMode &&
        tempPurchaseDates[col.id as number]
      ) {
        const tempDate = tempPurchaseDates[col.id as number];
        return tempDate ? formatDateShort(tempDate) : "-";
      }

      const dd = addDays(startDateObj, Number(col.daysOffset || 0));
      return formatDateShort(dd);
    });
  }, [columns, account?.start_date, isEditMode, tempPurchaseDates]);

  const exportData = useMemo((): ExportColumnData[] => {
    return columns.flatMap((c) => {
      if (c.kind !== "split") return [c];
      return c.event ? [c.event] : [c.session];
    });
  }, [columns]);

  if (!account) {
    return (
      <div className="w-full px-1 sm:px-2 py-4">
        <div className="mb-4">
          <BackButton
            to={
              selectedGameId ? `/accounts/detail?gameId=${selectedGameId}` : undefined
            }
          />
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            Account not found
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full px-1 sm:px-2 space-y-4 lg:space-y-6 min-h-[calc(100vh-4rem)] relative flex flex-col">
      <div className="flex-1">
        <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl md:text-2xl font-bold truncate">
                {account.name}
              </h2>
              {account.proxy_state && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0 border-2 shrink-0",
                    account.proxy_state === "FLORIDA" &&
                      "border-orange-500/50 text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
                    account.proxy_state === "CALIFORNIA" &&
                      "border-blue-500/50 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400",
                    account.proxy_state === "TEXAS" &&
                      "border-red-500/50 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
                    account.proxy_state === "New York" &&
                      "border-slate-500/50 text-slate-600 bg-slate-50 dark:bg-slate-900/20 dark:text-slate-400",
                    account.proxy_state === "UK" &&
                      "border-teal-500/50 text-teal-600 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400",
                  )}
                >
                  {account.proxy_state}
                </Badge>
              )}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground flex items-center gap-2">
              {account.start_date} • {account.start_time}
              {account.branch_name && (
                <>
                  <span className="opacity-30">•</span>
                  <span className="font-medium text-primary/80 bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">
                    {account.branch_name}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto">
            {/* Desktop Secondary Actions */}
            <div className="hidden lg:flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportDialog(true)}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                {t("common.import", "Import")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExportDialog(true)}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {t("common.export", "Export")}
              </Button>
              <div className="flex items-center gap-2 px-2 py-1 border rounded h-9">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="account-detail-mode-desktop"
                    checked={mode === "event-only"}
                    onChange={() => setMode("event-only")}
                    className="w-3 h-3"
                  />
                  <span className="text-xs">{t("common.eventOnly")}</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="account-detail-mode-desktop"
                    checked={mode === "all"}
                    onChange={() => setMode("all")}
                    className="w-3 h-3"
                  />
                  <span className="text-xs">{t("common.all")}</span>
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
                    <Label className="text-[10px] uppercase text-muted-foreground font-bold">
                      {t("common.view")}
                    </Label>
                    <div className="flex flex-col gap-2 p-2 border rounded bg-accent/20">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="account-detail-mode-mobile"
                          checked={mode === "event-only"}
                          onChange={() => setMode("event-only")}
                        />
                        <span className="text-sm">{t("common.eventOnly")}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="account-detail-mode-mobile"
                          checked={mode === "all"}
                          onChange={() => setMode("all")}
                        />
                        <span className="text-sm">{t("common.all")}</span>
                      </label>
                    </div>
                  </div>

                  {isEditMode && (
                    <div className="space-y-2 pt-2 border-t">
                      <Label className="text-[10px] uppercase text-muted-foreground font-bold">
                        {t("common.edit")}
                      </Label>

                      <Button
                        type="button"
                        variant={rangeFillMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => setRangeFillMode((prev) => !prev)}
                        className={`w-full justify-start gap-2 h-9 ${
                          rangeFillMode
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "text-muted-foreground"
                        }`}
                      >
                        <Edit3 className="h-4 w-4" />
                        {rangeFillMode
                          ? t("accounts.rangeFillOn", "Range Fill: ON")
                          : t("accounts.rangeFillOff", "Range Fill")}
                      </Button>
                      <p className="text-[11px] text-muted-foreground px-1">
                        {t(
                          "accounts.rangeFillHint",
                          "Tap any checkbox to fill from start to that point",
                        )}
                      </p>

                      <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-orange-500/10 border-orange-500/20 text-orange-600">
                        <input
                          type="checkbox"
                          id="complete-all-mobile"
                          checked={completeAllChecked}
                          onChange={(e) =>
                            handleCompleteAllChange(e.target.checked)
                          }
                          className="h-4 w-4"
                        />
                        <label
                          htmlFor="complete-all-mobile"
                          className="text-sm font-medium flex items-center gap-2 cursor-pointer select-none"
                        >
                          <CheckSquare className="h-4 w-4" />
                          {t("accounts.completeAll", "Complete All")}
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-[10px] uppercase text-muted-foreground font-bold">
                      {t("common.actions")}
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowImportDialog(true)}
                        className="justify-start gap-2 h-9 text-xs px-2"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {t("common.import")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowExportDialog(true)}
                        className="justify-start gap-2 h-9 text-xs px-2"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t("common.export")}
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="h-8 w-[1px] bg-border mx-1" />

            {/* Primary Actions */}
            <div className="flex items-center gap-2">
              {isEditMode ? (
                <>
                  {/* Desktop Edit Helpers */}
                  <div className="hidden lg:flex items-center gap-2 px-3 py-2 border rounded-lg bg-muted/50 h-9">
                    <Button
                      type="button"
                      variant={rangeFillMode ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRangeFillMode((prev) => !prev)}
                      className={`h-7 px-2 text-[11px] font-semibold transition-all ${
                        rangeFillMode
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={t(
                        "accounts.rangeFillHint",
                        "Tap any checkbox to fill from start to that point",
                      )}
                    >
                      {rangeFillMode
                        ? t("accounts.rangeFillOn", "Range Fill: ON")
                        : t("accounts.rangeFillOff", "Range Fill")}
                    </Button>
                    <input
                      type="checkbox"
                      id="complete-all"
                      checked={completeAllChecked}
                      onChange={(e) =>
                        handleCompleteAllChange(e.target.checked)
                      }
                      className="h-4 w-4"
                    />
                    <label
                      htmlFor="complete-all"
                      className="text-xs font-medium flex items-center gap-1 cursor-pointer"
                    >
                      {t("accounts.completeAll")}
                    </label>
                  </div>

                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveProgress}
                    className="flex items-center gap-2 h-9 bg-green-600 hover:bg-green-700"
                  >
                    <Save className="h-4 w-4" />
                    <span className="hidden xs:inline">
                      {t("common.save", "Save")}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    className="flex items-center gap-2 h-9"
                  >
                    <X className="h-4 w-4" />
                    <span className="hidden xs:inline">
                      {t("common.cancel", "Cancel")}
                    </span>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditToggle}
                    className="flex items-center gap-2 h-9"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span className="hidden xs:inline">
                      {t("common.edit", "Edit")}
                    </span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      navigate(`/accounts/edit/${account?.id}`, {
                        state: { account, selectedGameId },
                      })
                    }
                    className="flex items-center gap-2 h-9"
                    title={t("accounts.editAccountInfo", "Edit Account Info")}
                  >
                    <User className="h-4 w-4" />
                    <span className="hidden xs:inline">
                      {t("accounts.editAccount", "Edit Account")}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBranchTransferDialog(true)}
                    className="flex items-center gap-2 h-9"
                    title={t("accounts.branchTransfer.title")}
                  >
                    <GitBranch className="h-4 w-4" />
                    <span className="hidden xs:inline">
                      {t("accounts.branchTransfer.title")}
                    </span>
                  </Button>
                </>
              )}
            </div>

            <BackButton
              to={
                selectedGameId
                  ? `/accounts/detail?gameId=${selectedGameId}`
                  : undefined
              }
            />
          </div>
        </div>
        <section className="space-y-0.5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-3 px-4 py-2 bg-accent/20 rounded-t-xl border-x border-t border-border/50">
            <div className="h-5 w-1 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
            <h3 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2 flex-1">
              {account.branch_name ||
                t("branches.defaultBranch", "Default Branch")}
            </h3>
          </div>
          <Card className="rounded-t-none border-t-0 shadow-lg shadow-black/5 bg-background/40 backdrop-blur-sm">
            <CardContent className="p-0 overflow-auto max-h-[600px] custom-scrollbar">
              <AccountDataTable
                columns={columns}
                computedLevelDates={computedLevelDates}
                levelsProgress={levelsProgress}
                purchaseProgress={purchaseProgress}
                isEditMode={isEditMode}
                tempProgress={tempProgress}
                onProgressChange={handleProgressChange}
                rangeFillMode={rangeFillMode}
                onPurchaseDateChange={handlePurchaseDateChange}
                tempPurchaseDates={tempPurchaseDates}
                levels={levels}
                mode={mode}
              />
            </CardContent>
          </Card>
        </section>
        <ImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          gameId={account?.game_id}
          branchId={account?.branch_id}
        />
        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          gameId={account?.game_id}
          branchId={account?.branch_id}
          accountId={accountId}
          exportType="account"
          colorSettings={colors}
          theme={theme}
          source="account-detail"
          data={exportData}
          levelsProgress={levelsProgress}
          purchaseProgress={purchaseProgress}
        />
        <BranchTransferDialog
          open={showBranchTransferDialog}
          onOpenChange={setShowBranchTransferDialog}
          accountId={accountId}
          accountName={account.name}
          currentBranchId={account.branch_id}
          currentBranchName={account.branch_name}
          gameId={account.game_id}
        />
      </div>
      {(prevAccount || nextAccount) && (
        <div
          className="fixed inset-x-0 bottom-[var(--mobile-offset)] lg:sticky lg:bottom-0 lg:inset-x-auto z-40 flex justify-between items-center px-4 py-3 bg-background/95 backdrop-blur-xl border-t border-border/40 shadow-[0_-4px_24px_rgba(0,0,0,0.04)] lg:rounded-t-lg transition-all duration-300"
          style={
            {
              "--mobile-offset": "calc(3.5rem + env(safe-area-inset-bottom))",
            } as React.CSSProperties
          }
        >
          <div>
            {prevAccount && (
              <Button
                variant="outline"
                onClick={() => navigate(`/accounts/${prevAccount.id}`)}
                className="flex items-center gap-2 bg-background"
                title={`${t("common.previous", "Previous")}: ${prevAccount.name}`}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{prevAccount.name}</span>
              </Button>
            )}
          </div>
          <div>
            {nextAccount && (
              <Button
                variant="outline"
                onClick={() => navigate(`/accounts/${nextAccount.id}`)}
                className="flex items-center gap-2 bg-background"
                title={`${t("common.next", "Next")}: ${nextAccount.name}`}
              >
                <span className="hidden sm:inline">{nextAccount.name}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
