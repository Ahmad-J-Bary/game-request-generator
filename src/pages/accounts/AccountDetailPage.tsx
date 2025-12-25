// src/pages/accounts/AccountDetailPage.tsx

import { useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../components/ui/card';
import { LayoutToggle, Layout } from '../../components/molecules/LayoutToggle';
import { BackButton } from '../../components/molecules/BackButton';
import { ImportDialog } from '../../components/molecules/ImportDialog';
import { ExportDialog } from '../../components/molecules/ExportDialog';
import { Button } from '../../components/ui/button';
import { Download, Upload, Edit3, Save, X } from 'lucide-react';
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
  const { colors } = useSettings();
  const { theme } = useTheme();

  const state = (location.state as any) || {};
  const stateAccount: Account | undefined = state.account;
  const stateLevels: Level[] | undefined = state.levels;

  const { accounts } = useAccounts(undefined as any);
  const account = stateAccount ?? accounts?.find((a) => String(a.id) === String(id));
  const gameIdForLevels = account?.game_id ?? undefined;

  const { levels: fetchedLevels = [] } = useLevels(gameIdForLevels);
  const { events: purchaseEvents = [] } = usePurchaseEvents(gameIdForLevels);

  // الحصول على بيانات التقدم
  const accountId = parseInt(id || '0', 10);
  const { levelsProgress, purchaseProgress } = useProgress(accountId);

  const levels = stateLevels ?? fetchedLevels;

  const [layout, setLayout] = useState<Layout>('vertical');
  const [mode, setMode] = useState<Mode>('event-only');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [tempProgress, setTempProgress] = useState<{
    levels: { [key: number | string]: boolean };
    purchases: { [key: number]: boolean };
  }>({
    levels: {},
    purchases: {},
  });

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
        const existingProgress = purchaseProgress.find(p => p.purchase_event_id === purchaseIdNum);

        if (existingProgress) {
          // Update existing progress
          const request = {
            account_id: accountId,
            purchase_event_id: purchaseIdNum,
            is_completed: isCompleted,
          };
          await TauriService.updatePurchaseEventProgress(request);
        } else {
          // Create new progress record
          const createRequest = {
            account_id: accountId,
            purchase_event_id: purchaseIdNum,
            days_offset: 0, // Default values
            time_spent: 0,
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

    const purchaseCols = purchaseEvents.map((p) => ({
      kind: 'purchase' as const,
      id: p.id,
      token: p.event_token,
      name: '$$$',
      isRestricted: p.is_restricted,
      maxDaysOffset: p.max_days_offset != null ? `${t('purchaseEvents.lessThan')} ${p.max_days_offset}` : null,
    }));

    if (mode === 'event-only') {
      // In event-only mode, show only manually added levels (excluding session levels which have name '-')
      // and purchase events
      const realLevels = levelCols.filter(l => l.name !== '-');
      return [...realLevels, ...purchaseCols];
    }

    // In 'all' mode, show all manually added plus synthetic levels calculated for days without events
    const numeric = levelCols.filter((c: any) => typeof c.daysOffset === 'number');
    numeric.sort((a: any, b: any) => a.daysOffset - b.daysOffset);

    const result: any[] = [];

    // Add levels with synthetic ones
    for (let i = 0; i < numeric.length; i++) {
      const left = numeric[i];
      result.push(left);
      const right = numeric[i + 1];
      if (right && typeof right.daysOffset === 'number' && typeof left.daysOffset === 'number' && right.daysOffset > left.daysOffset + 1) {
        for (let d = left.daysOffset + 1; d <= right.daysOffset - 1; d++) {
          let synthesizedTime: number | null = null;
          if (typeof left.timeSpent === 'number' && typeof right.timeSpent === 'number') {
            const ratio = (d - left.daysOffset) / (right.daysOffset - left.daysOffset);
            synthesizedTime = Math.round(left.timeSpent + ratio * (right.timeSpent - left.timeSpent));
          }

          // Check if we already have a "real" session level for this day (it would be in numeric list)
          // But since we iterate through numeric list, if it was there, it would be 'left' or 'right'.
          // However, we might have gaps.

          const synth = {
            kind: 'level' as const,
            id: `synth-${left.id}-${d}`,
            token: right.token,
            name: '-',
            daysOffset: d,
            timeSpent: synthesizedTime,
            isBonus: false,
            synthetic: true,
          };
          result.push(synth);
        }
      }
    }

    // Add any non-numeric levels
    const numericIds = new Set(numeric.map((c: any) => c.id));
    const nonNumeric = levelCols.filter((c: any) => !numericIds.has(c.id));
    nonNumeric.forEach(c => result.push(c));

    // Add purchase events last
    result.push(...purchaseCols);

    return result;
  }, [levels, purchaseEvents, mode, t]);

  // Initialize temp progress when entering edit mode
  useMemo(() => {
    if (isEditMode) {
      const levelProgress: { [key: number | string]: boolean } = {};
      const purchaseProgressMap: { [key: number]: boolean } = {};

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

      // Initialize ALL purchase events with their current progress status (defaulting to false if no progress exists)
      purchaseEvents.forEach(purchase => {
        const existingProgress = purchaseProgress.find(p => p.purchase_event_id === purchase.id);
        purchaseProgressMap[purchase.id] = existingProgress ? existingProgress.is_completed : false;
      });

      setTempProgress({
        levels: levelProgress,
        purchases: purchaseProgressMap,
      });
    }
  }, [isEditMode, columns, purchaseEvents, levelsProgress, purchaseProgress]);

  const computedLevelDates = useMemo(() => {
    // Get all level columns from the final result and calculate their dates
    const levelColumns = columns.filter(col => col.kind === 'level');
    return levelColumns.map((col) => {
      const dd = addDays(startDateObj, Number(col.daysOffset || 0));
      return formatDateShort(dd);
    });
  }, [columns, startDateObj]);

  return (
    <div className="p-6 space-y-6">
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
            levels={levels}
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
  );
}