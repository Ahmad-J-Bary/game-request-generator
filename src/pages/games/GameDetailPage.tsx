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
import { Download, Upload, Plus } from 'lucide-react';

import { useGames } from '../../hooks/useGames';
import { useLevels } from '../../hooks/useLevels';
import { usePurchaseEvents } from '../../hooks/usePurchaseEvents';
import { useSettings } from '../../contexts/SettingsContext';
import { useTheme } from '../../contexts/ThemeContext';

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

  useEffect(() => {
    setLayout('vertical');
    setMode('event-only');
  }, [gameId]);

  const game = games.find(g => String(g.id) === String(id));

  const baseColumns = useMemo(() => {
    const levelCols = levels.map(l => ({
      kind: 'level' as const,
      id: l.id,
      token: l.event_token,
      name: l.level_name,
      daysOffsetRaw: l.days_offset,
      daysOffset: typeof l.days_offset === 'number' ? l.days_offset : null,
      timeSpentRaw: l.time_spent,
      timeSpent: typeof l.time_spent === 'number' ? l.time_spent : null,
      isBonus: !!l.is_bonus,
    }));

    const purchaseCols = purchaseEvents.map(p => ({
      kind: 'purchase' as const,
      id: p.id,
      token: p.event_token,
      name: '$$$',
      daysOffsetRaw: p.max_days_offset != null ? `${t('purchaseEvents.lessThan')} ${p.max_days_offset}` : null,
      daysOffset: p.max_days_offset != null ? `${t('purchaseEvents.lessThan')} ${p.max_days_offset}` : null,
      isRestricted: !!p.is_restricted,
      timeSpent: null as number | null,
    }));

    return [...levelCols, ...purchaseCols] as const;
  }, [levels, purchaseEvents]);

  function interpolateTime(leftT: number, leftD: number, rightT: number, rightD: number, day: number) {
    if (rightD === leftD) return leftT;
    const ratio = (day - leftD) / (rightD - leftD);
    return leftT + ratio * (rightT - leftT);
  }

  const columns = useMemo(() => {
    if (mode === 'event-only') {
      return baseColumns.map((c: any) => ({
        ...c,
        synthetic: false,
      }));
    }

    const levelCols = baseColumns.filter((c: any) => c.kind === 'level').slice();
    const numeric = levelCols.filter((c: any) => typeof c.daysOffset === 'number');
    numeric.sort((a: any, b: any) => a.daysOffset - b.daysOffset);

    const result: any[] = [];
    for (let i = 0; i < numeric.length; i++) {
      const left = numeric[i];
      result.push({ ...left, synthetic: false });
      const right = numeric[i + 1];
      if (right && typeof right.daysOffset === 'number' && typeof left.daysOffset === 'number' && right.daysOffset > left.daysOffset + 1) {
        for (let d = left.daysOffset + 1; d <= right.daysOffset - 1; d++) {
          let synthesizedTime: number | null = null;
          if (typeof left.timeSpent === 'number' && typeof right.timeSpent === 'number') {
            const v = interpolateTime(left.timeSpent, left.daysOffset!, right.timeSpent, right.daysOffset, d);
            synthesizedTime = Math.round(v);
          }
          const synth = {
            kind: 'level' as const,
            id: `synth-${left.id}-${d}`,
            token: right.token,
            name: '-',
            daysOffsetRaw: d,
            daysOffset: d,
            timeSpentRaw: synthesizedTime,
            timeSpent: synthesizedTime,
            isBonus: false,
            synthetic: true,
          };
          result.push(synth);
        }
      }
    }

    const numericIds = new Set(numeric.map((c: any) => c.id));
    const nonNumeric = levelCols.filter((c: any) => !numericIds.has(c.id));
    nonNumeric.forEach(c => result.push({ ...c, synthetic: false }));

    const purchases = baseColumns.filter((c: any) => c.kind === 'purchase').map((p: any) => ({ ...p, synthetic: false }));
    return [...result, ...purchases];
  }, [baseColumns, mode]);

  return (
    <div className="container mx-auto p-6 space-y-6">
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
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 mt-6">
        <Button
          onClick={() => navigate('/levels', { state: { selectedGameId: gameId } })}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {t('games.quickActions.addLevel')}
        </Button>

        <Button
          onClick={() => navigate('/purchase-events', { state: { selectedGameId: gameId } })}
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
      />
    </div>
  );
}

