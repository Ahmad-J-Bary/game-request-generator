// src/pages/levels/LevelListPage.tsx

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useLevels } from '@grq/core/hooks/useLevels';
import { Button } from '@grq/ui/atoms/button';
import { Card, CardContent } from '@grq/ui/atoms/card';
import { GameSelector } from '@grq/ui/molecules/GameSelector';
import { LayoutToggle, Layout } from '@grq/ui/molecules/LayoutToggle';
import { LevelDataTable } from '@grq/ui/organisms/tables/LevelDataTable';
import { ImportDialog } from '@grq/ui/molecules/ImportDialog';
import { ExportDialog } from '@grq/ui/molecules/ExportDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@grq/ui/atoms/alert-dialog';
import { Plus } from 'lucide-react';
import { LevelForm } from './LevelForm';
import { Level } from '@grq/api-bindings';

type Mode = 'all' | 'event-only';

export default function LevelListPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const locationState = location.state as { selectedGameId?: number; createMode?: boolean } | null;
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>(locationState?.selectedGameId);
  const [layout, setLayout] = useState<Layout>('vertical');
  const [mode, setMode] = useState<Mode>('event-only');
  const { levels = [], loading, deleteLevel } = useLevels(selectedGameId);

  const [showForm, setShowForm] = useState(locationState?.createMode ?? false);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [deletingLevel, setDeletingLevel] = useState<Level | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const handleEdit = (level: Level) => {
    setEditingLevel(level);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (deletingLevel) {
      await deleteLevel(deletingLevel.id);
      setDeletingLevel(null);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingLevel(null);
  };

  function interpolateTime(leftT: number, leftD: number, rightT: number, rightD: number, day: number) {
    if (rightD === leftD) return leftT;
    const ratio = (day - leftD) / (rightD - leftD);
    return leftT + ratio * (rightT - leftT);
  }

  // Filter levels based on mode using exact GameDetailPage logic
  const filteredLevels = useMemo(() => {
    if (mode === 'event-only') {
      return levels
        .filter(level => level.level_name !== '-')
        .map(level => ({ ...level, event_token: level.event_token.split('_day')[0], synthetic: false }));
    }

    // In 'all' mode, implement the same logic as GameDetailPage for creating synthetic entries
    const levelCols = levels.map(l => ({
      kind: 'level' as const,
      id: l.id,
      token: l.event_token.split('_day')[0],
      name: l.level_name,
      daysOffset: l.days_offset,
      timeSpent: l.time_spent,
      isBonus: l.is_bonus,
      synthetic: l.level_name === '-',
    }));

    const numeric = levelCols.filter((c) => typeof c.daysOffset === 'number') as (typeof levelCols[number] & { daysOffset: number })[];
    numeric.sort((a, b) => a.daysOffset - b.daysOffset);

    type SynthEntry = { kind: 'level'; id: string | number; token: string; name: string; daysOffset: number; timeSpent: number | null; isBonus: boolean; synthetic: boolean };
    const result: (typeof levelCols[number] | SynthEntry)[] = [];
    for (let i = 0; i < numeric.length; i++) {
      const left = numeric[i];
      result.push(left);
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
            daysOffset: d,
            timeSpent: synthesizedTime,
            isBonus: false,
            synthetic: true,
          };
          result.push(synth);
        }
      }
    }

    const numericIds = new Set(numeric.map((c) => c.id));
    const nonNumeric = levelCols.filter((c) => !numericIds.has(c.id));
    nonNumeric.forEach(c => result.push(c));

    // Convert back to Level format for display (cast id to number; synthetic ids are display-only)
    return result.map(item => ({
      id: typeof item.id === 'string' ? -1 : item.id as number,
      event_token: item.token,
      level_name: item.name,
      days_offset: item.daysOffset,
      time_spent: item.timeSpent,
      is_bonus: item.isBonus,
      synthetic: item.synthetic,
      game_id: selectedGameId || 0,
    }));
  }, [levels, mode, selectedGameId]);

  if (showForm) {
    return (
      <LevelForm
        level={editingLevel}
        gameId={selectedGameId}
        onClose={handleCloseForm}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xl font-bold">{t('levels.title')}</h3>
        <div className="flex items-center gap-2">
          <GameSelector selectedGameId={selectedGameId} onGameChange={setSelectedGameId} />
          <LayoutToggle layout={layout} onLayoutChange={setLayout} />

          <div className="flex items-center gap-2 px-2 py-1 border rounded">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="levels-mode"
                checked={mode === 'event-only'}
                onChange={() => setMode('event-only')}
              />
              <span className="text-sm">{t('common.eventOnly')}</span>
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="levels-mode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
              />
              <span className="text-sm">{t('common.all')}</span>
            </label>
          </div>

          <Button onClick={() => setShowForm(true)} disabled={!selectedGameId}>
            <Plus className="mr-2 h-4 w-4" />
            {t('levels.addLevel')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">{t('common.loading')}</div>
      ) : !selectedGameId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('games.noGames')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <LevelDataTable
              levels={filteredLevels}
              layout={layout}
              onEdit={handleEdit}
              onDelete={setDeletingLevel}
            />
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deletingLevel} onOpenChange={() => setDeletingLevel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('levels.deleteLevel')}</AlertDialogTitle>
            <AlertDialogDescription>{t('levels.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        gameId={selectedGameId}
      />

      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        gameId={selectedGameId}
        exportType="game"
      />
    </div>
  );
}
