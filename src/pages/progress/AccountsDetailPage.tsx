import { useMemo, useState } from 'react';
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
import { GameSelector } from '../../components/molecules/GameSelector';
import { BackButton } from '../../components/molecules/BackButton';

import { useAccounts } from '../../hooks/useAccounts';
import { useLevels } from '../../hooks/useLevels';
import { usePurchaseEvents } from '../../hooks/usePurchaseEvents';
import { TauriService } from '../../services/tauri.service';
import { useSettings } from '../../contexts/SettingsContext';
import { useTranslation } from 'react-i18next';

import type { PurchaseEvent } from '../../types';

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
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${date.getDate()}-${months[date.getMonth()]}`;
}

function daysBetween(start: Date, target: Date) {
  const ms = target.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export default function AccountsDetailPage() {
  const [layout, setLayout] = useState<Layout>('vertical');
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();

  const { t } = useTranslation();
  const { accounts = [] } = useAccounts(selectedGameId);
  const { levels = [] } = useLevels(selectedGameId);
  const { events: purchaseEvents = [] } = usePurchaseEvents(selectedGameId);
  const { colors } = useSettings();

  const [peDates, setPeDates] = useState<Record<string, string>>({});

  const columns = useMemo(() => {
    const levelCols = levels.map((l) => ({
      kind: 'level' as const,
      id: l.id,
      token: l.event_token,
      name: l.level_name,
      daysOffset: l.days_offset,
      timeSpent: l.time_spent,
      isBonus: l.is_bonus,
      color: l.is_bonus ? colors.levelBonus : colors.levelNormal,
    }));

    const peCols = purchaseEvents.map((p: PurchaseEvent) => ({
      kind: 'purchase' as const,
      id: p.id,
      token: p.event_token,
      name: '$$$',
      isRestricted: (p as any).is_restricted ?? false,
      maxDaysOffset: p.max_days_offset != null ? `Less Than ${p.max_days_offset}` : '-',
      color: (p as any).is_restricted ? colors.purchaseRestricted : colors.purchaseUnrestricted,
    }));

    return [...levelCols, ...peCols];
  }, [levels, purchaseEvents, colors]);

  const matrix = useMemo(() => {
    return accounts.map((acc) => {
      const start = parseDate(acc.start_date);
      return columns.map((c) => {
        if (c.kind === 'level' && start) {
          return formatDateShort(addDays(start, Number(c.daysOffset || 0)));
        }
        return '-';
      });
    });
  }, [accounts, columns]);

  const handlePurchaseDateChange = async (accountId: number, peId: number, isoDate: string) => {
    const key = `${accountId}_${peId}`;
    setPeDates((prev) => ({ ...prev, [key]: isoDate }));

    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const start = parseDate(acc.start_date);
    const target = parseDate(isoDate);
    if (!start || !target) return;
    const daysOffset = daysBetween(start, target);

    try {
      await (TauriService as any).createPurchaseEventProgress({
        account_id: accountId,
        purchase_event_id: peId,
        days_offset: daysOffset,
        time_spent: 0,
      } as any);
      window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));
    } catch (err) {
      console.error('Failed to save purchase-event date/progress', err);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Accounts Detail</h2>

        <div className="flex gap-3">
          <LayoutToggle layout={layout} onLayoutChange={setLayout} />

          <GameSelector selectedGameId={selectedGameId} onGameChange={setSelectedGameId} />

          <BackButton />
        </div>
      </div>

      <Card>
        <CardContent className="overflow-auto">
          {layout === 'vertical' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead colSpan={3}>Event Token</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.id} className={`text-center font-mono ${c.color}`}>{c.token}</TableHead>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead colSpan={3}>Level Name</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.id} className={`text-center ${c.color}`}>{c.name}</TableHead>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead colSpan={3}>Days Offset</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.id} className={`text-center ${c.color}`}>{c.kind === 'level' ? c.daysOffset : c.maxDaysOffset}</TableHead>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead colSpan={3}>Time Spent (1000 seconds)</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.id} className={`text-center ${c.color}`}>{c.kind === 'level' ? c.timeSpent : '-'}</TableHead>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  {columns.map((c) => <TableHead key={c.id} />)}
                </TableRow>
              </TableHeader>

              <TableBody>
                {accounts.map((acc, accIdx) => (
                  <TableRow key={acc.id}>
                    <TableCell>{acc.name}</TableCell>
                    <TableCell>{formatDateShort(parseDate(acc.start_date))}</TableCell>
                    <TableCell>{acc.start_time}</TableCell>

                    {columns.map((c, colIdx) => {
                      if (c.kind === 'purchase') {
                        const key = `${acc.id}_${c.id}`;
                        return (
                          <TableCell key={colIdx} className="text-center">
                            <input
                              type="date"
                              className="border rounded px-1 text-xs"
                              value={peDates[key] ?? ''}
                              onChange={(e) => handlePurchaseDateChange(acc.id, c.id, e.target.value)}
                            />
                          </TableCell>
                        );
                      }
                      return <TableCell key={colIdx} className="text-center">{matrix[accIdx][colIdx]}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('levels.eventToken')}</TableHead>
                  <TableHead>{t('levels.levelName')}</TableHead>
                  <TableHead>{t('levels.daysOffset')}</TableHead>
                  <TableHead>{t('levels.timeSpent')}</TableHead>
                  <TableHead>{t('accounts.account')}</TableHead>

                  {accounts.map((a) => <TableHead key={a.id} className="text-center">{a.name}</TableHead>)}
                </TableRow>

                <TableRow>
                  <TableHead />
                  <TableHead />
                  <TableHead />
                  <TableHead />
                  <TableHead>Date</TableHead>

                  {accounts.map((a) => (
                    <TableHead key={a.id} className="text-center">
                      {formatDateShort(parseDate(a.start_date))}
                    </TableHead>
                  ))}
                </TableRow>

                <TableRow>
                  <TableHead />
                  <TableHead />
                  <TableHead />
                  <TableHead />
                  <TableHead>Time</TableHead>

                  {accounts.map((a) => (
                    <TableHead key={a.id} className="text-center">
                      {a.start_time}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {columns.map((c, colIdx) => (
                  <TableRow key={c.id}>
                    <TableCell className={`font-mono ${c.color}`}>{c.token}</TableCell>
                    <TableCell className={c.color}>{c.name}</TableCell>
                    <TableCell className={c.color}>{c.kind === 'level' ? c.daysOffset : c.maxDaysOffset}</TableCell>
                    <TableCell className={c.color}>{c.kind === 'level' ? c.timeSpent : '-'}</TableCell>
                    <TableCell />

                    {accounts.map((acc) => {
                      if (c.kind === 'purchase') {
                        const key = `${acc.id}_${c.id}`;
                        return (
                          <TableCell key={acc.id} className="text-center">
                            <input
                              type="date"
                              className="border rounded px-1 text-xs mb-1"
                              value={peDates[key] ?? ''}
                              onChange={(e) => handlePurchaseDateChange(acc.id, c.id, e.target.value)}
                            />
                          </TableCell>
                        );
                      }
                      const accIdx = accounts.findIndex(a => a.id === acc.id);
                      return <TableCell key={acc.id} className="text-center">{matrix[accIdx]?.[colIdx]}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

