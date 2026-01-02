// src/pages/accounts/AccountDetailPage.tsx

// Force reload
import { useMemo, useState, useEffect } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../components/ui/card';
import { LayoutToggle, Layout } from '../../components/molecules/LayoutToggle';
import { BackButton } from '../../components/molecules/BackButton';
import { ImportDialog } from '../../components/molecules/ImportDialog';
import { ExportDialog } from '../../components/molecules/ExportDialog';
import { Button } from '../../components/ui/button';
import { Download, Upload, Edit3, Save, X, CheckSquare, ArrowLeft, ArrowRight } from 'lucide-react';
import { Level, Account } from '../../types';
import { useAccounts } from '../../hooks/useAccounts';
import { useLevels } from '../../hooks/useLevels';
import { usePurchaseEvents } from '../../hooks/usePurchaseEvents';
import { useProgress } from '../../hooks/useProgress';
import { TauriService } from '../../services/tauri.service';
import { useSettings } from '../../contexts/SettingsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AccountDataTable } from '../../components/tables/AccountDataTable';

type Mode = 'all' | 'event-only';

function parseDateFlexible(input: string): Date | null {
  if (!input) return null;
  const d = new Date(input);
  if (!Number.isNaN(d.getTime())) return d;
  const m = input.trim().match(/^(\d{1,2})-([A-Za-z]{3,})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const monStr = m[2].toLowerCase();
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = months.indexOf(monStr);
    if (monthIndex >= 0) {
      const now = new Date();
      const year = now.getFullYear();
      return new Date(year, monthIndex, day);
    }
  }
  const parts = input.split('/');
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
  if (!date) return '-';
  const day = date.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[date.getMonth()];
  return `${day}-${mon}`;
}

export default function AccountDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { colors } = useSettings();
  const { theme } = useTheme();

  const state = (location.state as any) || {};
  const stateAccount: Account | undefined = state.account;
  const stateLevels: Level[] | undefined = state.levels;

  const [fetchedAccount, setFetchedAccount] = useState<Account | null>(null);

  useEffect(() => {
    if (!stateAccount && id) {
      TauriService.getAccountById(parseInt(id, 10))
        .then(setFetchedAccount)
        .catch(console.error);
    }
  }, [id, stateAccount]);

  const account = stateAccount ?? fetchedAccount;
  const gameIdForLevels = account?.game_id ?? undefined;

  const { accounts } = useAccounts(gameIdForLevels); // Now fetches siblings!

  const { levels: fetchedLevels = [] } = useLevels(gameIdForLevels);
  const { events: purchaseEvents = [] } = usePurchaseEvents(gameIdForLevels);

  // Calculate previous and next accounts
  const { prevAccount, nextAccount } = useMemo(() => {
    if (!account || !accounts) return { prevAccount: null, nextAccount: null };

    // Filter accounts for the same game
    const gameAccounts = accounts.filter(a => a.game_id === account.game_id);

    // Sort accounts by date/time (same logic as list page)
    const sortedAccounts = [...gameAccounts].sort((a, b) => {
      try {
        const dateA = new Date(`${a.start_date}T${a.start_time}`);
        const dateB = new Date(`${b.start_date}T${b.start_time}`);
        
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          if (a.start_date !== b.start_date) {
            return a.start_date.localeCompare(b.start_date);
          }
          return a.start_time.localeCompare(b.start_time);
        }
        
        return dateA.getTime() - dateB.getTime();
      } catch (e) {
        return 0;
      }
    });

    const currentIndex = sortedAccounts.findIndex(a => a.id === account.id);
    
    if (currentIndex === -1) return { prevAccount: null, nextAccount: null };

    return {
      prevAccount: currentIndex > 0 ? sortedAccounts[currentIndex - 1] : null,
      nextAccount: currentIndex < sortedAccounts.length - 1 ? sortedAccounts[currentIndex + 1] : null
    };
  }, [account, accounts]);

  // الحصول على بيانات التقدم
  const accountId = parseInt(id || '0', 10);
  const { levelsProgress, purchaseProgress } = useProgress(accountId);

  const levels = stateLevels ?? fetchedLevels;

  const [layout, setLayout] = useState<Layout>('vertical');
  const [mode, setMode] = useState<Mode>('event-only');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [completeAllChecked, setCompleteAllChecked] = useState(false);
  const [tempProgress, setTempProgress] = useState<{
    levels: { [key: number | string]: boolean };
    purchases: { [key: number]: boolean };
  }>({
    levels: {},
    purchases: {},
  });
  const [tempPurchaseDates, setTempPurchaseDates] = useState<{ [key: number]: Date | null }>({});

  const handleEditToggle = () => {
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

  const handlePurchaseDateChange = (purchaseId: number, date: Date | null) => {
    setTempPurchaseDates(prev => ({
      ...prev,
      [purchaseId]: date
    }));
  };

  const handleCompleteAllChange = (checked: boolean) => {
    setCompleteAllChecked(checked);

    if (checked) {
      // Mark all levels and purchase events as completed
      const newTempProgress = {
        levels: {} as { [key: number | string]: boolean },
        purchases: {} as { [key: number]: boolean },
      };

      // Mark all levels as completed
      columns.forEach(col => {
        if (col.kind === 'level') {
          newTempProgress.levels[col.id] = true;
        } else if (col.kind === 'purchase') {
          newTempProgress.purchases[col.id] = true;
        }
      });

      setTempProgress(newTempProgress);
    } else {
      // Clear all progress when unchecked
      setTempProgress({
        levels: {},
        purchases: {},
      });
    }
  };

  const handleSaveProgress = async () => {
    try {
      // Save level progress - create records for all levels that have been modified
      for (const [levelId, isCompleted] of Object.entries(tempProgress.levels)) {
        let actualLevelId = levelId;

        // Handle synthetic levels by creating real levels with the synthetic level's properties
        if (levelId.startsWith('synth-')) {
          // Find the synthetic level in the current columns to get its properties
          const syntheticLevel = columns.find(col =>
            col.kind === 'level' &&
            typeof col.id === 'string' &&
            col.id === levelId
          );

          if (syntheticLevel) {
            // Create a real level with the synthetic level's properties
            const newLevel = {
              game_id: account!.game_id,
              level_name: syntheticLevel.name, // Use the synthetic level's name (e.g., "-")
              // Append _day suffix to ensure uniqueness in DB (constraint is game_id + event_token)
              event_token: `${syntheticLevel.token}_day${syntheticLevel.daysOffset}`,
              days_offset: syntheticLevel.daysOffset,
              time_spent: syntheticLevel.timeSpent,
              is_bonus: syntheticLevel.isBonus
            };

            // Check if this level already exists (to avoid duplicates)
            const existingLevels = await TauriService.getGameLevels(account!.game_id);
            const existingLevel = existingLevels.find(l =>
              l.days_offset === newLevel.days_offset &&
              l.event_token === newLevel.event_token
            );

            if (existingLevel) {
              // Use the existing level
              actualLevelId = existingLevel.id.toString();
            } else {
              // Create new level
              const createdLevelId = await TauriService.addLevel(newLevel);
              actualLevelId = createdLevelId.toString();
            }
          } else {
            continue; // Skip if synthetic level not found
          }
        }

        const levelIdNum = parseInt(actualLevelId);
        const existingProgress = levelsProgress.find(p => p.level_id === levelIdNum);

        if (existingProgress) {
          // Update existing progress
          const request = {
            account_id: accountId,
            level_id: levelIdNum,
            is_completed: isCompleted,
          };
          await TauriService.updateLevelProgress(request);
        } else {
          // Create new progress record
          const createRequest = {
            account_id: accountId,
            level_id: levelIdNum,
          };
          await TauriService.createLevelProgress(createRequest);

          // If it should be completed, update it
          if (isCompleted) {
            const updateRequest = {
              account_id: accountId,
              level_id: levelIdNum,
              is_completed: true,
            };
            await TauriService.updateLevelProgress(updateRequest);
          }
        }
      }

      // Save purchase event progress - create records for all purchase events that have been modified
      for (const [purchaseId, isCompleted] of Object.entries(tempProgress.purchases)) {
        const purchaseIdNum = parseInt(purchaseId);
        const selectedDate = tempPurchaseDates[purchaseIdNum];
        let daysOffset = 0;
        let calculatedTimeSpent = 0;

        if (selectedDate) {
          const diffTime = selectedDate.getTime() - startDateObj.getTime();
          daysOffset = Math.round(diffTime / (1000 * 60 * 60 * 24));

          // Calculate the correct time_spent for this purchase event based on surrounding levels
          const numericLevels = levels
            .filter(l => typeof l.days_offset === 'number' && l.days_offset !== null)
            .sort((a, b) => (a.days_offset as number) - (b.days_offset as number));

          if (numericLevels.length > 0) {
            // Find all levels on the same day as the purchase event
            const sameDayLevels = numericLevels.filter(l => (l.days_offset as number) === daysOffset);
            // Find the next level after the purchase event day
            const nextLevel = numericLevels.find(l => (l.days_offset as number) > daysOffset);

            const levelsToAverage = [...sameDayLevels];
            if (nextLevel) {
              levelsToAverage.push(nextLevel);
            }

            if (levelsToAverage.length > 0) {
              const totalTimeSpent = levelsToAverage.reduce((sum, level) => sum + (level.time_spent || 0), 0);
              calculatedTimeSpent = Math.round(totalTimeSpent / levelsToAverage.length);
            }
          }

          // If no levels found for averaging, use the existing time_spent or a fallback
          if (calculatedTimeSpent <= 0) {
            const existingProgress = purchaseProgress.find(p => p.purchase_event_id === purchaseIdNum);
            if (existingProgress && existingProgress.time_spent > 0) {
              calculatedTimeSpent = existingProgress.time_spent;
            } else {
              calculatedTimeSpent = 243; // Default fallback value
            }
          }
        }

        const existingProgress = purchaseProgress.find(p => p.purchase_event_id === purchaseIdNum);

        if (existingProgress) {
          // Update existing progress with calculated time_spent
          const request = {
            account_id: accountId,
            purchase_event_id: purchaseIdNum,
            is_completed: isCompleted,
            days_offset: daysOffset,
            time_spent: calculatedTimeSpent,
          };
          await TauriService.updatePurchaseEventProgress(request);
        } else {
          // Create new progress record with calculated time_spent
          const createRequest = {
            account_id: accountId,
            purchase_event_id: purchaseIdNum,
            days_offset: daysOffset,
            time_spent: calculatedTimeSpent,
          };
          await TauriService.createPurchaseEventProgress(createRequest);

          // If it should be completed, update it
          if (isCompleted) {
            const updateRequest = {
              account_id: accountId,
              purchase_event_id: purchaseIdNum,
              is_completed: true,
            };
            await TauriService.updatePurchaseEventProgress(updateRequest);
          }
        }
      }

      setIsEditMode(false);
      // Refresh progress data
      window.location.reload();
    } catch (error) {
      console.error('Error saving progress:', error);
      alert(`Error saving progress: ${error}`);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
  };

  const startDateObj = useMemo(() => {
    return parseDateFlexible(account?.start_date ?? '') || new Date();
  }, [account]);

  const columns = useMemo(() => {
    const levelCols = levels.map((l) => ({
      kind: 'level' as const,
      id: l.id,
      token: l.event_token.split('_day')[0], // Strip _day suffix for display/logic
      name: l.level_name,
      daysOffset: l.days_offset,
      timeSpent: l.time_spent,
      isBonus: l.is_bonus,
      // Mark as synthetic if name is '-' so it keeps the session style even if it's a real DB record
      synthetic: l.level_name === '-',
    }));

    const purchaseCols = purchaseEvents.map((p) => {
      const progress = purchaseProgress.find(pp => pp.purchase_event_id === p.id);
      const day = progress ? progress.days_offset : p.days_offset;
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
        isRestricted: p.is_restricted,
        daysOffset: day,
        timeSpent: midpointTime || 0,
        maxDaysOffset: p.max_days_offset != null ? `${t('purchaseEvents.lessThan')} ${p.max_days_offset}` : null,
      };
    });

    if (mode === 'event-only') {
      const levels = levelCols.filter(l => l.name !== '-');
      const purchases = purchaseCols;

      levels.sort((a: any, b: any) => (a.daysOffset || 0) - (b.daysOffset || 0));
      purchases.sort((a: any, b: any) => {
        if (a.daysOffset === b.daysOffset) return 0;
        if (a.daysOffset == null) return 1;
        if (b.daysOffset == null) return -1;
        return a.daysOffset - b.daysOffset;
      });

      return [...levels, ...purchases];
    }

    const allCols = [...levelCols, ...purchaseCols];
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

    // Group entries by daysOffset to handle multiple entries per day
    const entriesByDay: { [day: number]: any[] } = {};
    numeric.forEach(entry => {
      const day = entry.daysOffset;
      if (!entriesByDay[day]) {
        entriesByDay[day] = [];
      }
      entriesByDay[day].push(entry);
    });

    let minDay = numeric.length > 0 ? numeric[0].daysOffset : 0;
    let maxDay = numeric.length > 0 ? numeric[numeric.length - 1].daysOffset : 0;

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

    // Add any non-numeric levels
    const numericIds = new Set(numeric.map((c: any) => c.id));
    const nonNumeric = allCols.filter((c: any) => !numericIds.has(c.id));
    return [...result, ...nonNumeric];

    return result;
  }, [levels, purchaseEvents, mode, t]);

  // Initialize temp progress when entering edit mode
  useMemo(() => {
    if (isEditMode) {
      const levelProgress: { [key: number | string]: boolean } = {};
      const purchaseProgressMap: { [key: number]: boolean } = {};
      const purchaseDatesMap: { [key: number]: Date | null } = {};

      // Initialize ALL level columns (including synthetic ones) with their current progress status
      columns.filter(col => col.kind === 'level').forEach(col => {
        if (typeof col.id === 'string' && col.id.startsWith('synth-')) {
          // Synthetic levels don't have database progress, default to false
          levelProgress[col.id] = false;
        } else {
          // Real levels get their progress from the database
          const existingProgress = levelsProgress.find(p => p.level_id === col.id);
          levelProgress[col.id] = existingProgress ? existingProgress.is_completed : false;
        }
      });

      // Initialize ALL purchase events with their current progress status and dates
      purchaseEvents.forEach(purchase => {
        const existingProgress = purchaseProgress.find(p => p.purchase_event_id === purchase.id);
        purchaseProgressMap[purchase.id] = existingProgress ? existingProgress.is_completed : false;

        const daysOffset = existingProgress?.days_offset ?? 0;
        const date = addDays(startDateObj, daysOffset);
        // Store Date object instead of formatted string
        purchaseDatesMap[purchase.id] = existingProgress ? date : null;
      });

      setTempProgress({
        levels: levelProgress,
        purchases: purchaseProgressMap,
      });
      setTempPurchaseDates(purchaseDatesMap);
    }
  }, [isEditMode, columns, purchaseEvents, levelsProgress, purchaseProgress, startDateObj]);

  const computedLevelDates = useMemo(() => {
    // Get all level columns from the final result and calculate their dates
    return columns.map((col) => {
      if (col.kind === 'level') {
        const dd = addDays(startDateObj, Number(col.daysOffset || 0));
        return formatDateShort(dd);
      } else if (col.kind === 'purchase') {
        if (isEditMode && tempPurchaseDates[col.id as number]) {
          const tempDate = tempPurchaseDates[col.id as number];
          return tempDate ? formatDateShort(tempDate) : '-';
        }
        const dd = addDays(startDateObj, Number(col.daysOffset || 0));
        return formatDateShort(dd);
      }
      return '-';
    });
  }, [columns, startDateObj, isEditMode, tempPurchaseDates, purchaseProgress]);

  if (!account) {
    return (
      <div className="p-6">
        <div className="mb-4">
          <BackButton />
        </div>
        <Card>
          <CardContent className="p-6 text-center">Account not found</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 min-h-[calc(100vh-4rem)] relative flex flex-col">
      <div className="flex-1">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{account.name}</h2>
          <div className="text-sm text-muted-foreground">
            {account.start_date} • {account.start_time}
          </div>
        </div>

        <div className="flex items-center gap-2">
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

          {isEditMode ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-muted/50">
                <input
                  type="checkbox"
                  id="complete-all"
                  checked={completeAllChecked}
                  onChange={(e) => handleCompleteAllChange(e.target.checked)}
                  className="h-4 w-4"
                />
                <label
                  htmlFor="complete-all"
                  className="text-sm font-medium flex items-center gap-2 cursor-pointer"
                >
                  <CheckSquare className="h-4 w-4 text-muted-foreground" />
                  {t('accounts.completeAll', 'Complete All')}
                </label>
              </div>

              <Button
                variant="default"
                size="sm"
                onClick={handleSaveProgress}
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
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEditToggle}
              className="flex items-center gap-2"
            >
              <Edit3 className="h-4 w-4" />
              {t('common.edit', 'Edit')}
            </Button>
          )}

          <div className="flex items-center gap-2 px-2 py-1 border rounded">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="account-detail-mode"
                checked={mode === 'event-only'}
                onChange={() => setMode('event-only')}
              />
              <span className="text-sm">{t('common.eventOnly')}</span>
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="account-detail-mode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
              />
              <span className="text-sm">{t('common.all')}</span>
            </label>
          </div>

          <LayoutToggle layout={layout} onLayoutChange={setLayout} />
          <BackButton />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-auto">
          <AccountDataTable
            columns={columns}
            computedLevelDates={computedLevelDates}
            layout={layout}
            levelsProgress={levelsProgress}
            purchaseProgress={purchaseProgress}
            isEditMode={isEditMode}
            tempProgress={tempProgress}
            onProgressChange={handleProgressChange}
            onPurchaseDateChange={handlePurchaseDateChange}
            tempPurchaseDates={tempPurchaseDates}
            levels={levels}
            mode={mode}
          />
        </CardContent>
      </Card>

      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        gameId={gameIdForLevels}
      />

      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        gameId={gameIdForLevels}
        accountId={accountId}
        exportType="account"
        layout={layout}
        colorSettings={colors}
        theme={theme}
        source="account-detail"
        data={columns}
        levelsProgress={levelsProgress}
        purchaseProgress={purchaseProgress}
      />
      </div>

      {/* Account Navigation Arrows */}
      {(prevAccount || nextAccount) && (
        <div className="sticky bottom-0 w-[calc(100%+3rem)] -ml-6 -mb-6 bg-gray-100 border-t border-gray-200 p-4 flex justify-between items-center z-40 mt-auto">
          <div>
            {prevAccount && (
              <Button
                variant="outline"
                onClick={() => navigate(`/accounts/${prevAccount.id}`)}
                className="flex items-center gap-2"
                title={`${t('common.previous', 'Previous')}: ${prevAccount.name}`}
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
                className="flex items-center gap-2"
                title={`${t('common.next', 'Next')}: ${nextAccount.name}`}
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