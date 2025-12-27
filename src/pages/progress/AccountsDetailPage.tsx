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

    const peCols = purchaseEvents.map((p: PurchaseEvent) => ({
      kind: 'purchase' as const,
      id: p.id,
      token: p.event_token,
      name: '$$$',
      isRestricted: (p as any).is_restricted ?? false,
      maxDaysOffset: p.max_days_offset != null ? `${t('purchaseEvents.lessThan')} ${p.max_days_offset}` : '-',
    }));

    // Base columns following GameDetailPage logic
    const baseLevelCols = [...levelCols];
    const basePeCols = [...peCols];

    if (mode === 'event-only') {
      // In event-only mode, filter out session levels (name '-')
      return [...baseLevelCols.filter(c => c.name !== '-'), ...basePeCols];
    }

    // In 'all' mode, generate synthetic entries for all missing days
    const numeric = baseLevelCols.filter((c: any) => typeof c.daysOffset === 'number');
    numeric.sort((a: any, b: any) => {
      // Sort by daysOffset first, then by id to maintain consistent order for same day entries
      if (a.daysOffset !== b.daysOffset) {
        return a.daysOffset - b.daysOffset;
      }
      return String(a.id).localeCompare(String(b.id));
    });

    // Group entries by daysOffset to handle multiple entries per day
    const entriesByDay: { [day: number]: any[] } = {};
    numeric.forEach(entry => {
      if (!entriesByDay[entry.daysOffset]) {
        entriesByDay[entry.daysOffset] = [];
      }
      entriesByDay[entry.daysOffset].push(entry);
    });

    let minDay = numeric.length > 0 ? numeric[0].daysOffset : 0;
    let maxDay = numeric.length > 0 ? numeric[numeric.length - 1].daysOffset : 0;

    // Ensure minDay starts from 0 if there are levels
    if (numeric.length > 0 && minDay > 0) {
      minDay = 0;
    }

    const result: any[] = [];

    for (let day = minDay; day <= maxDay; day++) {
      // Add all existing entries for this day (could be multiple)
      if (entriesByDay[day]) {
        result.push(...entriesByDay[day]);
      } else {
        // Find the next real level after this day
        let nextRealLevel = null;
        for (let d = day + 1; d <= maxDay; d++) {
          if (entriesByDay[d]) {
            // Find the first non-synthetic entry for this day
            const nonSyntheticEntries = entriesByDay[d].filter(entry => !entry.synthetic);
            if (nonSyntheticEntries.length > 0) {
              nextRealLevel = nonSyntheticEntries[0];
              break;
            }
          }
        }

        let synthesizedTime: number | null = null;
        let token = '';

        if (nextRealLevel) {
          // Check if this synthetic level appears before any real level in the dataset
          const realDays = Object.keys(entriesByDay)
            .map(d => parseInt(d))
            .filter(d => entriesByDay[d].some(entry => !entry.synthetic));
          const firstRealDay = Math.min(...realDays);
          const isBeforeFirstReal = day < firstRealDay;

          if (isBeforeFirstReal) {
            // Apply cumulative percentage to the first level event: (target_time - 0) / (first_real_day - (-1)) = target_time / (first_real_day + 1)
            const increment = nextRealLevel.timeSpent / (firstRealDay + 1);
            synthesizedTime = Math.round((day + 1) * increment);
            token = nextRealLevel.token;
          } else {
            // Normal interpolation between adjacent real levels
            let prevRealLevel = null;
            for (let d = day - 1; d >= minDay; d--) {
              if (entriesByDay[d]) {
                // Find the last non-synthetic entry for this day
                const nonSyntheticEntries = entriesByDay[d].filter(entry => !entry.synthetic);
                if (nonSyntheticEntries.length > 0) {
                  prevRealLevel = nonSyntheticEntries[nonSyntheticEntries.length - 1];
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
          const synth = {
            kind: 'level' as const,
            id: `synth-${token}-${day}`,
            token: token,
            name: '-',
            daysOffset: day,
            timeSpent: synthesizedTime,
            isBonus: false,
            synthetic: true,
          };
          result.push(synth);
        }
      }
    }

    const numericIds = new Set(numeric.map((c: any) => c.id));
    const nonNumeric = baseLevelCols.filter((c: any) => !numericIds.has(c.id));
    nonNumeric.forEach(c => result.push(c));

    const finalPeCols = basePeCols;

    return [...result, ...finalPeCols];
  }, [levels, purchaseEvents, mode]);



  return (
    <div className="p-6 space-y-4">
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
              const matrix = accounts.map((acc) => {
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
                  }
                  return '-';
                });
              });

              return (
                <>
                  <AccountsDataTable
                    accounts={accounts}
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
  );
}

