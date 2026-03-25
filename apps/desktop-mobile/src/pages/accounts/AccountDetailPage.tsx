// src/pages/accounts/AccountDetailPage.tsx

import { useMemo, useState, useEffect } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@grq/ui/atoms/card';
import { Download, Upload, Edit3, Save, X, CheckSquare, ArrowLeft, ArrowRight } from 'lucide-react';
import type { ColumnData } from '@grq/ui/organisms/tables/AccountDataTable';
import { LayoutToggle, Layout } from '@grq/ui/molecules/LayoutToggle';
import { BackButton } from '@grq/ui/molecules/BackButton';
import { ImportDialog } from '@grq/ui/molecules/ImportDialog';
import { ExportDialog } from '@grq/ui/molecules/ExportDialog';
import { Button } from '@grq/ui/atoms/button';
import { Level, Account } from '@grq/api-bindings';
import { useAccounts } from '@grq/core/hooks/useAccounts';
import { useLevels } from '@grq/core/hooks/useLevels';
import { usePurchaseEvents } from '@grq/core/hooks/usePurchaseEvents';
import { useProgress } from '@grq/core/hooks/useProgress';
import { TauriService } from '@grq/core/services/tauri.service';
import { useSettings } from '@grq/ui/contexts/SettingsContext';
import { useTheme } from '@grq/ui/contexts/ThemeContext';
import { AccountDataTable } from '@grq/ui/organisms/tables/AccountDataTable';

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

  const state = (location.state as { account?: Account; levels?: Level[] }) || {};
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

  const { accounts } = useAccounts(gameIdForLevels); 

  const { levels: fetchedLevels = [] } = useLevels(gameIdForLevels);
  const { events: purchaseEvents = [] } = usePurchaseEvents(gameIdForLevels);

  const { prevAccount, nextAccount } = useMemo(() => {
    if (!account || !accounts) return { prevAccount: null, nextAccount: null };

    const gameAccounts = accounts.filter(a => a.game_id === account.game_id);
    const sortedAccounts = [...gameAccounts].sort((a, b) => {
      try {
        const dateA = new Date(`${a.start_date}T${a.start_time}`);
        const dateB = new Date(`${b.start_date}T${b.start_time}`);
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          if (a.start_date !== b.start_date) return a.start_date.localeCompare(b.start_date);
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
    if (!isEditMode) {
      const levelProg: { [key: number | string]: boolean } = {};
      const purchaseProg: { [key: number]: boolean } = {};

      levelsProgress.forEach(p => {
        levelProg[p.level_id] = p.is_completed;
      });

      purchaseProgress.forEach(p => {
        purchaseProg[p.purchase_event_id] = p.is_completed;
      });
      setTempProgress({
        levels: levelProg,
        purchases: purchaseProg,
      });
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

  const handlePurchaseDateChange = (purchaseId: number, date: Date | null) => {
    setTempPurchaseDates(prev => ({ ...prev, [purchaseId]: date }));
  };

  const handleCompleteAllChange = (checked: boolean) => {
    setCompleteAllChecked(checked);
    if (checked) {
      const newTempProgress = {
        levels: {} as { [key: number | string]: boolean },
        purchases: {} as { [key: number]: boolean },
      };
      columns.forEach(col => {
        if (col.kind === 'level') newTempProgress.levels[col.id] = true;
        else if (col.kind === 'purchase') newTempProgress.purchases[col.id] = true;
      });
      setTempProgress(newTempProgress);
    } else {
      setTempProgress({ levels: {}, purchases: {} });
    }
  };

  const handleSaveProgress = async () => {
    try {
      for (const [levelId, isCompleted] of Object.entries(tempProgress.levels)) {
        let actualLevelId = levelId;
        if (levelId.startsWith('synth-')) {
          const syntheticLevel = columns.find(col => col.kind === 'level' && col.id === levelId);
          if (syntheticLevel) {
            const newLevel = {
              game_id: account!.game_id,
              level_name: syntheticLevel.name,
              event_token: `${syntheticLevel.token}_day${syntheticLevel.daysOffset}`,
              days_offset: syntheticLevel.daysOffset as number,
              time_spent: syntheticLevel.timeSpent || 0,
              is_bonus: syntheticLevel.kind === 'level' ? syntheticLevel.isBonus : false
            };
            const existingLevels = await TauriService.getGameLevels(account!.game_id);
            const existingLevel = existingLevels.find(l => l.days_offset === newLevel.days_offset && l.event_token === newLevel.event_token);
            if (existingLevel) actualLevelId = existingLevel.id.toString();
            else {
              const createdLevelId = await TauriService.addLevel(newLevel);
              actualLevelId = createdLevelId.toString();
            }
          } else continue;
        }

        const levelIdNum = parseInt(actualLevelId);
        const existingProgress = levelsProgress.find(p => p.level_id === levelIdNum);
        if (existingProgress) {
          await TauriService.updateLevelProgress({ account_id: accountId, level_id: levelIdNum, is_completed: isCompleted });
        } else {
          await TauriService.createLevelProgress({ account_id: accountId, level_id: levelIdNum });
          if (isCompleted) await TauriService.updateLevelProgress({ account_id: accountId, level_id: levelIdNum, is_completed: true });
        }
      }

      const purchaseKeys = new Set(Object.keys(tempProgress.purchases));
      Object.keys(tempPurchaseDates).forEach(k => purchaseKeys.add(k));

      for (const purchaseIdStr of Array.from(purchaseKeys)) {
        const purchaseIdNum = parseInt(purchaseIdStr);
        const isCompleted = tempProgress.purchases[purchaseIdNum] ?? false; 
        const selectedDate = tempPurchaseDates[purchaseIdNum];
        
        const eventDef = purchaseEvents.find(e => e.id === purchaseIdNum);
        let daysOffset = typeof eventDef?.days_offset === 'number' ? eventDef.days_offset : (eventDef?.max_days_offset || 0);
        let calculatedTimeSpent = 0;

        if (selectedDate) {
          const startDateObj = parseDateFlexible(account?.start_date ?? '') || new Date();
          daysOffset = Math.round((selectedDate.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));

          const numericLevels = levels.filter(l => typeof l.days_offset === 'number').sort((a, b) => (a.days_offset as number) - (b.days_offset as number));
          if (numericLevels.length > 0) {
            const sameDayLevels = numericLevels.filter(l => (l.days_offset as number) === daysOffset);
            const nextLevel = numericLevels.find(l => (l.days_offset as number) > daysOffset);
            const levelsToAverage = [...sameDayLevels];
            if (nextLevel) levelsToAverage.push(nextLevel);
            if (levelsToAverage.length > 0) {
              const totalTimeSpent = levelsToAverage.reduce((sum, level) => sum + (level.time_spent || 0), 0);
              calculatedTimeSpent = Math.round(totalTimeSpent / levelsToAverage.length);
            }
          }
          if (calculatedTimeSpent <= 0) {
            const existingProgress = purchaseProgress.find(p => p.purchase_event_id === purchaseIdNum);
            calculatedTimeSpent = existingProgress?.time_spent || 243;
          }
        }

        const existingProgress = purchaseProgress.find(p => p.purchase_event_id === purchaseIdNum);
        if (existingProgress) {
          await TauriService.updatePurchaseEventProgress({ account_id: accountId, purchase_event_id: purchaseIdNum, is_completed: isCompleted, days_offset: daysOffset, time_spent: calculatedTimeSpent });
        } else {
          await TauriService.createPurchaseEventProgress({ account_id: accountId, purchase_event_id: purchaseIdNum, days_offset: daysOffset, time_spent: calculatedTimeSpent });
          if (isCompleted) await TauriService.updatePurchaseEventProgress({ account_id: accountId, purchase_event_id: purchaseIdNum, is_completed: true });
        }
      }

      setIsEditMode(false);
      window.location.reload();
    } catch (error) {
      console.error('Error saving progress:', error);
      alert(`Error saving progress: ${error}`);
    }
  };

  const handleCancelEdit = () => setIsEditMode(false);

  const columns = useMemo(() => {
    const levelCols = levels.map((l) => ({
      kind: 'level' as const,
      id: l.id as number | string,
      token: (l.event_token || '').split('_day')[0],
      name: l.level_name,
      daysOffset: l.days_offset,
      timeSpent: l.time_spent,
      isBonus: l.is_bonus,
      synthetic: l.level_name === '-',
    }));

    const purchaseCols = purchaseEvents.map((p) => {
      const progress = purchaseProgress.find(pp => pp.purchase_event_id === p.id);
      const day = progress ? progress.days_offset : p.days_offset;
      let midpointTime: number | null = null;

      if (day != null) {
        const numericLevels = levelCols.filter(l => typeof l.daysOffset === 'number').sort((a, b) => Number(a.daysOffset) - Number(b.daysOffset));
        const sameDayLevels = numericLevels.filter(l => Number(l.daysOffset) === day);
        const nextLevel = numericLevels.find(l => Number(l.daysOffset) > day);
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
        daysOffset: day,
        maxDaysOffset: p.max_days_offset != null ? String(p.max_days_offset) : null,
        isRestricted: !!p.is_restricted,
        timeSpent: midpointTime,
        synthetic: false,
      };
    });

    const allColsWithMax = [...levelCols, ...purchaseCols] as ColumnData[];
    const numericOnly = allColsWithMax.filter((c) => typeof c.daysOffset === 'number' && c.daysOffset !== null);
    
    numericOnly.sort((a, b) => {
      const aOff = a.daysOffset as number;
      const bOff = b.daysOffset as number;
      if (aOff !== bOff) return aOff - bOff;
      if (a.kind !== b.kind) return a.kind === 'level' ? -1 : 1;
      return String(a.id).localeCompare(String(b.id));
    });

    if (mode === 'event-only') {
      const levelsFiltered = allColsWithMax.filter((c) => c.kind === 'level' && c.name !== '-');
      const purchases = allColsWithMax.filter((c) => c.kind === 'purchase');
      return [...levelsFiltered, ...purchases];
    }

    const result: ColumnData[] = [];
    const entriesByDay: Record<number, ColumnData[]> = {};
    numericOnly.forEach(entry => {
      if (entry.daysOffset != null) {
        if (!entriesByDay[entry.daysOffset]) entriesByDay[entry.daysOffset] = [];
        entriesByDay[entry.daysOffset].push(entry);
      }
    });

    const minDay = numericOnly.length > 0 ? Math.min(0, numericOnly[0].daysOffset as number) : 0;
    const maxDay = numericOnly.length > 0 ? numericOnly[numericOnly.length - 1].daysOffset as number : 0;

    for (let day = minDay; day <= maxDay; day++) {
      if (entriesByDay[day]) {
        result.push(...entriesByDay[day]);
      } else {
        const nextMatch = numericOnly.find(c => c.kind === 'level' && !c.synthetic && (c.daysOffset as number) > day);
        if (nextMatch) {
          let synthesizedTime = 0;
          const realLevels = numericOnly.filter(e => e.kind === 'level' && !e.synthetic);
          const firstRealDay = (realLevels[0]?.daysOffset as number) || 0;
          
          if (day < firstRealDay) {
            synthesizedTime = Math.round((day + 1) * ((nextMatch.timeSpent || 0) / (firstRealDay + 1)));
          } else {
            const prevLevels = realLevels.filter(e => (e.daysOffset as number) < day);
            const prevReal = prevLevels[prevLevels.length - 1];
            if (prevReal) {
                const ratio = (day - (prevReal.daysOffset as number)) / ((nextMatch.daysOffset as number) - (prevReal.daysOffset as number));
                synthesizedTime = Math.round((prevReal.timeSpent || 0) + ratio * ((nextMatch.timeSpent || 0) - (prevReal.timeSpent || 0)));
            } else {
                synthesizedTime = Math.round((nextMatch.timeSpent || 0) / 2);
            }
          }

          result.push({
            kind: 'level',
            id: `synth-${nextMatch.token}-${day}`,
            token: nextMatch.token,
            name: '-',
            daysOffset: day,
            timeSpent: synthesizedTime,
            isBonus: false,
            synthetic: true,
          });
        }
      }
    }

    const numericIds = new Set(numericOnly.map((c) => c.id));
    const nonNumeric = allColsWithMax.filter((c) => !numericIds.has(c.id));
    return [...result, ...nonNumeric];
  }, [levels, purchaseEvents, purchaseProgress, mode]);

  const computedLevelDates = useMemo(() => {
    const startDateObj = parseDateFlexible(account?.start_date ?? '') || new Date();
    return columns.map((col) => {
      if (col.kind === 'level' || col.kind === 'purchase') {
        if (col.kind === 'purchase' && isEditMode && tempPurchaseDates[col.id as number]) {
          const tempDate = tempPurchaseDates[col.id as number];
          return tempDate ? formatDateShort(tempDate) : '-';
        }
        const dd = addDays(startDateObj, Number(col.daysOffset || 0));
        return formatDateShort(dd);
      }
      return '-';
    });
  }, [columns, account?.start_date, isEditMode, tempPurchaseDates]);

  if (!account) {
    return (
      <div className="p-6">
        <div className="mb-4"><BackButton /></div>
        <Card><CardContent className="p-6 text-center">Account not found</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 min-h-[calc(100vh-4rem)] relative flex flex-col">
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
            <div>
            <h2 className="text-xl font-semibold">{account.name}</h2>
            <div className="text-sm text-muted-foreground">{account.start_date} • {account.start_time}</div>
            </div>
            <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)} className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {t('common.import', 'Import')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                {t('common.export', 'Export')}
            </Button>
            {isEditMode ? (
                <>
                <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-muted/50">
                    <input type="checkbox" id="complete-all" checked={completeAllChecked} onChange={(e) => handleCompleteAllChange(e.target.checked)} className="h-4 w-4" />
                    <label htmlFor="complete-all" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                        <CheckSquare className="h-4 w-4 text-muted-foreground" />
                        {t('accounts.completeAll', 'Complete All')}
                    </label>
                </div>
                <Button variant="default" size="sm" onClick={handleSaveProgress} className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    {t('common.save', 'Save')}
                </Button>
                <Button variant="outline" size="sm" onClick={handleCancelEdit} className="flex items-center gap-2">
                    <X className="h-4 w-4" />
                    {t('common.cancel', 'Cancel')}
                </Button>
                </>
            ) : (
                <Button variant="outline" size="sm" onClick={handleEditToggle} className="flex items-center gap-2">
                <Edit3 className="h-4 w-4" />
                {t('common.edit', 'Edit')}
                </Button>
            )}
            <div className="flex items-center gap-2 px-2 py-1 border rounded">
                <label className="inline-flex items-center gap-2">
                <input type="radio" name="account-detail-mode" checked={mode === 'event-only'} onChange={() => setMode('event-only')} />
                <span className="text-sm">{t('common.eventOnly')}</span>
                </label>
                <label className="inline-flex items-center gap-2">
                <input type="radio" name="account-detail-mode" checked={mode === 'all'} onChange={() => setMode('all')} />
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
        <ImportDialog open={showImportDialog} onOpenChange={setShowImportDialog} gameId={gameIdForLevels} />
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
      {(prevAccount || nextAccount) && (
        <div className="sticky bottom-0 w-[calc(100%+3rem)] -ml-6 -mb-6 bg-gray-100 border-t border-gray-200 p-4 flex justify-between items-center z-40 mt-auto">
          <div>
            {prevAccount && (
              <Button variant="outline" onClick={() => navigate(`/accounts/${prevAccount.id}`)} className="flex items-center gap-2" title={`${t('common.previous', 'Previous')}: ${prevAccount.name}`}>
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{prevAccount.name}</span>
              </Button>
            )}
          </div>
          <div>
            {nextAccount && (
              <Button variant="outline" onClick={() => navigate(`/accounts/${nextAccount.id}`)} className="flex items-center gap-2" title={`${t('common.next', 'Next')}: ${nextAccount.name}`}>
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