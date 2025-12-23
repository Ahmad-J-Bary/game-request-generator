import { useMemo, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { LayoutToggle, Layout } from '../../components/molecules/LayoutToggle';
import { BackButton } from '../../components/molecules/BackButton';
import { useColorClass } from '../../contexts/SettingsContext';

import { useGames } from '../../hooks/useGames';
import { useLevels } from '../../hooks/useLevels';
import { usePurchaseEvents } from '../../hooks/usePurchaseEvents';

type Mode = 'all' | 'event-only';

export default function GameDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id?: string }>();
  const gameId = id ? parseInt(id, 10) : undefined;

  const { games } = useGames();
  const { levels = [] } = useLevels(gameId);
  const { events: purchaseEvents = [] } = usePurchaseEvents(gameId);

  const [layout, setLayout] = useState<Layout>('vertical');
  const [mode, setMode] = useState<Mode>('all');
  const getColorClass = useColorClass();

  useEffect(() => {
    setLayout('vertical');
    setMode('all');
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
      daysOffsetRaw: p.max_days_offset != null ? `Less Than ${p.max_days_offset}` : null,
      daysOffset: p.max_days_offset != null ? `Less Than ${p.max_days_offset}` : null,
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
    if (mode === 'all') {
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
            {game ? game.name : t('games.detailTitle') ?? 'Game Detail'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('games.detailSubtitle') ?? 'Levels and purchase events overview'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <LayoutToggle layout={layout} onLayoutChange={setLayout} />

          <div className="flex items-center gap-2 px-2 py-1 border rounded">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="game-detail-mode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
              />
              <span className="text-sm">Event Only</span>
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="game-detail-mode"
                checked={mode === 'event-only'}
                onChange={() => setMode('event-only')}
              />
              <span className="text-sm">All</span>
            </label>
          </div>

          <BackButton />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-auto">
          {columns.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {t('games.noDetails') ?? 'No levels or purchase events'}
            </div>
          ) : layout === 'horizontal' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('levels.eventToken')}</TableHead>
                  <TableHead>{t('levels.levelName')}</TableHead>
                  <TableHead>{t('levels.daysOffset')}</TableHead>
                  <TableHead>{t('levels.timeSpent')}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {columns.map(col => {
                  const baseBg = getColorClass(col.kind, col.isBonus, col.isRestricted);
                  const synthClass = col.synthetic ? 'opacity-60 italic' : '';

                  return (
                    <TableRow key={`${col.kind}-${col.id}`}>
                      <TableCell className={`font-mono ${baseBg} ${synthClass}`}>{col.token}</TableCell>
                      <TableCell className={`${baseBg} ${synthClass}`}>
                        {col.name ?? '-'}
                      </TableCell>
                      <TableCell className={`text-center ${baseBg} ${synthClass}`}>
                        {col.daysOffset != null ? col.daysOffset : (col.daysOffsetRaw ?? '-')}
                      </TableCell>
                      <TableCell className={`text-center ${baseBg} ${synthClass}`}>
                        {col.timeSpent != null ? col.timeSpent : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('levels.eventToken')}</TableHead>
                  {columns.map(col => {
                    const baseBg = getColorClass(col.kind, col.isBonus, col.isRestricted);
                    const synthClass = col.synthetic ? 'opacity-60 italic' : '';
                    return (
                      <TableHead
                        key={`${col.kind}-${col.id}`}
                        className={`text-center font-mono ${baseBg} ${synthClass}`}
                      >
                        {col.token}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>

              <TableBody>
                <TableRow>
                  <TableHead>{t('levels.levelName')}</TableHead>
                  {columns.map(col => {
                    const baseBg = getColorClass(col.kind, col.isBonus, col.isRestricted);
                    const synthClass = col.synthetic ? 'opacity-60 italic' : '';
                    return (
                      <TableCell key={`name-${col.kind}-${col.id}`} className={`text-center ${baseBg} ${synthClass}`}>
                        {col.kind === 'level' ? (col.name ?? '-') : (col.name ?? '-')}
                      </TableCell>
                    );
                  })}
                </TableRow>

                <TableRow>
                  <TableHead>{t('levels.daysOffset')}</TableHead>
                  {columns.map(col => {
                    const baseBg = getColorClass(col.kind, col.isBonus, col.isRestricted);
                    const synthClass = col.synthetic ? 'opacity-60 italic' : '';
                    return (
                      <TableCell key={`offset-${col.kind}-${col.id}`} className={`text-center ${baseBg} ${synthClass}`}>
                        {col.daysOffset != null ? col.daysOffset : (col.daysOffsetRaw ?? '-')}
                      </TableCell>
                    );
                  })}
                </TableRow>

                <TableRow>
                  <TableHead>{t('levels.timeSpent')}</TableHead>
                  {columns.map(col => {
                    const baseBg = getColorClass(col.kind, col.isBonus, col.isRestricted);
                    const synthClass = col.synthetic ? 'opacity-60 italic' : '';
                    return (
                      <TableCell key={`time-${col.kind}-${col.id}`} className={`text-center ${baseBg} ${synthClass}`}>
                        {col.timeSpent != null ? col.timeSpent : '-'}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

