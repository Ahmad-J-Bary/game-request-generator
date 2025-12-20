// src/pages/GameDetail.tsx
import { useMemo, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { ArrowLeft } from 'lucide-react';

import { useGames } from '../hooks/useGames';
import { useLevels } from '../hooks/useLevels';
import { usePurchaseEvents } from '../hooks/usePurchaseEvents';

type Layout = 'vertical' | 'horizontal';

export default function GameDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const gameId = id ? parseInt(id, 10) : undefined;

  const { games } = useGames();
  const { levels = [] } = useLevels(gameId);
  const { events: purchaseEvents = [] } = usePurchaseEvents(gameId);

  const [layout, setLayout] = useState<Layout>('vertical');

  useEffect(() => {
    // default vertical view
    setLayout('vertical');
  }, [gameId]);

  const game = games.find(g => String(g.id) === String(id));

  // merge columns: levels first, then purchase events
  const columns = useMemo(() => {
    const levelCols = levels.map(l => ({
      kind: 'level' as const,
      id: l.id,
      token: l.event_token,
      name: l.level_name,
      daysOffset: l.days_offset,
      timeSpent: l.time_spent,
      isBonus: l.is_bonus,
    }));

    const purchaseCols = purchaseEvents.map(p => ({
      kind: 'purchase' as const,
      id: p.id,
      token: p.event_token,
      name: '$$$',
      isRestricted: p.is_restricted,
      maxDaysOffset: p.max_days_offset != null ? `Less Than ${p.max_days_offset}` : null,
    }));

    return [...levelCols, ...purchaseCols];
  }, [levels, purchaseEvents]);

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
          <Select value={layout} onValueChange={(v) => setLayout(v as Layout)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vertical">{t('levels.viewVertical') ?? 'Vertical'}</SelectItem>
              <SelectItem value="horizontal">{t('levels.viewHorizontal') ?? 'Horizontal'}</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back') ?? 'Back'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-auto">
          {columns.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {t('games.noDetails') ?? 'No levels or purchase events'}
            </div>
          ) : layout === 'horizontal' ? (
            // Horizontal: rows = metadata rows, columns = columns
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Token</TableHead>
                  <TableHead>Level Name</TableHead>
                  <TableHead>Days Offset</TableHead>
                  <TableHead>Time Spent (seconds)</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {columns.map(col => {
                  const colColor =
                    col.kind === 'level'
                      ? col.isBonus ? 'bg-green-50' : 'bg-blue-50'
                      : col.isRestricted ? 'bg-yellow-50' : 'bg-gray-50';

                  if (col.kind === 'level') {
                    return (
                      <TableRow key={`level-${col.id}`}>
                        <TableCell className={`font-mono ${colColor}`}>{col.token}</TableCell>
                        <TableCell className={colColor}>{col.name}</TableCell>
                        <TableCell className={`text-center ${colColor}`}>{col.daysOffset}</TableCell>
                        <TableCell className={`text-center ${colColor}`}>{col.timeSpent}</TableCell>
                      </TableRow>
                    );
                  } else {
                    return (
                      <TableRow key={`purchase-${col.id}`}>
                        <TableCell className={`font-mono ${colColor}`}>{col.token}</TableCell>
                        <TableCell className={colColor}>{col.name}</TableCell>
                        <TableCell className={`text-center ${colColor}`}>
                          {col.isRestricted ? (col.maxDaysOffset ?? 'less than') : '-'}
                        </TableCell>
                        <TableCell className={`text-center ${colColor}`}>-</TableCell>
                      </TableRow>
                    );
                  }
                })}
              </TableBody>
            </Table>
          ) : (
            // Vertical/pivot: first column labels, then a header row with tokens
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Token</TableHead>
                  {columns.map(col => (
                    <TableHead
                      key={`${col.kind}-${col.id}`}
                      className={`text-center font-mono
                        ${col.kind === 'level' ? (col.isBonus ? 'bg-green-50' : 'bg-blue-50') :
                        (col.isRestricted ? 'bg-yellow-50' : 'bg-gray-50')}`}
                    >
                      {col.token}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                <TableRow>
                  <TableHead>Level Name</TableHead>
                  {columns.map(col => (
                    <TableCell
                      key={`name-${col.kind}-${col.id}`}
                      className={`text-center ${col.kind === 'level' ? (col.isBonus ? 'bg-green-50' : 'bg-blue-50') : (col.isRestricted ? 'bg-yellow-50' : 'bg-gray-50')}`}
                    >
                      {col.kind === 'level' ? col.name : col.name}
                    </TableCell>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead>Days Offset</TableHead>
                  {columns.map(col => (
                    <TableCell
                      key={`offset-${col.kind}-${col.id}`}
                      className={`text-center ${col.kind === 'level' ? (col.isBonus ? 'bg-green-50' : 'bg-blue-50') : (col.isRestricted ? 'bg-yellow-50' : 'bg-gray-50')}`}
                    >
                      {col.kind === 'level' ? col.daysOffset : (col.isRestricted ? (col.maxDaysOffset ?? 'less than') : '-')}
                    </TableCell>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead>Time Spent (seconds)</TableHead>
                  {columns.map(col => (
                    <TableCell
                      key={`time-${col.kind}-${col.id}`}
                      className={`text-center ${col.kind === 'level' ? (col.isBonus ? 'bg-green-50' : 'bg-blue-50') : (col.isRestricted ? 'bg-yellow-50' : 'bg-gray-50')}`}
                    >
                      {col.kind === 'level' ? col.timeSpent : '-'}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
